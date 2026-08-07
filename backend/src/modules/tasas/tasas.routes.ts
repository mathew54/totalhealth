// modules/tasas/tasas.routes.ts
// TotalHealth: tasas de cambio del día (fuente dolarapi / BCV o manual).
// - Public: GET /api/tasas → tasa activa del día (USD/EUR) para el header.
// - Admin:  GET/POST /api/admin/tasas, POST /scraping, POST /seleccionar.
// - La extracción automática diaria corre en jobs/syncTasas.ts (06:30 AM).

import { Router } from 'express';
import { z } from 'zod';
import { getSupabase } from '../../config/supabase.js';
import { authRequired } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';
import { validate } from '../../middleware/validate.js';
import { badRequest, notFound } from '../../utils/httpError.js';
import { obtenerTasasDelDia, almacenarTasasDelDia } from '../../services/cotizaciones.js';
import { fechaHoyCaracas } from '../../services/bcv.js';

const MONEDAS = ['USD', 'EUR'] as const;
const MONEDA = z.enum(MONEDAS);
const FECHA = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD');

const COLS = 'id, fecha, moneda, valor, origen, activa, actualizado_por, created_at';

const tasasQuerySchema = z.object({
  fecha: FECHA.optional(),
  moneda: MONEDA.optional(),
});

const crearTasaSchema = z.object({
  fecha: FECHA,
  moneda: MONEDA,
  valor: z.number().positive('Valor debe ser mayor a 0'),
});

const seleccionarTasaSchema = z.object({
  id: z.string().uuid('ID inválido'),
});

export const publicRouter = Router();

export const adminRouter = Router();
adminRouter.use(authRequired, requireRole('admin', 'super_root'));

/** Desactiva la tasa activa de un (fecha, moneda) antes de activar otra. */
async function desactivarPara(fecha: string, moneda: string) {
  const { data } = await getSupabase()
    .from('tasas_cambio')
    .select('id')
    .eq('fecha', fecha)
    .eq('moneda', moneda)
    .eq('activa', true);
  for (const row of data ?? []) {
    await getSupabase().from('tasas_cambio').update({ activa: false }).eq('id', row.id);
  }
}

/**
 * GET /api/tasas
 * Tasa activa de USD/EUR del día (con respaldo al día más reciente que tenga
 * datos). Es pública y la consume el header de la web.
 */
publicRouter.get('/', async (_req, res, next) => {
  try {
    const hoy = fechaHoyCaracas();

    let { data } = await getSupabase()
      .from('tasas_cambio')
      .select(COLS)
      .eq('fecha', hoy)
      .order('activa', { ascending: false })
      .order('created_at', { ascending: false });

    if (!data || data.length === 0) {
      // Respaldo: último día con tasas registradas.
      const { data: fechas } = await getSupabase()
        .from('tasas_cambio')
        .select('fecha')
        .order('fecha', { ascending: false })
        .limit(1);
      const fechaUltima = fechas?.[0]?.fecha;
      if (fechaUltima) {
        const { data: previas } = await getSupabase()
          .from('tasas_cambio')
          .select(COLS)
          .eq('fecha', fechaUltima as string)
          .order('activa', { ascending: false })
          .order('created_at', { ascending: false });
        data = previas ?? [];
      }
    }

    const filas = data ?? [];
    const fecha = (filas[0]?.fecha as string) ?? hoy;

    const monedas = MONEDAS.map((moneda) => {
      const activa = filas.find((f) => f.moneda === moneda && f.activa);
      const fila = activa ?? filas.find((f) => f.moneda === moneda);
      return {
        moneda,
        valor: fila ? Number(fila.valor) : null,
        origen: fila ? fila.origen : null,
        fecha,
      };
    });

    res.json({
      fecha,
      actualizada: filas[0]?.created_at ?? null,
      monedas,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/admin/tasas?fecha=&moneda=
 * Historial de tasas (para el panel de administración).
 */
adminRouter.get('/', validate(tasasQuerySchema, 'query'), async (req, res, next) => {
  try {
    const { fecha, moneda } = req.query as { fecha?: string; moneda?: string };
    let query = getSupabase().from('tasas_cambio').select(COLS).order('fecha', { ascending: false }).order('created_at', { ascending: false });
    if (fecha) query = query.eq('fecha', fecha);
    if (moneda) query = query.eq('moneda', moneda);

    const { data, error } = await query;
    if (error) return next(badRequest(error.message));
    res.json((data ?? []).map((f) => ({ ...f, valor: Number(f.valor) })));
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/admin/tasas
 * Crea una tasa del día manualmente y la deja como activa para (fecha, moneda).
 */
adminRouter.post('/', validate(crearTasaSchema), async (req, res, next) => {
  try {
    const { fecha, moneda, valor } = req.body as { fecha: string; moneda: 'USD' | 'EUR'; valor: number };
    await desactivarPara(fecha, moneda);

    const { data, error } = await getSupabase()
      .from('tasas_cambio')
      .insert({ fecha, moneda, valor, origen: 'manual', activa: true, actualizado_por: req.user!.id })
      .select(COLS)
      .single();
    if (error) return next(badRequest(error.message));
    res.status(201).json(data);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/admin/tasas/scraping
 * Ejecuta la extracción de cotizaciones del día (fuente primaria dolarapi;
 * respaldo BCV) y guarda las tasas (origen 'dolarapi'). Si no hay una tasa
 * activa para ese día/moneda, deja la recién almacenada como activa.
 */
adminRouter.post('/scraping', async (req, res, next) => {
  try {
    const tasas = await obtenerTasasDelDia();
    const resultado = await almacenarTasasDelDia(tasas, req.user!.id);
    res.json(resultado);
  } catch (err) {
    next(badRequest((err as Error).message));
  }
});

/**
 * POST /api/admin/tasas/seleccionar
 * Selecciona qué tasa (scraping automática o manual) es la activa del día.
 */
adminRouter.post('/seleccionar', validate(seleccionarTasaSchema), async (req, res, next) => {
  try {
    const { id } = req.body as { id: string };

    const { data: fila, error: gErr } = await getSupabase().from('tasas_cambio').select('id, fecha, moneda').eq('id', id).single();
    if (gErr || !fila) return next(notFound('Tasa no encontrada'));

    await desactivarPara(fila.fecha as string, fila.moneda as string);
    const { data, error } = await getSupabase().from('tasas_cambio').update({ activa: true }).eq('id', id).select(COLS).single();
    if (error) return next(badRequest(error.message));

    res.json(data);
  } catch (err) {
    next(err);
  }
});
