import type { NextFunction, Request, Response } from 'express';
import { forbidden } from '../utils/httpError.js';
import type { Rol } from '../modules/auth/types.js';

export function requireRole(...roles: Rol[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(forbidden('Acceso denegado'));
    if (!roles.includes(req.user.role)) return next(forbidden('Acceso denegado'));
    next();
  };
}
