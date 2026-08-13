import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, getApiError } from '../../lib/api'
import type { CasoCompartido } from './types'

const inputCls =
  'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none'

/** Casos compartidos: publica un resumen anonimizado en el foro/feed interno. */
export default function PanelCasos({ nombrePaciente }: { nombrePaciente: string }) {
  const queryClient = useQueryClient()
  const [titulo, setTitulo] = useState('')
  const [resumen, setResumen] = useState('')
  const [especialidadId, setEspecialidadId] = useState('')
  const [error, setError] = useState<string | null>(null)

  const { data: casos = [] } = useQuery<CasoCompartido[]>({
    queryKey: ['expediente', 'casos'],
    queryFn: async () => (await api.get('/expediente/casos')).data,
  })

  const { data: catalogo } = useQuery<{ especialidades: { id: string; nombre: string }[] }>({
    queryKey: ['historial', 'especialidades'],
    queryFn: async () => (await api.get('/historial/especialidades')).data,
  })

  const publicar = useMutation({
    mutationFn: async () =>
      api.post('/expediente/casos', {
        titulo,
        resumen,
        especialidad_id: especialidadId || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expediente', 'casos'] })
      setTitulo(''); setResumen(''); setEspecialidadId(''); setError(null)
    },
    onError: (e) => setError(getApiError(e)),
  })

  function submit(e: FormEvent) {
    e.preventDefault()
    if (!titulo.trim() || !resumen.trim()) {
      setError('Completa título y resumen.')
      return
    }
    publicar.mutate()
  }

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <h3 className="mb-1 text-sm font-semibold text-slate-800">Publicar caso anonimizado</h3>
        <p className="mb-3 text-[11px] text-slate-500">
          Al publicar se omite la identidad del paciente ({nombrePaciente}).
        </p>
        <form onSubmit={submit} className="space-y-2">
          <input
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            placeholder="Título del caso (mín. 5 caracteres)"
            className={inputCls}
          />
          <textarea
            value={resumen}
            onChange={(e) => setResumen(e.target.value)}
            rows={4}
            placeholder="Resumen clínico (mín. 10 caracteres, sin datos de identificación)"
            className={inputCls}
          />
          <select value={especialidadId} onChange={(e) => setEspecialidadId(e.target.value)} className={inputCls}>
            <option value="">Especialidad (opcional)</option>
            {(catalogo?.especialidades ?? []).map((esp) => (
              <option key={esp.id} value={esp.id}>{esp.nombre}</option>
            ))}
          </select>
          {error && <p className="text-xs text-red-500">{error}</p>}
          <button
            type="submit"
            disabled={publicar.isPending}
            className="w-full rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
          >
            {publicar.isPending ? 'Publicando…' : 'Publicar en el foro interno'}
          </button>
        </form>
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-slate-800">Feed de casos</h3>
        {casos.length === 0 && (
          <p className="rounded-2xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-400">
            Sin casos compartidos aún.
          </p>
        )}
        {casos.map((c) => (
          <div key={c.id} className="rounded-xl border border-slate-200 bg-white p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium text-slate-800">{c.titulo}</span>
              <span className="text-[10px] text-slate-400">{new Date(c.created_at).toLocaleDateString('es-VE')}</span>
            </div>
            <p className="mt-1 text-xs text-slate-600">{c.resumen}</p>
            <p className="mt-2 text-[11px] text-slate-400">
              {c.medico_nombre} · {c.especialidad_nombre ?? 'General'}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}