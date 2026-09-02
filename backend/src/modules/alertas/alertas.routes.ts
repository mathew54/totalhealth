import { Router } from 'express';
import { z } from 'zod';
import { getSupabase } from '../../config/supabase.js';
import { authRequired } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';
import { ROLES_ADMIN_SUPER } from '../../roles.js';
import { validate } from '../../middleware/validate.js';
import { badRequest, notFound } from '../../utils/httpError.js';
import { idParamSchema } from '../../utils/schemas.js';
import { resolverNombres } from '../../services/resolverNombres.js';
import { registrarAuditoria } from '../../services/auditoria.js';

const router = Router();
router.use(authRequired);

const parametroSchema = z.object({
  examen_id: z.string().uuid('Examen inválido'),
  parametro: z.string().min(1, 'Parámetro requerido').max(100),
  nombre: z.string().min(1, 'Nombre requerido').max(200),
  unidad: z.string().max(30).optional().nullable(),
  normal_min: z.coerce.number().nullable().optional(),
  normal_max: z.coerce.number().nullable().optional(),
  critico_min: z.coerce.number().nullable().optional(),
  critico_max: z.coerce.number().nullable().optional(),
  // Rango por edad (años) y sexo, típico de los LIS. Null = aplica a todos.
  edad_min: z.coerce.number().int().min(0).nullable().optional(),
  edad_max: z.coerce.number().int().min(0).nullable().optional(),
  sexo: z.enum(['M', 'F']).nullable().optional(),
  activo: z.boolean().optional(),
});

const alertasQuery = z.object({
  paciente_id: z.string().uuid('Paciente inválido').optional(),
  solicitud_id: z.string().uuid('Solicitud inválida').optional(),
  solo_no_leidas: z.enum(['true', 'false']).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

/**
 * GET /api/alertas/parametros?examen_id=...
 * Umbrales de referencia (filtrables por examen).
 */
router.get('/parametros', async (req, res, next) => {
  try {
    const { examen_id } = req.query as { examen_id?: string };
    const q = getSupabase()
      .from('parametros_referencia')
      .select('*')
      .eq('activo', true)
      .order('nombre', { ascending: true });
    if (examen_id) q.eq('examen_id', examen_id);
    const { data, error } = await q;
    if (error) return next(badRequest(error.message));
    res.json(data ?? []);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/alertas/parametros
 * Crea un umbral de referencia (admin).
 */
router.post('/parametros', requireRole(...ROLES_ADMIN_SUPER), validate(parametroSchema), async (req, res, next) => {
  try {
    const body = req.body as z.infer<typeof parametroSchema>;
    const { data, error } = await getSupabase().from('parametros_referencia').insert(body).select('*').single();
    if (error) return next(badRequest(error.message));
    void registrarAuditoria({ accion: 'INSERT', tabla: 'parametros_referencia', registroId: data.id, detalles: { ...body } }, req.user!.id);
    res.status(201).json(data);
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/alertas/parametros/:id
 * Actualiza un umbral (admin).
 */
router.patch('/parametros/:id', requireRole(...ROLES_ADMIN_SUPER), validate(idParamSchema, 'params'), async (req, res, next) => {
  try {
    const { id } = req.params as z.infer<typeof idParamSchema>;
    const body = req.body as Partial<z.infer<typeof parametroSchema>>;
    const { data, error } = await getSupabase()
      .from('parametros_referencia')
      .update({ ...body, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('*')
      .single();
    if (error) return next(badRequest(error.message));
    if (!data) return next(notFound('Parámetro no encontrado'));
    void registrarAuditoria({ accion: 'UPDATE', tabla: 'parametros_referencia', registroId: id, detalles: { ...body } }, req.user!.id);
    res.json(data);
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/alertas/parametros/:id
 * Elimina un umbral (admin).
 */
router.delete('/parametros/:id', requireRole(...ROLES_ADMIN_SUPER), validate(idParamSchema, 'params'), async (req, res, next) => {
  try {
    const { id } = req.params as z.infer<typeof idParamSchema>;
    const { error } = await getSupabase().from('parametros_referencia').delete().eq('id', id);
    if (error) return next(badRequest(error.message));
    void registrarAuditoria({ accion: 'DELETE', tabla: 'parametros_referencia', registroId: id }, req.user!.id);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/alertas
 * Alertas clínicas, filtrables por paciente, solicitud o no leídas.
 */
router.get('/', validate(alertasQuery, 'query'), async (req, res, next) => {
  try {
    const { paciente_id, solicitud_id, solo_no_leidas, limit } = req.query as unknown as z.infer<typeof alertasQuery>;
    const q = getSupabase()
      .from('alertas_clinicas')
      .select('*')
      .order('created_at', { ascending: false });
    if (paciente_id) q.eq('paciente_id', paciente_id);
    if (solo_no_leidas === 'true') q.eq('leida', false);
    q.range(0, limit - 1);

    let rows = (await q).data ?? [];

    // Filtro por solicitud: las alertas se relacionan vía solicitudes_detalle.
    if (solicitud_id) {
      const { data: detalles } = await getSupabase()
        .from('solicitudes_detalle')
        .select('id')
        .eq('solicitud_id', solicitud_id);
      const ids = new Set((detalles ?? []).map((d) => d.id));
      rows = rows.filter((a) => ids.has(a.solicitud_detalle_id));
    }

    // Resuelve nombres de pacientes y exámenes manualmente (mock sin joins).
    const pacientes = await resolverNombres('pacientes', rows.map((r) => r.paciente_id), 'id', 'nombre_completo');
    const examenes = await resolverNombres('examenes_laboratorio', rows.map((r) => r.examen_id), 'id', 'nombre');
    res.json(
      rows.map((a) => ({
        ...a,
        paciente_nombre: pacientes.get(a.paciente_id) ?? null,
        examen_nombre: examenes.get(a.examen_id) ?? null,
      })),
    );
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/alertas/:id/leida
 * Marca una alerta como leída (laboratorio/admin).
 */
router.patch('/:id/leida', validate(idParamSchema, 'params'), async (req, res, next) => {
  try {
    const { id } = req.params as z.infer<typeof idParamSchema>;
    const { data, error } = await getSupabase()
      .from('alertas_clinicas')
      .update({ leida: true })
      .eq('id', id)
      .select('*')
      .single();
    if (error) return next(badRequest(error.message));
    if (!data) return next(notFound('Alerta no encontrada'));
    res.json(data);
  } catch (err) {
    next(err);
  }
});

export default router;