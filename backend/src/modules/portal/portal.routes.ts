import crypto from 'node:crypto';
import { Router, type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import { getSupabase } from '../../config/supabase.js';
import { validate } from '../../middleware/validate.js';
import { badRequest, conflict, forbidden, notFound, unauthorized } from '../../utils/httpError.js';
import { signPortalToken, signShareToken, verifyPortalToken, verifyShareToken } from '../../utils/jwt.js';
import { MODULOS_CUESTIONARIO, OBSERVACIONES_MODULO, normalizarRespuestas } from '../historial/cuestionarios/definicion.js';
import { respuestasSchema as respuestasCuestionarioSchema } from '../historial/cuestionarios/cuestionario.validators.js';
import { normalizeCedula } from '../pacientes/pacientes.validators.js';
import { recordatorioCita } from '../../services/notifier.js';
import { getMessagingProvider } from '../../services/messagingProvider.js';
import { decryptCampo } from '../../services/cifrado.js';
import { conTelefonoSeparado } from '../../services/phoneNumber.js';
import { registrarAuditoria, ipDeRequest } from '../../services/auditoria.js';
import { obtenerTasasActivas, usdABs, montoAUsd } from '../../services/moneda.js';
import { fechaHoyCaracas } from '../../services/bcv.js';
import { fechaCaracasDeISO } from '../../utils/fechaCaracas.js';
import { generarCodigoSchema, verificarSchema, reservarSchema, reprogramarSchema, cancelarSchema, idParamSchema } from './portal.validators.js';

const router = Router();

const OTP_TTL_MS = 5 * 60 * 1000;
const OTP_MAX_INTENTOS = 5;

/** Cuerpo del POST del portal: paciente opcional (self por defecto) + respuestas.
 * Acepta pacientes cuyo `respuestas` es el esquema del cuestionario de anamnesis. */
const respuestasPortalSchema = z.object({
  paciente_id: z.string().uuid('Paciente inválido').optional(),
  respuestas: respuestasCuestionarioSchema,
});

const hashCodigo = (codigo: string, pacienteId: string) =>
  crypto.createHash('sha256').update(`${codigo}:${pacienteId}`).digest('hex');

async function buscarPacientePorCedula(cedulaNormalizada: string) {
  const { data } = await getSupabase()
    .from('pacientes')
    .select('id, cedula, nombre_completo, telefono')
    .eq('cedula', cedulaNormalizada)
    .maybeSingle();
  if (!data) return data;
  const claro = decryptCampo((data.telefono as string | null) ?? null);
  return conTelefonoSeparado({ ...data, telefono: claro });
}

/**
 * Conjunto de expedientes que el paciente autenticado (pid) puede gestionar:
 * él mismo + sus dependientes vinculados (perfiles familiares / hijos).
 */
async function pacienteIdYoDependientes(pid: string): Promise<Set<string>> {
  const ids = new Set<string>([pid]);
  const { data: vinculos } = await getSupabase()
    .from('vinculos_familiares')
    .select('dependiente_id')
    .eq('paciente_id', pid);
  for (const v of vinculos ?? []) {
    if (v.dependiente_id) ids.add(String(v.dependiente_id));
  }
  return ids;
}

/**
 * POST /api/portal/generar-codigo
 * Envía un OTP de 6 dígitos al teléfono registrado del paciente.
 */
router.post('/generar-codigo', validate(generarCodigoSchema), async (req, res, next) => {
  try {
    const { cedula } = req.body as z.infer<typeof generarCodigoSchema>;
    const paciente = await buscarPacientePorCedula(normalizeCedula(cedula));
    if (!paciente) return res.status(200).json({ ok: true }); // no revelar existencia

    // Invalidar códigos vigentes sin consumir
    const { data: vigentes } = await getSupabase()
      .from('portal_codigos')
      .select('id')
      .eq('paciente_id', paciente.id)
      .eq('consumido', false);
    for (const v of vigentes ?? []) {
      await getSupabase().from('portal_codigos').update({ consumido: true }).eq('id', v.id);
    }

    const codigo = String(Math.floor(100000 + Math.random() * 900000));
    const { error } = await getSupabase().from('portal_codigos').insert({
      paciente_id: paciente.id,
      codigo_hash: hashCodigo(codigo, paciente.id),
      expira_at: new Date(Date.now() + OTP_TTL_MS).toISOString(),
      consumido: false,
    });
    if (error) return next(error);

    const isDev = process.env.NODE_ENV !== 'production';
    // Despacha el OTP por el proveedor de mensajería (mock devuelve el código; en
    // producción SMTP/Twilio lo entregan fuera de banda al teléfono del paciente).
    let dev_codigo: string | undefined;
    try {
      const envio = await getMessagingProvider().sendOtp({
        destino: paciente.telefono ?? '',
        codigo,
        canal: 'sms',
      });
      if (envio.devContent && isDev) dev_codigo = envio.devContent;
    } catch (err) {
      // No revelar existencia: si el provider falla, responder lo mismo que si el
      // paciente no existiera (indistinguible), pero registrar el error.
      console.error('[otp] envío falló', err);
      return res.status(200).json({ ok: true });
    }

    res.status(200).json({
      ok: true,
      // Dev/Mock: se expone el código para poder probar el flujo sin SMS real.
      ...(dev_codigo ? { dev_codigo } : {}),
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/portal/verificar
 * Valida el OTP y emite un token de portal (corta vida) para el paciente.
 */
router.post('/verificar', validate(verificarSchema), async (req, res, next) => {
  try {
    const { cedula, codigo } = req.body as z.infer<typeof verificarSchema>;
    const paciente = await buscarPacientePorCedula(normalizeCedula(cedula));
    if (!paciente) return next(unauthorized('Código inválido'));

    const { data: codigos } = await getSupabase()
      .from('portal_codigos')
      .select('id, codigo_hash, consumido, intentos, expira_at')
      .eq('paciente_id', paciente.id)
      .order('created_at', { ascending: false });

    const cohorte = (codigos ?? []).find((c) => !c.consumido && new Date(c.expira_at).getTime() > Date.now());
    if (!cohorte) return next(unauthorized('Código inválido o expirado'));

    if (hashCodigo(codigo, paciente.id) !== cohorte.codigo_hash) {
      const intentos = Number(cohorte.intentos) + 1;
      await getSupabase().from('portal_codigos').update({ intentos }).eq('id', cohorte.id);
      if (intentos >= OTP_MAX_INTENTOS) {
        await getSupabase().from('portal_codigos').update({ consumido: true }).eq('id', cohorte.id);
      }
      await registrarAuditoria(
        {
          accion: 'PORTAL_OTP_FALLIDO',
          tabla: 'portal_codigos',
          registroId: cohorte.id,
          detalles: { cedula: paciente.cedula, intentos },
          ip: ipDeRequest(req),
        },
        paciente.id,
      );
      return next(unauthorized('Código inválido'));
    }

    await getSupabase().from('portal_codigos').update({ consumido: true }).eq('id', cohorte.id);
    await registrarAuditoria(
      {
        accion: 'PORTAL_LOGIN_OK',
        tabla: 'portal_codigos',
        registroId: cohorte.id,
        detalles: { cedula: paciente.cedula },
        ip: ipDeRequest(req),
      },
      paciente.id,
    );

    res.json({
      token: signPortalToken(paciente.id),
      paciente: { id: paciente.id, cedula: paciente.cedula, nombre_completo: paciente.nombre_completo },
    });
  } catch (err) {
    next(err);
  }
});

// ===== Endpoints protegidos por token de portal =====

function portalAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return next(unauthorized('Token del portal requerido'));
  try {
    req.patientId = verifyPortalToken(token).pid;
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/portal/mis-resultados
 * Resultados tomar de laboratorio descargables del paciente.
 */
router.get('/mis-resultados', portalAuth, async (req, res, next) => {
  try {
    const pid = req.patientId!;

    const [solicitudesRes, examenesRes] = await Promise.all([
      getSupabase().from('solicitudes').select('id, fecha, estado').eq('paciente_id', pid),
      getSupabase().from('examenes_laboratorio').select('id, nombre'),
    ]);
    // Las solicitudes anuladas (escondidas) no se muestran al paciente.
    const solicitudIds = (solicitudesRes.data ?? [])
      .filter((s) => s.estado !== 'anulada')
      .map((s) => s.id as string);
    const examenes = new Map((examenesRes.data ?? []).map((e) => [e.id, e.nombre]));

    let lineas: { id: string; solicitud_id: string; resultado_id: string | null; examen_id: string }[] = [];
    if (solicitudIds.length) {
      const { data } = await getSupabase().from('solicitudes_detalle').select('id, solicitud_id, examen_id, resultado_id').in('solicitud_id', solicitudIds);
      lineas = (data ?? []) as typeof lineas;
    }

    const resultadoIds = lineas.map((l) => l.resultado_id).filter(Boolean) as string[];
    let resultados: Record<string, unknown>[] = [];
    if (resultadoIds.length) {
      const { data } = await getSupabase().from('resultados').select('id, valores, observaciones, procesado_at, pdf_path').in('id', resultadoIds);
      resultados = data ?? [];
    }

    // Alertas clínicas de los detalles de este paciente (para resaltado en ficha).
    const detalleIds = lineas.map((l) => l.id);
    let alertas: Record<string, unknown>[] = [];
    if (detalleIds.length) {
      const { data } = await getSupabase().from('alertas_clinicas').select('solicitud_detalle_id, parametro, valor, nivel, motivo').in('solicitud_detalle_id', detalleIds);
      alertas = data ?? [];
    }
    const alertasPorDetalle = new Map<string, typeof alertas>();
    for (const a of alertas) {
      const key = String(a.solicitud_detalle_id);
      const arr = alertasPorDetalle.get(key) ?? [];
      arr.push(a);
      alertasPorDetalle.set(key, arr);
    }

    const porLinea = new Map(lineas.map((l) => [l.resultado_id, l]));

    res.json(
      resultados.map((r) => {
        const linea = porLinea.get(r.id as string);
        const solicitud = (solicitudesRes.data ?? []).find((s) => s.id === linea?.solicitud_id);
        return {
          resultado_id: r.id,
          examen: linea ? examenes.get(linea.examen_id as string) ?? null : null,
          valores: r.valores,
          observaciones: r.observaciones,
          procesado_at: r.procesado_at,
          pdf_path: r.pdf_path ?? null,
          solicitud_id: solicitud?.id ?? null,
          estado_solicitud: solicitud?.estado ?? null,
          alertas: linea ? alertasPorDetalle.get(linea.id) ?? [] : [],
        };
      }),
    );
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/portal/compartir-resultado
 * Genera un token firmado de corta duración para compartir UN resultado con un
 * médico externo vía enlace público de solo lectura (QR).
 */
router.post('/compartir-resultado', portalAuth, async (req, res, next) => {
  try {
    const pid = req.patientId!;
    const { resultado_id } = req.body as { resultado_id: string };

    const { data: resultado } = await getSupabase()
      .from('resultados')
      .select('id, solicitud_detalle_id')
      .eq('id', resultado_id)
      .maybeSingle();
    if (!resultado) return next(notFound('Resultado no encontrado'));

    const { data: linea } = await getSupabase()
      .from('solicitudes_detalle')
      .select('solicitud_id')
      .eq('id', resultado.solicitud_detalle_id)
      .maybeSingle();
    if (!linea) return next(notFound('Resultado no encontrado'));

    const { data: solicitud } = await getSupabase()
      .from('solicitudes')
      .select('paciente_id')
      .eq('id', linea.solicitud_id)
      .maybeSingle();
    if (!solicitud || solicitud.paciente_id !== pid) {
      return next(forbidden('El resultado no pertenece a este paciente'));
    }

    const token = signShareToken(pid, resultado_id);
    await registrarAuditoria(
      {
        accion: 'PORTAL_COMPARTIR_RESULTADO',
        tabla: 'resultados',
        registroId: resultado_id,
        detalles: { pid },
        ip: ipDeRequest(req),
      },
      pid,
    );
    res.json({ token, url: `/api/portal/compartido/${token}` });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/portal/compartido/:token
 * Endpoint PÚBLICO de solo lectura: valida el token firmado de corta duración
 * y devuelve los datos de UN resultado (valores, examen, fecha, observaciones).
 * No expone datos de facturación ni del historial completo.
 */
router.get('/compartido/:token', async (req, res, next) => {
  try {
    const { rid, pid } = verifyShareToken(req.params.token);

    const { data: resultado } = await getSupabase()
      .from('resultados')
      .select('id, valores, observaciones, procesado_at, solicitud_detalle_id')
      .eq('id', rid)
      .maybeSingle();
    if (!resultado) return next(notFound('Resultado no encontrado'));

    const { data: linea } = await getSupabase()
      .from('solicitudes_detalle')
      .select('examen_id')
      .eq('id', resultado.solicitud_detalle_id)
      .maybeSingle();
    const examenNombre = linea
      ? (await getSupabase().from('examenes_laboratorio').select('nombre').eq('id', linea.examen_id).maybeSingle()).data
        ?.nombre ?? null
      : null;

    const { data: paciente } = await getSupabase()
      .from('pacientes')
      .select('nombre_completo, cedula')
      .eq('id', pid)
      .maybeSingle();

    res.json({
      resultado_id: resultado.id,
      paciente,
      examen: examenNombre,
      valores: resultado.valores,
      observaciones: resultado.observaciones,
      procesado_at: resultado.procesado_at,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/portal/mis-pagos
 * Histórico financiero del paciente: pagos realizados y montos pendientes
 * (solicitudes de exámenes sin cobrar). Solo del paciente autenticado en el portal.
 */
router.get('/mis-pagos', portalAuth, async (req, res, next) => {
  try {
    const pid = req.patientId!;

    const { data: pagos } = await getSupabase()
      .from('pagos')
      .select('id, tipo, monto, moneda, tasa_usd, metodo, fecha, estado')
      .eq('paciente_id', pid)
      .order('fecha', { ascending: false });

    const { data: solicitudes } = await getSupabase()
      .from('solicitudes')
      .select('id, fecha, estado, cobrado')
      .eq('paciente_id', pid)
      .eq('cobrado', false);
    const pendientesIds = (solicitudes ?? []).map((s) => s.id as string);

    let pendientes: { id: string; fecha: string; monto: number }[] = [];
    if (pendientesIds.length) {
      const { data: lineas } = await getSupabase()
        .from('solicitudes_detalle')
        .select('solicitud_id, precio')
        .in('solicitud_id', pendientesIds);
      const porSolicitud = (lineas ?? []).reduce<Record<string, number>>((acc, l) => {
        acc[l.solicitud_id] = (acc[l.solicitud_id] ?? 0) + Number(l.precio);
        return acc;
      }, {});
      pendientes = (solicitudes ?? []).map((s) => ({
        id: s.id,
        fecha: s.fecha,
        monto: porSolicitud[s.id] ?? 0, // base USD
      }));
    }

    // Montos normalizados a USD (moneda base) con la tasa guardada en cada pago.
    const pagosNorm = [];
    let totalPagado = 0;
    for (const p of pagos ?? []) {
      const montoUsd = await montoAUsd(Number(p.monto), String(p.moneda ?? 'USD'), p.tasa_usd ? Number(p.tasa_usd) : null);
      pagosNorm.push({ ...p, monto_usd: montoUsd ?? 0 });
      if (p.estado !== 'reembolsado') totalPagado += montoUsd ?? 0;
    }
    const totalPendiente = pendientes.reduce((acc, p) => acc + p.monto, 0);

    res.json({
      pagos: pagosNorm,
      pendientes,
      total_pagado: Number(totalPagado.toFixed(2)),
      total_pendiente: Number(totalPendiente.toFixed(2)),
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/portal/mis-recipes
 * Récipes activos del paciente (imprimibles).
 */
router.get('/mis-recipes', portalAuth, async (req, res, next) => {
  try {
    const pid = req.patientId!;
    const { data: recipes } = await getSupabase()
      .from('recipes')
      .select('id, fecha_emision, fecha_expiracion, estado')
      .eq('paciente_id', pid)
      .eq('estado', 'activo');
    const ids = (recipes ?? []).map((r) => r.id as string);

    let lineas: Record<string, unknown>[] = [];
    if (ids.length) {
      const { data } = await getSupabase().from('recipes_detalle').select('recipe_id, medicamento, presentacion, dosis, frecuencia, indicaciones, duracion').in('recipe_id', ids);
      lineas = data ?? [];
    }

    res.json((recipes ?? []).map((r) => ({ ...r, detalle: lineas.filter((l) => l.recipe_id === r.id) })));
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/portal/catalogo
 * Catálogo activo de exámenes con precios (base USD) y su equivalencia en Bs.
 * con la tasa del día, condiciones previas y tiempos de entrega. Público.
 */
router.get('/catalogo', async (_req, res, next) => {
  try {
    const { data, error } = await getSupabase()
      .from('examenes_laboratorio')
      .select('id, nombre, categoria, precio, interno, duracion_min, condiciones_previas, tiempo_entrega')
      .eq('activo', true)
      .order('nombre', { ascending: true });
    if (error) return next(error);

    const { usd: tasaUsd } = await obtenerTasasActivas();
    res.json((data ?? []).map((e) => ({
      ...e,
      moneda: 'USD',
      precio: Number(e.precio),
      precio_bs: usdABs(Number(e.precio), tasaUsd),
      tasa_usd: tasaUsd,
    })));
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/portal/mis-consultas
 * Histórico resumido de consultas completadas.
 */
router.get('/mis-consultas', portalAuth, async (req, res, next) => {
  try {
    const pid = req.patientId!;
    const { data, error } = await getSupabase()
      .from('consultas')
      .select('id, medico_id, fecha_hora, motivo, diagnostico, estado')
      .eq('paciente_id', pid)
      .eq('estado', 'completada');
    if (error) return next(error);
    res.json(data ?? []);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/portal/mis-dependientes
 * Lista de dependientes vinculados al paciente de cabecera (perfil familiar).
 */
router.get('/mis-dependientes', portalAuth, async (req, res, next) => {
  try {
    const pid = req.patientId!;
    const { data: vinculos, error } = await getSupabase()
      .from('vinculos_familiares')
      .select('id, parentesco, dependiente_id')
      .eq('paciente_id', pid);
    if (error) return next(error);

    const dependienteIds = (vinculos ?? []).map((v) => v.dependiente_id).filter(Boolean) as string[];
    let pacientes: Record<string, unknown>[] = [];
    if (dependienteIds.length) {
      const { data } = await getSupabase()
        .from('pacientes')
        .select('id, cedula, nombre_completo, fecha_nacimiento')
        .in('id', dependienteIds);
      pacientes = data ?? [];
    }
    const porId = new Map(pacientes.map((p) => [p.id, p]));

    res.json(
      (vinculos ?? []).map((v) => ({
        id: v.id,
        parentesco: v.parentesco,
        dependientes: porId.get(v.dependiente_id as string) ?? null,
      })),
    );
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/portal/medicos?especialidad=
 * Lista de médicos activos (con especialidad) para reserva online.
 */
router.get('/medicos', async (req, res, next) => {
  try {
    const { especialidad } = req.query as { especialidad?: string };
    let query = getSupabase()
      .from('profiles')
      .select('id, nombre_completo, especialidad, clinica_id')
      .eq('role', 'medico')
      .eq('activo', true);
    if (especialidad) query = query.eq('especialidad', especialidad);
    query = query.order('nombre_completo', { ascending: true });

    const { data, error } = await query;
    if (error) return next(error);
    res.json(data ?? []);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/portal/disponibilidad?medico_id=&fecha=YYYY-MM-DD
 * Slots libres del médico para un día (según su horario menos las consultas
 * ya programadas de ese día).
 */
router.get('/disponibilidad', async (req, res, next) => {
  try {
    const { medico_id, fecha } = req.query as { medico_id?: string; fecha?: string };
    if (!medico_id || !fecha) return next(badRequest('medico_id y fecha son requeridos'));

    const { data: horarios, error: hErr } = await getSupabase()
      .from('disponibilidad_medico')
      .select('*')
      .eq('medico_id', medico_id)
      .eq('activo', true);
    if (hErr) return next(hErr);

    const dia = new Date(`${fecha}T12:00:00`).getDay();
    const horario = (horarios ?? []).find((h) => h.dia === dia);

    // El mock no soporta joins; resolvemos consultas del día por rango.
    const { data: ocupadas, error: oErr } = await getSupabase()
      .from('consultas')
      .select('fecha_hora')
      .eq('medico_id', medico_id)
      .eq('estado', 'programada')
      .gte('fecha_hora', `${fecha}T00:00:00.000Z`)
      .lte('fecha_hora', `${fecha}T23:59:59.999Z`);
    if (oErr) return next(oErr);

    if (!horario) return res.json({ slots: [], motivo: 'El médico no atiende este día' });

    const durMin = Number(horario.duracion_min ?? 30);
    const inicio = new Date(`${fecha}T${horario.hora_inicio}`);
    const fin = new Date(`${fecha}T${horario.hora_fin}`);
    const ocupados = new Set((ocupadas ?? []).map((c) => new Date(c.fecha_hora).toISOString()));

    const slots: { hora: string; ocupado: boolean }[] = [];
    for (let t = new Date(inicio); t < fin; t = new Date(t.getTime() + durMin * 60000)) {
      if (t.getTime() < Date.now()) continue;
      const iso = t.toISOString();
      slots.push({ hora: iso, ocupado: ocupados.has(iso) });
    }

    res.json({ slots });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/portal/reservar
 * El paciente autenticado por OTP reserva una cita online.
 */
router.post('/reservar', portalAuth, validate(reservarSchema), async (req, res, next) => {
  try {
    const pid = req.patientId!;
    const { medico_id, fecha_hora, motivo } = req.body as z.infer<typeof reservarSchema>;

    const { data: medico } = await getSupabase()
      .from('profiles')
      .select('id, clinica_id, nombre_completo')
      .eq('id', medico_id)
      .maybeSingle();
    if (!medico) return next(notFound('Médico no encontrado'));

    const { data: paciente } = await getSupabase()
      .from('pacientes')
      .select('id, clinica_id, nombre_completo')
      .eq('id', pid)
      .maybeSingle();
    if (!paciente) return next(unauthorized('Paciente no reconocido'));

    // Evitar doble reserva en el mismo slot.
    const { data: duplicada } = await getSupabase()
      .from('consultas')
      .select('id')
      .eq('medico_id', medico_id)
      .eq('fecha_hora', fecha_hora)
      .eq('estado', 'programada')
      .maybeSingle();
    if (duplicada) return next(badRequest('Ese horario ya está reservado'));

    const { data, error } = await getSupabase()
      .from('consultas')
      .insert({
        paciente_id: pid,
        medico_id,
        clinica_id: medico.clinica_id ?? paciente.clinica_id ?? null,
        fecha_hora,
        motivo: motivo ?? 'Reserva online',
        estado: 'programada',
        origen: 'online',
        reservada_por: pid,
      })
      .select('id, medico_id, fecha_hora, estado, origen')
      .single();
    if (error) return next(badRequest(error.message));

    // Agenda un recordatorio de la cita (24h y 1h antes).
    await recordatorioCita({
      pacienteId: pid,
      nombre: paciente.nombre_completo,
      fechaHora: fecha_hora,
      medicos: medico.nombre_completo,
    }).catch(() => {});

    res.status(201).json(data);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/portal/mis-reservas
 * Citas próximas (programadas) del paciente.
 */
router.get('/mis-reservas', portalAuth, async (req, res, next) => {
  try {
    const pid = req.patientId!;
    const { data, error } = await getSupabase()
      .from('consultas')
      .select('id, medico_id, fecha_hora, motivo, estado, origen')
      .eq('paciente_id', pid)
      .eq('estado', 'programada')
      .gte('fecha_hora', new Date().toISOString())
      .order('fecha_hora', { ascending: true });
    if (error) return next(error);

    const medicoIds = [...new Set((data ?? []).map((c) => c.medico_id as string))];
    let medicos: Record<string, unknown>[] = [];
    if (medicoIds.length) {
      const { data: ms } = await getSupabase()
        .from('profiles')
        .select('id, nombre_completo, especialidad')
        .in('id', medicoIds);
      medicos = ms ?? [];
    }
    const porId = new Map(medicos.map((m) => [m.id, m]));

    res.json((data ?? []).map((c) => ({ ...c, medico: porId.get(c.medico_id as string) ?? null })));
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/portal/reservas/:id/reprogramar
 * El paciente reprograma su propia reserva online.
 */
router.patch('/reservas/:id/reprogramar', portalAuth, validate(idParamSchema, 'params'), validate(reprogramarSchema), async (req, res, next) => {
  try {
    const pid = req.patientId!;
    const { id } = req.params as z.infer<typeof idParamSchema>;
    const { fecha_hora } = req.body as z.infer<typeof reprogramarSchema>;

    const { data: consulta } = await getSupabase()
      .from('consultas')
      .select('id, paciente_id, estado, origen, medico_id')
      .eq('id', id)
      .maybeSingle();
    if (!consulta) return next(notFound('Reserva no encontrada'));
    if (consulta.paciente_id !== pid) return next(forbidden('No es tu reserva'));
    if (consulta.estado !== 'programada') return next(badRequest('Solo se pueden reprogramar citas programadas'));

    const { data: enEseSlot } = await getSupabase()
      .from('consultas')
      .select('id')
      .eq('medico_id', consulta.medico_id)
      .eq('fecha_hora', fecha_hora)
      .eq('estado', 'programada');
    const duplicada = (enEseSlot ?? []).find((c) => c.id !== id);
    if (duplicada) return next(badRequest('Ese horario ya está reservado'));

    const { data, error } = await getSupabase()
      .from('consultas')
      .update({ fecha_hora })
      .eq('id', id)
      .select('id, medico_id, fecha_hora, estado, origen')
      .single();
    if (error) return next(badRequest(error.message));

    // Mueve el turno vinculado a la nueva fecha (retroalimentación con la cola).
    try {
      const r = await getSupabase()
        .from('turnos')
        .update({ fecha: fechaCaracasDeISO(fecha_hora) ?? '' })
        .eq('consulta_id', id);
      if (r.error) throw r.error;
    } catch {
      // Fail-open.
    }

    res.json(data);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/portal/reservas/:id/cancelar
 * El paciente cancela su propia reserva online.
 */
router.post('/reservas/:id/cancelar', portalAuth, validate(idParamSchema, 'params'), validate(cancelarSchema), async (req, res, next) => {
  try {
    const pid = req.patientId!;
    const { id } = req.params as z.infer<typeof idParamSchema>;
    const { motivo } = req.body as z.infer<typeof cancelarSchema>;

    const { data: consulta } = await getSupabase()
      .from('consultas')
      .select('id, paciente_id, estado')
      .eq('id', id)
      .maybeSingle();
    if (!consulta) return next(notFound('Reserva no encontrada'));
    if (consulta.paciente_id !== pid) return next(forbidden('No es tu reserva'));
    if (consulta.estado !== 'programada') return next(badRequest('Solo se pueden cancelar citas programadas'));

    const { data, error } = await getSupabase()
      .from('consultas')
      .update({ estado: 'cancelada', notas: motivo ?? null })
      .eq('id', id)
      .select('id, fecha_hora, estado')
      .single();
    if (error) return next(badRequest(error.message));

    // Saca de la cola el turno vinculado (retroalimentación con la sala de espera).
    try {
      const r = await getSupabase()
        .from('turnos')
        .update({ estado: 'cancelado' })
        .eq('consulta_id', id)
        .in('estado', ['esperando', 'llamado']);
      if (r.error) throw r.error;
    } catch {
      // Fail-open.
    }

    res.json(data);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/portal/cuestionario-definicion
 * Definición declarativa del cuestionario de anamnesis (checklist dinámico).
 * Se expone en público para que el portal renderice el wizard.
 */
router.get('/cuestionario-definicion', (_req, res) => {
  res.json({ modulos: MODULOS_CUESTIONARIO, cierre: OBSERVACIONES_MODULO });
});

/**
 * GET /api/portal/mi-cuestionario?paciente_id=
 * READ del paciente (propietario/tutor): lista los cuestionarios del paciente
 * autenticado y de sus dependientes vinculados. Sin `paciente_id` devuelve los
 * propios. Excluye los borrados.
 */
router.get('/mi-cuestionario', portalAuth, async (req, res, next) => {
  try {
    const pid = req.patientId!;
    const { paciente_id } = req.query as { paciente_id?: string };

    const permitidos = await pacienteIdYoDependientes(pid);
    const target = paciente_id ?? pid;
    if (!permitidos.has(target)) return next(forbidden('No puedes consultar el cuestionario de este paciente'));

    const { data: rows } = await getSupabase()
      .from('cuestionarios_historial')
      .select('id, paciente_id, consulta_id, origen, creado_por_medico, estado, respuestas, consolidado_at, deleted_at, created_at, updated_at')
      .eq('paciente_id', target);

    const lista = (rows ?? []).filter((c) => !c.deleted_at).sort((a, b) => (a.created_at > b.created_at ? -1 : 1));

    const { data: paciente } = await getSupabase()
      .from('pacientes')
      .select('id, cedula, nombre_completo')
      .eq('id', target)
      .maybeSingle();

    res.json({
      paciente: paciente ?? null,
      cuestionarios: lista.map((c) => ({
        ...c,
        respuestas: normalizarRespuestas(c.respuestas as Record<string, unknown>),
      })),
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/portal/mi-cuestionario
 * CREATE/UPDATE del paciente: responde el cuestionario para sí mismo o para un
 * dependiente vinculado (ej. "Hijo 1", "Adulto mayor a cargo"). Si existe un
 * borrador activo se actualiza en sitio; si el historial ya está consolidado,
 * se rechaza (las ediciones posteriores pasan por adenda del personal médico).
 * Las respuestas quedan asociadas al ID único del expediente seleccionado.
 */
router.post('/mi-cuestionario', portalAuth, validate(respuestasPortalSchema), async (req, res, next) => {
  try {
    const pid = req.patientId!;
    const body = req.body as z.infer<typeof respuestasPortalSchema>;
    const target = body.paciente_id ?? pid;

    const permitidos = await pacienteIdYoDependientes(pid);
    if (!permitidos.has(target)) return next(forbidden('No puedes responder el cuestionario de este paciente'));

    const respuestas = normalizarRespuestas(body.respuestas as Record<string, unknown>);

    const { data: activos } = await getSupabase()
      .from('cuestionarios_historial')
      .select('id, estado, consulta_id, deleted_at')
      .eq('paciente_id', target)
      .order('created_at', { ascending: false });

    const borrador = (activos ?? []).find((c) => !c.deleted_at && c.estado === 'borrador');
    const consolidado = (activos ?? []).find((c) => !c.deleted_at && c.estado === 'consolidado');

    if (borrador) {
      // UPDATE: mientras no esté consolidado, el paciente puede modificar respuestas.
      const { data, error } = await getSupabase()
        .from('cuestionarios_historial')
        .update({ respuestas })
        .eq('id', borrador.id)
        .select('id, paciente_id, estado, respuestas, updated_at')
        .single();
      if (error) return next(badRequest(error.message));
      return res.json({ actualizado: true, cuestionario: { ...data, respuestas: normalizarRespuestas(data.respuestas as Record<string, unknown>) } });
    }

    if (consolidado) {
      return next(conflict('El historial ya fue consolidado tras la consulta. Las correcciones posteriores las registra el personal médico como adenda con marca de agua.'));
    }

    // CREATE: nuevo cuestionario (borrador) asociado al expediente seleccionado.
    const { data: paciente } = await getSupabase().from('pacientes').select('id, clinica_id').eq('id', target).maybeSingle();
    if (!paciente) return next(notFound('Paciente no encontrado'));

    const { data, error } = await getSupabase()
      .from('cuestionarios_historial')
      .insert({
        clinica_id: paciente.clinica_id ?? null,
        paciente_id: target,
        origen: 'paciente',
        creado_por_paciente: pid,
        estado: 'borrador',
        respuestas,
      })
      .select('id, paciente_id, estado, respuestas, created_at')
      .single();
    if (error) return next(badRequest(error.message));

    res.status(201).json({ actualizado: false, cuestionario: { ...data, respuestas: normalizarRespuestas(data.respuestas as Record<string, unknown>) } });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/portal/turnos-hoy
 * Pantalla pública de turnos activos del día (sala de espera visible al paciente).
 * Solo devuelve el número, estado, prioridad y la inicial del paciente.
 */
router.get('/turnos-hoy', async (_req, res, next) => {
  try {
    const fecha = fechaHoyCaracas();
    const { data, error } = await getSupabase()
      .from('turnos')
      .select('id, numero, estado, prioridad, paciente_id, hora_llamado')
      .eq('fecha', fecha)
      .order('numero', { ascending: true });
    if (error) return next(error);

    const ids = (data ?? []).map((t) => t.paciente_id).filter(Boolean) as string[];
    let pacientes: Record<string, unknown>[] = [];
    if (ids.length) {
      const { data: ps } = await getSupabase()
        .from('pacientes')
        .select('id, nombre_completo')
        .in('id', ids);
      pacientes = ps ?? [];
    }
    const porId = new Map(pacientes.map((p) => [p.id, p]));

    res.json(
      (data ?? []).map((t) => ({
        numero: t.numero,
        estado: t.estado,
        prioridad: t.prioridad,
        hora_llamado: t.hora_llamado ?? null,
        inicial: String((porId.get(t.paciente_id as string) as { nombre_completo?: string } | undefined)?.nombre_completo?.charAt(0) ?? ''),
      })),
    );
  } catch (err) {
    next(err);
  }
});

export default router;