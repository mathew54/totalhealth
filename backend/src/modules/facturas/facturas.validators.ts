import { z } from 'zod';

export const facturasQuery = z.object({
  desde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD').optional(),
  hasta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD').optional(),
  paciente_id: z.string().uuid('Paciente inválido').optional(),
  estatus: z.enum(['emitida', 'anulada']).optional(),
  tipo: z.enum(['factura', 'recibo', 'nota_credito', 'nota_debito']).optional(),
});

export const anularFacturaSchema = z.object({
  motivo: z.string().min(5, 'Indica el motivo de anulación (mínimo 5 caracteres)').max(500),
});
