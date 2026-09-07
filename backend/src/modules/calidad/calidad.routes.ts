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

const controlSchema = z.object({
  examen_id: z.string().uuid('Examen inválido').nullable().optional(),
  parametro: z.string().min(1, 'Parámetro requerido'),
  nombre: z.string().min(2, 'Nombre requerido'),
  lote: z.string().max(60).optional().nullable(),
  media: z.coerce.number().refine(v => !Number.isNaN(v), 'Media numérica requerida'),
  desviacion_estandar: z.coerce.number().min(0, 'SD debe ser >= 0').min(0, 'SD debe ser >= 0'),
  unidad: z.string().max(30).optional().nullable(),
  activo: z.boolean().optional(),
});

const medicionSchema = z.object({
  control_id: z.string().uuid('Control inválido'),
  valor: z.coerce.number().refine(v => !Number.isNaN(v), 'Valor numérico requerido'),
  notas: z.string().max(300).optional().nullable(),
});

/** GET /api/calidad — lista los controles de calidad con su última medición. */
router.get('/', async (req, res, next) => {
  try {
    const { data, error } = await getSupabase()
      .from('controles_calidad')
      .select('id, examen_id, parametro, nombre, lote, media, desviacion_estandar, unidad, activo, created_at')
      .eq('clinica_id', req.user!.clinicaId)
      .order('nombre', { ascending: true });
    if (error) return next(badRequest(error.message));

    const ids = (data ?? []).map((c) => c.id as string);
    const ultimas: Record<string, { valor: number; fecha: string }> = {};
    if (ids.length) {
      const { data: mediciones } = await getSupabase()
        .from('controles_calidad_mediciones')
        .select('id, control_id, valor, fecha')
        .in('control_id', ids)
        .order('fecha', { ascending: false });
      for (const m of mediciones ?? []) {
        const cid = m.control_id as string;
        if (!ultimas[cid]) ultimas[cid] = { valor: Number(m.valor), fecha: m.fecha as string };
      }
    }

    res.json((data ?? []).map((c) => ({
      ...c,
      media: Number(c.media),
      desviacion_estandar: Number(c.desviacion_estandar),
      ultima_medicion: ultimas[c.id as string] ?? null,
    })));
  } catch (err) {
    next(err);
  }
});

/** POST /api/calidad — crea un control de calidad. */
router.post('/', validate(controlSchema), async (req, res, next) => {
  try {
    const body = req.body as z.infer<typeof controlSchema>;
    const { data, error } = await getSupabase()
      .from('controles_calidad')
      .insert({ ...body, clinica_id: req.user!.clinicaId })
      .select()
      .single();
    if (error) return next(badRequest(error.message));
    void registrarAuditoria({ accion: 'INSERT', tabla: 'controles_calidad', registroId: data.id as string, detalles: body }, req.user!.id);
    res.status(201).json(data);
  } catch (err) {
    next(err);
  }
});

/** PATCH /api/calidad/:id — actualiza un control. */
router.patch('/:id', validate(controlSchema.partial()), async (req, res, next) => {
  try {
    const { data: existente } = await getSupabase().from('controles_calidad').select('id, clinica_id').eq('id', req.params.id).maybeSingle();
    if (!existente) return next(badRequest('Control no encontrado'));
    if (req.user!.role !== 'super_root' && existente.clinica_id !== req.user!.clinicaId) return next(forbidden('No pertenece a tu clínica'));
    const { data, error } = await getSupabase()
      .from('controles_calidad')
      .update({ ...req.body, updated_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) return next(badRequest(error.message));
    void registrarAuditoria({ accion: 'UPDATE', tabla: 'controles_calidad', registroId: req.params.id, detalles: req.body }, req.user!.id);
    res.json(data);
  } catch (err) {
    next(err);
  }
});

/** DELETE /api/calidad/:id — elimina un control. */
router.delete('/:id', async (req, res, next) => {
  try {
    const { data: existente } = await getSupabase().from('controles_calidad').select('id, clinica_id').eq('id', req.params.id).maybeSingle();
    if (!existente) return next(badRequest('Control no encontrado'));
    if (req.user!.role !== 'super_root' && existente.clinica_id !== req.user!.clinicaId) return next(forbidden('No pertenece a tu clínica'));
    const { error } = await getSupabase().from('controles_calidad').delete().eq('id', req.params.id);
    if (error) return next(badRequest(error.message));
    void registrarAuditoria({ accion: 'DELETE', tabla: 'controles_calidad', registroId: req.params.id }, req.user!.id);
    res.json({ deleted: true });
  } catch (err) {
    next(err);
  }
});

/** GET /api/calidad/:id/mediciones — serie de mediciones para Levey-Jennings. */
router.get('/:id/mediciones', async (req, res, next) => {
  try {
    const { data, error } = await getSupabase()
      .from('controles_calidad_mediciones')
      .select('id, valor, fecha, notas')
      .eq('control_id', req.params.id)
      .order('fecha', { ascending: true });
    if (error) return next(badRequest(error.message));
    res.json((data ?? []).map((m) => ({ ...m, valor: Number(m.valor) })));
  } catch (err) {
    next(err);
  }
});

/** POST /api/calidad/:id/mediciones — registra una medición de control. */
router.post('/:id/mediciones', validate(medicionSchema), async (req, res, next) => {
  try {
    const { data: control } = await getSupabase().from('controles_calidad').select('id, clinica_id').eq('id', req.params.id).maybeSingle();
    if (!control) return next(badRequest('Control no encontrado'));
    if (req.user!.role !== 'super_root' && control.clinica_id !== req.user!.clinicaId) return next(forbidden('No pertenece a tu clínica'));

    const { valor, notas } = req.body as z.infer<typeof medicionSchema>;
    const { data, error } = await getSupabase()
      .from('controles_calidad_mediciones')
      .insert({ control_id: req.params.id, valor, notas: notas ?? null, usuario_id: req.user!.id })
      .select()
      .single();
    if (error) return next(badRequest(error.message));
    void registrarAuditoria({ accion: 'INSERT', tabla: 'controles_calidad_mediciones', registroId: data.id as string, detalles: { control_id: req.params.id, valor } }, req.user!.id);
    res.status(201).json(data);
  } catch (err) {
    next(err);
  }
});

export default router;
