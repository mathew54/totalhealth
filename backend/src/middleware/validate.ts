import type { NextFunction, Request, Response } from 'express';
import { ZodSchema } from 'zod';
import { badRequest } from '../utils/httpError.js';

type Source = 'body' | 'query' | 'params';

export function validate(schema: ZodSchema, source: Source = 'body') {
  return (req: Request, _res: Response, next: NextFunction) => {
    const parsed = schema.safeParse(req[source]);
    if (!parsed.success) {
      return next(badRequest(parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')));
    }
    (req as unknown as Record<string, unknown>)[source] = parsed.data;
    next();
  };
}