// Utilidades E.164 para el Front-end (espejo de backend/src/services/phoneNumber.ts).
import { paisesActuales, VENEZUELA, type Pais } from './paises'

export interface TelefonoPartes {
  country_code: string | null
  local_number: string | null
}

const limpiar = (valor: string | null | undefined): string => String(valor ?? '').trim().replace(/[\s\-().]/g, '')

// Códigos E.164 de países conocidos, ordenados de mayor a menor longitud para
// buscar el prefijo de país correcto (más largo primero). Se calcula en cada
// llamada porque el catálogo se carga del backend (GET /config/paises).
const codigosPais = (): string[] =>
  Array.from(new Set(paisesActuales().map((p) => p.codigo))).sort((a, b) => b.length - a.length)

/** Extrae `country_code` (+CC) y `local_number` de un string E.164 (o legado). */
export function separarTelefono(telefono: string | null | undefined): TelefonoPartes {
  const t = limpiar(telefono)
  if (!t) return { country_code: null, local_number: null }

  const digits = t.replace(/\D/g, '')

  // Con prefijo de país ('+'): identifica el código de país por el prefijo más
  // largo conocido (p.ej. +584244458116 → '+58' + '4244458116', no '584').
  if (t.startsWith('+')) {
    for (const code of codigosPais()) {
      if (digits.startsWith(code)) {
        const local = digits.slice(code.length)
        return { country_code: `+${code}`, local_number: local || null }
      }
    }
    // Sin coincidencia con un país conocido: devolver el número sin código.
    return { country_code: null, local_number: digits || null }
  }

  // Sin prefijo de país: se asume Venezuela (+58) y se quita el 0 inicial.
  const local = digits.replace(/^0+/, '')
  return { country_code: '+58', local_number: local || null }
}

/** Une `country_code` + `local_number` en un string E.164 estricto (null si vacío). */
export function unificarTelefono(partes: { country_code?: string | null; local_number?: string | null } | null | undefined): string | null {
  const cc = limpiar(partes?.country_code).replace(/^\+/, '')
  const local = limpiar(partes?.local_number).replace(/^0+/, '')
  if (!cc && !local) return null
  if (!cc) return `+58${local}`
  if (!local) return null
  return `+${cc}${local}`
}

/** Solo dígitos del número local (quita el 0 inicial: no puede empezar en cero). */
export function limpiarNumeroLocal(raw: string): string {
  let d = String(raw ?? '').replace(/\D/g, '')
  if (d.startsWith('0')) d = d.replace(/^0+/, '')
  return d
}

/** País a partir de un código E.164 (con o sin '+') o ISO; Venezuela por defecto. */
export function paisDesdeCodigo(codigo: string | null | undefined): Pais {
  const sinMas = limpiar(codigo).replace(/^\+/, '')
  if (!sinMas) return VENEZUELA
  const PAISES = paisesActuales()
  return (
    PAISES.find((p) => p.codigo === sinMas) ??
    PAISES.find((p) => p.iso2.toLowerCase() === sinMas.toLowerCase()) ??
    VENEZUELA
  )
}

/** Formatea un teléfono para mostrarlo (separado: "+58 4121234567"; único: "+584121234567"). */
export function formatearTelefono(telefono: string | null | undefined, modo: 'separado' | 'unico' = 'separado'): string {
  if (!limpiar(telefono)) return telefono ?? ''
  const { country_code, local_number } = separarTelefono(telefono)
  if (!local_number) return telefono ?? ''
  return modo === 'separado' ? `${country_code} ${local_number}` : `${country_code ?? ''}${local_number}`
}
