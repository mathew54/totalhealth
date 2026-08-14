// services/cotizaciones.ts
// TotalHealth: cotizaciones del día (USD/EUR).
// - Fuente primaria: API pública ve.dolarapi.com/v1/cotizaciones (JSON estable).
// - Respaldo: scraping del HTML del sitio del BCV (services/bcv.ts).
// - Persistencia compartida: la usa el endpoint manual (/admin/tasas/scraping)
//   y el trigger diario (jobs/syncTasas.ts).

import { getSupabase } from '../config/supabase.js';
import { fechaCaracasDeISO } from '../utils/fechaCaracas.js';
import { fechaHoyCaracas, obtenerTasasBCV } from './bcv.js';

const DOLARAPI_URL = process.env.DOLARAPI_URL ?? 'https://ve.dolarapi.com/v1/cotizaciones';

export interface CotizacionDia {
  usd: number | null;
  eur: number | null;
  fecha: string; // YYYY-MM-DD en hora de Caracas
  fuente: string;
}

/** Convierte el valor numérico de dolarapi a number válido (> 0). */
export function parseNumeroCotizacion(raw: number | null | undefined): number | null {
  if (raw == null) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Fecha (YYYY-MM-DD) de una marca de tiempo ISO, en hora de Caracas. */
export const fechaDeISO = fechaCaracasDeISO;

interface CotizacionDolarApi {
  moneda: string;
  promedio?: number | null;
  fechaActualizacion?: string | null;
}

/**
 * Consulta ve.dolarapi.com/v1/cotizaciones y devuelve el promedio oficial del
 * día para USD y EUR. Lanza un Error legible si la API falla o no trae valores.
 */
export async function obtenerTasasDolarApi(): Promise<CotizacionDia> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const res = await fetch(DOLARAPI_URL, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`dolarapi respondió HTTP ${res.status}`);
    const items = (await res.json()) as CotizacionDolarApi[];

    const porMoneda = new Map((items ?? []).map((i) => [i.moneda, i]));
    const usd = parseNumeroCotizacion(porMoneda.get('USD')?.promedio);
    const eur = parseNumeroCotizacion(porMoneda.get('EUR')?.promedio);
    if (usd == null && eur == null) {
      throw new Error('dolarapi no devolvió cotizaciones de USD/EUR');
    }

    const iso =
      porMoneda.get('USD')?.fechaActualizacion ?? porMoneda.get('EUR')?.fechaActualizacion ?? null;
    return { usd, eur, fecha: fechaDeISO(iso) ?? fechaHoyCaracas(), fuente: DOLARAPI_URL };
  } catch (err) {
    const causa =
      err instanceof Error && err.name === 'AbortError' ? 'tiempo de espera agotado' : (err as Error).message;
    throw new Error(`No se pudieron obtener las cotizaciones (${causa}).`);
  } finally {
    clearTimeout(timeout);
  }
}

/** Cotizaciones del día: dolarapi como fuente primaria, BCV como respaldo. */
export async function obtenerTasasDelDia(): Promise<CotizacionDia> {
  try {
    return await obtenerTasasDolarApi();
  } catch {
    const bcv = await obtenerTasasBCV();
    return { usd: bcv.usd, eur: bcv.eur, fecha: bcv.fecha, fuente: `bcv (respaldo: ${bcv.fuente})` };
  }
}

export interface TasasAlmacenadas {
  ok: true;
  fuente: string;
  fecha: string;
  monedas: { moneda: string; valor: number; activa: boolean }[];
}

/**
 * Guarda las cotizaciones del día en `tasas_cambio` (origen 'dolarapi'). Si ya
 * existe una fila para (fecha, moneda, origen) la actualiza; en caso contrario
 * inserta. Si aún no hay una tasa ACTIVA para ese día/moneda, deja la recién
 * almacenada como activa (auto-selección).
 */
export async function almacenarTasasDelDia(tasas: CotizacionDia, usuarioId: string | null): Promise<TasasAlmacenadas> {
  const entradas: Record<string, number | null> = { USD: tasas.usd, EUR: tasas.eur };
  const monedas: TasasAlmacenadas['monedas'] = [];

  for (const [moneda, valor] of Object.entries(entradas) as [string, number | null][]) {
    if (valor == null) continue;

    const { data: existente } = await getSupabase()
      .from('tasas_cambio')
      .select('id')
      .eq('fecha', tasas.fecha)
      .eq('moneda', moneda)
      .eq('origen', 'dolarapi')
      .maybeSingle();

    if (existente) {
      await getSupabase().from('tasas_cambio').update({ valor, actualizado_por: usuarioId }).eq('id', existente.id);
    } else {
      await getSupabase().from('tasas_cambio').insert({
        fecha: tasas.fecha,
        moneda,
        valor,
        origen: 'dolarapi',
        activa: false,
        actualizado_por: usuarioId,
      });
    }

    // Auto-selección: solo se activa si no existe ya una tasa activa hoy para la moneda.
    const { data: activa } = await getSupabase()
      .from('tasas_cambio')
      .select('id')
      .eq('fecha', tasas.fecha)
      .eq('moneda', moneda)
      .eq('activa', true)
      .maybeSingle();

    let esActiva = false;
    if (!activa) {
      const { data: fila } = await getSupabase()
        .from('tasas_cambio')
        .select('id')
        .eq('fecha', tasas.fecha)
        .eq('moneda', moneda)
        .eq('origen', 'dolarapi')
        .single();
      if (fila) {
        await getSupabase().from('tasas_cambio').update({ activa: true }).eq('id', fila.id);
        esActiva = true;
      }
    }

    monedas.push({ moneda, valor, activa: esActiva });
  }

  return { ok: true, fuente: tasas.fuente, fecha: tasas.fecha, monedas };
}
