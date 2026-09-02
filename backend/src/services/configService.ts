// Configuración global de negocio (app_config, fila única id = true).
// Fuente de verdad para valores parametrizables (IVA, preanalítica, marca).

import { getSupabase } from '../config/supabase.js';

export const IVA_DEFECTO = 0.16;

/** Lee el porcentaje de IVA (0.16 = 16%) desde app_config; respaldo al default. */
export async function obtenerIvaPorcentaje(): Promise<number> {
  try {
    const { data } = await getSupabase()
      .from('app_config')
      .select('iva')
      .eq('id', true)
      .maybeSingle();
    const v = Number(data?.iva);
    return Number.isFinite(v) && v >= 0 ? v : IVA_DEFECTO;
  } catch {
    return IVA_DEFECTO;
  }
}

/** Porcentaje de Impuesto a las Grandes Transacciones Financieras (default 0.03 = 3%). */
export const IGTF_DEFECTO = 0.03;

/** Lee el porcentaje de IGTF desde app_config; respaldo al default. */
export async function obtenerIgtfPorcentaje(): Promise<number> {
  try {
    const { data } = await getSupabase()
      .from('app_config')
      .select('igtf')
      .eq('id', true)
      .maybeSingle();
    const v = Number(data?.igtf);
    return Number.isFinite(v) && v >= 0 ? v : IGTF_DEFECTO;
  } catch {
    return IGTF_DEFECTO;
  }
}

/**
 * Retención de IVA (Ley del IVA, art. 27-28): porcentaje del IVA que el comprador
 * agente de retención le descuenta al vendedor. Default 0.75 (75%, contribuyente
 * especial); puede subirse a 1 (100%) si hay sanción declarada.
 */
export const RETENCION_IVA_DEFECTO = 0.75;

/** Lee el porcentaje de retención de IVA desde app_config; respaldo al default. */
export async function obtenerRetencionIvaPct(): Promise<number> {
  try {
    const { data } = await getSupabase()
      .from('app_config')
      .select('retencion_iva_pct')
      .eq('id', true)
      .maybeSingle();
    const v = Number(data?.retencion_iva_pct);
    return Number.isFinite(v) && v >= 0 && v <= 1 ? v : RETENCION_IVA_DEFECTO;
  } catch {
    return RETENCION_IVA_DEFECTO;
  }
}

/**
 * Retención de ISLR (Decreto 1.808 de Retenciones, art. 8): porcentaje retenido
 * sobre pagos por servicios. Default 0.03 (3% servicios en general).
 */
export const RETENCION_ISLR_DEFECTO = 0.03;

/** Lee el porcentaje de retención de ISLR desde app_config; respaldo al default. */
export async function obtenerRetencionIslrPct(): Promise<number> {
  try {
    const { data } = await getSupabase()
      .from('app_config')
      .select('retencion_islr_pct')
      .eq('id', true)
      .maybeSingle();
    const v = Number(data?.retencion_islr_pct);
    return Number.isFinite(v) && v >= 0 && v <= 1 ? v : RETENCION_ISLR_DEFECTO;
  } catch {
    return RETENCION_ISLR_DEFECTO;
  }
}
