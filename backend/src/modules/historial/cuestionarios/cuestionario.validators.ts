// cuestionario.validators.ts
// TotalHealth: JSON Schema (zod) de las operaciones CRUD del cuestionario de
// historial médico. Modela estados (boolean), detalles (string), metadatos de
// auditoría y las banderas de aprobación administrativa (justificación +
// contraseña) para la eliminación.
import { z } from 'zod';
import { CLAVES_ITEMS, OBSERVACIONES_KEY } from './definicion.js';

export const idParamSchema = z.object({ id: z.string().uuid('ID inválido') });

/** Query de listado dentro de un paciente: solo el estado (opcional). */
export const cuestionarioPacienteQuerySchema = z.object({
  estado: z.enum(['borrador', 'consolidado']).optional(),
});

const itemRespuestaSchema = z.object({
  marcado: z.boolean(),
  detalle: z.string().trim().max(500, 'El detalle no puede superar 500 caracteres').optional().nullable(),
});

const respuestasFields = Object.fromEntries(CLAVES_ITEMS.map((clave) => [clave, itemRespuestaSchema]));

/**
 * Cuerpo de respuestas: cada punto del checklist es { marcado, detalle } y el
 * cierre "Otros / Observaciones Adicionales" es obligatorio (se valida al
 * consolidar; en borrador se tolera vacío mediante `.default('')`).
 */
export const respuestasSchema = z.object({
  ...respuestasFields,
  [OBSERVACIONES_KEY]: z.string().trim().max(2000, 'Las observaciones no pueden superar 2000 caracteres').optional().default(''),
});

/**
 * CREATE: el paciente llega en el path (`/historial/pacientes/:id/cuestionarios`);
 * el cuerpo solo puede traer consulta y respuestas iniciales (opcionales).
 */
export const crearCuestionarioPacienteSchema = z.object({
  consulta_id: z.string().uuid('Consulta inválida').optional().nullable(),
  respuestas: respuestasSchema.optional(),
});

export const actualizarRespuestasSchema = z.object({
  respuestas: respuestasSchema,
});

export const adendaSchema = z.object({
  respuestas: respuestasSchema,
  observacion: z.string().trim().max(1000).optional().nullable(),
});

export const consolidarSchema = z.object({}).strict();

/**
 * DELETE: solo administradores. Exige justificación (para el Log de Auditoría)
 * y la contraseña del administrador (re-autenticación administrativa explícita).
 */
export const eliminarCuestionarioSchema = z.object({
  justificacion: z.string().trim().min(10, 'Debes indicar una justificación (mín. 10 caracteres)').max(1000, 'Justificación demasiado larga'),
  password: z.string().min(1, 'Contraseña de administrador requerida'),
});
