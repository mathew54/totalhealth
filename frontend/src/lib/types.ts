// Tipos compartidos entre módulos del frontend (evita redefinir `Paciente` en
// cada página/vista). Solo el mínimo común que devuelve el API; el resto son
// campos opcionales que algunas vistas consultan.

export interface Paciente {
  id: string
  cedula: string | null
  nombre_completo: string
  tipo_documento?: string | null
  telefono?: string | null
  country_code?: string | null
  local_number?: string | null
  email?: string | null
  direccion?: string | null
  sexo?: string | null
  fecha_nacimiento?: string | null
  es_menor?: boolean
  representante_id?: string | null
  parentesco_representante?: string | null
  fecha_consentimiento?: string | null
  historial?: { total_consultas: number }
  clinica_id?: string | null
}