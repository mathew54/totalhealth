import type { Session } from '@supabase/supabase-js';

/**
 * Sesiones pendientes de completar el segundo factor (MFA).
 *
 * Al autenticar el primer factor (contraseña) con MFA activo, la sesión de
 * Supabase se guarda aquí de forma transitoria, referenciada por el
 * `mfa_token` (5 min). El segundo factor la devuelve y la elimina.
 *
 * Almacenamiento en memoria del proceso: suficiente para el despliegue de un
 * solo nodo (Render/Railway). Para multi-instancia habría que moverlo a Redis.
 */

const MAX_INTENTOS = 5;
const TTL_MS = 5 * 60 * 1000;

interface Entrada {
  session: Session;
  exp: number;
  intentos: number;
}

const pendientes = new Map<string, Entrada>();

function limpiar() {
  const ahora = Date.now();
  for (const [token, e] of pendientes) {
    if (e.exp < ahora) pendientes.delete(token);
  }
}

/** Guarda la sesión pendiente asociada al mfa_token (reemplaza la anterior). */
export function guardarSesionPendiente(mfaToken: string, session: Session): void {
  limpiar();
  pendientes.set(mfaToken, { session, exp: Date.now() + TTL_MS, intentos: 0 });
}

/** Registra un código inválido; true si se agotaron los intentos (invalida). */
export function registrarCodigoInvalido(mfaToken: string): boolean {
  const e = pendientes.get(mfaToken);
  if (!e) return true;
  e.intentos += 1;
  if (e.intentos >= MAX_INTENTOS) {
    pendientes.delete(mfaToken);
    return true;
  }
  return false;
}

/** Devuelve y elimina la sesión pendiente si sigue vigente. */
export function tomarSesionPendiente(mfaToken: string): Session | null {
  limpiar();
  const e = pendientes.get(mfaToken);
  if (!e) return null;
  pendientes.delete(mfaToken);
  return e.session;
}
