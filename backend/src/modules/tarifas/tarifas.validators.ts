import { z } from 'zod';

export const TIPOS_CONSULTA = ['consulta_general', 'especialista', 'domicilio', 'telemedicina', 'control'] as const;
export type TipoConsulta = (typeof TIPOS_CONSULTA)[number];

export const TIPO_CONSULTA_LABEL: Record<TipoConsulta, string> = {
  consulta_general: 'Consulta General',
  especialista: 'Especialista',
  domicilio: 'Domicilio',
  telemedicina: 'Telemedicina',
  control: 'Control',
};

export const IMPUESTO = ['gravado', 'exento', 'no_sujeto'] as const;

export const tarifaConsultaSchema = z.object({
  nombre: z.string().min(2, 'Nombre requerido').max(100),
  tipo: z.enum(TIPOS_CONSULTA),
  especialidad: z.string().max(50).optional().nullable(),
  medico_id: z.string().uuid('Médico inválido').nullable().optional(),
  precio_usd: z.coerce.number().min(0, 'El precio no puede ser negativo'),
  impuesto: z.enum(IMPUESTO).default('gravado'),
  duracion_min: z.coerce.number().int().min(0).optional(),
  activo: z.coerce.boolean().optional(),
});

export const tarifasQuery = z.object({
  tipo: z.string().optional(),
  especialidad: z.string().optional(),
  medico_id: z.string().uuid().optional(),
  activo: z.coerce.boolean().optional(),
});

export const idParamSchema = z.object({
  id: z.string().uuid('ID inválido'),
});

export const resolverTarifaQuery = z.object({
  tipo: z.enum(TIPOS_CONSULTA),
  medico_id: z.string().uuid().optional(),
  clinica_id: z.string().uuid().optional(),
});
