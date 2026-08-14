// Resolución de nombres/id de catálogos y perfiles para respuestas de la API
// (el mock no soporta joins). Única implementación: la usan historial,
// cuestionario, imágenes y alertas.

import { getSupabase } from '../config/supabase.js';

/**
 * Arma un Map { id → nombre } desde una tabla con idCol/nameCol.
 * Lee TODAS las filas (catálogos pequeños); el mock no soporta filtros con `in`.
 */
export async function resolverNombres(
  tabla: string,
  ids: string[],
  idCol = 'id',
  nameCol = 'nombre_completo',
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (!ids.length) return map;
  const { data } = await getSupabase().from(tabla).select(`${idCol}, ${nameCol}` as never);
  for (const r of (data ?? []) as unknown as Array<Record<string, unknown>>) {
    const key = r[idCol];
    if (key != null) map.set(String(key), String(r[nameCol] ?? ''));
  }
  return map;
}