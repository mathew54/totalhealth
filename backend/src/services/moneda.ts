// services/moneda.ts
// TotalHealth: moneda base USD + equivalencia en Bs. con la tasa del día.
// - La tasa activa del día (USD y EUR) se lee de `tasas_cambio` (puede venir
//   de dolarapi/BCV o ser manual). Se reusa la lógica del endpoint público
//   /api/tasas: tasa activa de hoy, con respaldo al día más reciente con datos.
// - Los precios de servicios/exámenes/consultas se expresan siempre en USD; el
//   cobro y la factura pueden convertirse a Bs. con la tasa registrada.

import { getSupabase } from '../config/supabase.js';

const MONEDAS = ['USD', 'EUR'] as const;

export interface TasasDelDia {
  usd: number | null;
  eur: number | null;
  fecha: string | null;
}

function numeroValido(valor: unknown): number | null {
  if (valor == null) return null;
  const n = Number(valor);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Lee las tasas activas del día para USD y EUR (con respaldo al último día con
 * datos). Devuelve null por moneda si no hay ninguna registrada.
 */
export async function obtenerTasasActivas(): Promise<TasasDelDia> {
  const { data } = await getSupabase()
    .from('tasas_cambio')
    .select('fecha, moneda, valor, activa')
    .in('moneda', MONEDAS as unknown as string[])
    .order('fecha', { ascending: false })
    .order('activa', { ascending: false })
    .order('created_at', { ascending: false });

  const filas = data ?? [];
  const fecha = filas[0]?.fecha ? String(filas[0].fecha) : null;

  const usd = numeroValido(
    filas.find((f) => f.moneda === 'USD' && f.activa)?.valor ??
      filas.find((f) => f.moneda === 'USD')?.valor,
  );
  const eur = numeroValido(
    filas.find((f) => f.moneda === 'EUR' && f.activa)?.valor ??
      filas.find((f) => f.moneda === 'EUR')?.valor,
  );

  return { usd, eur, fecha };
}

/** Tasa activa del día del Dólar (USD) o null si no hay datos. */
export async function obtenerTasaUsdActiva(): Promise<number | null> {
  const { usd } = await obtenerTasasActivas();
  return usd;
}

/** Convierte un monto en USD a Bs. (2 decimales). Devuelve null sin tasa. */
export function usdABs(montoUsd: number, tasaUsd: number | null): number | null {
  if (montoUsd == null || tasaUsd == null || tasaUsd <= 0) return null;
  return Number((montoUsd * tasaUsd).toFixed(2));
}

/** Convierte un monto en Bs. a USD (2 decimales). Devuelve null sin tasa. */
export function bsAUsd(montoBs: number, tasaUsd: number | null): number | null {
  if (montoBs == null || tasaUsd == null || tasaUsd <= 0) return null;
  return Number((montoBs / tasaUsd).toFixed(2));
}

/**
 * Normaliza un monto de pago a USD base según la moneda en que se registró.
 * - USD: es el mismo monto.
 * - BS: se divide entre la tasa registrada en el pago (o la tasa del día).
 */
export async function montoAUsd(monto: number, moneda: string, tasaRegistrada: number | null): Promise<number | null> {
  if (moneda === 'USD') return Number(monto.toFixed(2));
  const tasa = tasaRegistrada ?? (await obtenerTasaUsdActiva());
  return bsAUsd(monto, tasa);
}
