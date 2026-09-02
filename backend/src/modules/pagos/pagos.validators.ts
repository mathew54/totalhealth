import { z } from 'zod';

// Opciones fiscales del cobro (caja): IGTF opcional y retenciones VE.
const opcionesFiscales = {
  // Cliente al que se factura (por defecto el paciente de la solicitud).
  paciente_id: z.string().uuid('Cliente a facturar inválido').optional(),
  // IGTF: aplica solo en divisas; se puede excluir con igtf_aplica=false.
  igtf_aplica: z.boolean().optional(),
  // Retenciones según leyes VE (Ley IVA art. 27-28; Decreto 1.808 ISLR).
  retencion_iva_aplica: z.boolean().optional(),
  retencion_islr_aplica: z.boolean().optional(),
};

export const cobroLaboratorioSchema = z.object({
  solicitud_id: z.string().uuid('Solicitud inválida'),
  metodo: z.string().max(30).optional(),
  moneda: z.enum(['BS', 'USD']).default('USD'),
  descuento: z.coerce.number().min(0).optional(),
  descuento_motivo: z.string().max(300).optional(),
  usar_prepago: z.boolean().optional(),
  ...opcionesFiscales,
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

export const abonoSchema = z.object({
  solicitud_id: z.string().uuid('Solicitud inválida'),
  monto: z.coerce.number().positive('El abono debe ser mayor a 0'),
  metodo: z.string().max(30).optional(),
  moneda: z.enum(['BS', 'USD']).default('USD'),
  observaciones: z.string().max(300).optional(),
  ...opcionesFiscales,
});

export const prepagoSchema = z.object({
  paciente_id: z.string().uuid('Paciente inválido'),
  monto: z.coerce.number().positive('La recarga debe ser mayor a 0'),
  metodo: z.string().max(30).optional(),
  moneda: z.enum(['BS', 'USD']).default('USD'),
});

export const prepagoQuery = z.object({
  paciente_id: z.string().uuid('Paciente inválido'),
});