import { getSupabase } from '../config/supabase.js';

export interface AuditoriaEntrada {
  accion: string;
  tabla?: string;
  registroId?: string;
  detalles?: Record<string, unknown>;
  ip?: string;
}

/**
 * Registra un evento en `audit_logs`. Fail-open: si el registro falla (ej.
 * tabla inexistente en un perfil), no interrumpe la operación principal.
 */
export async function registrarAuditoria(
  entrada: AuditoriaEntrada,
  usuarioId?: string,
): Promise<void> {
  try {
    await getSupabase().from('audit_logs').insert({
      usuario_id: usuarioId ?? null,
      accion: entrada.accion,
      tabla: entrada.tabla ?? null,
      registro_id: entrada.registroId ?? null,
      detalles: entrada.detalles ?? null,
      ip: entrada.ip ?? null,
    });
  } catch (err) {
    console.error('[auditoria] no se pudo registrar', err);
  }
}

/** Helper para extraer la IP del request Express. */
export function ipDeRequest(req: {
  ip?: string;
  headers?: { [key: string]: string | string[] | undefined };
}): string {
  const fwd = req.headers?.['x-forwarded-for'];
  const valor = Array.isArray(fwd) ? fwd[0] : fwd;
  return valor?.split(',')[0]?.trim() ?? req.ip ?? '';
}