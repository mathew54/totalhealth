import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, getApiError } from '../../lib/api'
import { useSessionStore } from '../../stores/sessionStore'
import { ESTADO_LABELS, TIPO_LABELS, type EstudioImagen, type ImagenClinica } from './types'
import { PanelEditar } from './viewer/PanelEditar'
import { PanelCompartir } from './viewer/PanelCompartir'
import { PanelSubir } from './viewer/PanelSubir'
import { CanvasPane } from './viewer/CanvasPane'

export function EstudioViewer({
  estudioId,
  onClose,
  onCambio,
  pacienteNombre,
}: {
  estudioId: string
  onClose: () => void
  onCambio?: () => void
  pacienteNombre?: string
}) {
  const queryClient = useQueryClient()
  const profile = useSessionStore((s) => s.profile)
  const [error, setError] = useState<string | null>(null)
  const [modo, setModo] = useState<'ver' | 'editar' | 'compartir' | 'subir'>('ver')
  const [compararId, setCompararId] = useState<string | null>(null)

  const { data: estudio, isLoading } = useQuery<EstudioImagen>({
    queryKey: ['imagenes', 'estudio', estudioId],
    queryFn: async () => (await api.get(`/imagenes/estudios/${estudioId}`)).data,
  })

  const { data: otrosEstudios = [] } = useQuery<EstudioImagen[]>({
    queryKey: ['imagenes', 'estudios', 'paciente', estudio?.paciente_id],
    enabled: !!estudio?.paciente_id,
    queryFn: async () =>
      (await api.get(`/imagenes/estudios?paciente_id=${estudio!.paciente_id}`)).data,
  })

  const imagenes = estudio?.imagenes ?? []

  const puedeEditar = useMemo(() => {
    if (!profile || !estudio) return false
    if (profile.role === 'admin' || profile.role === 'super_root') return true
    if (estudio.creado_por === profile.id) return true
    return profile.role === 'medico' && estudio.medico_id === profile.id
  }, [profile, estudio])

  const actualizarEstudio = useMutation({
    mutationFn: (payload: unknown) => api.patch(`/imagenes/estudios/${estudioId}`, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['imagenes'] })
      onCambio?.()
      setModo('ver')
      setError(null)
    },
    onError: (e) => setError(getApiError(e)),
  })

  const eliminarEstudio = useMutation({
    mutationFn: () => api.delete(`/imagenes/estudios/${estudioId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['imagenes'] })
      onCambio?.()
      onClose()
    },
    onError: (e) => setError(getApiError(e)),
  })

  const eliminarImagen = useMutation({
    mutationFn: (id: string) => api.delete(`/imagenes/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['imagenes', 'estudio', estudioId] })
      queryClient.invalidateQueries({ queryKey: ['imagenes'] })
      onCambio?.()
    },
    onError: (e) => setError(getApiError(e)),
  })

  function confirmarEliminarImagen(img: ImagenClinica) {
    if (!window.confirm(`¿Eliminar la imagen ${img.orden} de la serie?`)) return
    eliminarImagen.mutate(img.id)
  }

  const subirImagenes = useMutation({
    mutationFn: (imagenes: { data_url: string; descripcion: string | null }[]) =>
      api.post(`/imagenes/estudios/${estudioId}/imagenes`, { imagenes }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['imagenes', 'estudio', estudioId] })
      queryClient.invalidateQueries({ queryKey: ['imagenes'] })
      onCambio?.()
      setModo('ver')
      setError(null)
    },
    onError: (e) => setError(getApiError(e)),
  })

  const compartir = useMutation<{ token: string; expira: string }>({
    mutationFn: async () => (await api.post(`/imagenes/estudios/${estudioId}/compartir`, { dias: 7 })).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['imagenes', 'estudio', estudioId] })
      setError(null)
    },
    onError: (e) => setError(getApiError(e)),
  })

  const registrarAcceso = useMutation({
    mutationFn: (accion: string) => api.post(`/imagenes/estudios/${estudioId}/acceso`, { accion }),
  })

  function confirmarEliminarEstudio() {
    if (!window.confirm('¿Eliminar este estudio y todas sus imágenes? Esta acción no se puede deshacer.')) return
    eliminarEstudio.mutate()
  }

  const estudioComparar = otrosEstudios.find((e) => e.id === compararId) ?? null

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-950 text-slate-100">
      {isLoading || !estudio ? (
        <div className="flex flex-1 items-center justify-center text-sm text-slate-400">Cargando estudio…</div>
      ) : (
        <>
          <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 px-4 py-2.5">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[11px] font-medium text-slate-200">
                  {TIPO_LABELS[estudio.tipo] ?? estudio.tipo}
                </span>
                {estudio.region && <span className="text-xs text-slate-400">{estudio.region}</span>}
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                    estudio.estado === 'leido' ? 'bg-green-900 text-green-200' : 'bg-amber-900 text-amber-200'
                  }`}
                >
                  {ESTADO_LABELS[estudio.estado] ?? estudio.estado}
                </span>
              </div>
              <h1 className="truncate text-sm font-bold text-white">{estudio.titulo ?? 'Estudio sin título'}</h1>
              <p className="text-xs text-slate-400">
                {pacienteNombre ?? estudio.paciente_nombre ?? 'Paciente'} ·{' '}
                {new Date(estudio.fecha_estudio).toLocaleString()} · {imagenes.length} imagen(es)
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {puedeEditar && (
                <>
                  <button
                    onClick={() => setModo(modo === 'editar' ? 'ver' : 'editar')}
                    className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-medium hover:bg-slate-700"
                  >
                    {modo === 'editar' ? 'Cerrar edición' : 'Editar estudio'}
                  </button>
                  <button
                    onClick={() => setModo(modo === 'compartir' ? 'ver' : 'compartir')}
                    className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-medium hover:bg-slate-700"
                  >
                    Compartir
                  </button>
                  <button
                    onClick={() => setModo(modo === 'subir' ? 'ver' : 'subir')}
                    className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-medium hover:bg-slate-700"
                  >
                    + Imágenes
                  </button>
                  <button
                    onClick={() => setCompararId(compararId ? null : otrosEstudios[0]?.id ?? 'listar')}
                    className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-medium hover:bg-slate-700"
                  >
                    {compararId ? 'Quitar comparar' : 'Comparar'}
                  </button>
                  <button
                    onClick={confirmarEliminarEstudio}
                    className="rounded-lg bg-red-900/60 px-3 py-1.5 text-xs font-medium text-red-100 hover:bg-red-900"
                  >
                    Eliminar
                  </button>
                </>
              )}
              <button onClick={onClose} className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-medium hover:bg-slate-600">
                × Cerrar
              </button>
            </div>
          </header>

          {error && <div className="border-b border-slate-800 bg-red-950 px-4 py-2 text-xs text-red-200">{error}</div>}

          <div className="flex flex-1 overflow-hidden">
            <main className="flex flex-1 flex-col overflow-hidden">
              <div className={`grid flex-1 gap-px bg-slate-900 ${compararId ? 'lg:grid-cols-2' : 'grid-cols-1'}`}>
                <CanvasPane
                  estudio={estudio}
                  imagenes={imagenes}
                  pacienteNombre={pacienteNombre ?? estudio.paciente_nombre ?? ''}
                  registrarAcceso={registrarAcceso.mutate}
                  puedeEditar={puedeEditar}
                  onEliminarImagen={puedeEditar ? confirmarEliminarImagen : undefined}
                />
                {estudioComparar && (
                  <CanvasPane
                    estudio={estudioComparar}
                    imagenes={estudioComparar.imagenes ?? []}
                    pacienteNombre={pacienteNombre ?? estudioComparar.paciente_nombre ?? ''}
                    registrarAcceso={registrarAcceso.mutate}
                  />
                )}
              </div>
            </main>

            <aside className="w-80 shrink-0 overflow-y-auto border-l border-slate-800 bg-slate-900">
              {modo === 'editar' && (
                <PanelEditar
                  estudio={estudio}
                  onGuardar={(payload) => actualizarEstudio.mutate(payload)}
                  onCancelar={() => setModo('ver')}
                  error={error}
                  guardando={actualizarEstudio.isPending}
                />
              )}
              {modo === 'compartir' && (
                <PanelCompartir
                  estudio={estudio}
                  onGenerar={() => compartir.mutate()}
                  token={compartir.data?.token ?? null}
                  expira={compartir.data?.expira ?? null}
                  generando={compartir.isPending}
                />
              )}
              {modo === 'subir' && (
                <PanelSubir
                  onSubir={(imagenes) => subirImagenes.mutate(imagenes)}
                  subiendo={subirImagenes.isPending}
                  onCancelar={() => setModo('ver')}
                  error={error}
                />
              )}
              {modo === 'ver' && (
                <div className="space-y-4 p-4">
                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Estudio</h3>
                    <dl className="mt-2 space-y-1 text-xs">
                      <div className="flex justify-between">
                        <dt className="text-slate-500">Región</dt>
                        <dd className="text-slate-200">{estudio.region ?? '—'}</dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-slate-500">Fecha</dt>
                        <dd className="text-slate-200">{new Date(estudio.fecha_estudio).toLocaleDateString()}</dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-slate-500">Registrado por</dt>
                        <dd className="text-slate-200">{estudio.creado_por_nombre ?? '—'}</dd>
                      </div>
                      {estudio.retencion_hasta && (
                        <div className="flex justify-between">
                          <dt className="text-slate-500">Retención</dt>
                          <dd className="text-slate-200">Hasta {estudio.retencion_hasta}</dd>
                        </div>
                      )}
                    </dl>
                  </div>
                  {estudio.hallazgos && (
                    <div>
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Hallazgos</h3>
                      <p className="mt-1 text-xs text-slate-200">{estudio.hallazgos}</p>
                    </div>
                  )}
                  {estudio.impresion && (
                    <div>
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Impresión</h3>
                      <p className="mt-1 text-xs text-slate-200">{estudio.impresion}</p>
                    </div>
                  )}
                  {compararId && (
                    <div>
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Comparar con</h3>
                      <select
                        value={compararId}
                        onChange={(e) => setCompararId(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-2 py-1.5 text-xs text-white"
                      >
                        <option value="">Seleccionar estudio…</option>
                        {otrosEstudios
                          .filter((e) => e.id !== estudio.id)
                          .map((e) => (
                            <option key={e.id} value={e.id}>
                              {e.titulo ?? TIPO_LABELS[e.tipo]} · {new Date(e.fecha_estudio).toLocaleDateString()}
                            </option>
                          ))}
                      </select>
                    </div>
                  )}
                </div>
              )}
            </aside>
          </div>
        </>
      )}
    </div>
  )
}
