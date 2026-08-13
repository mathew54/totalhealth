/** Tipos del módulo Expediente Clínico Unificado (SPA del médico). */

export interface PacienteExpediente {
  id: string
  cedula: string | null
  nombre_completo: string
  telefono?: string | null
  fecha_nacimiento?: string | null
  sexo?: 'M' | 'F' | null
  es_menor: boolean
  representante_id: string | null
  parentesco_representante: string | null
}

export interface Evolucion {
  id: string
  paciente_id: string
  medico_id: string
  medico_nombre: string | null
  especialidad_id: string | null
  especialidad_nombre: string | null
  subjetivo: string
  objetivo: string
  evaluacion: string
  plan: string
  signos_vitales: Record<string, number | null>
  especialidad_data: Record<string, unknown>
  created_at: string
}

export interface NotaPrivada {
  id: string
  paciente_id: string
  medico_id: string
  contenido: string
  updated_at: string
  created_at: string
}

export interface CasoCompartido {
  id: string
  medico_id: string
  medico_nombre: string | null
  especialidad_id: string | null
  especialidad_nombre: string | null
  titulo: string
  resumen: string
  created_at: string
}

export interface ItemOrden {
  id: string
  nombre: string
  tema: string
  precio: number | null
}

export interface OrdenLaboratorio {
  id: string
  paciente_id: string
  medico_id: string
  examenes: ItemOrden[]
  nota: string
  estado: string
  created_at: string
}

/** Examen del catálogo de laboratorio (GET /api/examenes). */
export interface ExamenCatalogo {
  id: string
  nombre: string
  categoria: string
  precio: number | null
  interno?: boolean
  duracion_min?: number | null
  condiciones_previas?: string | null
  tiempo_entrega?: string | null
  activo: boolean
}

export interface DefCuestionario {
  modulos: {
    id: string
    nombre: string
    descripcion?: string
    items: { clave: string; etiqueta: string; placeholder: string }[]
  }[]
  cierre: { id: string; nombre: string; descripcion?: string; items: { clave: string; etiqueta: string; placeholder: string }[] }
}

export interface RespuestaItem {
  marcado: boolean
  detalle: string | null
}

/** Alerta crítica del paciente (alergias, crónicos, medicamentos críticos). */
export interface AlertaCritica {
  id: string
  tipo: string
  descripcion: string
  severidad: 'alta' | 'media'
  activa: boolean
  created_at: string
}

/** Corrección vinculada a un registro del historial (Fe de Erratas / Adenda). */
export interface CorreccionHistorial {
  id: string
  tipo: 'fe_errata' | 'adenda'
  contenido: Record<string, unknown>
  medico_nombre: string | null
  firma: string
  created_at: string
}

/** Registro inmutable firmado del historial clínico compartido. */
export interface RegistroHistorial {
  id: string
  tipo: string
  titulo: string
  contenido: Record<string, unknown>
  categoria_origen_nombre: string | null
  medico_id: string
  medico_nombre: string | null
  firma: string
  correcciones: CorreccionHistorial[]
  created_at: string
}

/** Línea de una solicitud de laboratorio con su resultado. */
export interface LineaResultado {
  id: string
  examen_id: string
  examen: string
  precio: number
  resultado: {
    id: string
    valores: Record<string, unknown> | null
    observaciones: string | null
    procesado_at: string | null
  } | null
}

/** Solicitud de laboratorio del paciente con sus líneas/resultados. */
export interface ResultadoLaboratorio {
  id: string
  fecha: string
  estado: string
  cobrado: boolean
  lineas: LineaResultado[]
}

/** Interconsulta: derivación del caso a otro especialista. */
export interface Interconsulta {
  id: string
  paciente_id: string
  medico_origen_id: string
  medico_origen_nombre: string | null
  medico_destino_nombre: string | null
  medico_responde_nombre: string | null
  categoria_destino_nombre: string | null
  especialidad_destino_nombre: string | null
  motivo: string
  hipotesis: string | null
  respuesta: string | null
  estado: string
  created_at: string
}

/** Respuesta agregada del módulo historial para el expediente del paciente. */
export interface ExpedienteCompleto {
  paciente: { id: string; cedula: string | null; nombre_completo: string }
  alertas_criticas: AlertaCritica[]
  historial: RegistroHistorial[]
  interconsultas: Interconsulta[]
  resultados_laboratorio: ResultadoLaboratorio[]
}

export type Respuestas = Record<string, RespuestaItem | string>