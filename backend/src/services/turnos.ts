// Numeración de turnos de sala de espera. Única implementación del cálculo del
// próximo número del día: la comparten consultas (creación desde agenda) y el
// módulo turnos (sala de espera), evitando numeraciones desincronizadas.

import { getSupabase } from '../config/supabase.js';

/** Asigna el próximo número de turno del día (máximo existente + 1). */
export async function proximoNumeroTurno(clinicaId: string | null, fecha: string): Promise<number> {
  const { data } = await getSupabase()
    .from('turnos')
    .select('numero')
    .eq('fecha', fecha)
    .order('numero', { ascending: false })
    .range(0, 0);
  return ((data?.[0]?.numero as number | undefined) ?? 0) + 1;
}