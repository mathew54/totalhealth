// modules/caja/caja.routes.ts
// TotalHealth: caja por turnos. Apertura, consulta del turno activo, cierre con
// arqueo de efectivo (conciliación USD/Bs.) e historial de turnos.
//
// Acceso: MISMA autorización que pagos/facturas -> ROLES_SECRETARIA_ADMIN
// (['secretaria','admin','super_root']). No cambia el contrato de pagos.

import { Router } from 'express';
import { z } from 'zod';
import { getSupabase } from '../../config/supabase.js';
import { authRequired } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';
import { ROLES_SECRETARIA_ADMIN } from '../../roles.js';
import { validate } from '../../middleware/validate.js';
import { badRequest, conflict, notFound } from '../../utils/httpError.js';
import { obtenerTasasActivas, usdABs, bsAUsd } from '../../services/moneda.js';
import { redondear } from '../../services/factura.js';
import { aperturaCajaSchema, cierreCajaSchema, cajaTurnosQuery } from './caja.validators.js';

const router = Router();
router.use(authRequired, requireRole(...ROLES_SECRETARIA_ADMIN));

const TURNO_COLS =
  'id, abierta_por, fecha_apertura, monto_inicial, estado, fecha_cierre, cierre_por, efectivo_esperado_usd, efectivo_esperado_bs, efectivo_real_usd, efectivo_real_bs, monto_esperado_caja_usd, monto_real_caja_usd, diferencia_usd, tasa_usd, observaciones';

/** Turno de caja abierto de la clínica, o null. */
async function turnoActivoDe(clinicaId: string | null) {
  if (!clinicaId) return null;
  const { data, error } = await getSupabase()
    .from('caja_turnos')
    .select(TURNO_COLS)
    .eq('clinica_id', clinicaId)
    .eq('estado', 'abierta')
    .order('fecha_apertura', { ascending: false })
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}

/**
 * GET /api/caja/turno-activo
 * Turno abierto actual de la clínica (o null si no hay).
 */
router.get('/turno-activo', async (req, res, next) => {
  try {
    const turno = await turnoActivoDe(req.user!.clinicaId);
    res.json({ turno });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/caja/apertura
 * Abre un turno de caja con un monto inicial. Solo puede existir un turno
 * abierto por clínica.
 */
router.post('/apertura', validate(aperturaCajaSchema), async (req, res, next) => {
  try {
    const body = req.body as z.infer<typeof aperturaCajaSchema>;
    const user = req.user!;
    if (!user.clinicaId) return next(badRequest('No hay una clínica asociada a este usuario'));

    const existente = await turnoActivoDe(user.clinicaId);
    if (existente) return next(conflict('Ya hay un turno de caja abierto'));

    const { data, error } = await getSupabase()
      .from('caja_turnos')
      .insert({
        clinica_id: user.clinicaId,
        abierta_por: user.id,
        monto_inicial: body.monto_inicial,
        observaciones: body.observaciones ?? null,
        estado: 'abierta',
        fecha_apertura: new Date().toISOString(),
      })
      .select(TURNO_COLS)
      .single();
    if (error) return next(badRequest(error.message));

    res.status(201).json(data);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/caja/cierre
 * Cierra el turno activo con el arqueo: el usuario declara el efectivo contado
 * (USD y Bs.). El esperado es el inicial más los cobros en efectivo del turno;
 * la diferencia (sobrante/faltante) se expresa en USD base con la tasa del día.
 */
router.post('/cierre', validate(cierreCajaSchema), async (req, res, next) => {
  try {
    const body = req.body as z.infer<typeof cierreCajaSchema>;
    const user = req.user!;
    if (!user.clinicaId) return next(badRequest('No hay una clínica asociada a este usuario'));

    const turno = await turnoActivoDe(user.clinicaId);
    if (!turno) return next(conflict('No hay un turno de caja abierto'));

    // Solo cuentan los cobros efectivamente pagados del turno.
    const { data: pagos } = await getSupabase()
      .from('pagos')
      .select('monto, moneda, igtf, metodo, estado')
      .eq('turno_id', turno.id as string)
      .eq('estado', 'pagado');

    let efectivoEsperadoUsd = 0;
    let efectivoEsperadoBs = 0;
    for (const p of pagos ?? []) {
      if (p.metodo !== 'efectivo') continue;
      const moneda = String(p.moneda ?? 'USD');
      // El cajero recibe el monto + IGTF en cobros en divisas.
      const recibido = Number(p.monto) + Number(p.igtf ?? 0);
      if (moneda === 'BS') efectivoEsperadoBs += recibido;
      else efectivoEsperadoUsd += recibido;
    }
    efectivoEsperadoUsd = redondear(efectivoEsperadoUsd);
    efectivoEsperadoBs = redondear(efectivoEsperadoBs);

    const tasaUsd = (await obtenerTasasActivas()).usd;
    const esperadoCajaUsd = redondear(
      Number(turno.monto_inicial) +
        efectivoEsperadoUsd +
        (efectivoEsperadoBs > 0 ? (bsAUsd(efectivoEsperadoBs, tasaUsd) ?? 0) : 0),
    );
    const realCajaUsd = redondear(
      body.efectivo_usd + (body.efectivo_bs > 0 ? (bsAUsd(body.efectivo_bs, tasaUsd) ?? 0) : 0),
    );
    const diferencia = redondear(realCajaUsd - esperadoCajaUsd);

    const { data, error } = await getSupabase()
      .from('caja_turnos')
      .update({
        estado: 'cerrada',
        fecha_cierre: new Date().toISOString(),
        cierre_por: user.id,
        efectivo_esperado_usd: efectivoEsperadoUsd,
        efectivo_esperado_bs: efectivoEsperadoBs,
        efectivo_real_usd: body.efectivo_usd,
        efectivo_real_bs: body.efectivo_bs,
        monto_esperado_caja_usd: esperadoCajaUsd,
        monto_real_caja_usd: realCajaUsd,
        diferencia_usd: diferencia,
        tasa_usd: tasaUsd,
        observaciones: body.observaciones ?? turno.observaciones ?? null,
      })
      .eq('id', turno.id)
      .select(TURNO_COLS)
      .single();
    if (error) return next(badRequest(error.message));

    res.json(data);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/caja/turnos?desde=&hasta=&estado=
 * Historial de turnos de caja (apertura/cierre, arqueo y diferencia).
 */
router.get('/turnos', validate(cajaTurnosQuery, 'query'), async (req, res, next) => {
  try {
    const { desde, hasta, estado } = req.query as unknown as z.infer<typeof cajaTurnosQuery>;
    const user = req.user!;

    let query = getSupabase()
      .from('caja_turnos')
      .select(TURNO_COLS)
      .eq('clinica_id', user.clinicaId)
      .order('fecha_apertura', { ascending: false });
    if (desde) query = query.gte('fecha_apertura', `${desde}T00:00:00.000Z`);
    if (hasta) query = query.lte('fecha_apertura', `${hasta}T23:59:59.999Z`);
    if (estado) query = query.eq('estado', estado);

    const { data, error } = await query;
    if (error) return next(error);

    res.json({
      count: (data ?? []).length,
      turnos: data ?? [],
    });
  } catch (err) {
    next(err);
  }
});

export default router;