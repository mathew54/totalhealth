import { z } from 'zod';

export const idParamSchema = z.object({ id: z.string().uuid('ID inválido') });

export const configPreanaliticaSchema = z.object({
  habilitado: z.boolean(),
  obligatorio: z.boolean(),
});

export const checkpointSchema = z.object({
  nombre: z.string().min(3, 'Nombre requerido').max(200),
});

export const validarSolicitudSchema = z.object({
  checkpoints: z.array(z.string().uuid('Checkpoint inválido')).min(1, 'Selecciona al menos un checkpoint'),
});