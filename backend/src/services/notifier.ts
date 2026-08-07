import { getSupabase } from '../config/supabase.js';
import { getMessagingProvider } from './messagingProvider.js';
import { decryptCampo } from './cifrado.js';

/**
 * Recordatorios automáticos (push/WhatsApp/SMS). En desarrollo persiste la
 * notificación en `notificaciones` y la marca como "enviada" (mock). En
 * producción se conecta a un proveedor real (Twilio/WhatsApp Business API).
 */
export interface Notificacion {
  pacienteId: string;
  canal?: 'push' | 'whatsapp' | 'sms';
  tipo: 'cita' | 'resultado' | 'domicilio';
  mensaje: string;
  programadaPara?: string;
  metadata?: Record<string, unknown>;
}

/** Persiste la notificación con estado pendiente. */
export async function agendarNotificacion(n: Notificacion): Promise<void> {
  await getSupabase().from('notificaciones').insert({
    paciente_id: n.pacienteId,
    canal: n.canal ?? 'push',
    tipo: n.tipo,
    mensaje: n.mensaje,
    programada_para: n.programadaPara ?? new Date().toISOString(),
    estado: n.programadaPara ? 'pendiente' : 'enviada',
    enviada_at: n.programadaPara ? null : new Date().toISOString(),
    metadata: n.metadata ?? null,
  });
}

/**
 * Envía las notificaciones pendientes y cuyo `programada_para` ya venció.
 * Devuelve cuántas se marcaron como enviadas. Es el job que un cron puede
 * invocar periódicamente (`POST /api/notificaciones/enviar-pendientes`).
 */
export async function enviarNotificacionesPendientes(): Promise<number> {
  const ahora = new Date().toISOString();
  const { data: pendientes } = await getSupabase()
    .from('notificaciones')
    .select('id')
    .eq('estado', 'pendiente')
    .lte('programada_para', ahora);

  let count = 0;
  for (const n of pendientes ?? []) {
    // En producción se despacha por canal vía proveedor real (SMTP/Twilio).
    // En dev, el provider mock marca como enviada sin red real.
    const { data: detalle } = await getSupabase()
      .from('notificaciones')
      .select('paciente_id, canal, mensaje')
      .eq('id', n.id)
      .maybeSingle();

    if (detalle) {
      const { data: paciente } = await getSupabase()
        .from('pacientes')
        .select('telefono')
        .eq('id', detalle.paciente_id)
        .maybeSingle();
      if (paciente?.telefono) {
        await getMessagingProvider().sendNotify({
          destino: decryptCampo((paciente.telefono as string) ?? '') ?? '',
          canal: detalle.canal === 'push' ? 'push' : detalle.canal,
          mensaje: detalle.mensaje,
        }).catch((err) => console.error('[notifier] envío falló', err));
      }
    }

    const { error } = await getSupabase()
      .from('notificaciones')
      .update({ estado: 'enviada', enviada_at: ahora })
      .eq('id', n.id);
    if (!error) count += 1;
  }
  return count;
}

/** Agenda un recordatorio de cita (ej. 1 h antes). */
export async function recordatorioCita(opts: {
  pacienteId: string;
  nombre: string;
  fechaHora: string;
  medicos: string;
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
      mensaje: `${opts.nombre}, te recordamos tu cita con ${opts.medicos} el ${fecha.toLocaleDateString()} a las ${fecha.toLocaleTimeString()}.`,
      programadaPara: cuando.toISOString(),
      metadata: { fecha_cita: opts.fechaHora },
    });
  }
}

/** Notifica que un resultado está listo para consultar. */
export async function notificarResultadoListo(opts: {
  pacienteId: string;
  nombre: string;
  examen: string;
  consultaURL?: string;
}): Promise<void> {
  await agendarNotificacion({
    pacienteId: opts.pacienteId,
    tipo: 'resultado',
    mensaje: `${opts.nombre}, el resultado de ${opts.examen} ya está disponible. Consúltalo desde tu portal.`,
  });
}

/** Notifica que una toma de muestra a domicilio fue programada. */
export async function notificarDomicilio(opts: {
  pacienteId: string;
  direccion: string;
}): Promise<void> {
  await agendarNotificacion({
    pacienteId: opts.pacienteId,
    tipo: 'domicilio',
    mensaje: `Tu toma de muestra a domicilio en ${opts.direccion} ha sido programada. Seguimos el rastreo desde tu portal.`,
  });
}