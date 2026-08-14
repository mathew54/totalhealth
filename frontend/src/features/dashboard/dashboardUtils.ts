import { useEffect, useState } from 'react'

/* ------------------------------------------------------------------ */
/* Utilidades de tiempo                                                */
/* ------------------------------------------------------------------ */

/** Devuelve un texto corto de "hace X min / h" para mostrar frescura de datos. */
export function tiempoDesde(iso: string | null | undefined): string {
  if (!iso) return '—'
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return '—'
  const diff = Date.now() - t
  const min = Math.floor(diff / 60_000)
  if (min < 1) return 'hace <1 min'
  if (min < 60) return `hace ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `hace ${h} h`
  const d = Math.floor(h / 24)
  return `hace ${d} d`
}

/** Fecha "hoy" en formato YYYY-MM-DD (convención UTC usada por los filtros del backend). */
export function fechaHoyIso(): string {
  return new Date().toISOString().slice(0, 10)
}

/** Duración legible entre dos fechas (para TAT / tiempos de espera). */
export function duracionLegible(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '—'
  const min = Math.round(ms / 60_000)
  if (min < 1) return '<1 min'
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m ? `${h} h ${m} min` : `${h} h`
}

/** Diferencia en ms entre una fecha ISO y ahora. */
export function msDesde(iso: string | null | undefined): number {
  if (!iso) return 0
  const t = new Date(iso).getTime()
  return Number.isNaN(t) ? 0 : Date.now() - t
}

/* ------------------------------------------------------------------ */
/* Preferencias persistidas por perfil                                 */
/* ------------------------------------------------------------------ */

/** Vista persistida por perfil (operativo/supervisión, ejecutiva/operativa). */
export function useVistaPersistida<T extends string>(key: string, inicial: T): [T, (v: T) => void] {
  const [vista, setVista] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key)
      return raw ? (JSON.parse(raw) as T) : inicial
    } catch {
      return inicial
    }
  })
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(vista))
    } catch {
      /* almacenamiento no disponible */
    }
  }, [key, vista])
  return [vista, setVista]
}
