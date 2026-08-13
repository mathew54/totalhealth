import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, getApiError } from '../../lib/api'
import type { NotaPrivada } from './types'

const inputCls =
  'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none'

interface Props {
  pacienteId: string
}

/** Notas privadas del médico — visibilidad restringida al autor. */
export default function PanelNotas({ pacienteId }: Props) {
  const queryClient = useQueryClient()
  const [contenido, setContenido] = useState('')
  const [error, setError] = useState<string | null>(null)

  const { data: notas = [], refetch } = useQuery<NotaPrivada[]>({
    queryKey: ['expediente', 'notas', pacienteId],
    queryFn: async () => (await api.get(`/expediente/notas?paciente_id=${pacienteId}`)).data,
  })

  const crear = useMutation({
    mutationFn: async (texto: string) => api.post('/expediente/notas', { paciente_id: pacienteId, contenido: texto }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expediente', 'notas', pacienteId] })
      setContenido('')
      setError(null)
    },
    onError: (e) => setError(getApiError(e)),
  })

  const borrar = useMutation({
    mutationFn: async (id: string) => api.delete(`/expediente/notas/${id}`),
    onSuccess: () => refetch(),
  })

  function submit(e: FormEvent) {
    e.preventDefault()
    if (!contenido.trim()) return
    crear.mutate(contenido.trim())
  }

  return (
    <div className="space-y-3">
      <form onSubmit={submit} className="space-y-2">
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-slate-700">Nueva nota privada</span>
          <textarea
            value={contenido}
            onChange={(e) => setContenido(e.target.value)}
            rows={4}
            className={inputCls}
            placeholder="Solo visible para ti…"
          />
        </label>
        {error && <p className="text-xs text-red-500">{error}</p>}
        <button
          type="submit"
          disabled={crear.isPending || !contenido.trim()}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
        >
          {crear.isPending ? 'Guardando…' : 'Guardar nota'}
        </button>
      </form>

      {notas.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-400">
          Sin notas privadas para este paciente.
        </p>
      ) : (
        <div className="space-y-2">
          {notas.map((n) => (
            <div key={n.id} className="rounded-xl border border-slate-200 bg-white p-3">
              <p className="whitespace-pre-wrap text-sm text-slate-700">{n.contenido}</p>
              <div className="mt-2 flex items-center justify-between">
                <span className="text-[10px] text-slate-400">
                  {new Date(n.updated_at).toLocaleString('es-VE')}
                </span>
                <button
                  type="button"
                  onClick={() => borrar.mutate(n.id)}
                  className="text-[11px] font-medium text-red-500 hover:underline"
                >
                  Eliminar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}