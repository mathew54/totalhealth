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
import { fechaCaracasDeISO } from '../../utils/fechaCaracas.js';
import { proximoNumeroTurno } from '../../services/turnos.js';
import { consultasQuery, createConsultaSchema, actualizarConsultaSchema, diagnosticoSchema, idParamSchema } from './consultas.validators.js';

const router = Router();
router.use(authRequired);

const CONSULTA_COLS =
  'id, paciente_id, medico_id, clinica_id, fecha_hora, motivo, diagnostico, notas, estado, created_at';

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

  const fecha = fechaCaracasDeISO(consulta.fecha_hora) ?? '';
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
 * Elimina los recordatorios de cita pendientes vinculados a una consulta
 * (por `metadata.consulta_id`), al reprogramar o eliminar la cita.
 */
async function limpiarRecordatoriosCita(consultaId: string): Promise<void> {
  const { data: notifs } = await getSupabase().from('notificaciones').select('id, tipo, metadata, estado');
  const aBorrar = (notifs ?? [])
    .filter(
      (n) =>
        n.tipo === 'cita' &&
        n.estado === 'pendiente' &&
        (n.metadata as Record<string, unknown> | null)?.consulta_id === consultaId,
    )
    .map((n) => n.id);
  if (aBorrar.length === 0) return;
  await getSupabase().from('notificaciones').delete().in('id', aBorrar);
}

/**
 * PATCH /api/consultas/:id
 * Edita una consulta no completada (fecha/hora, médico, motivo, notas). Si cambia
 * la fecha o el médico se refrescan los recordatorios de cita y, al cambiar la
 * fecha, se actualiza el día del turno vinculado en la sala de espera.
 */
router.patch(
  '/:id',
  requireRole('medico', 'secretaria', 'admin', 'super_root'),
  validate(idParamSchema, 'params'),
  validate(actualizarConsultaSchema),
  async (req, res, next) => {
    try {
      const { id } = req.params as z.infer<typeof idParamSchema>;
      const body = req.body as z.infer<typeof actualizarConsultaSchema>;
      const user = req.user!;

      const { data: consulta, error: getErr } = await getSupabase()
        .from('consultas')
        .select('id, paciente_id, medico_id, fecha_hora, estado')
        .eq('id', id)
        .single();
      if (getErr || !consulta) return next(notFound('Consulta no encontrada'));

      if (user.role === 'medico' && consulta.medico_id !== user.id) {
        return next(forbidden('Solo puedes editar tus consultas'));
      }
      if (consulta.estado === 'completada') {
        return next(badRequest('No se puede editar una consulta completada'));
      }

      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (user.role !== 'medico' && body.medico_id !== undefined) updates.medico_id = body.medico_id;
      if (body.fecha_hora !== undefined) updates.fecha_hora = body.fecha_hora;
      if (body.motivo !== undefined) updates.motivo = body.motivo;
      if (body.notas !== undefined) updates.notas = body.notas;

      const { data: updated, error: uErr } = await getSupabase()
        .from('consultas')
        .update(updates)
        .eq('id', id)
        .select(CONSULTA_COLS)
        .single();
      if (uErr) return next(badRequest(uErr.message));

      const fechaCambia = body.fecha_hora !== undefined && body.fecha_hora !== consulta.fecha_hora;
      const medicoCambia = user.role !== 'medico' && body.medico_id !== undefined && body.medico_id !== consulta.medico_id;
      if (fechaCambia || medicoCambia) {
        await limpiarRecordatoriosCita(id);
        if (fechaCambia) {
          await getSupabase().from('turnos').update({ fecha: fechaCaracasDeISO(body.fecha_hora!) ?? '' }).eq('consulta_id', id);
        }
        const finalFecha = body.fecha_hora ?? (consulta.fecha_hora as string);
        const finalMedico = user.role === 'medico' ? user.id : (body.medico_id ?? consulta.medico_id);
        const [{ data: paciente }, { data: medico }] = await Promise.all([
          getSupabase().from('pacientes').select('nombre_completo').eq('id', consulta.paciente_id).maybeSingle(),
          getSupabase().from('profiles').select('nombre_completo').eq('id', finalMedico).maybeSingle(),
        ]);
        await recordatorioCita({
          pacienteId: consulta.paciente_id,
          nombre: (paciente?.nombre_completo as string) ?? 'Paciente',
          fechaHora: finalFecha,
          medicos: (medico?.nombre_completo as string) ?? 'el médico',
          metadata: { consulta_id: id },
        }).catch(() => {});
      }

      res.json(updated);
    } catch (err) {
      next(err);
    }
  },
);

/**
 * DELETE /api/consultas/:id
 * Elimina una consulta no completada, junto con su turno de sala de espera y los
 * recordatorios de cita pendientes. No permite eliminar consultas con exámenes
 * asociados (mejor cancelarlas o eliminarlas desde el módulo de laboratorio).
 */
router.delete(
  '/:id',
  requireRole('medico', 'secretaria', 'admin', 'super_root'),
  validate(idParamSchema, 'params'),
  async (req, res, next) => {
    try {
      const { id } = req.params as z.infer<typeof idParamSchema>;
      const user = req.user!;

      const { data: consulta, error: getErr } = await getSupabase()
        .from('consultas')
        .select('id, medico_id, estado')
        .eq('id', id)
        .single();
      if (getErr || !consulta) return next(notFound('Consulta no encontrada'));

      if (user.role === 'medico' && consulta.medico_id !== user.id) {
        return next(forbidden('Solo puedes eliminar tus consultas'));
      }
      if (consulta.estado === 'completada') {
        return next(badRequest('No se puede eliminar una consulta completada'));
      }

      const { data: conExamenes } = await getSupabase().from('solicitudes').select('id').eq('consulta_id', id).range(0, 0);
      if ((conExamenes ?? []).length > 0) {
        return next(badRequest('La consulta tiene exámenes de laboratorio asociados; cancélala en lugar de eliminarla'));
      }

      await limpiarRecordatoriosCita(id);
      await getSupabase().from('turnos').delete().eq('consulta_id', id);

      const { error: delErr } = await getSupabase().from('consultas').delete().eq('id', id);
      if (delErr) return next(badRequest(delErr.message));
      res.json({ ok: true });
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
