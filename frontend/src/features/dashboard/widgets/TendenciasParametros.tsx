import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Line, LineChart, CartesianGrid, Tooltip, XAxis, YAxis } from 'recharts'
import { api } from '../../../lib/api'
import { useExpedienteStore } from '../../expediente/expedienteStore'
import Widget from './Widget'
import { PacientePicker, type PacienteMini } from './PacientePicker'

interface ResultadoHist {
  resultado_id: string
  examen_id: string | null
  examen: string | null
  fecha: string
  valores: Record<string, unknown> | null
}

const inputCls =
  'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none'

function esNumerico(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string') {
    const n = Number(v.replace(',', '.'))
    return Number.isFinite(n) && v.trim() !== '' ? n : null
  }
  return null
}

const PALETA = ['#0ea5e9', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#64748b']

/** Tendencias de parámetros: evolución de un valor por examen sobre resultados firmados. */
export function TendenciasParametros() {
  const [paciente, setPaciente] = useState<PacienteMini | null>(null)
  const [examen, setExamen] = useState('todos')
  const [param, setParam] = useState('resultado')
  const navigate = useNavigate()

  const { data: resultados = [], isLoading } = useQuery<ResultadoHist[]>({
    queryKey: ['solicitudes', 'resultados', paciente?.id],
    queryFn: async () => (await api.get(`/solicitudes/pacientes/${paciente!.id}/resultados`)).data,
    enabled: !!paciente,
  })

  const params = useMemo(() => {
    const set = new Set<string>()
    for (const r of resultados) {
      for (const [k, v] of Object.entries(r.valores ?? {})) {
        if (esNumerico(v) !== null) set.add(k)
      }
    }
    return [...set]
  }, [resultados])

  const examenes = useMemo(() => [...new Set(resultados.map((r) => r.examen).filter(Boolean) as string[])], [resultados])

  const puntos = useMemo(() => {
    const sel = param || params[0] || 'resultado'
    return resultados
      .filter((r) => examen === 'todos' || r.examen === examen)
      .map((r) => {
        const v = esNumerico((r.valores ?? {})[sel])
        return v === null
          ? null
          : {
              fecha: new Date(r.fecha).toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: '2-digit' }),
              valor: v,
              examen: r.examen ?? '—',
            }
      })
      .filter(Boolean) as { fecha: string; valor: number; examen: string }[]
  }, [resultados, examen, param, params])

  const porExamen = useMemo(() => {
    const map = new Map<string, { fecha: string; valor: number }[]>()
    for (const p of puntos) {
      const arr = map.get(p.examen) ?? []
      arr.push({ fecha: p.fecha, valor: p.valor })
      map.set(p.examen, arr)
    }
    return [...map.entries()]
  }, [puntos])

  return (
    <Widget titulo="Tendencias de parámetros" descripcion="Evolución de laboratorios por paciente">
      {!paciente ? (
        <PacientePicker value={null} onChange={setPaciente} />
      ) : (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <PacientePicker value={paciente} onChange={(p) => { setPaciente(p); setExamen('todos') }} />
            <button
              onClick={() => {
                useExpedienteStore.getState().setExpedienteId(paciente.id)
                navigate('/expediente')
              }}
              className="shrink-0 rounded-lg border border-brand-300 px-3 py-2 text-xs font-semibold text-brand-700 hover:bg-brand-50"
              title="Abrir el expediente clínico completo del paciente"
            >
              Ver expediente →
            </button>
          </div>
          {isLoading ? (
            <p className="py-4 text-center text-xs text-slate-500">Cargando resultados…</p>
          ) : resultados.length === 0 ? (
            <p className="py-4 text-center text-xs text-slate-500">Este paciente no tiene resultados firmados.</p>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2">
                <label className="block text-xs font-medium text-slate-600">
                  Examen
                  <select value={examen} onChange={(e) => setExamen(e.target.value)} className={`${inputCls} mt-1`}>
                    <option value="todos">Todos</option>
                    {examenes.map((ex) => <option key={ex} value={ex}>{ex}</option>)}
                  </select>
                </label>
                <label className="block text-xs font-medium text-slate-600">
                  Parámetro
                  <select value={param} onChange={(e) => setParam(e.target.value)} className={`${inputCls} mt-1`}>
                    {(params.length ? params : ['resultado']).map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                </label>
              </div>
              {puntos.length === 0 ? (
                <p className="py-4 text-center text-xs text-slate-500">Sin valores numéricos para este parámetro.</p>
              ) : (
                <div className="overflow-x-auto">
                  <LineChart width={500} height={200} data={puntos} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="fecha" stroke="#94a3b8" fontSize={9} />
                    <YAxis stroke="#94a3b8" fontSize={10} domain={['auto', 'auto']} />
                    <Tooltip />
                    {examen === 'todos'
                      ? porExamen.map(([nombre], i) => (
                          <Line key={nombre} type="monotone" dataKey="valor" data={porExamen.find(([n]) => n === nombre)?.[1]} name={nombre} stroke={PALETA[i % PALETA.length]} strokeWidth={1.6} dot={{ r: 2 }} isAnimationActive={false} />
                        ))
                      : (
                        <Line type="monotone" dataKey="valor" name={examen} stroke="#0ea5e9" strokeWidth={1.6} dot={{ r: 2 }} isAnimationActive={false} />
                      )}
                  </LineChart>
                </div>
              )}
              <p className="text-[10px] text-slate-400">{puntos.length} resultado(s) · valores de resultados firmados por el bioanalista.</p>
            </>
          )}
        </div>
      )}
    </Widget>
  )
}
