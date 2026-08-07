import { getSupabase } from '../config/supabase.js';
import { env } from '../config/env.js';

export interface EstadoBloqueo {
  bloqueado: boolean;
  /** Segundos hasta que expira el bloqueo (0 si no está bloqueado). */
  retryAfterSec: number;
  /** Intentos fallidos consecutivos acumulados (0 si bloqueado). */
  intentos: number;
}

/**
 * Bloqueo de cuenta por intentos fallidos de login.
 * Estado persistido en `profiles` (`login_intentos`, `bloqueado_hasta`),
 * compatible con mock y Supabase real.
 */

/** Lee el estado de bloqueo de un perfil por cédula, sin contabilizar nada. */
export async function estadoBloqueo(cedula: string): Promise<EstadoBloqueo> {
  const { data: profile } = await getSupabase()
    .from('profiles')
    .select('login_intentos, bloqueado_hasta')
    .eq('cedula', cedula)
    .maybeSingle();

  const bloqueadoHasta = profile?.bloqueado_hasta
    ? new Date(profile.bloqueado_hasta as string).getTime()
    : 0;
  if (bloqueadoHasta > Date.now()) {
    const retryAfterSec = Math.max(1, Math.ceil((bloqueadoHasta - Date.now()) / 1000));
    return { bloqueado: true, retryAfterSec, intentos: 0 };
  }
  return { bloqueado: false, retryAfterSec: 0, intentos: Number(profile?.login_intentos ?? 0) };
}

/** Registra un intento fallido; al alcanzar el máximo bloquea la cuenta. */
export async function registrarIntentoFallido(cedula: string): Promise<EstadoBloqueo> {
  const estado = await estadoBloqueo(cedula);
  if (estado.bloqueado) return estado;

  const intentos = estado.intentos + 1;
  if (intentos >= env.loginMaxIntentos) {
    const bloqueadoHasta = new Date(Date.now() + env.loginLockMin * 60_000).toISOString();
    await getSupabase()
      .from('profiles')
      .update({ login_intentos: 0, bloqueado_hasta: bloqueadoHasta })
      .eq('cedula', cedula);
    return { bloqueado: true, retryAfterSec: env.loginLockMin * 60, intentos: 0 };
  }
  await getSupabase()
    .from('profiles')
    .update({ login_intentos: intentos })
    .eq('cedula', cedula);
  return { bloqueado: false, retryAfterSec: 0, intentos };
}

/** Limpia los contadores tras un login correcto. */
export async function reiniciarIntentos(cedula: string): Promise<void> {
  await getSupabase()
    .from('profiles')
    .update({ login_intentos: 0, bloqueado_hasta: null })
    .eq('cedula', cedula);
}
