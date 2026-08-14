import { Router } from 'express';
import { z } from 'zod';
import { getSupabase } from '../../config/supabase.js';
import { authRequired } from '../../middleware/auth.js';
import { requireRole } from '../../middleware/rbac.js';
import { ROLES_SECRETARIA_ADMIN } from '../../roles.js';
import { validate } from '../../middleware/validate.js';
import { badRequest, notFound } from '../../utils/httpError.js';
import { crearTurnoSchema, asignarMedicoSchema, idParamSchema, estadoTurnoSchema, turnosQuery } from './turnos.validators.js';
import { fechaHoyCaracas } from '../../services/bcv.js';
import { notificarSalaEspera } from '../../services/notifier.js';
import { proximoNumeroTurno } from '../../services/turnos.js';

const router = Router();
router.use(authRequired, requireRole(...ROLES_SECRETARIA_ADMIN));

const COLS = 'id, clinica_id, paciente_id, consulta_id, numero, fecha, estado, prioridad, creado_por, hora_creado, hora_llamado, hora_atendido';

const DURACION_ATENCION_MIN = 20;

interface ConsultaBasica {
  id: string;
  medico_id: string | null;
  fecha_hora: string;
}

/**
 * Calcula la fecha/hora de la próxima consulta creada desde la sala de espera:
 * hoy (America/Caracas) con una hora posterior al último paciente del día
 * (última consulta programada o último turno generado) más una duración base.
 */
async function proximaFechaHora(clinicaId: string | null): Promise<string> {
  const fecha = fechaHoyCaracas();
  const [{ data: citas }, { data: ultimoTurno }] = await Promise.all([
    getSupabase()
      .from('consultas')
      .select('fecha_hora')
      .gte('fecha_hora', `${fecha}T00:00:00.000Z`)
      .lte('fecha_hora', `${fecha}T23:59:59.999Z`)
      .order('fecha_hora', { ascending: false })
      .limit(1),
    getSupabase()
      .from('turnos')
      .select('hora_creado')
      .eq('fecha', fecha)
      .order('numero', { ascending: false })
      .limit(1),
  ]);

  const ref = Math.max(
    citas?.[0]?.fecha_hora ? new Date(citas[0].fecha_hora as string).getTime() : 0,
    ultimoTurno?.[0]?.hora_creado ? new Date(ultimoTurno[0].hora_creado as string).getTime() : 0,
    Date.now(),
  );
  return new Date(ref + DURACION_ATENCION_MIN * 60_000).toISOString();
}

/** Enriquece turnos con paciente, médico (de la consulta vinculada) y hora de la cita. */
async function enriquecerTurnos<T extends { paciente_id: string; consulta_id: string | null }>(turnos: T[]) {
  const consultaIds = turnos.map((t) => t.consulta_id).filter(Boolean) as string[];

  const [{ data: pacientes }, { data: consultas }] = await Promise.all([
    getSupabase().from('pacientes').select('id, nombre_completo, cedula'),
    consultaIds.length
      ? getSupabase().from('consultas').select('id, medico_id, fecha_hora').in('id', consultaIds)
      : Promise.resolve({ data: [] }),
  ]);

  const medicoIds = (consultas ?? []).map((c) => c.medico_id as string).filter(Boolean) as string[];
  const medicosPorId = new Map<string, { nombre_completo: string; especialidad: string | null }>();
  if (medicoIds.length) {
    const { data: medicos } = await getSupabase()
      .from('profiles')
      .select('id, nombre_completo, especialidad')
      .in('id', medicoIds);
    for (const m of medicos ?? []) medicosPorId.set(m.id as string, m as { nombre_completo: string; especialidad: string | null });
  }

  const consultaPorId = new Map<string, ConsultaBasica>((consultas ?? []).map((c) => [c.id as string, c as ConsultaBasica]));
  const pacientePorId = new Map((pacientes ?? []).map((p) => [p.id, p]));

  return turnos.map((t) => {
    const consulta = t.consulta_id ? consultaPorId.get(t.consulta_id) : undefined;
    return {
      ...t,
      paciente: pacientePorId.get(t.paciente_id) ?? null,
      medico: (consulta?.medico_id ? medicosPorId.get(consulta.medico_id) : undefined) ?? null,
      hora_cita: consulta?.fecha_hora ?? null,
    };
  });
}

/** Crea una consulta (registro de la sala de espera) con fecha/hora automáticas. */
async function crearConsultaSalaEspera(pacienteId: string, clinicaId: string | null, medicoId: string | null): Promise<string> {
  const fechaHora = await proximaFechaHora(clinicaId);
  const { data, error } = await getSupabase()
    .from('consultas')
    .insert({
      paciente_id: pacienteId,
      medico_id: medicoId,
      clinica_id: clinicaId,
      fecha_hora: fechaHora,
      estado: 'programada',
      origen: 'sala_espera',
    })
    .select('id')
    .single();
  if (error) throw error;
  return data.id as string;
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

    let consultaId = body.consulta_id ?? null;
    if (body.consulta_id) {
      // Consulta existente: actualizar el médico si viene uno en el turno.
      if (body.medico_id) {
        const r = await getSupabase().from('consultas').update({ medico_id: body.medico_id }).eq('id', body.consulta_id);
        if (r.error) return next(badRequest(r.error.message));
      }
    } else if (body.medico_id) {
      // Nuevo registro desde la sala de espera: se crea la consulta con fecha y
      // hora automáticas (hoy, posterior al último paciente en cola).
      try {
        consultaId = await crearConsultaSalaEspera(body.paciente_id, user.clinicaId, body.medico_id);
      } catch (err) {
        return next(badRequest((err as Error).message));
      }
    }

    const numero = await proximoNumeroTurno(user.clinicaId, fecha);

    const { data, error } = await getSupabase()
      .from('turnos')
      .insert({
        clinica_id: user.clinicaId,
        paciente_id: body.paciente_id,
        consulta_id: consultaId,
        numero,
        fecha,
        estado: 'esperando',
        prioridad: body.prioridad ?? 'normal',
        creado_por: user.id,
      })
      .select(COLS)
      .single();
    if (error) return next(badRequest(error.message));

    const [enriquecido] = await enriquecerTurnos([data]);

    // Genera el aviso de sala de espera (recordatorio tipo 'turno') automáticamente.
    try {
      const p = await getSupabase().from('pacientes').select('nombre_completo').eq('id', body.paciente_id).maybeSingle();
      if (p.data?.nombre_completo) {
        await notificarSalaEspera({
          pacienteId: body.paciente_id,
          nombre: p.data.nombre_completo as string,
          numero,
          fecha,
          metadata: { turno_id: data.id },
        });
      }
    } catch {
      // No romper la creación del turno si el aviso falla.
    }

    res.status(201).json(enriquecido);
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
    // La sala de espera siempre es del día en curso: si no se filtra, se usa la
    // fecha de hoy (America/Caracas) para que coincida con la agenda del día.
    const dia = fecha ?? fechaHoyCaracas();
    let query = getSupabase().from('turnos').select(COLS).eq('fecha', dia);
    if (estado) query = query.eq('estado', estado);
    query = query.order('numero', { ascending: true });

    const { data } = await query;
    const turnos = await enriquecerTurnos(data ?? []);
    res.json(turnos);
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/turnos/:id/medico
 * Asigna el médico que atenderá al paciente. Si el turno no tiene consulta
 * vinculada, la crea con fecha/hora automáticas (registro desde sala de espera).
 */
router.patch('/:id/medico', validate(idParamSchema, 'params'), validate(asignarMedicoSchema, 'body'), async (req, res, next) => {
  try {
    const { id } = req.params as z.infer<typeof idParamSchema>;
    const { medico_id } = req.body as z.infer<typeof asignarMedicoSchema>;
    const user = req.user!;

    const { data: turno } = await getSupabase().from('turnos').select('id, paciente_id, consulta_id').eq('id', id).maybeSingle();
    if (!turno) return next(notFound('Turno no encontrado'));

    let consultaId = turno.consulta_id as string | null;
    if (consultaId) {
      const r = await getSupabase().from('consultas').update({ medico_id }).eq('id', consultaId);
      if (r.error) return next(badRequest(r.error.message));
    } else {
      try {
        consultaId = await crearConsultaSalaEspera(turno.paciente_id as string, user.clinicaId, medico_id);
      } catch (err) {
        return next(badRequest((err as Error).message));
      }
      const r = await getSupabase().from('turnos').update({ consulta_id: consultaId }).eq('id', id).select(COLS).single();
      if (r.error) return next(badRequest(r.error.message));
    }

    const actualizado = await getSupabase().from('turnos').select(COLS).eq('id', id).single();
    if (!actualizado.data) return next(notFound('Turno no encontrado'));
    const [enriquecido] = await enriquecerTurnos([actualizado.data]);
    res.json(enriquecido);
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

    const { data: turno } = await getSupabase().from('turnos').select('id, estado, consulta_id, paciente_id, numero').eq('id', id).maybeSingle();
    if (!turno) return next(notFound('Turno no encontrado'));

    // Avisa en el momento de la llamada ("es tu turno").
    if (estado === 'llamado') {
      try {
        const p = await getSupabase().from('pacientes').select('nombre_completo').eq('id', turno.paciente_id).maybeSingle();
        if (p.data?.nombre_completo) {
          await notificarSalaEspera({
            pacienteId: turno.paciente_id as string,
            nombre: p.data.nombre_completo as string,
            numero: turno.numero as number,
            atendido: true,
            metadata: { turno_id: turno.id },
          });
        }
      } catch {
        // No romper el cambio de estado si el aviso falla.
      }
    }

    const patch: Record<string, unknown> = { estado };
    if (estado === 'llamado') patch.hora_llamado = new Date().toISOString();
    if (estado === 'atendido') patch.hora_atendido = new Date().toISOString();

    const { data, error } = await getSupabase().from('turnos').update(patch).eq('id', id).select(COLS).single();
    if (error) return next(badRequest(error.message));

    // Retroalimentación Sala de espera → Agenda: el estado del turno se
    // refleja en la consulta del día para todos los perfiles.
    const cid = turno.consulta_id as string | null;
    if (cid) {
      const estadoConsulta =
        estado === 'atendido' ? 'en_curso' : estado === 'cancelado' ? 'cancelada' : null;
      if (estadoConsulta) {
        try {
          const r = await getSupabase()
            .from('consultas')
            .update({ estado: estadoConsulta })
            .eq('id', cid);
          if (r.error) throw r.error;
        } catch {
          // Fail-open.
        }
      }
    }

    res.json(data);
  } catch (err) {
    next(err);
  }
});

export default router;