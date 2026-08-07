import { z } from 'zod';

export const cobroLaboratorioSchema = z.object({
  solicitud_id: z.string().uuid('Solicitud inválida'),
  metodo: z.string().max(30).optional(),
  moneda: z.enum(['BS', 'USD']).default('USD'),
  descuento: z.coerce.number().min(0).optional(),
  descuento_motivo: z.string().max(300).optional(),
});

export const pagosQuery = z.object({
  desde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD').optional(),
  hasta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD').optional(),
});

export const cambioEstadoSchema = z.object({
  estado: z.enum(['pendiente', 'pagado', 'reembolsado']),
});

export const pagosFacturaQuery = z.object({
  id: z.string().uuid('Pago inválido'),
});

export const reembolsoSchema = z.object({}).passthrough();