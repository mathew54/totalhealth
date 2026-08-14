// Catálogo de países para el selector de prefijo telefónico (Código E.164).
// Fuente ÚNICA: GET /api/config/paises, que el backend lee de la BD (tabla
// `paises`, alimentada por src/data/paises.ts en el backend y la migración
// 0030). Aquí solo queda la interfaz, el cálculo de bandera y un fallback
// mínimo (Venezuela + Estados Unidos) para cuando aún no hay red/caché.

import { useEffect, useState } from 'react'
import { api } from './api'

export interface Pais {
  iso2: string
  nombre: string
  codigo: string
  bandera: string
}

export const banderaDe = (iso2: string): string => {
  const cp = [...iso2.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65)
  return String.fromCodePoint(...cp)
}

const FALLBACK: Pais[] = [
  { iso2: 'VE', nombre: 'Venezuela', codigo: '58', bandera: banderaDe('VE') },
  { iso2: 'US', nombre: 'Estados Unidos', codigo: '1', bandera: banderaDe('US') },
]

let cache: Pais[] | null = null
let promesa: Promise<Pais[]> | null = null

/** Carga (una sola vez) el catálogo de países desde el backend. */
export async function cargarPaises(): Promise<Pais[]> {
  if (cache) return cache
  if (!promesa) {
    promesa = (async () => {
      try {
        const { data } = await api.get<Array<{ iso2: string; nombre: string; codigo: string }>>('/config/paises')
        cache = data.map((p) => ({ ...p, bandera: banderaDe(p.iso2) }))
        return cache
      } catch {
        cache = FALLBACK
        return cache
      }
    })()
  }
  return promesa
}

/** Países disponibles ahora mismo (caché si ya cargó, fallback mínimo si no). */
export function paisesActuales(): Pais[] {
  return cache ?? FALLBACK
}

/** Hook: países del backend con estado de carga (empieza con el fallback). */
export function usePaises(): { paises: Pais[]; cargando: boolean } {
  const [paises, setPaises] = useState<Pais[]>(paisesActuales())
  const [cargando, setCargando] = useState(!cache)
  useEffect(() => {
    let activo = true
    cargarPaises().then((p) => {
      if (activo) {
        setPaises(p)
        setCargando(false)
      }
    })
    return () => {
      activo = false
    }
  }, [])
  return { paises, cargando }
}

export const VENEZUELA: Pais = FALLBACK[0]