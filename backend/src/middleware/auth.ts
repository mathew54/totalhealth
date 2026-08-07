import type { NextFunction, Request, Response } from 'express';
import { getSupabase } from '../config/supabase.js';
import { verifySupabaseToken } from '../utils/jwt.js';
import { forbidden, unauthorized } from '../utils/httpError.js';
import type { AuthUser, Rol } from '../modules/auth/types.js';

export async function authRequired(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return next(unauthorized('Token requerido'));

  let ctx: AuthUser;
  try {
    ctx = verifySupabaseToken(token);
  } catch (err) {
    return next(err);
  }

  const { data: profile, error } = await getSupabase()
    .from('profiles')
    .select('id, role, roles, clinica_id, nombre_completo, activo')
    .eq('id', ctx.id)
    .single();

  if (error || !profile) return next(unauthorized('Perfil no encontrado'));
  if (!profile.activo) return next(forbidden('Usuario desactivado'));

  const roles = Array.isArray(profile.roles) ? (profile.roles as Rol[]) : [profile.role ?? ctx.role];

  req.user = {
    id: profile.id,
    role: roles.includes(ctx.role) ? ctx.role : (roles[0] ?? ctx.role),
    roles,
    clinicaId: profile.clinica_id,
    nombre: profile.nombre_completo,
  } satisfies AuthUser;

  next();
}
