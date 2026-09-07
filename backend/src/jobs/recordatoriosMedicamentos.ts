// jobs/recordatoriosMedicamentos.ts
// TotalHealth: ciclo automático de recordatorios de medicamentos.
// Cada 15 minutos: limpia los recordatorios ya cumplidos del día, agenda los de
// la próxima hora configurada y despacha las notificaciones pendientes vencidas
// de la cola (medicamentos y demás). Se registra en server.ts.

import { schedule, type ScheduledTask } from 'node-cron';
import { env } from '../config/env.js';
import { getSupabase } from '../config/supabase.js';
import { enviarNotificacionesPendientes, generarRecordatoriosMedicamentos } from '../services/notifier.js';

const CRON_HORA = '*/15 * * * *'; // cada 15 minutos
const ZONA_HORARIA = 'America/Caracas';
const TAREA_ID = 'recordatorios-medicamentos';

/**
 * Elimina los recordatorios de medicamento ya cumplidos (enviados o con hora
 * vencida) para que la deduplicación por `recordatorio_id` no bloquee el ciclo
 * del día siguiente. Los que quedaron `fallida` se conservan para reintento
 * desde la UI. Devuelve cuántos limpió.
 */
export async function limpiarRecordatoriosMedicamentosVencidos(): Promise<number> {
  const ahora = new Date().toISOString();
  const { data } = await getSupabase()
    .from('notificaciones')
    .select('id, estado, programada_para')
    .eq('tipo', 'medicamento');
  const aBorrar = (data ?? []).filter(
    (n) => n.estado === 'enviada' || ((n.programada_para as string | null) ?? '') < ahora,
  ).map((n) => n.id);
  if (aBorrar.length === 0) return 0;
  await getSupabase().from('notificaciones').delete().in('id', aBorrar);
  return aBorrar.length;
}

/** Ejecuta el ciclo completo: limpiar vencidos, agendar el día y despachar. */
export async function ejecutarRecordatoriosMedicamentos(): Promise<{
  limpiados: number;
  agendados: number;
  enviadas: number;
  fallidas: number;
}> {
  const limpiados = await limpiarRecordatoriosMedicamentosVencidos();
  const agendados = await generarRecordatoriosMedicamentos();
  const envio = await enviarNotificacionesPendientes();
  return { limpiados, agendados, enviadas: envio.enviadas, fallidas: envio.fallidas };
}

/**
 * Programa el ciclo automático de recordatorios de medicamentos. Devuelve el
 * handle de la tarea para poder detenerla en pruebas/salidas. No se registra
 * en entorno 'test' para evitar efectos de lado durante el arranque de tests.
 */
export function iniciarRecordatoriosMedicamentos(): ScheduledTask | null {
  if (env.nodeEnv === 'test') {
    console.info('[medicamentos] Trigger de recordatorios omitido (modo test).');
    return null;
  }

  const tarea = schedule(
    CRON_HORA,
    async () => {
      console.log('[medicamentos] Ejecutando ciclo de recordatorios de medicamentos…');
      try {
        const resumen = await ejecutarRecordatoriosMedicamentos();
        console.log(
          `[medicamentos] OK — limpiados ${resumen.limpiados}, agendados ${resumen.agendados}, enviadas ${resumen.enviadas}, fallidas ${resumen.fallidas}.`,
        );
      } catch (err) {
        console.error('[medicamentos] Ciclo de recordatorios falló:', (err as Error).message);
      }
    },
    { timezone: ZONA_HORARIA, name: TAREA_ID },
  );

  console.log(`[medicamentos] Trigger programado: CRON ${CRON_HORA} (${ZONA_HORARIA}).`);
  return tarea;
}