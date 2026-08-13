import { z } from 'zod'

/** Campo de un formulario dinámico de especialidad (JSON-Schema ligero). */
export interface CampoEspecialidad {
  clave: string
  etiqueta: string
  tipo: 'texto' | 'textarea' | 'select' | 'numero' | 'check'
  opciones?: string[]
  unidad?: string
  lugar?: string
  requerido?: boolean
}

export interface SchemaEspecialidad {
  id: string
  titulo: string
  descripcion: string
  campos: CampoEspecialidad[]
}

/**
 * Formularios dinámicos por especialidad (JSON-Schema). Se definen para las
 * especialidades de Atención Primaria y las clínicas más usadas; el resto del
 * catálogo (23) queda extensible agregando una entrada aquí (o en el backend).
 */
export const SCHEMAS_ESPECIALIDAD: Record<string, SchemaEspecialidad> = {
  medicina_general: {
    id: 'medicina_general',
    titulo: 'Medicina General',
    descripcion: 'Consulta general y control de salud',
    campos: [
      { clave: 'motivo_consulta', etiqueta: 'Motivo de consulta', tipo: 'texto', requerido: true },
      { clave: 'examen_fisico', etiqueta: 'Examen físico', tipo: 'textarea', lugar: 'Hallazgos relevantes' },
      { clave: 'diagnostico', etiqueta: 'Diagnóstico (CIE-10)', tipo: 'texto' },
      { clave: 'tratamiento', etiqueta: 'Tratamiento indicado', tipo: 'textarea' },
      { clave: 'seguimiento_dias', etiqueta: 'Seguimiento en (días)', tipo: 'numero' },
    ],
  },
  pediatria: {
    id: 'pediatria',
    titulo: 'Pediatría',
    descripcion: 'Crecimiento, desarrollo e inmunización',
    campos: [
      { clave: 'edad_meses', etiqueta: 'Edad (meses)', tipo: 'numero' },
      { clave: 'percentil_peso', etiqueta: 'Percentil de peso (OMS)', tipo: 'select', opciones: ['< P3', 'P3–P15', 'P15–P85', 'P85–P97', '> P97'] },
      { clave: 'percentil_talla', etiqueta: 'Percentil de talla (OMS)', tipo: 'select', opciones: ['< P3', 'P3–P15', 'P15–P85', 'P85–P97', '> P97'] },
      { clave: 'esquema_vacunacion', etiqueta: 'Esquema de vacunación al día', tipo: 'check' },
      { clave: 'nutricion_lactancia', etiqueta: 'Lactancia / Nutrición', tipo: 'textarea' },
    ],
  },
  cardiologia: {
    id: 'cardiologia',
    titulo: 'Cardiología',
    descripcion: 'Riesgo cardiovascular y evaluación cardiológica',
    campos: [
      { clave: 'clase_funcional', etiqueta: 'Clase funcional NYHA', tipo: 'select', opciones: ['I', 'II', 'III', 'IV'] },
      { clave: 'soplo', etiqueta: 'Soplo cardiaco', tipo: 'texto' },
      { clave: 'ekg', etiqueta: 'ECG', tipo: 'select', opciones: ['Normal', 'FA', 'Bloqueo AV', 'Isquemia', 'Otro'] },
      { clave: 'fc_min', etiqueta: 'Frecuencia cardiaca (reposo)', tipo: 'numero', unidad: 'lpm' },
      { clave: 'bajo_riesgo_quirurgico', etiqueta: 'Bajo riesgo quirúrgico', tipo: 'check' },
    ],
  },
  geriatria: {
    id: 'geriatria',
    titulo: 'Geriatría',
    descripcion: 'Valoración integral del adulto mayor',
    campos: [
      { clave: 'riesgo_caidas', etiqueta: 'Riesgo de caídas', tipo: 'select', opciones: ['Bajo', 'Moderado', 'Alto'] },
      { clave: 'test_minimental', etiqueta: 'Mini-Mental (puntaje /30)', tipo: 'numero' },
      { clave: 'dependencia_barthel', etiqueta: 'Índice de Barthel', tipo: 'numero' },
      { clave: 'polifarmacia', etiqueta: 'Polifarmacia (≥5 fármacos)', tipo: 'check' },
      { clave: 'soporte_social', etiqueta: 'Soporte social / red de apoyo', tipo: 'textarea' },
    ],
  },
  endocrinologia: {
    id: 'endocrinologia',
    titulo: 'Endocrinología',
    descripcion: 'Metabolismo, tiroides y diabetes',
    campos: [
      { clave: 'hba1c', etiqueta: 'HbA1c', tipo: 'numero', unidad: '%' },
      { clave: 'tsh', etiqueta: 'TSH', tipo: 'numero', unidad: 'uUI/mL' },
      { clave: 'glicemia_ayunas', etiqueta: 'Glicemia en ayunas', tipo: 'numero', unidad: 'mg/dL' },
      { clave: 'tipo_diabetes', etiqueta: 'Tipo de diabetes', tipo: 'select', opciones: ['Tipo 1', 'Tipo 2', 'Gestacional', 'No diabético'] },
      { clave: 'retinopatia', etiqueta: 'Retinopatía diabética', tipo: 'check' },
    ],
  },
  neurologia: {
    id: 'neurologia',
    titulo: 'Neurología',
    descripcion: 'Valoración neurológica',
    campos: [
      { clave: 'escena_glasgow', etiqueta: 'Escala de Glasgow', tipo: 'numero', unidad: '/15' },
      { clave: 'tipo_cefalea', etiqueta: 'Tipo de cefalea', tipo: 'select', opciones: ['Migraña', 'Tensional', 'Cluster', 'Secundaria', 'Otra'] },
      { clave: 'foco_neurologico', etiqueta: 'Déficit focal presente', tipo: 'check' },
      { clave: 'eextremidades_fuerza', etiqueta: 'Fuerza (MRC /5)', tipo: 'numero' },
      { clave: 'otras_observaciones', etiqueta: 'Otras observaciones', tipo: 'textarea' },
    ],
  },

  vacio: {
    id: 'vacio',
    titulo: 'Especialidad sin formulario específico',
    descripcion: 'Usa la pestaña Evolución (SOAP) para registrar la consulta.',
    campos: [],
  },
}

/** Devuelve el schema de una especialidad (fallback vacío si no está definido). */
export function obtenerSchemaEspecialidad(id: string | null | undefined): SchemaEspecialidad {
  if (id && SCHEMAS_ESPECIALIDAD[id]) return SCHEMAS_ESPECIALIDAD[id]
  return SCHEMAS_ESPECIALIDAD.vacio
}

/** Construye el schema Zod de validación para un schema de especialidad. */
export function construirZodSchema(schema: SchemaEspecialidad) {
  const obj: Record<string, z.ZodType> = {}
  for (const campo of schema.campos) {
    if (campo.tipo === 'numero') {
      obj[campo.clave] = campo.requerido
        ? z.coerce.number()
        : z.union([z.coerce.number(), z.literal(''), z.null()]).optional()
    } else if (campo.tipo === 'check') {
      obj[campo.clave] = z.boolean().optional()
    } else {
      obj[campo.clave] = campo.requerido ? z.string().min(1, 'Campo requerido') : z.string().optional()
    }
  }
  return z.object(obj)
}