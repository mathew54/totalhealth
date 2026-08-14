import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api, getApiError } from '../../lib/api'
import PrintHeader from '../../components/ui/PrintHeader'
import { ESTADO_LABELS, TIPO_LABELS, TIPO_LABELS_CORTOS, type EstudioImagen } from './types'
import { EstudioViewer } from './EstudioViewer'
import { FormEstudio } from './FormEstudio'
import type { Paciente } from '../../lib/types'

const inputCls = 'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500'

export default function ImagenesPage() {
  const queryClient = useQueryClient()
  const [params] = useSearchParams()
  const [error, setError] = useState<string | null>(null)
  const [abierto, setAbierto] = useState<string | null>(null)
  const [crear, setCrear] = useState(false)

  const [pacienteId, setPacienteId] = useState(params.get('paciente_id') ?? '')
  const consultaId = params.get('consulta_id') ?? ''
  const [tipo, setTipo] = useState('')
  const [estado, setEstado] = useState('')
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')

  const { data: pacientes = [] } = useQuery<Paciente[]>({
    queryKey: ['pacientes', 'imagenes'],
    queryFn: async () => (await api.get('/pacientes')).data,
  })

  const query = useMemo(() => {
    const q: Record<string, string> = {}
    if (pacienteId) q.paciente_id = pacienteId
    if (consultaId) q.consulta_id = consultaId
    if (tipo) q.tipo = tipo
    if (estado) q.estado = estado
    if (desde) q.desde = desde
    if (hasta) q.hasta = hasta
    return q
  }, [pacienteId, consultaId, tipo, estado, desde, hasta])

  const { data: estudios = [], isLoading } = useQuery<EstudioImagen[]>({
    queryKey: ['imagenes', 'estudios', query],
    queryFn: async () => (await api.get('/imagenes/estudios', { params: query })).data,
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
    if (!window.confirm(`¿Eliminar el estudio "${e.titulo ?? 'sin título'}" y sus ${e.imagenes_count ?? 0} imágenes?`)) return
    eliminar.mutate(e.id)
  }

  return (
    <div className="space-y-6">
      <PrintHeader />
      <div>
        <h1 className="text-xl font-bold text-slate-800">Imágenes médicas</h1>
        <p className="text-sm text-slate-500">
          Estudios por paciente (Rx, eco, TC, RMN, fotos) · visor con ventana, mediciones y compartición
        </p>
      </div>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-6">
          <label className="block text-xs">
            <span className="mb-1 block font-medium text-slate-600">Paciente</span>
            <select value={pacienteId} onChange={(e) => setPacienteId(e.target.value)} className={inputCls}>
              <option value="">Todos</option>
              {pacientes.map((p) => (
                <option key={p.id} value={p.id}>{p.nombre_completo} {p.cedula ? `(${p.cedula})` : ''}</option>
              ))}
            </select>
          </label>
          <label className="block text-xs">
            <span className="mb-1 block font-medium text-slate-600">Tipo</span>
            <select value={tipo} onChange={(e) => setTipo(e.target.value)} className={inputCls}>
              <option value="">Todos</option>
              {Object.entries(TIPO_LABELS).map(([id, label]) => (
                <option key={id} value={id}>{label}</option>
              ))}
            </select>
          </label>
          <label className="block text-xs">
            <span className="mb-1 block font-medium text-slate-600">Estado</span>
            <select value={estado} onChange={(e) => setEstado(e.target.value)} className={inputCls}>
              <option value="">Todos</option>
              {Object.entries(ESTADO_LABELS).map(([id, label]) => (
                <option key={id} value={id}>{label}</option>
              ))}
            </select>
          </label>
          <label className="block text-xs">
            <span className="mb-1 block font-medium text-slate-600">Desde</span>
            <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className={inputCls} />
          </label>
          <label className="block text-xs">
            <span className="mb-1 block font-medium text-slate-600">Hasta</span>
            <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className={inputCls} />
          </label>
          <div className="flex items-end">
            <button
              onClick={() => setCrear(true)}
              className="w-full rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700"
            >
              + Nuevo estudio
            </button>
          </div>
        </div>
      </div>

      {isLoading ? (
        <p className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500">Cargando…</p>
      ) : estudios.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-200 bg-white p-10 text-center text-sm text-slate-400">
          Sin estudios para mostrar.
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {estudios.map((e) => (
            <div key={e.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white transition hover:border-brand-400">
              <button onClick={() => setAbierto(e.id)} className="group block w-full text-left">
                <div className="relative bg-slate-900">
                  {e.portada ? (
                    <img src={e.portada} alt={e.titulo ?? 'Estudio'} className="h-44 w-full object-contain transition group-hover:scale-[1.02]" />
                  ) : (
                    <div className="flex h-44 items-center justify-center text-xs text-slate-500">Sin imágenes</div>
                  )}
                  <div className="absolute left-2 top-2 flex gap-1">
                    <span className="rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-medium uppercase text-white">
                      {TIPO_LABELS_CORTOS[e.tipo] ?? e.tipo}
                    </span>
                    <span className="rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-medium text-white">
                      {e.imagenes_count ?? 0} img
                    </span>
                  </div>
                  <span
                    className={`absolute right-2 top-2 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                      e.estado === 'leido' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                    }`}
                  >
                    {ESTADO_LABELS[e.estado] ?? e.estado}
                  </span>
                </div>
                <div className="space-y-1 p-3">
                  <p className="truncate text-sm font-semibold text-slate-800">{e.titulo ?? 'Estudio sin título'}</p>
                  <p className="text-xs text-slate-400">
                    {e.paciente_nombre ?? 'Paciente'} · {new Date(e.fecha_estudio).toLocaleDateString()}
                    {e.region ? ` · ${e.region}` : ''}
                  </p>
                  {e.hallazgos && <p className="line-clamp-2 text-xs text-slate-600">{e.hallazgos}</p>}
                </div>
              </button>
              <div className="flex justify-end gap-2 border-t border-slate-100 px-3 py-1.5">
                <button onClick={() => setAbierto(e.id)} className="text-xs font-medium text-brand-600 hover:text-brand-700">
                  Ver
                </button>
                <button onClick={() => confirmarEliminar(e)} className="text-xs font-medium text-red-500 hover:text-red-600">
                  Eliminar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {crear && (
        <FormEstudio
          pacienteIdInicial={pacienteId}
          consultaIdInicial={consultaId}
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
          onClose={() => setAbierto(null)}
          onCambio={() => queryClient.invalidateQueries({ queryKey: ['imagenes'] })}
        />
      )}
    </div>
  )
}