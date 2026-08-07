import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { api, getApiError } from '../../lib/api'
import PrintHeader from '../../components/ui/PrintHeader'

interface Alerta {
  id: string
  paciente_id: string
  paciente_nombre: string | null
  examen_id: string
  examen_nombre: string | null
  parametro: string
  valor: string | null
  unidad: string | null
  nivel: 'alerta' | 'critico'
  motivo: string
  leida: boolean
  created_at: string
}

export default function AlertasPage() {
  const queryClient = useQueryClient()
  const [error, setError] = useState<string | null>(null)
  const [soloNoLeidas, setSoloNoLeidas] = useState(false)

  const { data: alertas = [], isLoading } = useQuery<Alerta[]>({
    queryKey: ['alertas', soloNoLeidas],
    queryFn: async () => (await api.get(`/alertas${soloNoLeidas ? '?solo_no_leidas=true' : ''}`)).data,
  })

  const marcarLeida = useMutation({
    mutationFn: (id: string) => api.patch(`/alertas/${id}/leida`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alertas'] })
      setError(null)
    },
    onError: (e) => setError(getApiError(e)),
  })

  const noLeidas = alertas.filter((a) => !a.leida).length
  const criticas = alertas.filter((a) => a.nivel === 'critico').length

  return (
    <div className="space-y-6">
      <PrintHeader />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Alertas clínicas</h1>
          <p className="text-sm text-slate-500">Parámetros de laboratorio fuera de rango según umbrales de referencia</p>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="rounded-full bg-red-50 px-3 py-1 font-medium text-red-700">{criticas} críticas</span>
          <span className="rounded-full bg-slate-100 px-3 py-1 font-medium text-slate-700">{noLeidas} sin revisar</span>
          <label className="flex cursor-pointer items-center gap-2 text-slate-600">
            <input type="checkbox" checked={soloNoLeidas} onChange={(e) => setSoloNoLeidas(e.target.checked)} className="h-4 w-4 rounded" />
            Solo sin revisar
          </label>
        </div>
      </div>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {isLoading ? (
        <p className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500">Cargando…</p>
      ) : alertas.length === 0 ? (
        <p className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500">Sin alertas{`${soloNoLeidas ? ' pendientes de revisión' : ''}`}.</p>
      ) : (
        <div className="space-y-2">
          {alertas.map((a) => (
            <AlertaCard key={a.id} a={a} onLeida={() => marcarLeida.mutate(a.id)} marcando={marcarLeida.isPending} />
          ))}
        </div>
      )}
    </div>
  )
}

function AlertaCard({ a, onLeida, marcando }: { a: Alerta; onLeida: () => void; marcando: boolean }) {
  const critico = a.nivel === 'critico'
  return (
    <div className={`rounded-2xl border bg-white p-4 ${critico ? 'border-red-300' : 'border-amber-300'} ${a.leida ? 'opacity-70' : ''}`}>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className={`rounded-full px-2 py-0.5 font-medium ${critico ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
          {critico ? 'CRÍTICO' : 'ALERTA'}
        </span>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">{a.examen_nombre ?? 'Examen'}</span>
        <span className="text-slate-400">{new Date(a.created_at).toLocaleString()}</span>
        {!a.leida && <span className="rounded-full bg-sky-100 px-2 py-0.5 text-sky-700">Nueva</span>}
      </div>
      <p className="mt-2 text-sm font-medium text-slate-800">
        {a.paciente_nombre ?? 'Paciente'} — {a.motivo}
      </p>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-slate-500">
          <strong className="text-slate-700">{a.parametro}</strong> = {a.valor ?? '—'}
          {a.unidad ? ` ${a.unidad}` : ''}
        </p>
        {!a.leida && (
          <button
            onClick={onLeida}
            disabled={marcando}
            className="rounded-lg border border-slate-300 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {marcando ? 'Guardando…' : 'Marcar revisada'}
          </button>
        )}
      </div>
    </div>
  )
}