import { Router } from 'express';
import { z } from 'zod';
import { getSupabase } from '../../config/supabase.js';
import { authRequired } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';
import { validate } from '../../middleware/validate.js';
import { badRequest, notFound } from '../../utils/httpError.js';

const router = Router();
router.use(authRequired, requireRole('medico', 'secretaria', 'laboratorio', 'admin', 'super_root'));

const TIPOS = ['rx', 'ecografia', 'tomografia', 'resonancia', 'foto', 'otro'] as const;

const crearImagenSchema = z.object({
  paciente_id: z.string().uuid('Paciente inválido'),
  consulta_id: z.string().uuid('Consulta inválida').optional().nullable(),
  data_url: z.string().min(30, 'La imagen debe ser una data URL válida').refine((v) => v.startsWith('data:image/'), 'Debe ser una imagen (data URL)'),
  tipo: z.enum(TIPOS).default('rx'),
  region: z.string().max(120).optional().nullable(),
  descripcion: z.string().max(1000).optional().nullable(),
});

const idParamSchema = z.object({ id: z.string().uuid('ID inválido') });

const imagenesQuery = z.object({
  paciente_id: z.string().uuid('Paciente inválido').optional(),
  consulta_id: z.string().uuid('Consulta inválida').optional(),
  tipo: z.enum(TIPOS).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});

/**
 * GET /api/imagenes
 * Lista imágenes clínicas, filtrable por paciente, consulta o tipo.
 */
router.get('/', validate(imagenesQuery, 'query'), async (req, res, next) => {
  try {
    const { paciente_id, consulta_id, tipo, limit } = req.query as unknown as z.infer<typeof imagenesQuery>;
    const q = getSupabase().from('imagenes_clinicas').select('*').order('created_at', { ascending: false });
    if (paciente_id) q.eq('paciente_id', paciente_id);
    if (consulta_id) q.eq('consulta_id', consulta_id);
    if (tipo) q.eq('tipo', tipo);
    q.range(0, limit - 1);

    const { data: filas, error } = await q;
    if (error) return next(badRequest(error.message));
    const rows = (filas ?? []) as Array<Record<string, unknown>>;

    const pacientes = await resolverNombres('pacientes', rows.map((r) => String(r.paciente_id)), 'id', 'nombre_completo');
    const medicos = await resolverNombres('profiles', rows.map((r) => (r.creado_por ? String(r.creado_por) : '')).filter(Boolean), 'id', 'nombre_completo');

    res.json(
      rows.map((r) => ({
        ...r,
        paciente_nombre: pacientes.get(String(r.paciente_id)) ?? null,
        creado_por_nombre: r.creado_por ? medicos.get(String(r.creado_por)) ?? null : null,
      })),
    );
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/imagenes
 * Adjunta una imagen clínica (data URL base64 en el MVP; en producción se
 * sube al bucket y se guarda el path). Requiere staff (medico/lab/secretaria/admin).
 */
router.post('/', validate(crearImagenSchema), async (req, res, next) => {
  try {
    const body = req.body as z.infer<typeof crearImagenSchema>;
    const user = req.user!;

    const { data: paciente } = await getSupabase().from('pacientes').select('id').eq('id', body.paciente_id).maybeSingle();
    if (!paciente) return next(notFound('Paciente no encontrado'));

    if (body.consulta_id) {
      const { data: consulta } = await getSupabase().from('consultas').select('id').eq('id', body.consulta_id).maybeSingle();
      if (!consulta) return next(notFound('Consulta no encontrada'));
    }

    const { data, error } = await getSupabase()
      .from('imagenes_clinicas')
      .insert({
        clinica_id: user.clinicaId,
        paciente_id: body.paciente_id,
        consulta_id: body.consulta_id ?? null,
        url: body.data_url,
        tipo: body.tipo,
        region: body.region ?? null,
        descripcion: body.descripcion ?? null,
        creado_por: user.id,
      })
      .select('*')
      .single();
    if (error) return next(badRequest(error.message));
    res.status(201).json(data);
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/imagenes/:id
 * Elimina una imagen clínica (solo admin).
 */
router.delete('/:id', requireRole('admin', 'super_root'), validate(idParamSchema, 'params'), async (req, res, next) => {
  try {
    const { id } = req.params as z.infer<typeof idParamSchema>;
    const { error } = await getSupabase().from('imagenes_clinicas').delete().eq('id', id);
    if (error) return next(badRequest(error.message));
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

async function resolverNombres(tabla: string, ids: string[], idCol: string, nameCol: string): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (!ids.length) return map;
  const { data } = await getSupabase().from(tabla).select(`${idCol}, ${nameCol}` as never);
  for (const r of (data ?? []) as unknown as Array<Record<string, unknown>>) {
    const key = r[idCol];
    if (key != null) map.set(String(key), String(r[nameCol] ?? ''));
  }
  return map;
}

export default router;