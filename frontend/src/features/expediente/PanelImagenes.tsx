import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { api, getApiError } from '../../lib/api'
import { ESTADO_LABELS, TIPO_LABELS_CORTOS, type EstudioImagen } from '../imagenes/types'
import { EstudioViewer } from '../imagenes/EstudioViewer'
import { FormEstudio } from '../imagenes/FormEstudio'

interface Props {
  pacienteId: string
  nombrePaciente: string
}

/**
 * Pestaña "Imágenes" del expediente: CRUD completo de estudios de imagen del
 * paciente (crear, ver/editar, subir serie, eliminar) sin salir del expediente.
 */
export default function PanelImagenes({ pacienteId, nombrePaciente }: Props) {
  const queryClient = useQueryClient()
  const [abierto, setAbierto] = useState<string | null>(null)
  const [crear, setCrear] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { data: estudios = [], isLoading } = useQuery<EstudioImagen[]>({
    queryKey: ['imagenes', 'estudios', 'paciente', pacienteId],
    queryFn: async () => (await api.get(`/imagenes/estudios?paciente_id=${pacienteId}`)).data,
  })

  const eliminar = useMutation({
    mutationFn: (id: string) => api.delete(`/imagenes/estudios/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['imagenes'] })
      setError(null)
    },
    onError: (e) => setError(getApiError(e)),
  })

  function confirmarEliminar(e: EstudioImagen) {
    if (!window.confirm(`¿Eliminar el estudio "${e.titulo ?? 'sin título'}" y sus imágenes?`)) return
    eliminar.mutate(e.id)
  }

  if (isLoading) return <p className="py-4 text-center text-sm text-slate-500">Cargando imágenes…</p>

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-slate-700">Estudios de imagen</p>
        <button
          onClick={() => setCrear(true)}
          className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700"
        >
          + Nuevo estudio
        </button>
      </div>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}

      {estudios.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-400">
          El paciente no tiene estudios de imagen registrados.
        </p>
      ) : (
        estudios.map((e) => (
          <div key={e.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <button onClick={() => setAbierto(e.id)} className="group flex w-full items-center gap-3 p-3 text-left">
              <div className="h-16 w-20 shrink-0 overflow-hidden rounded-lg bg-slate-900">
                {e.portada ? (
                  <img src={e.portada} alt={e.titulo ?? 'Estudio'} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center text-[10px] text-slate-500">Sin img</div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium uppercase text-slate-600">
                    {TIPO_LABELS_CORTOS[e.tipo] ?? e.tipo}
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                      e.estado === 'leido' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                    }`}
                  >
                    {ESTADO_LABELS[e.estado] ?? e.estado}
                  </span>
                </div>
                <p className="mt-1 truncate text-sm font-medium text-slate-800">{e.titulo ?? 'Estudio sin título'}</p>
                <p className="text-xs text-slate-400">
                  {new Date(e.fecha_estudio).toLocaleDateString()} · {e.imagenes_count ?? 0} img{e.region ? ` · ${e.region}` : ''}
                </p>
                {e.hallazgos && <p className="mt-1 line-clamp-2 text-xs text-slate-600">{e.hallazgos}</p>}
              </div>
            </button>
            <div className="flex justify-end gap-2 border-t border-slate-100 px-3 py-1.5">
              <button onClick={() => setAbierto(e.id)} className="text-xs font-medium text-brand-600 hover:text-brand-700">
                Ver / editar
              </button>
              <button onClick={() => confirmarEliminar(e)} className="text-xs font-medium text-red-500 hover:text-red-600">
                Eliminar
              </button>
            </div>
          </div>
        ))
      )}

      {crear && (
        <FormEstudio
          pacienteIdInicial={pacienteId}
          onClose={() => setCrear(false)}
          onCreado={(id) => {
            setCrear(false)
            setAbierto(id)
          }}
        />
      )}

      {abierto && (
        <EstudioViewer
          estudioId={abierto}
          pacienteNombre={nombrePaciente}
          onClose={() => setAbierto(null)}
          onCambio={() => queryClient.invalidateQueries({ queryKey: ['imagenes'] })}
        />
      )}
    </div>
  )
}