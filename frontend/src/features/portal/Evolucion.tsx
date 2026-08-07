import { useMemo } from 'react'
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

export interface EvolucionResultado {
  resultado_id: string
  examen: string | null
  valores: Record<string, unknown> | null
  observaciones: string | null
  procesado_at: string
}

function valoresNumericos(v: Record<string, unknown> | null): [string, number][] {
  if (!v) return []
  return Object.entries(v).filter(
    (entry): entry is [string, string] => {
      const val = entry[1]
      return typeof val === 'number' || (typeof val === 'string' && val.trim() !== '' && !Number.isNaN(Number(val)))
    },
  ).map(([k, val]) => [k, Number(val)])
}

function formatearParametro(key: string): string {
  return key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

export default function Evolucion({ resultados }: { resultados: EvolucionResultado[] }) {
  const series = useMemo(() => {
    const porExamen = new Map<string, Record<string, { fecha: number; valor: number }[]>>()
    const ordenados = [...resultados].sort((a, b) => new Date(a.procesado_at).getTime() - new Date(b.procesado_at).getTime())
    for (const r of ordenados) {
      const examen = r.examen ?? 'Examen'
      const numericos = valoresNumericos(r.valores)
      if (!numericos.length) continue
      if (!porExamen.has(examen)) porExamen.set(examen, {})
      const cabal = porExamen.get(examen)!
      const t = new Date(r.procesado_at).getTime()
      for (const [param, valor] of numericos) {
        ;(cabal[param] ??= []).push({ fecha: t, valor })
      }
    }
    return porExamen
  }, [resultados])

  const examenes = [...series.keys()]
  if (!examenes.length) {
    return <p className="py-8 text-center text-sm text-slate-500">Sin valores numéricos para graficar.</p>
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-slate-500">Evolución histórica de los valores numéricos por examen.</p>
      {examenes.map((nombre) => {
        const params = series.get(nombre)!
        return Object.entries(params).map(([param, puntos]) => (
          <div key={`${nombre}-${param}`} className="rounded-2xl border border-slate-200 bg-white p-4">
            <h3 className="font-semibold text-slate-800">{nombre}</h3>
            <p className="text-xs text-slate-500">{formatearParametro(param)}</p>
            <div className="mt-3 h-56">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={puntos} margin={{ top: 8, right: 16, bottom: 0, left: -20 }}>
                  <XAxis
                    dataKey="fecha"
                    tickFormatter={(t: number) => new Date(t).toLocaleDateString()}
                    type="number"
                    scale="time"
                    domain={['auto', 'auto']}
                    tick={{ fontSize: 11 }}
                  />
                  <YAxis tick={{ fontSize: 11 }} width={60} />
                  <Tooltip
                    labelFormatter={(t) => new Date(Number(t)).toLocaleString()}
                    formatter={(v) => [Number(v).toFixed(2), formatearParametro(param)]}
                  />
                  <Line type="monotone" dataKey="valor" stroke="#8b5cf6" strokeWidth={2} dot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        ))
      })}
    </div>
  )
}