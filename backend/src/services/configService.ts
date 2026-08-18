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
