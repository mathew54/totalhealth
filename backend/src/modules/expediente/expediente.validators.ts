import { z } from 'zod';

export const idParamSchema = z.object({ id: z.string().uuid('ID inválido') });

export const pacienteIdParamSchema = z.object({ id: z.string().uuid('ID de paciente inválido') });

export const pacienteIdQuerySchema = z.object({
  paciente_id: z.string().uuid('ID de paciente inválido'),
});

export const tutorIdQuerySchema = z.object({
  tutor_id: z.string().uuid('ID de tutor inválido'),
});

/** Valor numérico de un signo vital (acepta número o string vacío). */
const numeroOpcional = z.union([z.number(), z.string().regex(/^\s*$/, ''), z.null()]).optional();

const signosVitalesSchema = z.object({
  peso_kg: numeroOpcional,
  talla_cm: numeroOpcional,
  presion_sistolica: numeroOpcional,
  presion_diastolica: numeroOpcional,
  frecuencia_cardiaca: numeroOpcional,
  frecuencia_respiratoria: numeroOpcional,
  temperatura: numeroOpcional,
  saturacion_oxigeno: numeroOpcional,
  glicemia: numeroOpcional,
});

/** Nota SOAP de evolución + signos vitales + datos de especialidad (JSON libre). */
export const evolucionSchema = z.object({
  paciente_id: z.string().uuid('Paciente inválido'),
  especialidad_id: z.string().optional(),
  subjetivo: z.string().max(4000).optional().default(''),
  objetivo: z.string().max(4000).optional().default(''),
  evaluacion: z.string().max(4000).optional().default(''),
  plan: z.string().max(4000).optional().default(''),
  signos_vitales: signosVitalesSchema.optional(),
  especialidad_data: z.record(z.unknown()).optional(),
});

export const notaPrivadaSchema = z.object({
  paciente_id: z.string().uuid('Paciente inválido'),
  contenido: z.string().min(1, 'Contenido requerido').max(8000),
});

export const casoSchema = z.object({
  titulo: z.string().min(5, 'Título requerido').max(200),
  resumen: z.string().min(10, 'Resumen requerido').max(8000),
  especialidad_id: z.string().optional(),
});
