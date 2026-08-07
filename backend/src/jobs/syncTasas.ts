// jobs/syncTasas.ts
// TotalHealth: trigger diario que sincroniza las tasas de cambio del día.
// Se ejecuta a las 06:30 AM (hora de Caracas) y persiste las cotizaciones de
// USD/EUR (fuente primaria dolarapi; respaldo BCV). Se registra en server.ts.

import { schedule, type ScheduledTask } from 'node-cron';
import { env } from '../config/env.js';
import { obtenerTasasDelDia, almacenarTasasDelDia } from '../services/cotizaciones.js';

const CRON_HORA = '30 6 * * *'; // 06:30, todos los días
const ZONA_HORARIA = 'America/Caracas';
const TAREA_ID = 'sync-tasas-diarias';

/**
 * Programa la sincronización diaria. Devuelve el handle de la tarea para poder
 * detenerla en pruebas/salidas. No se registra en entorno 'test' para evitar
 * efectos de lado durante el arranque de los tests.
 */
export function iniciarSincronizacionTasas(): ScheduledTask | null {
  if (env.nodeEnv === 'test') {
    console.info('[tasas] Trigger diario de tasas omitido (modo test).');
    return null;
  }

  const tarea = schedule(
    CRON_HORA,
    async () => {
      console.log('[tasas] Ejecutando sincronización de tasas del día…');
      try {
        const tasas = await obtenerTasasDelDia();
        const resultado = await almacenarTasasDelDia(tasas, null);
        console.log(
          `[tasas] OK — ${resultado.fuente} | USD ${tasas.usd ?? '—'} | EUR ${tasas.eur ?? '—'} | fecha ${resultado.fecha}`,
        );
      } catch (err) {
        console.error('[tasas] Sincronización automática falló:', (err as Error).message);
      }
    },
    { timezone: ZONA_HORARIA, name: TAREA_ID },
  );

  console.log(`[tasas] Trigger diario programado: CRON ${CRON_HORA} (${ZONA_HORARIA}).`);
  return tarea;
}