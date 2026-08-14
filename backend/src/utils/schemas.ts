// Schemas Zod compartidos (identificadores, fechas). Evita redefinirlos en cada
// módulo (14 copias de idParamSchema) y unifica los mensajes de error de fechas.

import { z } from 'zod';

export const idParamSchema = z.object({ id: z.string().uuid('ID inválido') });

export const uuidSchema = z.string().uuid('ID inválido');

/** Fecha en formato YYYY-MM-DD. */
export const fechaYmd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha en formato YYYY-MM-DD');

/** Datetime ISO 8601 (zod datetime). */
export const fechaISO = z.string().datetime('Fecha ISO inválida');