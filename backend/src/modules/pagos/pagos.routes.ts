import { Router } from 'express';
import { z } from 'zod';
import { getSupabase } from '../../config/supabase.js';
import { authRequired } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';
import { ROLES_SECRETARIA_ADMIN } from '../../roles.js';
import { validate } from '../../middleware/validate.js';
import { badRequest, conflict, notFound } from '../../utils/httpError.js';
import { getPaymentProvider } from '../../services/paymentProvider.js';
import { construirFactura, montoTexto, type Factura } from '../../services/invoice.js';
import { obtenerIvaPorcentaje } from '../../services/configService.js';
import { conTelefonoSeparado } from '../../services/phoneNumber.js';
import { obtenerTasaUsdActiva, obtenerTasasActivas, usdABs, bsAUsd, montoAUsd } from '../../services/moneda.js';
import { persistirFactura, calcularIgtf, calcularRetenciones, redondear } from '../../services/factura.js';
import {
  cobroLaboratorioSchema,
  pagosQuery,
  cambioEstadoSchema,
  reembolsoSchema,
  pagosFacturaQuery,
  abonoSchema,
  prepagoSchema,
  prepagoQuery,
} from './pagos.validators.js';

const router = Router();
router.use(authRequired, requireRole(...ROLES_SECRETARIA_ADMIN));

const PAGO_COLS =
  'id, tipo, solicitud_id, consulta_id, paciente_id, monto, moneda, tasa_usd, descuento, iva, base_gravada, base_exenta, igtf, retencion_iva, retencion_islr, factura_id, turno_id, metodo, secretaria_id, fecha, estado, provider, provider_ref, convenio_id, paquete_id, prepago_usado_usd';

/**
 * POST /api/pagos/laboratorio
 * Cobra una solicitud aplicando un descuento opcional y la pasarela de pagos.
 * Facturación VE: separa base gravada de base exenta por examen (los servicios
 * de laboratorio pueden estar exentos de IVA), calcula el IGTF opcional en
 * divisas (checkbox de caja), aplica retenciones de IVA/ISLR configurables y
 * persiste la factura/recibo con su correlativo.
 * Permite facturarle a un cliente distinto al paciente de la orden (`paciente_id`)
 * y usar el fondo de prepago del cliente facturado.
 * El pago queda en el estado que devuelva el proveedor (mock -> pagado; una
 * pasarela real podría devolver "pendiente").
 */
router.post('/laboratorio', validate(cobroLaboratorioSchema), async (req, res, next) => {
  try {
    const body = req.body as z.infer<typeof cobroLaboratorioSchema>;
    const user = req.user!;

    const { data: solicitud, error: sErr } = await getSupabase()
      .from('solicitudes')
      .select('id, paciente_id, clinica_id, cobrado, estado, monto_pagado, paquete_id')
      .eq('id', body.solicitud_id)
      .single();
    if (sErr || !solicitud) return next(notFound('Solicitud no encontrada'));
    if (solicitud.cobrado) return next(conflict('Esta solicitud ya fue cobrada'));
    if (solicitud.estado === 'anulada') return next(conflict('La solicitud está anulada y no puede cobrarse'));
    if (Number(solicitud.monto_pagado ?? 0) > 0) {
      return next(
        conflict('La solicitud tiene abonos registrados; completa el saldo desde Cuentas por cobrar'),
      );
    }

    // Cliente a facturar: por defecto el paciente de la orden; la caja puede
    // cambiarlo (ej. una empresa que paga los exámenes de un empleado).
    const pacienteFacturarId = body.paciente_id ?? (solicitud.paciente_id as string);

    // Líneas de la solicitud (precios en USD, moneda base) y su tipo de impuesto.
    const { data: lineas } = await getSupabase()
      .from('solicitudes_detalle')
      .select('precio, examen_id')
      .eq('solicitud_id', body.solicitud_id);
    const { data: examenes } = await getSupabase().from('examenes_laboratorio').select('id, impuesto');
    const impuestoDe = new Map<string, string>((examenes ?? []).map((e) => [e.id as string, e.impuesto ?? 'gravado']));

    let gravada = 0;
    let exenta = 0;
    for (const l of lineas ?? []) {
      const precio = Number(l.precio);
      const impuesto = impuestoDe.get(l.examen_id as string);
      if (impuesto === 'exento' || impuesto === 'no_sujeto') exenta += precio;
      else gravada += precio;
    }
    const totalUsd = redondear(gravada + exenta);

    const { data: paciente, error: pacErr } = await getSupabase()
      .from('pacientes')
      .select('id, nombre_completo, rif, direccion_fiscal, direccion, convenio_id')
      .eq('id', pacienteFacturarId)
      .single();
    if (pacErr || !paciente) return next(notFound('Cliente a facturar no encontrado'));

    // ===== Cascada de descuentos (Fase D) =====
    // 1) Paquete (precio fijo) o promociones vigentes sobre el precio de catálogo.
    const motivos: string[] = [];
    let baseBruto = totalUsd;
    if (solicitud.paquete_id) {
      const { data: paquete } = await getSupabase()
        .from('paquetes')
        .select('nombre, precio, activo')
        .eq('id', solicitud.paquete_id)
        .maybeSingle();
      if (!paquete || !paquete.activo) return next(badRequest('El paquete de la solicitud ya no está activo'));
      baseBruto = redondear(Number(paquete.precio));
      if (baseBruto < totalUsd) motivos.push(`Paquete: ${paquete.nombre}`);
    } else {
      const hoy = new Date().toISOString().slice(0, 10);
      const { data: promos } = await getSupabase()
        .from('promociones')
        .select('id, descuento_porcentaje')
        .eq('activo', true)
        .gte('fecha_fin', hoy)
        .lte('fecha_inicio', hoy);
      if ((promos ?? []).length) {
        const { data: vinculados } = await getSupabase()
          .from('promocion_examenes')
          .select('promocion_id, examen_id')
          .in('promocion_id', (promos ?? []).map((p) => p.id));
        const pctDe = new Map<string, number>();
        for (const v of vinculados ?? []) {
          const promo = (promos ?? []).find((p) => p.id === v.promocion_id);
          if (!promo) continue;
          const pct = Number(promo.descuento_porcentaje) / 100;
          if (pct > (pctDe.get(v.examen_id as string) ?? 0)) pctDe.set(v.examen_id as string, pct);
        }
        const promosAplicadas = new Set<string>();
        for (const l of lineas ?? []) {
          const pct = pctDe.get(l.examen_id as string);
          if (!pct) continue;
          baseBruto -= redondear(Number(l.precio) * pct);
          for (const v of vinculados ?? []) {
            if (v.examen_id === l.examen_id) promosAplicadas.add(v.promocion_id as string);
          }
        }
        baseBruto = redondear(baseBruto);
        if (promosAplicadas.size) motivos.push('Promoción');
      }
    }

    // 2) Descuento manual (tope: la base bruta).
    let descuentoManual = Number(body.descuento ?? 0);
    if (descuentoManual < 0) return next(badRequest('Descuento inválido'));
    if (descuentoManual > baseBruto) descuentoManual = baseBruto;

    // 3) Convenio del paciente (% sobre lo restante).
    let convenioDiscount = 0;
    let convenioId: string | null = null;
    if (paciente?.convenio_id) {
      const { data: convenio } = await getSupabase()
        .from('convenios')
        .select('nombre, descuento_porcentaje, activo')
        .eq('id', paciente.convenio_id)
        .maybeSingle();
      if (convenio && convenio.activo) {
        convenioDiscount = redondear((baseBruto - descuentoManual) * (Number(convenio.descuento_porcentaje) / 100));
        convenioId = paciente.convenio_id;
        motivos.push(`Convenio: ${convenio.nombre}`);
      }
    }
    if (body.descuento_motivo) motivos.push(body.descuento_motivo);

    // Descuento total contra el precio de catálogo (invariante para CxC).
    const baseNeto = redondear(baseBruto - descuentoManual - convenioDiscount);
    const descuento = redondear(Math.max(0, totalUsd - baseNeto));
    const descuentoMotivo = motivos.length ? motivos.join(' · ') : null;

    // El descuento se prorratea entre la base gravada y la base exenta.
    let baseGravadaUsd = gravada;
    let baseExentaUsd = exenta;
    if (descuento > 0 && totalUsd > 0) {
      const dGravada = descuento * (gravada / totalUsd);
      baseGravadaUsd = redondear(gravada - dGravada);
      baseExentaUsd = redondear(exenta - (descuento - dGravada));
    }

    const ivaPct = await obtenerIvaPorcentaje();
    const ivaUsd = redondear(baseGravadaUsd * ivaPct);
    const montoUsd = redondear(baseGravadaUsd + baseExentaUsd + ivaUsd);

    const moneda = body.moneda ?? 'USD';
    // Tasa del día usada en el cobro (se guarda para facturar/convertir).
    let tasaUsd: number | null = null;
    if (moneda === 'BS') {
      tasaUsd = await obtenerTasaUsdActiva();
      if (tasaUsd == null) {
        return next(
          badRequest('No hay tasa de cambio del día. Configúrala en Administración → Tasas de cambio.'),
        );
      }
    }

    const aMoneda = (usd: number): number => {
      if (moneda !== 'BS') return usd;
      return usdABs(usd, tasaUsd) ?? 0;
    };
    const baseGravada = aMoneda(baseGravadaUsd);
    const baseExenta = aMoneda(baseExentaUsd);
    const iva = aMoneda(ivaUsd);

    // Prepago (Fase D): el fondo del cliente facturado cubre parte del monto y
    // el resto se cobra ahora. IGTF solo sobre lo cobrado en divisas.
    let prepagoUsadoUsd = 0;
    let montoACobrar = aMoneda(montoUsd);
    if (body.usar_prepago) {
      const { data: tarjeta } = await getSupabase()
        .from('tarjetas_prepago')
        .select('id, saldo_usd')
        .eq('paciente_id', pacienteFacturarId)
        .maybeSingle();
      if (tarjeta && Number(tarjeta.saldo_usd) > 0) {
        prepagoUsadoUsd = redondear(Math.min(Number(tarjeta.saldo_usd), montoUsd));
        const restanteUsd = redondear(montoUsd - prepagoUsadoUsd);
        montoACobrar = aMoneda(restanteUsd);
        await getSupabase()
          .from('tarjetas_prepago')
          .update({ saldo_usd: redondear(Number(tarjeta.saldo_usd) - prepagoUsadoUsd) })
          .eq('id', tarjeta.id);
      }
    }

    // IGTF: solo en divisas y opcional (checkbox de caja); en Bs. lo retiene el
    // banco del pagador.
    const igtf = await calcularIgtf(montoACobrar, moneda, body.igtf_aplica !== false);
    // Retenciones fiscales VE (Ley IVA art. 27-28; Decreto 1.808): reducen el
    // efectivo recibido; el crédito documentado permanece completo.
    const { retencion_iva, retencion_islr } = await calcularRetenciones(baseGravada, iva, {
      retencion_iva: body.retencion_iva_aplica === true,
      retencion_islr: body.retencion_islr_aplica === true,
    });
    const montoFinal = redondear(Math.max(0, montoACobrar + igtf - retencion_iva - retencion_islr));
    // Total del documento de servicio (base + IVA completos) + IGTF de lo cobrado.
    const facturaTotal = redondear(aMoneda(montoUsd) + igtf);

    // Asocia el cobro al turno de caja abierto de la clínica (si existe).
    const { data: turno } = await getSupabase()
      .from('caja_turnos')
      .select('id')
      .eq('clinica_id', solicitud.clinica_id)
      .eq('estado', 'abierta')
      .maybeSingle();

    const provider = getPaymentProvider();
    let cargo;
    try {
      cargo = await provider.createCharge({
        monto: montoFinal,
        moneda,
        metodo: body.metodo ?? 'efectivo',
        concepto: 'Exámenes de laboratorio',
        pacienteNombre: paciente?.nombre_completo ?? '',
      });
    } catch (e) {
      return next(badRequest((e as Error).message));
    }

    const { data: pago, error: pErr } = await getSupabase()
      .from('pagos')
      .insert({
        tipo: 'laboratorio',
        solicitud_id: body.solicitud_id,
        paciente_id: pacienteFacturarId,
        clinica_id: solicitud.clinica_id,
        monto: montoACobrar,
        moneda,
        tasa_usd: tasaUsd,
        descuento,
        iva,
        base_gravada: baseGravada,
        base_exenta: baseExenta,
        igtf,
        retencion_iva,
        retencion_islr,
        turno_id: turno?.id ?? null,
        metodo: body.metodo ?? 'efectivo',
        secretaria_id: user.id,
        estado: cargo.estado,
        provider: provider.name,
        provider_ref: cargo.reference,
        convenio_id: convenioId,
        paquete_id: solicitud.paquete_id ?? null,
        prepago_usado_usd: prepagoUsadoUsd,
        fecha: new Date().toISOString(),
      })
      .select(PAGO_COLS)
      .single();
    if (pErr) return next(badRequest(pErr.message));

    await getSupabase()
      .from('solicitudes')
      .update({
        cobrado: true,
        monto_pagado: montoUsd,
        descuento,
        descuento_motivo: descuentoMotivo,
        descuento_autorizado_por: user.id,
      })
      .eq('id', body.solicitud_id);

    // Factura persistida (recibo de laboratorio) con correlativo y número de control.
    const factura = await persistirFactura({
      clinica_id: solicitud.clinica_id,
      pago_id: pago.id as string,
      solicitud_id: body.solicitud_id,
      paciente_id: pacienteFacturarId,
      tipo_documento: 'recibo',
      moneda,
      tasa_usd: tasaUsd,
      base_gravada: baseGravada,
      base_exenta: baseExenta,
      iva,
      descuento,
      igtf,
      retencion_iva,
      retencion_islr,
      total: facturaTotal,
      receptor_razon_social: paciente?.nombre_completo ?? '',
      receptor_rif: paciente?.rif ?? null,
      receptor_direccion: paciente?.direccion_fiscal ?? paciente?.direccion ?? null,
      emitida_por: user.id,
      fecha_emision: new Date().toISOString(),
      lineas: (lineas ?? []).map((l) => {
        const impuesto = (impuestoDe.get(l.examen_id as string) ?? 'gravado') as 'gravado' | 'exento' | 'no_sujeto';
        const unitario = aMoneda(Number(l.precio));
        const ivaLinea = impuesto === 'gravado' ? redondear(unitario * ivaPct) : 0;
        return {
          descripcion: 'Examen de laboratorio',
          cantidad: 1,
          precio_unitario: unitario,
          impuesto,
          iva_linea: ivaLinea,
          total_linea: redondear(unitario + ivaLinea),
        };
      }),
    });
    await getSupabase().from('pagos').update({ factura_id: factura.id }).eq('id', pago.id);

    res.status(201).json({
      pago: { ...pago, factura_id: factura.id },
      total: totalUsd,
      total_usd: totalUsd,
      descuento,
      iva,
      base_gravada: baseGravada,
      base_exenta: baseExenta,
      igtf,
      retencion_iva,
      retencion_islr,
      monto: montoACobrar,
      monto_final: montoFinal,
      monto_usd: montoUsd,
      factura_total: facturaTotal,
      prepago_usado_usd: prepagoUsadoUsd,
      convenio_id: convenioId,
      descuento_motivo: descuentoMotivo,
      moneda,
      tasa_usd: tasaUsd,
      factura: {
        id: factura.id,
        serie: factura.serie,
        numero_factura: factura.numero_factura,
        numero_control: factura.numero_control,
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/pagos/abono
 * Abono (pago parcial) sobre el saldo de una solicitud (Cuentas por cobrar).
 * Genera su propio recibo con el monto del abono y reduce `solicitudes.monto_pagado`;
 * cuando el acumulado cubre el total facturado (base + IVA) la solicitud queda cobrada.
 * Soporta cambiar el cliente a facturar (`paciente_id`), IGTF opcional en divisas
 * y retención de ISLR configurable (los recibos de abono no discriminan IVA).
 */
router.post('/abono', validate(abonoSchema), async (req, res, next) => {
  try {
    const body = req.body as z.infer<typeof abonoSchema>;
    const user = req.user!;

    const { data: solicitud, error: sErr } = await getSupabase()
      .from('solicitudes')
      .select('id, paciente_id, clinica_id, cobrado, estado, monto_pagado, descuento')
      .eq('id', body.solicitud_id)
      .single();
    if (sErr || !solicitud) return next(notFound('Solicitud no encontrada'));
    if (solicitud.estado === 'anulada') return next(conflict('La solicitud está anulada y no puede recibir abonos'));

    // Total facturado en USD (base + IVA, sin descuento: el descuento solo aplica
    // al cobro completo). Saldo pendiente = total facturado - acumulado pagado.
    const { data: lineas } = await getSupabase()
      .from('solicitudes_detalle')
      .select('precio, examen_id')
      .eq('solicitud_id', body.solicitud_id);
    const { data: examenes } = await getSupabase().from('examenes_laboratorio').select('id, impuesto');
    const impuestoDe = new Map<string, string>((examenes ?? []).map((e) => [e.id as string, e.impuesto ?? 'gravado']));

    let gravada = 0;
    let exenta = 0;
    for (const l of lineas ?? []) {
      const precio = Number(l.precio);
      const impuesto = impuestoDe.get(l.examen_id as string);
      if (impuesto === 'exento' || impuesto === 'no_sujeto') exenta += precio;
      else gravada += precio;
    }
    const totalUsd = redondear(gravada + exenta);
    const ivaPct = await obtenerIvaPorcentaje();
    const ivaUsd = redondear(gravada * ivaPct);
    const totalFacturadoUsd = redondear(totalUsd + ivaUsd);

    const montoPagado = Number(solicitud.monto_pagado ?? 0);
    const saldoUsd = redondear(totalFacturadoUsd - montoPagado);
    if (saldoUsd <= 0.005) return next(conflict('La solicitud ya está saldada'));

    const abonoUsd = body.monto;
    if (abonoUsd > saldoUsd + 0.005) {
      return next(badRequest(`El abono excede el saldo pendiente (${saldoUsd.toFixed(2)} USD)`));
    }

    const moneda = body.moneda ?? 'USD';
    let tasaUsd: number | null = null;
    if (moneda === 'BS') {
      tasaUsd = await obtenerTasaUsdActiva();
      if (tasaUsd == null) {
        return next(badRequest('No hay tasa de cambio del día. Configúrala en Administración → Tasas de cambio.'));
      }
    }

    const aMoneda = (usd: number): number => {
      if (moneda !== 'BS') return usd;
      return usdABs(usd, tasaUsd) ?? 0;
    };
    const monto = aMoneda(abonoUsd);
    // IGTF opcional (checkbox de caja): solo en divisas.
    const igtf = await calcularIgtf(monto, moneda, body.igtf_aplica !== false);
    // El abono cubre base e IVA proporcionalmente al documento facturado; sobre
    // esa porción se calculan las retenciones (el recibo sigue mostrando el
    // monto abonado como base única, sin discriminar IVA).
    const ivaShare = totalFacturadoUsd > 0 ? ivaUsd / totalFacturadoUsd : 0;
    const ivaDelAbonoUsd = redondear(abonoUsd * ivaShare);
    const baseDelAbonoUsd = redondear(abonoUsd - ivaDelAbonoUsd);
    const { retencion_iva, retencion_islr } = await calcularRetenciones(
      aMoneda(baseDelAbonoUsd),
      aMoneda(ivaDelAbonoUsd),
      {
        retencion_iva: body.retencion_iva_aplica === true,
        retencion_islr: body.retencion_islr_aplica === true,
      },
    );
    const montoFinal = redondear(Math.max(0, monto + igtf - retencion_iva - retencion_islr));

    // Cliente a facturar: por defecto el paciente de la solicitud.
    const pacienteFacturarId = body.paciente_id ?? (solicitud.paciente_id as string);
    const { data: paciente, error: pacErr } = await getSupabase()
      .from('pacientes')
      .select('id, nombre_completo, rif, direccion_fiscal, direccion')
      .eq('id', pacienteFacturarId)
      .single();
    if (pacErr || !paciente) return next(notFound('Cliente a facturar no encontrado'));

    const { data: turno } = await getSupabase()
      .from('caja_turnos')
      .select('id')
      .eq('clinica_id', solicitud.clinica_id)
      .eq('estado', 'abierta')
      .maybeSingle();

    const provider = getPaymentProvider();
    let cargo;
    try {
      cargo = await provider.createCharge({
        monto: montoFinal,
        moneda,
        metodo: body.metodo ?? 'efectivo',
        concepto: 'Abono a exámenes de laboratorio',
        pacienteNombre: paciente?.nombre_completo ?? '',
      });
    } catch (e) {
      return next(badRequest((e as Error).message));
    }

    const { data: pago, error: pErr } = await getSupabase()
      .from('pagos')
      .insert({
        tipo: 'abono',
        solicitud_id: body.solicitud_id,
        paciente_id: pacienteFacturarId,
        clinica_id: solicitud.clinica_id,
        monto,
        moneda,
        tasa_usd: tasaUsd,
        descuento: 0,
        iva: 0,
        base_gravada: monto,
        base_exenta: 0,
        igtf,
        retencion_iva,
        retencion_islr,
        turno_id: turno?.id ?? null,
        metodo: body.metodo ?? 'efectivo',
        secretaria_id: user.id,
        estado: cargo.estado,
        provider: provider.name,
        provider_ref: cargo.reference,
        fecha: new Date().toISOString(),
      })
      .select(PAGO_COLS)
      .single();
    if (pErr) return next(badRequest(pErr.message));

    // Recibo del abono: base = monto abonado, sin IVA (documento de pago parcial).
    const factura = await persistirFactura({
      clinica_id: solicitud.clinica_id,
      pago_id: pago.id as string,
      solicitud_id: body.solicitud_id,
      paciente_id: pacienteFacturarId,
      tipo_documento: 'recibo',
      moneda,
      tasa_usd: tasaUsd,
      base_gravada: monto,
      base_exenta: 0,
      iva: 0,
      descuento: 0,
      igtf,
      retencion_iva,
      retencion_islr,
      total: montoFinal,
      receptor_razon_social: paciente?.nombre_completo ?? '',
      receptor_rif: paciente?.rif ?? null,
      receptor_direccion: paciente?.direccion_fiscal ?? paciente?.direccion ?? null,
      emitida_por: user.id,
      fecha_emision: new Date().toISOString(),
      lineas: [
        {
          descripcion: 'Abono a exámenes de laboratorio',
          cantidad: 1,
          precio_unitario: monto,
          impuesto: 'gravado',
          iva_linea: 0,
          total_linea: monto,
        },
      ],
    });
    await getSupabase().from('pagos').update({ factura_id: factura.id }).eq('id', pago.id);

    const nuevoPagado = redondear(montoPagado + abonoUsd);
    const saldada = nuevoPagado >= totalFacturadoUsd - 0.005;
    await getSupabase()
      .from('solicitudes')
      .update({ monto_pagado: nuevoPagado, cobrado: saldada })
      .eq('id', body.solicitud_id);

    res.status(201).json({
      pago: { ...pago, factura_id: factura.id },
      abono_usd: abonoUsd,
      monto,
      igtf,
      retencion_iva,
      retencion_islr,
      monto_final: montoFinal,
      moneda,
      tasa_usd: tasaUsd,
      monto_pagado: nuevoPagado,
      total_facturado_usd: totalFacturadoUsd,
      saldo: redondear(totalFacturadoUsd - nuevoPagado),
      saldada,
      factura: {
        id: factura.id,
        serie: factura.serie,
        numero_factura: factura.numero_factura,
        numero_control: factura.numero_control,
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/pagos/prepago?paciente_id=
 * Saldo de la tarjeta de prepago del paciente (null si no existe).
 */
router.get('/prepago', validate(prepagoQuery, 'query'), async (req, res, next) => {
  try {
    const { paciente_id } = req.query as unknown as z.infer<typeof prepagoQuery>;
    const { data: tarjeta } = await getSupabase()
      .from('tarjetas_prepago')
      .select('*')
      .eq('paciente_id', paciente_id)
      .maybeSingle();
    res.json({
      tarjeta: tarjeta
        ? { ...tarjeta, saldo_usd: Number(tarjeta.saldo_usd) }
        : null,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/pagos/prepago
 * Recarga la tarjeta de prepago del paciente (dinero recibido por adelantado).
 * Genera su recibo; el saldo en USD se puede usar al cobrar (`usar_prepago`).
 */
router.post('/prepago', validate(prepagoSchema), async (req, res, next) => {
  try {
    const body = req.body as z.infer<typeof prepagoSchema>;
    const user = req.user!;

    const { data: paciente, error: pErr } = await getSupabase()
      .from('pacientes')
      .select('id, clinica_id, nombre_completo, rif, direccion_fiscal, direccion')
      .eq('id', body.paciente_id)
      .single();
    if (pErr || !paciente) return next(notFound('Paciente no encontrado'));

    const moneda = body.moneda ?? 'USD';
    let tasaUsd: number | null = null;
    if (moneda === 'BS') {
      tasaUsd = await obtenerTasaUsdActiva();
      if (tasaUsd == null) {
        return next(badRequest('No hay tasa de cambio del día. Configúrala en Administración → Tasas de cambio.'));
      }
    }
    const aMoneda = (usd: number): number => (moneda !== 'BS' ? usd : (usdABs(usd, tasaUsd) ?? 0));
    const monto = aMoneda(body.monto);
    const igtf = await calcularIgtf(monto, moneda);
    const montoFinal = redondear(monto + igtf);

    const { data: turno } = await getSupabase()
      .from('caja_turnos')
      .select('id')
      .eq('clinica_id', paciente.clinica_id)
      .eq('estado', 'abierta')
      .maybeSingle();

    const provider = getPaymentProvider();
    let cargo;
    try {
      cargo = await provider.createCharge({
        monto: montoFinal,
        moneda,
        metodo: body.metodo ?? 'efectivo',
        concepto: 'Recarga de prepago',
        pacienteNombre: paciente?.nombre_completo ?? '',
      });
    } catch (e) {
      return next(badRequest((e as Error).message));
    }

    const { data: pago, error: gErr } = await getSupabase()
      .from('pagos')
      .insert({
        tipo: 'prepago',
        paciente_id: paciente.id,
        clinica_id: paciente.clinica_id,
        monto,
        moneda,
        tasa_usd: tasaUsd,
        descuento: 0,
        iva: 0,
        base_gravada: monto,
        base_exenta: 0,
        igtf,
        turno_id: turno?.id ?? null,
        metodo: body.metodo ?? 'efectivo',
        secretaria_id: user.id,
        estado: cargo.estado,
        provider: provider.name,
        provider_ref: cargo.reference,
        fecha: new Date().toISOString(),
      })
      .select(PAGO_COLS)
      .single();
    if (gErr) return next(badRequest(gErr.message));

    const factura = await persistirFactura({
      clinica_id: paciente.clinica_id,
      pago_id: pago.id as string,
      paciente_id: paciente.id,
      tipo_documento: 'recibo',
      moneda,
      tasa_usd: tasaUsd,
      base_gravada: monto,
      base_exenta: 0,
      iva: 0,
      descuento: 0,
      igtf,
      total: montoFinal,
      receptor_razon_social: paciente?.nombre_completo ?? '',
      receptor_rif: paciente?.rif ?? null,
      receptor_direccion: paciente?.direccion_fiscal ?? paciente?.direccion ?? null,
      emitida_por: user.id,
      fecha_emision: new Date().toISOString(),
      lineas: [
        {
          descripcion: 'Recarga de tarjeta de prepago',
          cantidad: 1,
          precio_unitario: monto,
          impuesto: 'gravado',
          iva_linea: 0,
          total_linea: monto,
        },
      ],
    });
    await getSupabase().from('pagos').update({ factura_id: factura.id }).eq('id', pago.id);

    // Acumula el saldo de la tarjeta (una por paciente).
    const { data: tarjeta } = await getSupabase()
      .from('tarjetas_prepago')
      .select('id, saldo_usd')
      .eq('paciente_id', paciente.id)
      .maybeSingle();
    let saldoUsd: number;
    if (tarjeta) {
      saldoUsd = redondear(Number(tarjeta.saldo_usd) + body.monto);
      await getSupabase().from('tarjetas_prepago').update({ saldo_usd: saldoUsd }).eq('id', tarjeta.id);
    } else {
      saldoUsd = redondear(body.monto);
      const { data: nueva } = await getSupabase()
        .from('tarjetas_prepago')
        .insert({ paciente_id: paciente.id, saldo_usd: saldoUsd })
        .select('*')
        .single();
      if (nueva) saldoUsd = Number(nueva.saldo_usd);
    }

    res.status(201).json({
      pago: { ...pago, factura_id: factura.id },
      saldo_usd: saldoUsd,
      monto,
      igtf,
      monto_final: montoFinal,
      moneda,
      tasa_usd: tasaUsd,
      factura: {
        id: factura.id,
        serie: factura.serie,
        numero_factura: factura.numero_factura,
        numero_control: factura.numero_control,
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/pagos/saldos
 * Cuentas por cobrar: solicitudes no anuladas con saldo pendiente mayor a 0.
 * El saldo se calcula en USD (base + IVA) menos el acumulado abonado.
 */
router.get('/saldos', async (req, res, next) => {
  try {
    const user = req.user!;

    const { data: solicitudes, error } = await getSupabase()
      .from('solicitudes')
      .select('id, paciente_id, clinica_id, fecha, estado, cobrado, monto_pagado, descuento')
      .eq('cobrado', false)
      .in('estado', ['pendiente', 'en_proceso', 'listo', 'entregado']);
    if (error) return next(error);

    const { data: detalle } = await getSupabase().from('solicitudes_detalle').select('solicitud_id, precio');
    const totales = new Map<string, number>();
    for (const d of detalle ?? []) {
      const sid = d.solicitud_id as string;
      totales.set(sid, (totales.get(sid) ?? 0) + Number(d.precio));
    }

    const { data: pacientes } = await getSupabase().from('pacientes').select('id, cedula, nombre_completo');
    const porId = new Map((pacientes ?? []).map((p) => [p.id, p]));

    const ivaPct = await obtenerIvaPorcentaje();
    const { usd: tasaDia } = await obtenerTasasActivas();

    const saldos = [];
    let totalPendiente = 0;
    for (const s of solicitudes ?? []) {
      const baseUsd = redondear(Number(totales.get(s.id as string) ?? 0) - Number(s.descuento ?? 0));
      const totalFacturadoUsd = redondear(baseUsd + redondear(baseUsd * ivaPct));
      const montoPagado = Number(s.monto_pagado ?? 0);
      const saldo = redondear(totalFacturadoUsd - montoPagado);
      if (saldo <= 0.005) continue;

      totalPendiente += saldo;
      saldos.push({
        solicitud_id: s.id,
        fecha: s.fecha,
        estado: s.estado,
        paciente: porId.get(s.paciente_id as string) ?? null,
        total_usd: totalFacturadoUsd,
        monto_pagado: montoPagado,
        saldo,
        parcial: montoPagado > 0,
      });
    }

    totalPendiente = redondear(totalPendiente);
    res.json({
      count: saldos.length,
      total_pendiente_usd: totalPendiente,
      total_pendiente_bs: usdABs(totalPendiente, tasaDia),
      tasa_usd: tasaDia,
      saldos,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/pagos/:id/estado
 * Transición de estado: pendiente -> pagado -> reembolsado.
 */
router.patch('/:id/estado', validate(cambioEstadoSchema), validate(pagosFacturaQuery, 'params'), async (req, res, next) => {
  try {
    const { id } = req.params as { id: string };
    const { estado } = req.body as z.infer<typeof cambioEstadoSchema>;

    const { data: pago, error: gErr } = await getSupabase().from('pagos').select('*').eq('id', id).single();
    if (gErr || !pago) return next(notFound('Pago no encontrado'));

    const transiciones: Record<string, string[]> = {
      pendiente: ['pagado'],
      pagado: ['reembolsado'],
      reembolsado: [],
    };
    if (!transiciones[pago.estado as string]?.includes(estado)) {
      return next(conflict(`Transición inválida: ${pago.estado} -> ${estado}`));
    }

    const { data: updated, error } = await getSupabase()
      .from('pagos')
      .update({ estado })
      .eq('id', id)
      .select(PAGO_COLS)
      .single();
    if (error) return next(badRequest(error.message));

    res.json(updated);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/pagos/:id/reembolsar
 * Reembolsa un pago a través del proveedor de pagos.
 */
router.post('/:id/reembolsar', validate(pagosFacturaQuery, 'params'), validate(reembolsoSchema, 'body'), async (req, res, next) => {
  try {
    const { id } = req.params as { id: string };

    const { data: pago, error: gErr } = await getSupabase().from('pagos').select('*').eq('id', id).single();
    if (gErr || !pago) return next(notFound('Pago no encontrado'));
    if (pago.estado !== 'pagado') return next(conflict('Solo se pueden reembolsar pagos pagados'));

    const provider = getPaymentProvider();
    let reembolso;
    try {
      reembolso = await provider.refund((pago.provider_ref as string) ?? id);
    } catch (e) {
      return next(badRequest((e as Error).message));
    }

    const { data: updated, error } = await getSupabase()
      .from('pagos')
      .update({ estado: reembolso.estado })
      .eq('id', id)
      .select(PAGO_COLS)
      .single();
    if (error) return next(badRequest(error.message));

    res.json(updated);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/pagos?desde=&hasta=
 * Reporte de pagos por rango. El total se normaliza a USD (moneda base); los
 * pagos registrados en Bs. se convierten con la tasa guardada en el cobro (o la
 * del día como respaldo). Se incluye la equivalencia en Bs. del total.
 */
router.get('/', validate(pagosQuery, 'query'), async (req, res, next) => {
  try {
    const { desde, hasta } = req.query as unknown as z.infer<typeof pagosQuery>;

    let query = getSupabase().from('pagos').select(PAGO_COLS);
    if (desde) query = query.gte('fecha', `${desde}T00:00:00.000Z`);
    if (hasta) query = query.lte('fecha', `${hasta}T23:59:59.999Z`);
    query = query.order('fecha', { ascending: false });

    const { data, error } = await query;
    if (error) return next(error);

    const rows = data ?? [];
    const { usd: tasaDia } = await obtenerTasasActivas();
    let totalUsd = 0;
    for (const p of rows) {
      if (p.estado === 'reembolsado') continue;
      const usd = await montoAUsd(Number(p.monto), String(p.moneda ?? 'USD'), p.tasa_usd ? Number(p.tasa_usd) : null);
      totalUsd += usd ?? 0;
    }
    totalUsd = Number(totalUsd.toFixed(2));

    res.json({
      total: totalUsd,
      total_usd: totalUsd,
      total_bs: usdABs(totalUsd, tasaDia),
      tasa_usd: tasaDia,
      count: rows.length,
      pagos: rows,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/pagos/:id/factura
 * Factura/recibo electrónico (VE) del pago. Genera la estructura lista para
 * imprimir; el frontend descarga el PDF.
 */
router.get('/:id/factura', validate(pagosFacturaQuery, 'params'), async (req, res, next) => {
  try {
    const { id } = req.params as { id: string };

    const { data: pago } = await getSupabase().from('pagos').select('*').eq('id', id).single();
    if (!pago) return next(notFound('Pago no encontrado'));

    // Factura persistida (facturación VE): documento con correlativo, base
    // gravada/exenta real, IVA e IGTF. Se usa cuando el pago tiene factura_id.
    if (pago.factura_id) {
      const { data: factura } = await getSupabase().from('facturas').select('*').eq('id', pago.factura_id).single();
      if (factura) {
        const [{ data: emisor }, { data: lineas }] = await Promise.all([
          getSupabase().from('app_config').select('razon_social, rif, direccion, telefono, logo_url').eq('id', true).maybeSingle(),
          getSupabase()
            .from('factura_lineas')
            .select('descripcion, cantidad, precio_unitario, impuesto, iva_linea, total_linea')
            .eq('factura_id', factura.id),
        ]);

        const moneda = String(factura.moneda ?? 'USD');
        const tasaUsd = factura.tasa_usd ? Number(factura.tasa_usd) : null;
        const baseGravada = Number(factura.base_gravada);
        const baseExenta = Number(factura.base_exenta);
        const base = redondear(baseGravada + baseExenta);
        const iva = Number(factura.iva);
        const ivaPct = baseGravada > 0 ? Number((iva / baseGravada).toFixed(4)) : await obtenerIvaPorcentaje();
        const monto = Number(factura.total);
        const montoUsd = moneda === 'BS' ? bsAUsd(monto, tasaUsd) : monto;

        const facturaDoc: Factura = {
          serie: String(factura.serie),
          control: String(factura.numero_control),
          tipo: (factura.tipo_documento === 'factura' || factura.tipo_documento === 'recibo'
            ? factura.tipo_documento
            : 'factura') as Factura['tipo'],
          emisor: conTelefonoSeparado({
            razon_social: emisor?.razon_social ?? 'TotalHealth',
            rif: emisor?.rif ?? '',
            direccion: emisor?.direccion ?? null,
            telefono: emisor?.telefono ?? null,
          }),
          receptor: {
            nombre: String(factura.receptor_razon_social ?? ''),
            cedula: factura.receptor_rif ? String(factura.receptor_rif) : null,
          },
          fecha: String(factura.fecha_emision),
          moneda,
          lineas: (lineas ?? []).map((l) => ({
            descripcion: String(l.descripcion),
            cantidad: Number(l.cantidad),
            precio: Number(l.precio_unitario),
            precio_iva: Number(l.total_linea),
          })),
          base,
          iva,
          monto,
          pagado: true,
          base_exenta: baseExenta,
          igtf: Number(factura.igtf),
          descuento: Number(factura.descuento),
          retencion_iva: Number(factura.retencion_iva ?? 0),
          retencion_islr: Number(factura.retencion_islr ?? 0),
        };

        return res.json({
          factura: facturaDoc,
          monto,
          base,
          iva,
          descuento: Number(factura.descuento),
          base_exenta: baseExenta,
          igtf: Number(factura.igtf),
          retencion_iva: Number(factura.retencion_iva ?? 0),
          retencion_islr: Number(factura.retencion_islr ?? 0),
          moneda,
          tasa_usd: tasaUsd,
          monto_usd: montoUsd,
          monto_texto: montoTexto(monto, moneda),
          iva_porcentaje: ivaPct,
        });
      }
    }

    // Fallback: recibo/factura on-the-fly para pagos sin factura persistida
    // (ej. pagos del seed o versiones previas a la migración 0033).
    const tipo = (pago.tipo as string) === 'consulta' ? 'factura' : 'recibo';

    const [{ data: emisor }, { data: receptor }, { data: lineas }] = await Promise.all([
      getSupabase().from('app_config').select('razon_social, rif, direccion, telefono, logo_url').eq('id', true).maybeSingle(),
      getSupabase().from('pacientes').select('nombre_completo, cedula').eq('id', pago.paciente_id).single(),
      getSupabase()
        .from('solicitudes_detalle')
        .select('precio, examen_id')
        .eq('solicitud_id', pago.solicitud_id ?? ''),
    ]);

    const descuento = Number(pago.descuento ?? 0);
    const moneda = String(pago.moneda ?? 'USD');
    const tasaUsd = pago.tasa_usd ? Number(pago.tasa_usd) : await obtenerTasaUsdActiva();
    // Factor de conversión de la base USD: 1 si se cobra en USD, la tasa si en Bs.
    const factor = moneda === 'BS' && tasaUsd ? tasaUsd : 1;
    const fechaPago = new Date(pago.fecha as string);

    let conceptos: { descripcion: string; neto: number }[] = [];
    if (lineas && lineas.length) {
      const examenes = await getSupabase().from('examenes_laboratorio').select('id, nombre');
      const nombres = new Map((examenes.data ?? []).map((e) => [e.id, e.nombre]));
      conceptos = (lineas as { precio: number; examen_id: string }[]).map((l) => ({
        descripcion: nombres.get(l.examen_id) ?? 'Examen de laboratorio',
        // El precio de la línea está en USD (moneda base); se convierte a Bs.
        neto: Number((Number(l.precio) * factor).toFixed(2)),
      }));
    } else {
      // Consultas: el pago ya quedó en la moneda de cobro; la base es el monto menos IVA.
      conceptos = [{ descripcion: 'Consulta médica', neto: Number(pago.monto) - Number(pago.iva ?? 0) }];
    }

    // El descuento (base USD) se reparte proporcionalmente entre las líneas y
    // se convierte a Bs. si el cobro es en Bs.
    const descuentoAplicado = Number((descuento * factor).toFixed(2));
    const montoLineas = conceptos.reduce((acc, c) => acc + c.neto, 0) || 1;
    conceptos = conceptos.map((c) => ({
      ...c,
      neto: Number((c.neto - (c.neto / montoLineas) * descuentoAplicado).toFixed(2)),
    }));
    const base = Number(conceptos.reduce((acc, c) => acc + c.neto, 0).toFixed(2));
    const ivaConfig = await obtenerIvaPorcentaje();
    const iva = Number(pago.iva ?? Number((base * ivaConfig).toFixed(2)));
    const monto = Number((base + iva).toFixed(2));

    const factura = construirFactura({
      tipo,
      emisor: conTelefonoSeparado({
        razon_social: emisor?.razon_social ?? 'TotalHealth',
        rif: emisor?.rif ?? '',
        direccion: emisor?.direccion ?? null,
        telefono: emisor?.telefono ?? null,
      }),
      receptor: {
        nombre: receptor?.nombre_completo ?? '',
        cedula: receptor?.cedula ?? null,
      },
      fecha: Number.isNaN(fechaPago.getTime()) ? new Date().toISOString() : pago.fecha as string,
      moneda,
      conceptos,
      serie: `TH-${Number.isNaN(fechaPago.getFullYear()) ? new Date().getFullYear() : fechaPago.getFullYear()}`,
      control: String(pago.id as string).slice(0, 8).toUpperCase(),
      iva: ivaConfig,
    });

    // Monto equivalente en USD (base) para mostrar la equivalencia en el PDF.
    const montoUsd = moneda === 'BS' ? bsAUsd(monto, tasaUsd) : monto;

    res.json({
      factura,
      monto,
      base,
      iva,
      descuento,
      base_exenta: 0,
      igtf: 0,
      retencion_iva: 0,
      retencion_islr: 0,
      moneda,
      tasa_usd: tasaUsd,
      monto_usd: montoUsd,
      monto_texto: montoTexto(monto, factura.moneda),
      iva_porcentaje: ivaConfig,
    });
  } catch (err) {
    next(err);
  }
});

export default router;