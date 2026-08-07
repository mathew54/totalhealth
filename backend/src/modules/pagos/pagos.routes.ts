import { Router } from 'express';
import { z } from 'zod';
import { getSupabase } from '../../config/supabase.js';
import { authRequired } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';
import { validate } from '../../middleware/validate.js';
import { badRequest, conflict, notFound } from '../../utils/httpError.js';
import { getPaymentProvider } from '../../services/paymentProvider.js';
import { construirFactura, montoTexto } from '../../services/invoice.js';
import { obtenerTasaUsdActiva, obtenerTasasActivas, usdABs, bsAUsd, montoAUsd } from '../../services/moneda.js';
import {
  cobroLaboratorioSchema,
  pagosQuery,
  cambioEstadoSchema,
  reembolsoSchema,
  pagosFacturaQuery,
} from './pagos.validators.js';

const router = Router();
router.use(authRequired, requireRole('secretaria', 'admin', 'super_root'));

const PAGO_COLS =
  'id, tipo, solicitud_id, consulta_id, paciente_id, monto, moneda, tasa_usd, descuento, iva, metodo, secretaria_id, fecha, estado, provider, provider_ref';

/**
 * Convierte un monto neto + descuento (base USD) en base/imponible con IVA (16%).
 * Devuelve los valores en USD; cuando el cobro es en Bs. se convierten con la tasa.
 */
function desglosar(total: number, descuento: number) {
  const neto = Math.max(0, total - descuento);
  const iva = Number((neto * 0.16).toFixed(2));
  return { neto: Number(neto.toFixed(2)), iva, monto: Number((neto + iva).toFixed(2)) };
}

/** Aplica la conversión de un desglose USD a Bs. (o devuelve el mismo en USD). */
function convertirDesglose(desglose: { neto: number; iva: number; monto: number }, moneda: string, tasaUsd: number | null) {
  if (moneda !== 'BS') return desglose;
  const neto = usdABs(desglose.neto, tasaUsd);
  if (neto == null) return null;
  return {
    neto,
    iva: usdABs(desglose.iva, tasaUsd) ?? 0,
    monto: usdABs(desglose.monto, tasaUsd) ?? 0,
  };
}

/**
 * POST /api/pagos/laboratorio
 * Cobra una solicitud aplicando un descuento opcional y la pasarela de pagos.
 * El pago queda en el estado que devuelva el proveedor (mock -> pagado; una
 * pasarela real podría devolver "pendiente").
 */
router.post('/laboratorio', validate(cobroLaboratorioSchema), async (req, res, next) => {
  try {
    const body = req.body as z.infer<typeof cobroLaboratorioSchema>;
    const user = req.user!;

    const { data: solicitud, error: sErr } = await getSupabase()
      .from('solicitudes')
      .select('id, paciente_id, clinica_id, cobrado, estado')
      .eq('id', body.solicitud_id)
      .single();
    if (sErr || !solicitud) return next(notFound('Solicitud no encontrada'));
    if (solicitud.cobrado) return next(conflict('Esta solicitud ya fue cobrada'));

    const { data: lineas } = await getSupabase()
      .from('solicitudes_detalle')
      .select('precio')
      .eq('solicitud_id', body.solicitud_id);
    // El precio de las líneas está en USD (moneda base).
    const totalUsd = (lineas ?? []).reduce((acc, l) => acc + Number(l.precio), 0);

    const descuento = Number(body.descuento ?? 0);
    if (descuento < 0 || descuento > totalUsd) {
      return next(badRequest('Descuento inválido (debe estar entre 0 y el total en USD)'));
    }
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

    const desgloseUsd = desglosar(totalUsd, descuento);
    const desglose = convertirDesglose(desgloseUsd, moneda, tasaUsd);
    if (!desglose) return next(badRequest('No hay tasa de cambio del día para convertir a Bs.'));
    const { neto, iva, monto } = desglose;

    const { data: paciente } = await getSupabase()
      .from('pacientes')
      .select('nombre_completo')
      .eq('id', solicitud.paciente_id)
      .single();

    const provider = getPaymentProvider();
    let cargo;
    try {
      cargo = await provider.createCharge({
        monto,
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
        paciente_id: solicitud.paciente_id,
        clinica_id: solicitud.clinica_id,
        monto,
        moneda,
        tasa_usd: tasaUsd,
        descuento,
        iva,
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

    await getSupabase().from('solicitudes').update({ cobrado: true }).eq('id', body.solicitud_id);
    if (descuento > 0) {
      await getSupabase()
        .from('solicitudes')
        .update({ descuento, descuento_motivo: body.descuento_motivo ?? null, descuento_autorizado_por: user.id })
        .eq('id', body.solicitud_id);
    }

    res.status(201).json({
      pago,
      total: totalUsd,
      total_usd: totalUsd,
      descuento,
      iva,
      monto,
      monto_usd: desgloseUsd.monto,
      moneda,
      tasa_usd: tasaUsd,
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
    const iva = Number(pago.iva ?? Number((base * 0.16).toFixed(2)));
    const monto = Number((base + iva).toFixed(2));

    const factura = construirFactura({
      tipo,
      emisor: {
        razon_social: emisor?.razon_social ?? 'TotalHealth',
        rif: emisor?.rif ?? '',
        direccion: emisor?.direccion ?? null,
        telefono: emisor?.telefono ?? null,
      },
      receptor: {
        nombre: receptor?.nombre_completo ?? '',
        cedula: receptor?.cedula ?? null,
      },
      fecha: Number.isNaN(fechaPago.getTime()) ? new Date().toISOString() : pago.fecha as string,
      moneda,
      conceptos,
      serie: `TH-${Number.isNaN(fechaPago.getFullYear()) ? new Date().getFullYear() : fechaPago.getFullYear()}`,
      control: String(pago.id as string).slice(0, 8).toUpperCase(),
    });

    // Monto equivalente en USD (base) para mostrar la equivalencia en el PDF.
    const montoUsd = moneda === 'BS' ? bsAUsd(monto, tasaUsd) : monto;

    res.json({
      factura,
      monto,
      base,
      iva,
      descuento,
      moneda,
      tasa_usd: tasaUsd,
      monto_usd: montoUsd,
      monto_texto: montoTexto(monto, factura.moneda),
    });
  } catch (err) {
    next(err);
  }
});

export default router;