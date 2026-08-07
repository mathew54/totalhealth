import { Router } from 'express';
import { z } from 'zod';
import { getSupabase } from '../../config/supabase.js';
import { authRequired } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';
import { validate } from '../../middleware/validate.js';
import { badRequest, notFound } from '../../utils/httpError.js';
import { crearTurnoSchema, idParamSchema, estadoTurnoSchema, turnosQuery } from './turnos.validators.js';
import { fechaHoyCaracas } from '../../services/bcv.js';

const router = Router();
router.use(authRequired, requireRole('secretaria', 'admin', 'super_root'));

const COLS = 'id, clinica_id, paciente_id, consulta_id, numero, fecha, estado, prioridad, creado_por, hora_creado, hora_llamado, hora_atendido';

/** Asigna el próximo número del día. */
async function proximoNumero(clinicaId: string | null, fecha: string): Promise<number> {
  const { data } = await getSupabase()
    .from('turnos')
    .select('numero')
    .eq('fecha', fecha)
    .order('numero', { ascending: false })
    .range(0, 0);
  return (data?.[0]?.numero as number ?? 0) + 1;
}

/**
 * POST /api/turnos
 * Genera un turno para un paciente (colas consistentes).
 */
router.post('/', validate(crearTurnoSchema), async (req, res, next) => {
  try {
    const body = req.body as z.infer<typeof crearTurnoSchema>;
    const user = req.user!;
    const fecha = fechaHoyCaracas();
    const numero = await proximoNumero(user.clinicaId, fecha);

    const { data, error } = await getSupabase()
      .from('turnos')
      .insert({
        clinica_id: user.clinicaId,
        paciente_id: body.paciente_id,
        consulta_id: body.consulta_id ?? null,
        numero,
        fecha,
        estado: 'esperando',
        prioridad: body.prioridad ?? 'normal',
        creado_por: user.id,
      })
      .select(COLS)
      .single();
    if (error) return next(badRequest(error.message));
    res.status(201).json(data);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/turnos?fecha=&estado=
 * Cola del día (sala de espera).
 */
router.get('/', validate(turnosQuery, 'query'), async (_req, res, next) => {
  try {
    const { fecha, estado } = _req.query as z.infer<typeof turnosQuery>;
    let query = getSupabase().from('turnos').select(COLS);
    if (fecha) query = query.eq('fecha', fecha);
    if (estado) query = query.eq('estado', estado);
    query = query.order('numero', { ascending: true });

    const { data } = await query;
    const ids = (data ?? []).map((t) => t.paciente_id as string);
    const { data: pacientes } = await getSupabase().from('pacientes').select('id, nombre_completo, cedula');
    const porId = new Map((pacientes ?? []).map((p) => [p.id, p]));

    res.json((data ?? []).map((t) => ({ ...t, paciente: porId.get(t.paciente_id as string) ?? null })));
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/turnos/:id/estado
 * Controla el turno: llamado → atendido → saltado | cancelado.
 */
router.patch('/:id/estado', validate(idParamSchema, 'params'), validate(estadoTurnoSchema, 'body'), async (req, res, next) => {
  try {
    const { id } = req.params as z.infer<typeof idParamSchema>;
    const { estado } = req.body as z.infer<typeof estadoTurnoSchema>;

    const { data: turno } = await getSupabase().from('turnos').select('id, estado').eq('id', id).maybeSingle();
    if (!turno) return next(notFound('Turno no encontrado'));

    const patch: Record<string, unknown> = { estado };
    if (estado === 'llamado') patch.hora_llamado = new Date().toISOString();
    if (estado === 'atendido') patch.hora_atendido = new Date().toISOString();

    const { data, error } = await getSupabase().from('turnos').update(patch).eq('id', id).select(COLS).single();
    if (error) return next(badRequest(error.message));
    res.json(data);
  } catch (err) {
    next(err);
  }
});

export default router;