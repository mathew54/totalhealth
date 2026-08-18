import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'

interface TasaMoneda {
  moneda: 'USD' | 'EUR'
  valor: number | null
  origen: 'bcv' | 'dolarapi' | 'manual' | null
  fecha: string
}

interface TasasResponse {
  fecha: string
  actualizada: string | null
  monedas: TasaMoneda[]
}

/**
 * Tasa de cambio del día seleccionada (BCV automática o manual), para el header.
 * Es pública (GET /api/tasas) y se refresca cada 60 s.
 */
export default function TasaHeader() {
  const { data } = useQuery<TasasResponse>({
    queryKey: ['tasas'],
    queryFn: async () => (await api.get('/tasas')).data,
    refetchInterval: 60_000,
    retry: 1,
  })

  const monedas = (data?.monedas ?? []).filter((m): m is TasaMoneda & { valor: number } => m.valor != null)
  if (monedas.length === 0) return null

  return (
    <span
      className="flex items-center gap-1.5 text-xs font-medium"
      title={`Tasa de cambio del día ${data?.fecha ?? ''} · ${data?.actualizada ? `actualizada ${new Date(data.actualizada).toLocaleTimeString()}` : ''}`}
    >
      {monedas.map((m) => (
        <span key={m.moneda} className="flex items-center gap-1 rounded-full bg-white/10 px-2 py-0.5">
          <span className="opacity-70">{m.moneda}</span>
          <span className="font-semibold">Bs. {m.valor.toFixed(2)}</span>
          {(m.origen === 'bcv' || m.origen === 'dolarapi') && (
            <span className="opacity-60" title={`Tasa automática (${m.origen})`}>
              {m.origen === 'bcv' ? 'BCV' : 'Auto'}
            </span>
          )}
        </span>
      ))}
    </span>
  )
}
