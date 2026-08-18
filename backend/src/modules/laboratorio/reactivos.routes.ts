// modules/laboratorio/reactivos.routes.ts
// TotalHealth: inventario de reactivos (catálogo + lotes + kardex).
// - Lectura (GET) autenticada.
// - Mutaciones (POST/PATCH/DELETE) para laboratorio/admin/super_root.

import { Router } from 'express';
import { z } from 'zod';
import { getSupabase } from '../../config/supabase.js';
import { authRequired } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';
import { validate } from '../../middleware/validate.js';
import { badRequest, notFound } from '../../utils/httpError.js';
import {
  listarReactivos,
  listarLotes,
  listarMovimientos,
  crearReactivo,
  editarReactivo,
  eliminarReactivo,
  recibirLote,
  registrarSalida,
  ajustarStock,
  consumirReactivo,
  revisarVencimientos,
  estadoInventario,
  listarAlertas,
  marcarAlertasLeidas,
  consumoResumen,
} from '../../services/reactivosService.js';

const FECHA = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD');

const crearSchema = z.object({
  nombre: z.string().min(2),
  lote: z.string().optional(),
  fecha_vencimiento: FECHA.nullable().optional(),
  cantidad: z.coerce.number().min(0).optional().default(0),
  alerta_minima: z.coerce.number().min(0).nullable().optional(),
  proveedor: z.string().nullable().optional(),
  unidad: z.string().min(1).optional().default('unidades'),
  costo_unitario: z.coerce.number().min(0).nullable().optional(),
});

const editarSchema = z.object({
  nombre: z.string().min(2).optional(),
  alerta_minima: z.coerce.number().min(0).nullable().optional(),
  proveedor: z.string().nullable().optional(),
  unidad: z.string().min(1).optional(),
  costo_unitario: z.coerce.number().min(0).nullable().optional(),
});

const recibirLoteSchema = z.object({
  lote: z.string().min(1),
  fecha_vencimiento: FECHA.nullable().optional(),
  cantidad: z.coerce.number().positive('La cantidad debe ser mayor a 0'),
  costo_unitario: z.coerce.number().min(0).nullable().optional(),
  fecha_recepcion: FECHA.nullable().optional(),
});

const salidaSchema = z.object({
  cantidad: z.coerce.number().positive('La cantidad debe ser mayor a 0'),
  motivo: z.string().max(500).nullable().optional(),
});

const ajusteSchema = z.object({
  cantidad: z.coerce.number().min(0, 'La nueva cantidad no puede ser negativa'),
  motivo: z.string().max(500).nullable().optional(),
});

const consumoSchema = z.object({
  reactivo_id: z.string().uuid('ID inválido'),
  cantidad: z.coerce.number().positive('La cantidad debe ser mayor a 0'),
  motivo: z.string().max(500).nullable().optional(),
  solicitud_detalle_id: z.string().uuid('ID inválido').nullable().optional(),
});

const idParam = z.object({ id: z.string().uuid('ID inválido') });
const loteIdParam = z.object({ loteId: z.string().uuid('ID inválido') });

const leerAlertasSchema = z.object({
  ids: z.array(z.string().uuid('ID inválido')).max(200).optional(),
});

const router = Router();
router.use(authRequired);

const mutar = requireRole('laboratorio', 'admin', 'super_root');

/**
 * GET /api/reactivos
 * Catálogo de reactivos con stock utilizable y resumen de lotes.
 */
router.get('/', async (req, res, next) => {
  try {
    res.json(await listarReactivos(req.user!.clinicaId));
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/reactivos/estado
 * Estado operativo: vencidos, por vencer (30 días), bajo stock y agotados.
 */
router.get('/estado', async (req, res, next) => {
  try {
    res.json(await estadoInventario(req.user!.clinicaId));
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/reactivos/movimientos?reactivo_id=&limit=
 * Kardex (últimos movimientos, opcionalmente por reactivo).
 */
router.get('/movimientos', async (req, res, next) => {
  try {
    const reactivoId = (req.query.reactivo_id as string | undefined) || null;
    const limit = Number(req.query.limit) || 100;
    res.json(await listarMovimientos({ reactivoId, limit }));
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/reactivos/alertas
 * Alertas internas de inventario (stock bajo, agotados, vencidos, por vencer).
 */
router.get('/alertas', async (req, res, next) => {
  try {
    res.json(await listarAlertas(req.user!.clinicaId));
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/reactivos/alertas/leer — laboratorio/admin
 * Marca alertas como leídas. Sin `ids`, marca todas las no leídas de la clínica.
 */
router.post('/alertas/leer', mutar, validate(leerAlertasSchema), async (req, res, next) => {
  try {
    const body = req.body as z.infer<typeof leerAlertasSchema>;
    const marcadas = await marcarAlertasLeidas(body.ids ?? [], req.user!.clinicaId);
    res.json({ ok: true, marcadas });
  } catch (err) {
    next(badRequest((err as Error).message));
  }
});

/**
 * GET /api/reactivos/consumo?dias=30
 * Consumo por reactivo y por examen + estimación de reposición.
 */
router.get('/consumo', async (req, res, next) => {
  try {
    const dias = Number(req.query.dias) || 30;
    res.json(await consumoResumen({ dias, clinicaId: req.user!.clinicaId }));
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/reactivos — laboratorio/admin
 * Crea un reactivo. Si se indica cantidad/lote, registra el lote inicial.
 */
router.post('/', mutar, validate(crearSchema), async (req, res, next) => {
  try {
    const body = req.body as z.infer<typeof crearSchema>;
    const data = await crearReactivo(body, req.user!);
    res.status(201).json(data);
  } catch (err) {
    next(badRequest((err as Error).message));
  }
});

/**
 * POST /api/reactivos/consumo — laboratorio/admin
 * Consumo FEFO desde el/los lote(s) que expiran primero.
 */
router.post('/consumo', mutar, validate(consumoSchema), async (req, res, next) => {
  try {
    const body = req.body as z.infer<typeof consumoSchema>;
    const data = await consumirReactivo(body.reactivo_id, body.cantidad, {
      motivo: body.motivo ?? null,
      usuarioId: req.user!.id,
      solicitudDetalleId: body.solicitud_detalle_id ?? null,
    });
    res.json(data);
  } catch (err) {
    next(badRequest((err as Error).message));
  }
});

/**
 * POST /api/reactivos/revisar-vencimientos — laboratorio/admin
 * Ejecuta la revisión de vencimientos manualmente (igual que el job diario).
 */
router.post('/revisar-vencimientos', mutar, async (req, res, next) => {
  try {
    res.json(await revisarVencimientos(req.user!.clinicaId));
  } catch (err) {
    next(badRequest((err as Error).message));
  }
});

/** GET /api/reactivos/:id — detalle del catálogo con sus lotes. */
router.get('/:id', validate(idParam, 'params'), async (req, res, next) => {
  try {
    const { id } = req.params as { id: string };
    const { data, error } = await getSupabase().from('reactivos').select('*').eq('id', id).maybeSingle();
    if (error) return next(badRequest(error.message));
    if (!data) return next(notFound('Reactivo no encontrado'));
    res.json({ ...data, lotes: await listarLotes(id) });
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/reactivos/:id — laboratorio/admin
 * Edita solo campos del catálogo (el stock se gestiona por lotes).
 */
router.patch('/:id', mutar, validate(idParam, 'params'), validate(editarSchema), async (req, res, next) => {
  try {
    const { id } = req.params as { id: string };
    const body = req.body as z.infer<typeof editarSchema>;
    const data = await editarReactivo(id, body);
    if (!data) return next(notFound('Reactivo no encontrado'));
    res.json(data);
  } catch (err) {
    next(badRequest((err as Error).message));
  }
});

/**
 * DELETE /api/reactivos/:id — laboratorio/admin
 * Elimina el reactivo con sus lotes y movimientos.
 */
router.delete('/:id', mutar, validate(idParam, 'params'), async (req, res, next) => {
  try {
    const { id } = req.params as { id: string };
    await eliminarReactivo(id);
    res.json({ ok: true });
  } catch (err) {
    next(badRequest((err as Error).message));
  }
});

/** GET /api/reactivos/:id/lotes — lotes de un reactivo (FEFO). */
router.get('/:id/lotes', validate(idParam, 'params'), async (req, res, next) => {
  try {
    const { id } = req.params as { id: string };
    res.json(await listarLotes(id));
  } catch (err) {
    next(err);
  }
});

/** POST /api/reactivos/:id/lotes — recepción de lote (entrada). */
router.post('/:id/lotes', mutar, validate(idParam, 'params'), validate(recibirLoteSchema), async (req, res, next) => {
  try {
    const { id } = req.params as { id: string };
    const body = req.body as z.infer<typeof recibirLoteSchema>;
    const data = await recibirLote(id, body, req.user!.id);
    res.status(201).json(data);
  } catch (err) {
    next(badRequest((err as Error).message));
  }
});

/** POST /api/reactivos/lotes/:loteId/salida — salida manual de un lote. */
router.post('/lotes/:loteId/salida', mutar, validate(loteIdParam, 'params'), validate(salidaSchema), async (req, res, next) => {
  try {
    const { loteId } = req.params as { loteId: string };
    const body = req.body as z.infer<typeof salidaSchema>;
    const data = await registrarSalida(loteId, body.cantidad, body.motivo ?? null, req.user!.id);
    res.json(data);
  } catch (err) {
    next(badRequest((err as Error).message));
  }
});

/** POST /api/reactivos/lotes/:loteId/ajuste — corrección de stock de un lote. */
router.post('/lotes/:loteId/ajuste', mutar, validate(loteIdParam, 'params'), validate(ajusteSchema), async (req, res, next) => {
  try {
    const { loteId } = req.params as { loteId: string };
    const body = req.body as z.infer<typeof ajusteSchema>;
    const data = await ajustarStock(loteId, body.cantidad, body.motivo ?? null, req.user!.id);
    res.json(data);
  } catch (err) {
    next(badRequest((err as Error).message));
  }
});

export default router;