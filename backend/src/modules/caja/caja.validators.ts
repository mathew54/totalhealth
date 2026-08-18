import { z } from 'zod';

/** Apertura de turno de caja: monto inicial en la caja (USD base). */
export const aperturaCajaSchema = z.object({
  monto_inicial: z.coerce.number().min(0).default(0),
  observaciones: z.string().max(500).optional().nullable(),
});

/** Cierre/arqueo: efectivo contado físicamente en USD y en Bs. */
export const cierreCajaSchema = z.object({
  efectivo_usd: z.coerce.number().min(0).default(0),
  efectivo_bs: z.coerce.number().min(0).default(0),
  observaciones: z.string().max(500).optional().nullable(),
});

export const cajaTurnosQuery = z.object({
  desde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD').optional(),
  hasta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD').optional(),
  estado: z.enum(['abierta', 'cerrada']).optional(),
});