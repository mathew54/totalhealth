import { z } from 'zod';

export { idParamSchema } from '../../utils/schemas.js';

export const vinculoSchema = z.object({
  paciente_id: z.string().uuid('Paciente inválido'),
  dependiente_id: z.string().uuid('Dependiente inválido'),
  parentesco: z.enum(['hijo', 'hija', 'hermano', 'hermana', 'padre', 'madre', 'conyuge', 'abuelo', 'abuela', 'nieto', 'nieta', 'otro'], {
    required_error: 'Parentesco requerido',
  }),
});