import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { unauthorized } from './httpError.js';
import type { AuthUser, Rol } from '../modules/auth/types.js';

/**
 * Firma un access token de staff con los claims internos de RBAC
 * (rol activo + roles asignados). Se usa tanto en modo mock como al
 * cambiar el rol activo sin volver a iniciar sesión.
 */
export function signStaffToken(args: {
  id: string;
  role: Rol;
  roles: Rol[];
  clinicaId: string | null;
  nombre: string;
}): string {
  return jwt.sign(
    {
      sub: args.id,
      role: args.role,
      roles: args.roles,
      clinica_id: args.clinicaId,
      nombre: args.nombre,
      aud: 'authenticated',
    },
    env.supabaseJwtSecret,
    { algorithm: 'HS256', expiresIn: '1h' },
  );
}

/**
 * Verifica un access token de Supabase (JWT HS256 firmado con el secreto del proyecto)
 * y lo mapea al contexto interno del usuario.
 */
export function verifySupabaseToken(token: string): AuthUser {
  try {
    const payload = jwt.verify(token, env.supabaseJwtSecret, {
      algorithms: ['HS256'],
    }) as jwt.JwtPayload;

    const userId = payload.sub;
    if (!userId) throw new Error('sin sub');

    const activeRole = (payload.role as Rol) ?? 'medico';
    const roles = Array.isArray(payload.roles)
      ? (payload.roles as Rol[])
      : [activeRole];

    return {
      id: userId,
      role: activeRole,
      roles,
      clinicaId: (payload.clinica_id as string) ?? null,
      nombre: (payload.nombre as string) ?? '',
    };
  } catch {
    throw unauthorized('Token inválido o expirado');
  }
}

export interface PortalTokenPayload {
  pid: string; // paciente id
  exp?: number;
}

export function signPortalToken(pacienteId: string): string {
  return jwt.sign({ pid: pacienteId } satisfies PortalTokenPayload, env.portalTokenSecret, {
    expiresIn: env.portalTokenTtlMin * 60,
  });
}

export function verifyPortalToken(token: string): PortalTokenPayload {
  try {
    return jwt.verify(token, env.portalTokenSecret) as PortalTokenPayload;
  } catch {
    throw unauthorized('Token del portal inválido o expirado');
  }
}

export interface ShareTokenPayload {
  pid: string; // paciente id (dueño del resultado)
  rid: string; // resultado id compartido
  exp?: number;
}

/** Token de corta duración para compartir UN resultado con un médico externo. */
export function signShareToken(pacienteId: string, resultadoId: string): string {
  return jwt.sign({ pid: pacienteId, rid: resultadoId } satisfies ShareTokenPayload, env.portalTokenSecret, {
    expiresIn: 60 * 60, // 1 hora
  });
}

export function verifyShareToken(token: string): ShareTokenPayload {
  try {
    return jwt.verify(token, env.portalTokenSecret) as ShareTokenPayload;
  } catch {
    throw unauthorized('Enlace de resultado inválido o expirado');
  }
}

export interface MfaTokenPayload {
  sub: string; // id del perfil que debe completar el segundo factor
  scope: 'mfa';
  exp?: number;
}

/** Token de corta duración que autoriza completar el segundo factor tras el login. */
export function signMfaToken(profileId: string): string {
  return jwt.sign({ sub: profileId, scope: 'mfa' } satisfies MfaTokenPayload, env.supabaseJwtSecret, {
    algorithm: 'HS256',
    expiresIn: 5 * 60, // 5 minutos
  });
}

export function verifyMfaToken(token: string): MfaTokenPayload {
  try {
    const payload = jwt.verify(token, env.supabaseJwtSecret, {
      algorithms: ['HS256'],
    }) as jwt.JwtPayload;
    if (payload.scope !== 'mfa' || !payload.sub) throw new Error('scope inválido');
    return { sub: payload.sub as string, scope: 'mfa' };
  } catch {
    throw unauthorized('Token MFA inválido o expirado');
  }
}
