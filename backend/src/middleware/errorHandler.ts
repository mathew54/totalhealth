import type { NextFunction, Request, Response } from 'express';
import { env } from '../config/env.js';
import { HttpError } from '../utils/httpError.js';

export function notFoundHandler(_req: Request, res: Response) {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Ruta no encontrada' } });
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: { code: err.code, message: err.message } });
  }

  const message = err instanceof Error ? err.message : 'Error interno';
  if (env.nodeEnv !== 'test') console.error('[error]', err);
  return res.status(500).json({ error: { code: 'INTERNAL', message } });
}
