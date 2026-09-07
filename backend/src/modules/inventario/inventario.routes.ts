import { Router } from 'express';
import { z } from 'zod';
import { getSupabase } from '../../config/supabase.js';
import { authRequired } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';
import { ROLES_ADMIN_SUPER } from '../../roles.js';
import { validate } from '../../middleware/validate.js';
import { badRequest, forbidden } from '../../utils/httpError.js';
import { registrarAuditoria } from '../../services/auditoria.js';

const router = Router();
router.use(authRequired, requireRole(...ROLES_ADMIN_SUPER));

const inventarioSchema = z.object({
  nombre: z.string().min(2, 'Nombre requerido'),
  categoria: z.enum(['papeleria', 'insumos', 'equipos', 'limpieza', 'otro']).default('otro').optional(),
  unidad: z.string().max(30).optional().nullable(),
  cantidad: z.coerce.number().min(0).default(0).optional(),
  alerta_minima: z.coerce.number().min(0).optional().nullable(),
  costo_unitario: z.coerce.number().min(0).optional().nullable(),
  proveedor: z.string().max(120).optional().nullable(),
  ubicacion: z.string().max(120).optional().nullable(),
  activo: z.boolean().optional(),
});

const movimientoSchema = z.object({
  item_id: z.string().uuid('Ítem inválido'),
  tipo: z.enum(['entrada', 'salida']),
  cantidad: z.coerce.number().positive('Cantidad debe ser > 0'),
  motivo: z.string().max(300).optional().nullable(),
});

/** GET /api/inventario — lista el inventario general de la clínica. */
router.get('/', async (req, res, next) => {
  try {
    const { data, error } = await getSupabase()
      .from('inventario_general')
      .select('id, nombre, categoria, unidad, cantidad, alerta_minima, costo_unitario, proveedor, ubicacion, activo, created_at')
      .eq('clinica_id', req.user!.clinicaId)
      .order('nombre', { ascending: true });
    if (error) return next(badRequest(error.message));
    res.json(data ?? []);
  } catch (err) {
    next(err);
  }
});

/** POST /api/inventario — agrega un ítem nuevo. */
router.post('/', validate(inventarioSchema), async (req, res, next) => {
  try {
    const body = req.body as z.infer<typeof inventarioSchema>;
    const { data, error } = await getSupabase()
      .from('inventario_general')
      .insert({ ...body, clinica_id: req.user!.clinicaId })
      .select()
      .single();
    if (error) return next(badRequest(error.message));
    void registrarAuditoria({ accion: 'INSERT', tabla: 'inventario_general', registroId: data.id as string, detalles: body }, req.user!.id);
    res.status(201).json(data);
  } catch (err) {
    next(err);
  }
});

/** PATCH /api/inventario/:id — actualiza un ítem. */
router.patch('/:id', validate(inventarioSchema.partial()), async (req, res, next) => {
  try {
    // Verificar propiedad de la clínica
    const { data: existente } = await getSupabase().from('inventario_general').select('id, clinica_id').eq('id', req.params.id).maybeSingle();
    if (!existente) return next(badRequest('Ítem no encontrado'));
    if (req.user!.role !== 'super_root' && existente.clinica_id !== req.user!.clinicaId) return next(forbidden('No pertenece a tu clínica'));

    const { data, error } = await getSupabase()
      .from('inventario_general')
      .update({ ...req.body, updated_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) return next(badRequest(error.message));
    void registrarAuditoria({ accion: 'UPDATE', tabla: 'inventario_general', registroId: req.params.id, detalles: req.body }, req.user!.id);
    res.json(data);
  } catch (err) {
    next(err);
  }
});

/** POST /api/inventario/movimiento — entrada o salida de stock. */
router.post('/movimiento', validate(movimientoSchema), async (req, res, next) => {
  try {
    const body = req.body as z.infer<typeof movimientoSchema>;
    const { data: item } = await getSupabase()
      .from('inventario_general')
      .select('id, clinica_id, cantidad')
      .eq('id', body.item_id)
      .maybeSingle();
    if (!item) return next(badRequest('Ítem no encontrado'));
    if (req.user!.role !== 'super_root' && item.clinica_id !== req.user!.clinicaId) return next(forbidden('No pertenece a tu clínica'));

    const actual = Number(item.cantidad ?? 0);
    const delta = body.tipo === 'entrada' ? body.cantidad : -body.cantidad;
    const nueva = Math.max(0, actual + delta);

    const { data, error } = await getSupabase()
      .from('inventario_general')
      .update({ cantidad: nueva, updated_at: new Date().toISOString() })
      .eq('id', body.item_id)
      .select()
      .single();
    if (error) return next(badRequest(error.message));

    void registrarAuditoria(
      { accion: 'UPDATE', tabla: 'inventario_general', registroId: body.item_id, detalles: { tipo: body.tipo, cantidad: body.cantidad, motivo: body.motivo, cantidad_anterior: actual, cantidad_posterior: nueva } },
      req.user!.id,
    );
    res.json(data);
  } catch (err) {
    next(err);
  }
});

/** DELETE /api/inventario/:id — elimina un ítem. */
router.delete('/:id', async (req, res, next) => {
  try {
    const { data: existente } = await getSupabase().from('inventario_general').select('id, clinica_id').eq('id', req.params.id).maybeSingle();
    if (!existente) return next(badRequest('Ítem no encontrado'));
    if (req.user!.role !== 'super_root' && existente.clinica_id !== req.user!.clinicaId) return next(forbidden('No pertenece a tu clínica'));
    const { error } = await getSupabase().from('inventario_general').delete().eq('id', req.params.id);
    if (error) return next(badRequest(error.message));
    void registrarAuditoria({ accion: 'DELETE', tabla: 'inventario_general', registroId: req.params.id }, req.user!.id);
    res.json({ deleted: true });
  } catch (err) {
    next(err);
  }
});

export default router;
