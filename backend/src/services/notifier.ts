import { getSupabase } from '../config/supabase.js';
import { env } from '../config/env.js';
import { getMessagingProvider } from './messagingProvider.js';
import { decryptCampo } from './cifrado.js';
import { normalizarTelefonoE164 } from './phoneNumber.js';
import { fechaHoyCaracas } from './bcv.js';

/**
 * Recordatorios automáticos (push/WhatsApp/SMS/Email).
 *
 * Estados:
 *  - pendiente: programado para el futuro (`programada_para`).
 *  - enviada: despachado con éxito por el proveedor (tiene `sent_at`).
 *  - fallida: el proveedor rechazó/faltó el envío (tiene `error` y quedará en
 *    la cola visual para reintentar; en producción se reintenta con backoff).
 */
export interface Notificacion {
  pacienteId: string;
  canal?: 'push' | 'whatsapp' | 'sms' | 'email';
  tipo: 'cita' | 'resultado' | 'domicilio' | 'turno' | 'pago';
  mensaje: string;
  programadaPara?: string;
  telefono?: string;
  metadata?: Record<string, unknown>;
}

export type EstadoNotificacion = 'pendiente' | 'enviada' | 'fallida';

export interface ResultadoEnvio {
  enviadas: number;
  fallidas: number;
  total: number;
}

/* -------------------------------------------------------------------------- */
/*  Teléfono                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Normaliza un teléfono a formato E.164. Si no trae prefijo de país se asume
 * Venezuela (+58) — los regionales venezolanos son 10 dígitos (0412-xxxxxxx).
 * Devuelve `null` si el valor es vacío. No valida el resultado (ver `telefonoValido`).
 */
export function normalizarTelefono(telefono: string | null | undefined): string | null {
  return normalizarTelefonoE164(telefono);
}

/** ¿Es un teléfono E.164 válido (prefijo + 8..15 dígitos)? */
export function telefonoValido(telefono: string | null | undefined): boolean {
  const t = normalizarTelefono(telefono);
  return t !== null && /^\+[1-9]\d{7,14}$/.test(t);
}

/** Descifra el teléfono persistido (cifrado en reposo) y lo normaliza. */
export async function telefonoPaciente(pacienteId: string): Promise<string | null> {
  const { data } = await getSupabase()
    .from('pacientes')
    .select('telefono')
    .eq('id', pacienteId)
    .maybeSingle();
  const claro = decryptCampo((data?.telefono as string | undefined) ?? null);
  return claro && claro !== '' ? normalizarTelefono(claro) : null;
}

/* -------------------------------------------------------------------------- */
/*  Persistencia                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Persiste una notificación en estado `pendiente`. Si se pasa `telefono`, lo
 * guarda como destino explícito; si no, se resuelve del paciente al enviar.
 */
export async function agendarNotificacion(n: Notificacion): Promise<string | null> {
  const canal = n.canal ?? 'push';
  const { data, error } = await getSupabase()
    .from('notificaciones')
    .insert({
      paciente_id: n.pacienteId,
      canal,
      tipo: n.tipo,
      mensaje: n.mensaje,
      programada_para: n.programadaPara ?? new Date().toISOString(),
      estado: 'pendiente',
      enviada_at: null,
      sent_at: null,
      telefono: n.telefono ? normalizarTelefono(n.telefono) : null,
      metadata: n.metadata ?? null,
    })
    .select('id')
    .single();
  if (error) throw error;
  return data?.id as string | null;
}

/**
 * Envía una notificación por su proveedor de transporte y refleja el resultado
 * en la base de datos (enviada+sent_at en éxito, fallida+error en fallo).
 */
export async function despacharNotificacion(id: string): Promise<boolean> {
  const { data: detalle } = await getSupabase()
    .from('notificaciones')
    .select('id, paciente_id, canal, mensaje, telefono')
    .eq('id', id)
    .maybeSingle();
  if (!detalle) return false;

  // Destino: teléfono explícito de la notificación o el del paciente.
  let destino =
    detalle.telefono && detalle.telefono !== ''
      ? normalizarTelefono(detalle.telefono as string)
      : await telefonoPaciente(detalle.paciente_id as string);

  if (!destino || !telefonoValido(destino)) {
    await getSupabase()
      .from('notificaciones')
      .update({ estado: 'fallida', error: 'Teléfono inválido o ausente', updated_at: new Date().toISOString() })
      .eq('id', id);
    return false;
  }

  const canal = (detalle.canal as string) === 'push' ? 'push' : (detalle.canal as 'sms' | 'whatsapp' | 'email');
  try {
    await getMessagingProvider().sendNotify({ destino, canal, mensaje: detalle.mensaje as string });
    await getSupabase()
      .from('notificaciones')
      .update({
        estado: 'enviada',
        enviada_at: new Date().toISOString(),
        sent_at: new Date().toISOString(),
        error: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);
    return true;
  } catch (err) {
    const msg = (err as Error).message || 'Fallo del proveedor de mensajería';
    console.error(`[notifier] envío ${id} falló:`, err);
    await getSupabase()
      .from('notificaciones')
      .update({ estado: 'fallida', error: msg, updated_at: new Date().toISOString() })
      .eq('id', id);
    return false;
  }
}

/* -------------------------------------------------------------------------- */
/*  Envío por lotes (job manual / cron)                                        */
/* -------------------------------------------------------------------------- */

/**
 * Procesa las notificaciones pendientes (`programada_para` vencido).
 * Acepta un lote de IDs (enviados desde la UI) o procesa toda la cola pendiente.
 * Devuelve un resumen { enviadas, fallidas, total }.
 */
export async function enviarNotificacionesPendientes(opts: { ids?: string[] } = {}): Promise<ResultadoEnvio> {
  const ahora = new Date().toISOString();
  let query = getSupabase()
    .from('notificaciones')
    .select('id')
    .eq('estado', 'pendiente')
    .lte('programada_para', ahora);

  if (opts.ids && opts.ids.length) query = query.in('id', opts.ids);

  const { data: pendientes } = await query;
  const ids = (pendientes ?? []).map((r) => r.id as string);

  const resumen: ResultadoEnvio = { enviadas: 0, fallidas: 0, total: ids.length };
  for (const id of ids) {
    const ok = await despacharNotificacion(id);
    if (ok) resumen.enviadas += 1;
    else resumen.fallidas += 1;
  }
  return resumen;
}

/**
 * Envío inmediato (resultados): despacha ahora mismo por el proveedor y persiste
 * directamente en estado `enviada` (con `sent_at`) o `fallida` (con `error`).
 * No pasa por la cola pendiente.
 */
export async function enviarInmediata(opts: Notificacion): Promise<boolean> {
  const destino = opts.telefono ? normalizarTelefono(opts.telefono) : await telefonoPaciente(opts.pacienteId);
  if (!destino || !telefonoValido(destino)) {
    await agendarResultado(opts, 'fallida', 'Teléfono inválido o ausente');
    return false;
  }

  const canal = opts.canal === 'push' ? 'push' : (opts.canal ?? 'sms');
  try {
    await getMessagingProvider().sendNotify({ destino, canal, mensaje: opts.mensaje });
    await agendarResultado(opts, 'enviada');
    return true;
  } catch (err) {
    console.error('[notifier] envío inmediato falló:', err);
    await agendarResultado(opts, 'fallida', (err as Error).message || 'Fallo del proveedor de mensajería');
    return false;
  }
}

/** Persiste el resultado de un envío inmediato (sin pasar por pendiente). */
async function agendarResultado(opts: Notificacion, estado: Exclude<EstadoNotificacion, 'pendiente'>, errorLog?: string): Promise<void> {
  const destino = opts.telefono ? normalizarTelefono(opts.telefono) : null;
  await getSupabase().from('notificaciones').insert({
    paciente_id: opts.pacienteId,
    canal: opts.canal ?? 'sms',
    tipo: opts.tipo,
    mensaje: opts.mensaje,
    programada_para: new Date().toISOString(),
    estado,
    enviada_at: estado === 'enviada' ? new Date().toISOString() : null,
    sent_at: estado === 'enviada' ? new Date().toISOString() : null,
    error: estado === 'fallida' ? errorLog ?? null : null,
    telefono: destino,
    metadata: opts.metadata ?? null,
  });
}

/* -------------------------------------------------------------------------- */
/*  Creación manual                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Crea una notificación manual desde la UI (estado pendiente). `paciente_id` y
 * `telefono` pueden coincidir con un paciente existente o ser un destinatario
 * externo (p.ej. un proveedor). Al menos uno de los dos debe venir.
 */
export async function crearNotificacionPendiente(opts: {
  pacienteId: string;
  telefono?: string;
  canal?: 'push' | 'whatsapp' | 'sms' | 'email';
  tipo: Notificacion['tipo'];
  mensaje: string;
  programadaPara: string;
}): Promise<string | null> {
  if (opts.pacienteId && !opts.telefono) {
    opts.telefono = (await telefonoPaciente(opts.pacienteId)) ?? undefined;
  }
  return agendarNotificacion({
    pacienteId: opts.pacienteId,
    telefono: opts.telefono,
    canal: opts.canal,
    tipo: opts.tipo,
    mensaje: opts.mensaje,
    programadaPara: opts.programadaPara,
  });
}

/* -------------------------------------------------------------------------- */
/*  Recordatorios específicos (diparados por eventos de negocio)               */
/* -------------------------------------------------------------------------- */

/** Agenda un recordatorio de cita (ej. 1 h antes). */
export async function recordatorioCita(opts: {
  pacienteId: string;
  nombre: string;
  fechaHora: string;
  medicos: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const fecha = new Date(opts.fechaHora);
  const recordatorios = [
    new Date(fecha.getTime() - 24 * 3600 * 1000),
    new Date(fecha.getTime() - 60 * 60 * 1000),
  ];
  for (const cuando of recordatorios) {
    if (cuando.getTime() <= Date.now()) continue;
    await agendarNotificacion({
      pacienteId: opts.pacienteId,
      tipo: 'cita',
      mensaje: `${opts.nombre}, te recordamos tu cita con ${opts.medicos} el próximo día a las ${fecha.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.`,
      programadaPara: cuando.toISOString(),
      metadata: { fecha_cita: opts.fechaHora, ...opts.metadata },
    });
  }
}

/**
 * Notifica un resultado disponible con ENVÍO INMEDIATO: no pasa por la cola
 * pendiente; la alerta se despacha ahora y se persiste como enviada/fallida.
 * El mensaje incluye el enlace al portal del paciente y, si se indica, los
 * detalles del resultado procesado.
 */
export async function notificarResultadoListo(opts: {
  pacienteId: string;
  nombre: string;
  examen: string;
  detalles?: string;
  telefono?: string;
  metadata?: Record<string, unknown>;
}): Promise<boolean> {
  const base = env.frontendUrl || env.corsOrigin;
  const portalUrl = `${base.replace(/\/$/, '')}/portal`;
  const detallesTxt = opts.detalles ? ` (${opts.detalles})` : '';
  return enviarInmediata({
    pacienteId: opts.pacienteId,
    telefono: opts.telefono,
    tipo: 'resultado',
    mensaje: `${opts.nombre}, el resultado de ${opts.examen}${detallesTxt} ya está disponible. Ingresa a tu portal del paciente para consultarlo: ${portalUrl}`,
    metadata: opts.metadata,
  });
}

/** Notifica que una toma de muestra a domicilio fue programada. */
export async function notificarDomicilio(opts: {
  pacienteId: string;
  direccion: string;
  fechaVisita?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const cuando = opts.fechaVisita ? ` el ${new Date(opts.fechaVisita).toLocaleDateString()} a las ${new Date(opts.fechaVisita).toLocaleTimeString()}` : '';
  await agendarNotificacion({
    pacienteId: opts.pacienteId,
    tipo: 'domicilio',
    mensaje: `Tu toma de muestra a domicilio en ${opts.direccion}${cuando} ha sido programada. Seguimos el rastreo desde tu portal.`,
    metadata: opts.metadata,
  });
}

/** Avisa que el paciente tiene un turno en la sala de espera o que es atendido. */
export async function notificarSalaEspera(opts: {
  pacienteId: string;
  nombre: string;
  numero: number;
  atendido?: boolean;
  fecha?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const turnoFecha = opts.fecha ? ` del día ${opts.fecha}` : '';
  await agendarNotificacion({
    pacienteId: opts.pacienteId,
    tipo: 'turno',
    mensaje: opts.atendido
      ? `${opts.nombre}, es tu turno (número ${opts.numero})${turnoFecha}. Acércate por favor.`
      : `${opts.nombre}, ya tienes asignado el turno número ${opts.numero}${turnoFecha}. Espera en la sala de espera hasta que te llamen.`,
    metadata: { numero_turno: opts.numero, ...opts.metadata },
  });
}

/**
 * Generación manual de recordatorios pendientes a partir del estado actual de
 * los datos (citas programadas, resultados listos, turnos del día y domicilios
 * programados). Evita duplicar si ya existe un recordatorio del mismo origen.
 * Devuelve un resumen por tipo.
 */
export async function generarRecordatoriosManuales(): Promise<Record<string, number>> {
  const resumen: Record<string, number> = {};
  const ahora = new Date().toISOString();

  const { data: existentes } = await getSupabase().from('notificaciones').select('paciente_id, tipo, metadata');

  const yaExiste = (pacienteId: string, tipo: Notificacion['tipo'], clave: string, valor: unknown): boolean =>
    (existentes ?? []).some((n) => {
      const md = (n.metadata ?? {}) as Record<string, unknown>;
      return n.paciente_id === pacienteId && n.tipo === tipo && md[clave] !== undefined && md[clave] === valor;
    });

  // 1) Citas programadas futuras → recordatorio de cita (24 h / 1 h antes).
  const { data: citas } = await getSupabase()
    .from('consultas')
    .select('id, paciente_id, medico_id, fecha_hora, estado')
    .eq('estado', 'programada')
    .gte('fecha_hora', ahora);
  const citasNuevas = (citas ?? []).filter((c) => !yaExiste(c.paciente_id, 'cita', 'consulta_id', c.id));
  for (const cita of citasNuevas) {
    const [{ data: paciente }, { data: medico }] = await Promise.all([
      getSupabase().from('pacientes').select('nombre_completo').eq('id', cita.paciente_id).maybeSingle(),
      cita.medico_id
        ? getSupabase().from('profiles').select('nombre_completo').eq('id', cita.medico_id).maybeSingle()
        : Promise.resolve({ data: {} as { nombre_completo?: string } | null }),
    ]);
    await recordatorioCita({
      pacienteId: cita.paciente_id,
      nombre: (paciente?.nombre_completo as string) ?? 'Paciente',
      fechaHora: cita.fecha_hora as string,
      medicos: (medico?.nombre_completo as string) ?? 'el médico',
      metadata: { consulta_id: cita.id },
    });
    resumen.citas = (resumen.citas ?? 0) + 1;
  }

  // 2) Líneas de solicitud con resultado → aviso por cada examen (igual que el
  //    flujo automático), evitando duplicar los que ya notificaron.
  const { data: examenes } = await getSupabase().from('examenes_laboratorio').select('id, nombre');
  const catalogoExamenes = new Map<string, string>((examenes ?? []).map((e) => [e.id as string, e.nombre as string]));

  const { data: resultados } = await getSupabase()
    .from('solicitudes_detalle')
    .select('id, solicitud_id, examen_id, resultado_id')
    .not('resultado_id', 'is', null);
  const solicitudPorId = new Map<string, { id: string; paciente_id: string }>();
  for (const linea of resultados ?? []) {
    if (!solicitudPorId.has(linea.solicitud_id as string)) {
      const { data: solicitud } = await getSupabase()
        .from('solicitudes')
        .select('id, paciente_id')
        .eq('id', linea.solicitud_id)
        .maybeSingle();
      if (!solicitud) continue;
      solicitudPorId.set(solicitud.id as string, { id: solicitud.id, paciente_id: solicitud.paciente_id });
    }
    const solicitud = solicitudPorId.get(linea.solicitud_id as string)!;
    if (yaExiste(solicitud.paciente_id, 'resultado', 'solicitud_detalle_id', linea.id)) continue;
    const { data: paciente } = await getSupabase()
      .from('pacientes')
      .select('nombre_completo')
      .eq('id', solicitud.paciente_id)
      .maybeSingle();
    await notificarResultadoListo({
      pacienteId: solicitud.paciente_id,
      nombre: (paciente?.nombre_completo as string) ?? 'Paciente',
      examen: catalogoExamenes.get(linea.examen_id as string) ?? 'un examen',
      metadata: { solicitud_id: solicitud.id, solicitud_detalle_id: linea.id, resultado_id: linea.resultado_id },
    });
    resumen.resultados = (resumen.resultados ?? 0) + 1;
  }

  // 3) Turnos de hoy en espera → aviso de sala de espera.
  const { data: turnos } = await getSupabase()
    .from('turnos')
    .select('id, paciente_id, numero, fecha')
    .eq('estado', 'esperando')
    .eq('fecha', fechaHoyCaracas());
  for (const turno of turnos ?? []) {
    if (yaExiste(turno.paciente_id, 'turno', 'turno_id', turno.id)) continue;
    const { data: paciente } = await getSupabase()
      .from('pacientes')
      .select('nombre_completo')
      .eq('id', turno.paciente_id)
      .maybeSingle();
    await notificarSalaEspera({
      pacienteId: turno.paciente_id,
      nombre: (paciente?.nombre_completo as string) ?? 'Paciente',
      numero: turno.numero as number,
      fecha: turno.fecha as string,
      metadata: { turno_id: turno.id },
    });
    resumen.turnos = (resumen.turnos ?? 0) + 1;
  }

  // 4) Domicilios programados.
  const { data: domicilios } = await getSupabase()
    .from('muestras_domicilio')
    .select('id, paciente_id, direccion, fecha_visita')
    .eq('estado', 'programada');
  for (const dom of domicilios ?? []) {
    if (yaExiste(dom.paciente_id, 'domicilio', 'domicilio_id', dom.id)) continue;
    await notificarDomicilio({
      pacienteId: dom.paciente_id,
      direccion: (dom.direccion as string) ?? '',
      fechaVisita: dom.fecha_visita as string | null,
      metadata: { domicilio_id: dom.id },
    });
    resumen.domicilios = (resumen.domicilios ?? 0) + 1;
  }

  return resumen;
}

/** Elimina (o archiva) el historial de recordatorios enviados. Devuelve cuántos borró. */
export async function limpiarNotificacionesEnviadas(): Promise<number> {
  const { data: enviadas } = await getSupabase().from('notificaciones').select('id').eq('estado', 'enviada');
  const ids = (enviadas ?? []).map((r) => r.id);
  if (ids.length === 0) return 0;
  await getSupabase().from('notificaciones').delete().in('id', ids);
  return ids.length;
}