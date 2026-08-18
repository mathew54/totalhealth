// jobs/vencimientosReactivos.ts
// TotalHealth: revisión diaria de vencimientos de lotes de reactivos.
// Marca como 'vencido' los lotes activos cuya fecha ya pasó y saca su stock del
// inventario utilizable (kardex). Se ejecuta a las 05:15 AM (hora de Caracas),
// antes del arranque de la jornada. Se registra en server.ts.

import { schedule, type ScheduledTask } from 'node-cron';
import { env } from '../config/env.js';
import { revisarVencimientos } from '../services/reactivosService.js';

const CRON_HORA = '15 5 * * *'; // 05:15, todos los días
const ZONA_HORARIA = 'America/Caracas';
const TAREA_ID = 'sync-vencimientos-reactivos';

/**
 * Programa la revisión diaria de vencimientos. Devuelve el handle de la tarea
 * para poder detenerla en pruebas/salidas. No se registra en entorno 'test'.
 */
export function iniciarRevisionVencimientosReactivos(): ScheduledTask | null {
  if (env.nodeEnv === 'test') {
    console.info('[reactivos] Revisión de vencimientos omitida (modo test).');
    return null;
  }

  const tarea = schedule(
    CRON_HORA,
    async () => {
      console.log('[reactivos] Revisando vencimientos de lotes…');
      try {
        const resumen = await revisarVencimientos();
        console.log(`[reactivos] OK — ${resumen.total} lote(s) marcado(s) como vencido(s).`);
      } catch (err) {
        console.error('[reactivos] Revisión de vencimientos falló:', (err as Error).message);
      }
    },
    { timezone: ZONA_HORARIA, name: TAREA_ID },
  );

  console.log(`[reactivos] Revisión de vencimientos programada: CRON ${CRON_HORA} (${ZONA_HORARIA}).`);
  return tarea;
}