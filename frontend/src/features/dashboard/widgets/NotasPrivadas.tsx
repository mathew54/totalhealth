import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, getApiError } from '../../../lib/api'
import Widget from './Widget'
import { PacientePicker, type PacienteMini } from './PacientePicker'

interface Nota {
  id: string
  contenido: string
  created_at: string
  medico_nombre?: string | null
}

const inputCls =
  'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none'

/** Notas privadas de consulta: persistidas en el backend, visibles solo para el autor. */
export function NotasPrivadas() {
  const queryClient = useQueryClient()
  const [paciente, setPaciente] = useState<PacienteMini | null>(null)
  const [contenido, setContenido] = useState('')
  const [error, setError] = useState<string | null>(null)

  const { data: notas = [], isLoading } = useQuery<Nota[]>({
    queryKey: ['historial', 'notas', paciente?.id],
    queryFn: async () => (await api.get(`/historial/pacientes/${paciente!.id}/notas`)).data,
    enabled: !!paciente,
  })

  const crear = useMutation({
    mutationFn: (texto: string) => api.post(`/historial/pacientes/${paciente!.id}/notas`, { contenido: texto }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['historial', 'notas', paciente?.id] })
      setContenido('')
      setError(null)
    },
    onError: (e) => setError(getApiError(e)),
  })

  return (
    <Widget titulo="Notas de evolución privadas" descripcion="Solo visibles para el médico autor">
      {!paciente ? (
        <PacientePicker value={null} onChange={setPaciente} />
      ) : (
        <div className="space-y-2">
          <PacientePicker value={paciente} onChange={setPaciente} />
          <textarea
            value={contenido}
            onChange={(e) => setContenido(e.target.value)}
            rows={3}
            placeholder="Nota de sesión privada…"
            className={`${inputCls} resize-y`}
          />
          <button
            onClick={() => contenido.trim() && crear.mutate(contenido.trim())}
            disabled={crear.isPending || !contenido.trim()}
            className="w-full rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-40"
          >
            {crear.isPending ? 'Guardando…' : 'Guardar nota'}
          </button>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="max-h-48 space-y-2 overflow-y-auto pr-1">
            {isLoading ? (
              <p className="text-xs text-slate-500">Cargando…</p>
            ) : notas.length === 0 ? (
              <p className="text-xs text-slate-500">Sin notas privadas para este paciente.</p>
            ) : (
              notas.map((n) => (
                <div key={n.id} className="rounded-lg border border-slate-100 p-2">
                  <p className="whitespace-pre-wrap text-xs text-slate-700">{n.contenido}</p>
                  <p className="mt-1 text-[10px] text-slate-400">
                    {new Date(n.created_at).toLocaleString('es-VE')} · {n.medico_nombre ?? 'usted'}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </Widget>
  )
}
