import { Router } from 'express';
import { z } from 'zod';
import { getSupabase } from '../../config/supabase.js';
import { authRequired } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';
import { validate } from '../../middleware/validate.js';
import { badRequest, forbidden, notFound } from '../../utils/httpError.js';
import { idParamSchema, vinculoSchema } from './familia.validators.js';

const router = Router();
router.use(authRequired, requireRole('admin', 'secretaria', 'super_root'));

const COLS = 'id, paciente_id, dependiente_id, parentesco, created_at';

/** Validación: el vínculo debe pertenecer a la misma clínica. */
async function existePacienteEnClinica(pacienteId: string, clinicaId: string | null): Promise<boolean> {
  if (clinicaId === null) return true; // super_root / multi-clínica
  const { data } = await getSupabase()
    .from('pacientes')
    .select('id')
    .eq('id', pacienteId)
    .eq('clinica_id', clinicaId)
    .maybeSingle();
  return Boolean(data);
}

/**
 * GET /api/familia?paciente_id=
 * Lista los dependientes (vínculos) de un paciente de cabecera.
 */
router.get('/', async (req, res, next) => {
  try {
    const { paciente_id } = req.query as { paciente_id?: string };
    const user = req.user!;

    let query = getSupabase().from('vinculos_familiares').select('id, paciente_id, dependiente_id, parentesco, created_at');
    if (paciente_id) query = query.eq('paciente_id', paciente_id);
    else if (user.clinicaId) {
      // Todos los vínculos de la clínica.
      const { data: pacientes } = await getSupabase().from('pacientes').select('id').eq('clinica_id', user.clinicaId);
      const ids = (pacientes ?? []).map((p) => p.id as string);
      if (!ids.length) return res.json([]);
      query = query.in('paciente_id', ids);
    }

    const { data, error } = await query.order('created_at', { ascending: false });
    if (error) return next(badRequest(error.message));

    // Resolver nombres de dependientes (funciona en mock y Supabase real).
    const dependienteIds = (data ?? []).map((v) => v.dependiente_id).filter(Boolean) as string[];
    let personas: Record<string, unknown>[] = [];
    if (dependienteIds.length) {
      const { data: ps } = await getSupabase()
        .from('pacientes')
        .select('id, cedula, nombre_completo, fecha_nacimiento')
        .in('id', dependienteIds);
      personas = ps ?? [];
    }
    const porId = new Map(personas.map((p) => [p.id, p]));

    res.json((data ?? []).map((v) => ({ ...v, dependientes: porId.get(v.dependiente_id as string) ?? null })));
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/familia
 * Vincula un dependiente a un paciente de cabecera (con parentesco).
 */
router.post('/', validate(vinculoSchema), async (req, res, next) => {
  try {
    const body = req.body as z.infer<typeof vinculoSchema>;
    const user = req.user!;

    if (!(await existePacienteEnClinica(body.paciente_id, user.clinicaId))) return next(forbidden('El paciente no pertenece a la clínica'));
    if (!(await existePacienteEnClinica(body.dependiente_id, user.clinicaId))) return next(forbidden('El dependiente no pertenece a la clínica'));
    if (body.paciente_id === body.dependiente_id) return next(badRequest('El dependiente no puede ser el mismo paciente'));

    // Evitar duplicados (par único).
    const { data: dup } = await getSupabase()
      .from('vinculos_familiares')
      .select('id')
      .eq('paciente_id', body.paciente_id)
      .eq('dependiente_id', body.dependiente_id)
      .maybeSingle();
    if (dup) return next(badRequest('Ese vínculo ya existe'));

    const { data, error } = await getSupabase().from('vinculos_familiares').insert(body).select(COLS).single();
    if (error) return next(badRequest(error.message));
    res.status(201).json(data);
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/familia/:id
 * Rompe un vínculo familiar.
 */
router.delete('/:id', validate(idParamSchema, 'params'), async (req, res, next) => {
  try {
    const { id } = req.params as z.infer<typeof idParamSchema>;
    const user = req.user!;

    const { data: vinculo } = await getSupabase().from('vinculos_familiares').select('id, paciente_id').eq('id', id).maybeSingle();
    if (!vinculo) return next(notFound('Vínculo no encontrado'));

    if (user.clinicaId) {
      const { data: paciente } = await getSupabase().from('pacientes').select('id').eq('id', vinculo.paciente_id).eq('clinica_id', user.clinicaId).maybeSingle();
      if (!paciente) return next(forbidden('El vínculo no pertenece a la clínica'));
    }

    await getSupabase().from('vinculos_familiares').delete().eq('id', id);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

export default router;