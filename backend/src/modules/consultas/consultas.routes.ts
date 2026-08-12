import { Router } from 'express';
import { z } from 'zod';
import { getSupabase } from '../../config/supabase.js';
import { authRequired } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';
import { validate } from '../../middleware/validate.js';
import { badRequest, forbidden, notFound } from '../../utils/httpError.js';
import { recordatorioCita } from '../../services/notifier.js';
import { decryptCampo } from '../../services/cifrado.js';
import { conTelefonoSeparado } from '../../services/phoneNumber.js';
import { consultasQuery, createConsultaSchema, diagnosticoSchema, idParamSchema } from './consultas.validators.js';

const router = Router();
router.use(authRequired);

const CONSULTA_COLS =
  'id, paciente_id, medico_id, clinica_id, fecha_hora, motivo, diagnostico, notas, estado, created_at';

/** Fecha (America/Caracas) de un ISO datetime, formato YYYY-MM-DD. */
function fechaCaracasDe(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Caracas',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso));
}

/** Asigna el próximo número de turno del día (mismo esquema que el módulo turnos). */
async function proximoNumeroTurno(clinicaId: string | null, fecha: string): Promise<number> {
  const { data } = await getSupabase()
    .from('turnos')
    .select('numero')
    .eq('fecha', fecha)
    .order('numero', { ascending: false })
    .range(0, 0);
  return (data?.[0]?.numero as number ?? 0) + 1;
}

/**
 * Crea el turno de sala de espera vinculado a una consulta (retroalimentación
 * Agenda → Sala de espera). Si la consulta ya tiene turno, no duplica.
 */
async function asegurarTurnoConsulta(consulta: { id: string; paciente_id: string; fecha_hora: string }, clinicaId: string | null, creadoPor: string): Promise<void> {
  const { data: existente } = await getSupabase()
    .from('turnos')
    .select('id')
    .eq('consulta_id', consulta.id)
    .maybeSingle();
  if (existente) return;

  const fecha = fechaCaracasDe(consulta.fecha_hora);
  const numero = await proximoNumeroTurno(clinicaId, fecha);
  try {
    const r = await getSupabase()
      .from('turnos')
      .insert({
        clinica_id: clinicaId,
        paciente_id: consulta.paciente_id,
        consulta_id: consulta.id,
        numero,
        fecha,
        estado: 'esperando',
        prioridad: 'normal',
        creado_por: creadoPor,
      })
      .select('id')
      .single();
    if (r.error) throw r.error;
  } catch {
    // Fail-open: si la creación del turno falla, la consulta no se pierde.
  }
}

/**
 * GET /api/consultas?fecha=&desde=&hasta=&medico_id=&estado=
 * Agenda (día / semana / mes). El médico solo ve sus consultas; secretaria/admin
 * ven todas. Cada consulta se enriquece con el paciente, el médico (con su
 * especialidad) y el turno de sala de espera asociado, para que la agenda
 * refleje el estado de la cola en tiempo real.
 */
router.get('/', validate(consultasQuery, 'query'), async (req, res, next) => {
  try {
    const { fecha, desde, hasta, medico_id, estado, limit } = req.query as unknown as z.infer<typeof consultasQuery>;
    const user = req.user!;

    let query = getSupabase().from('consultas').select(CONSULTA_COLS);

    if (user.role === 'medico') query = query.eq('medico_id', user.id);
    else if (medico_id) query = query.eq('medico_id', medico_id);

    if (fecha) {
      query = query.gte('fecha_hora', `${fecha}T00:00:00.000Z`).lte('fecha_hora', `${fecha}T23:59:59.999Z`);
    } else if (desde && hasta) {
      query = query.gte('fecha_hora', `${desde}T00:00:00.000Z`).lte('fecha_hora', `${hasta}T23:59:59.999Z`);
    }
    if (estado) query = query.eq('estado', estado);

    query = query.order('fecha_hora', { ascending: true });

    const { data, error } = await query;
    if (error) return next(error);

    const consultas = (data ?? []).slice(0, limit);
    const consultaIds = consultas.map((c) => c.id as string);

    const [pacientes, medicos, turnos] = await Promise.all([
      getSupabase().from('pacientes').select('id, cedula, nombre_completo'),
      getSupabase().from('profiles').select('id, nombre_completo, especialidad, categoria_medica'),
      getSupabase().from('turnos').select('id, consulta_id, numero, estado, prioridad'),
    ]);

    const pacientePorId = new Map((pacientes.data ?? []).map((p) => [p.id, p]));
    const medicoPorId = new Map((medicos.data ?? []).map((m) => [m.id, m]));
    const turnoPorConsulta = new Map<string, { id: string; numero: number; estado: string; prioridad: string }>();
    for (const t of turnos.data ?? []) {
      const cid = t.consulta_id as string | null;
      if (cid && consultaIds.includes(cid) && !turnoPorConsulta.has(cid)) {
        turnoPorConsulta.set(cid, {
          id: t.id as string,
          numero: t.numero as number,
          estado: t.estado as string,
          prioridad: t.prioridad as string,
        });
      }
    }

    res.json(
      consultas.map((c) => ({
        ...c,
        paciente: pacientePorId.get(c.paciente_id as string) ?? null,
        medico: medicoPorId.get(c.medico_id as string) ?? null,
        turno: turnoPorConsulta.get(c.id as string) ?? null,
      })),
    );
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/consultas
 * Agenda una consulta. El médico se asigna a sí mismo; la secretaria elige médico.
 */
router.post(
  '/',
  requireRole('medico', 'secretaria', 'admin', 'super_root'),
  validate(createConsultaSchema),
  async (req, res, next) => {
    try {
      const body = req.body as z.infer<typeof createConsultaSchema>;
      const user = req.user!;

      const medico_id = user.role === 'medico' ? user.id : body.medico_id;
      if (!medico_id) return next(badRequest('medico_id es requerido'));

      const { data: paciente, error: pErr } = await getSupabase()
        .from('pacientes')
        .select('id, nombre_completo')
        .eq('id', body.paciente_id)
        .maybeSingle();
      if (pErr) return next(pErr);
      if (!paciente) return next(notFound('Paciente no encontrado'));

      const { data: medico, error: mErr } = await getSupabase()
        .from('profiles')
        .select('id, nombre_completo')
        .eq('id', medico_id)
        .maybeSingle();
      if (mErr) return next(mErr);

      const { data: consulta, error } = await getSupabase()
        .from('consultas')
        .insert({
          paciente_id: body.paciente_id,
          medico_id,
          clinica_id: user.clinicaId,
          fecha_hora: body.fecha_hora,
          motivo: body.motivo,
          notas: body.notas,
          estado: 'programada',
          origen: 'staff',
        })
        .select(CONSULTA_COLS)
        .single();

      if (error) return next(badRequest(error.message));

      // Dispara recordatorios de cita (24h y 1h antes) automáticamente.
      await recordatorioCita({
        pacienteId: body.paciente_id,
        nombre: paciente.nombre_completo,
        fechaHora: body.fecha_hora,
        medicos: medico?.nombre_completo ?? 'el médico',
      }).catch(() => {});

      // Retroalimentación Agenda → Sala de espera: la consulta genera su turno.
      await asegurarTurnoConsulta(consulta, user.clinicaId, user.id);

      res.status(201).json(consulta);
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /api/consultas/medicos
 * Médicos activos (con especialidad y categoría) para agendar una consulta.
 * Accesible a todo el staff autenticado — a diferencia de `/admin/staff`, que
 * es solo admin/super_root. El formulario filtra por especialidad.
 */
router.get('/medicos', async (_req, res, next) => {
  try {
    const { data, error } = await getSupabase()
      .from('profiles')
      .select('id, nombre_completo, especialidad, categoria_medica')
      .eq('role', 'medico')
      .eq('activo', true)
      .order('nombre_completo', { ascending: true });
    if (error) return next(error);
    res.json(data ?? []);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/consultas/:id
 * Detalle de la consulta + datos básicos del paciente.
 */
router.get('/:id', validate(idParamSchema, 'params'), async (req, res, next) => {
  try {
    const { id } = req.params as z.infer<typeof idParamSchema>;
    const user = req.user!;

    const { data: consulta, error } = await getSupabase()
      .from('consultas')
      .select(CONSULTA_COLS)
      .eq('id', id)
      .single();
    if (error || !consulta) return next(notFound('Consulta no encontrada'));

    if (user.role === 'medico' && consulta.medico_id !== user.id) {
      return next(forbidden('No puedes ver esta consulta'));
    }

    const { data: paciente } = await getSupabase()
      .from('pacientes')
      .select('id, cedula, nombre_completo, telefono, fecha_nacimiento')
      .eq('id', consulta.paciente_id)
      .single();

    res.json({
      ...consulta,
      paciente: paciente
        ? conTelefonoSeparado({ ...paciente, telefono: decryptCampo((paciente.telefono as string | null) ?? null) })
        : null,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/consultas/:id/diagnostico
 * El médico autor registra el diagnóstico y cierra la consulta.
 */
router.patch(
  '/:id/diagnostico',
  requireRole('medico', 'super_root'),
  validate(diagnosticoSchema),
  validate(idParamSchema, 'params'),
  async (req, res, next) => {
    try {
      const { id } = req.params as z.infer<typeof idParamSchema>;
      const body = req.body as z.infer<typeof diagnosticoSchema>;
      const user = req.user!;

      const { data: consulta, error: getErr } = await getSupabase()
        .from('consultas')
        .select('medico_id')
        .eq('id', id)
        .single();
      if (getErr || !consulta) return next(notFound('Consulta no encontrada'));

      if (user.role === 'medico' && consulta.medico_id !== user.id) {
        return next(forbidden('Solo el médico asignado puede registrar el diagnóstico'));
      }

      const { data: updated, error } = await getSupabase()
        .from('consultas')
        .update({ diagnostico: body.diagnostico, notas: body.notas ?? null, estado: 'completada' })
        .eq('id', id)
        .select(CONSULTA_COLS)
        .single();
      if (error) return next(badRequest(error.message));

      // Retroalimentación Agenda → Sala de espera: al cerrar la consulta, el
      // turno vinculado pasa a atendido (ya no está en cola).
      try {
        const r = await getSupabase()
          .from('turnos')
          .update({ estado: 'atendido', hora_atendido: new Date().toISOString() })
          .eq('consulta_id', id)
          .in('estado', ['esperando', 'llamado']);
        if (r.error) throw r.error;
      } catch {
        // Fail-open.
      }

      res.json(updated);
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /api/consultas/:id/historial
 * Historial clínico del paciente (consultas previas + recetas).
 */
router.get('/:id/historial', validate(idParamSchema, 'params'), async (req, res, next) => {
  try {
    const { id } = req.params as z.infer<typeof idParamSchema>;
    const user = req.user!;

    const { data: consulta, error } = await getSupabase()
      .from('consultas')
      .select('id, paciente_id, medico_id')
      .eq('id', id)
      .single();
    if (error || !consulta) return next(notFound('Consulta no encontrada'));

    if (user.role === 'medico' && consulta.medico_id !== user.id) {
      return next(forbidden('No puedes ver esta consulta'));
    }

    const [consultas, recipes] = await Promise.all([
      getSupabase().from('consultas').select(CONSULTA_COLS).eq('paciente_id', consulta.paciente_id).order('fecha_hora', { ascending: false }),
      getSupabase().from('recipes').select('id, fecha_emision, fecha_expiracion, estado').eq('paciente_id', consulta.paciente_id).order('fecha_emision', { ascending: false }),
    ]);

    res.json({ paciente_id: consulta.paciente_id, consultas: consultas.data ?? [], recipes: recipes.data ?? [] });
  } catch (err) {
    next(err);
  }
});

export default router;
