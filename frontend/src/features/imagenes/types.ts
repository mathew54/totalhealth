export interface ImagenClinica {
  id: string
  estudio_id: string | null
  paciente_id: string
  url: string
  tipo: string
  region: string | null
  descripcion: string | null
  orden: number
  creado_por: string | null
  created_at: string
}

export interface EstudioImagen {
  id: string
  clinica_id: string | null
  paciente_id: string
  consulta_id: string | null
  tipo: string
  region: string | null
  titulo: string | null
  hallazgos: string | null
  impresion: string | null
  estado: 'pendiente' | 'leido'
  medico_id: string | null
  creado_por: string | null
  fecha_estudio: string
  retencion_hasta: string | null
  token: string | null
  token_expira: string | null
  created_at: string
  updated_at: string
  imagenes?: ImagenClinica[]
  imagenes_count?: number
  portada?: string | null
  paciente_nombre?: string | null
  creado_por_nombre?: string | null
  medico_nombre?: string | null
}

export const TIPO_LABELS: Record<string, string> = {
  rx: 'Radiografía',
  ecografia: 'Ecografía',
  tomografia: 'Tomografía (TC)',
  resonancia: 'Resonancia (RMN)',
  foto: 'Foto clínica',
  otro: 'Otro',
}

export const TIPO_LABELS_CORTOS: Record<string, string> = {
  rx: 'Rx',
  ecografia: 'Eco',
  tomografia: 'TC',
  resonancia: 'RMN',
  foto: 'Foto',
  otro: 'Otro',
}

export const ESTADO_LABELS: Record<string, string> = {
  pendiente: 'Pendiente',
  leido: 'Leído',
}

/** Presets de ventana/contraste por modalidad (window/level aproximado). */
export const PRESETS_VENTANA: Record<string, { brillo: number; contraste: number; label: string }> = {
  rx: { brillo: 1.05, contraste: 1.2, label: 'Rx' },
  ecografia: { brillo: 1.1, contraste: 1.1, label: 'Eco' },
  tomografia: { brillo: 0.95, contraste: 1.3, label: 'TC' },
  resonancia: { brillo: 1.0, contraste: 1.25, label: 'RMN' },
  foto: { brillo: 1, contraste: 1, label: 'Foto' },
  otro: { brillo: 1, contraste: 1, label: 'Otro' },
}