import { useQuery } from '@tanstack/react-query'
import { api } from './api'

// TotalHealth: moneda base USD + equivalencia en Bs. con la tasa del día.
// La tasa activa (USD/EUR) la expone GET /api/tasas y se refresca cada 60 s.

export interface TasaMoneda {
  moneda: 'USD' | 'EUR'
  valor: number | null
  origen: 'bcv' | 'manual' | 'dolarapi' | null
  fecha: string
}

export interface TasasResponse {
  fecha: string
  actualizada: string | null
  monedas: TasaMoneda[]
}

export function useTasas() {
  return useQuery<TasasResponse>({
    queryKey: ['tasas'],
    queryFn: async () => (await api.get('/tasas')).data,
    refetchInterval: 60_000,
    retry: 1,
  })
}

/** Tasa activa del día del Dólar (USD) o null si aún no hay datos. */
export function useTasaUsd(): number | null {
  const { data } = useTasas()
  return data?.monedas.find((m) => m.moneda === 'USD')?.valor ?? null
}

export function usdABs(usd: number | null | undefined, tasaUsd: number | null | undefined): number | null {
  if (usd == null || tasaUsd == null || tasaUsd <= 0) return null
  return Number((usd * tasaUsd).toFixed(2))
}

export function bsAUsd(bs: number | null | undefined, tasaUsd: number | null | undefined): number | null {
  if (bs == null || tasaUsd == null || tasaUsd <= 0) return null
  return Number((bs / tasaUsd).toFixed(2))
}

export function formatearUsd(n: number | null | undefined): string {
  return `$${Number(n ?? 0).toFixed(2)}`
}

export function formatearBs(n: number | null | undefined): string {
  return `Bs. ${Number(n ?? 0).toFixed(2)}`
}
