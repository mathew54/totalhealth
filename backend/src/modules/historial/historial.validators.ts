import { z } from 'zod';

export const idParamSchema = z.object({ id: z.string().uuid('ID inválido') });

export const pacienteIdParamSchema = z.object({ id: z.string().uuid('Paciente inválido') });

export const TIPOS_REGISTRO = ['evolucion', 'procedimiento', 'interconsulta', 'resultado', 'otro'] as const;

export const registroSchema = z.object({
  paciente_id: z.string().uuid('Paciente inválido'),
  consulta_id: z.string().uuid('Consulta inválida').optional().nullable(),
  tipo: z.enum(TIPOS_REGISTRO, { errorMap: () => ({ message: 'Tipo de registro inválido' }) }),
  titulo: z.string().min(1, 'Título requerido').max(200),
  contenido: z.record(z.unknown()).default({}),
});

export const correccionSchema = z.object({
  tipo: z.enum(['fe_errata', 'adenda'], { errorMap: () => ({ message: 'Tipo de corrección inválido' }) }),
  contenido: z.record(z.unknown(), { errorMap: () => ({ message: 'Contenido requerido' }) }).refine((v) => Object.keys(v).length > 0, 'Contenido requerido'),
});

export const notaSchema = z.object({
  consulta_id: z.string().uuid('Consulta inválida').optional().nullable(),
  contenido: z.string().min(1, 'Contenido requerido').max(5000),
});

export const notaUpdateSchema = z.object({
  contenido: z.string().min(1, 'Contenido requerido').max(5000),
});

export const alertaCriticaSchema = z.object({
  tipo: z.enum(['alergia', 'enfermedad_cronica', 'medicamento_critico'], { errorMap: () => ({ message: 'Tipo de alerta inválido' }) }),
  descripcion: z.string().min(1, 'Descripción requerida').max(500),
  severidad: z.enum(['alta', 'media']).default('alta'),
});

export const alertaUpdateSchema = z.object({
  activa: z.boolean(),
});

export const interconsultaSchema = z.object({
  paciente_id: z.string().uuid('Paciente inválido'),
  consulta_origen_id: z.string().uuid('Consulta inválida').optional().nullable(),
  categoria_destino: z.string().min(1, 'Categoría destino requerida').max(50),
  especialidad_destino: z.string().max(50).optional().nullable(),
  medico_destino_id: z.string().uuid('Médico inválido').optional().nullable(),
  motivo: z.string().min(1, 'Motivo requerido').max(500),
  hipotesis: z.string().max(1000).optional().nullable(),
});

export const interconsultaUpdateSchema = z.object({
  estado: z.enum(['aceptada', 'completada', 'cancelada'], { errorMap: () => ({ message: 'Estado inválido' }) }),
  respuesta: z.string().max(3000).optional().nullable(),
});

export const interconsultasQuery = z.object({
  estado: z.enum(['enviada', 'aceptada', 'completada', 'cancelada']).optional(),
  paciente_id: z.string().uuid('Paciente inválido').optional(),
});
