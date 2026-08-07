import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent, type ReactNode } from 'react'
import { api, getApiError } from '../../lib/api'
import { useSessionStore } from '../../stores/sessionStore'
import PrintHeader from '../../components/ui/PrintHeader'
import PrecioDual from '../../components/PrecioDual'
import { useTasaUsd } from '../../lib/moneda'

interface Solicitud {
  id: string
  paciente_id: string
  estado: string
  cobrado: boolean
  fecha: string
  total: number
}

interface Linea {
  id: string
  examen: string
  precio: number
  resultado: { id: string; valores: Record<string, unknown> | null; observaciones: string | null } | null
}

interface SolicitudDetalle extends Solicitud {
  lineas: Linea[]
  paciente: { id: string; cedula: string; nombre_completo: string }
}

interface Reactivo {
  id: string
  nombre: string
  lote: string | null
  cantidad: number
  alerta_minima: number | null
  fecha_vencimiento: string | null
  proveedor: string | null
}

interface PreanaliticaResp {
  config: { habilitado: boolean; obligatorio: boolean }
  validaciones: { id: string; nombre: string; cumplido: boolean }[]
  completado: boolean
  validado_por: string | null
}

interface AlertaGenerada {
  parametro: string
  valor: string | null
  unidad: string | null
  nivel: 'alerta' | 'critico'
  motivo: string
}

const ESTADOS = ['pendiente', 'en_proceso', 'listo'] as const
const ESTADO_STYLES: Record<string, string> = {
  pendiente: 'bg-blue-100 text-blue-700',
  en_proceso: 'bg-amber-100 text-amber-700',
  listo: 'bg-green-100 text-green-700',
  entregado: 'bg-slate-200 text-slate-600',
}

export default function LaboratorioPage() {
  const [tab, setTab] = useState<'cola' | 'reactivos'>('cola')
  const [estado, setEstado] = useState<string>('')
  const [detalleId, setDetalleId] = useState<string | null>(null)
  const profile = useSessionStore((s) => s.profile)

  const { data: solicitudes = [], isLoading } = useQuery<Solicitud[]>({
    queryKey: ['solicitudes', estado],
    queryFn: async () => (await api.get('/solicitudes', { params: estado ? { estado } : {} })).data,
    refetchInterval: 15000,
  })

  const tasaUsd = useTasaUsd()

  return (
    <div className="space-y-5">
      <PrintHeader />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Laboratorio</h1>
          <p className="text-sm text-slate-500">Cola de exámenes y resultados</p>
        </div>
      </div>

      <div className="flex gap-2">
        <TabButton active={tab === 'cola'} onClick={() => setTab('cola')}>Cola de exámenes</TabButton>
        <TabButton active={tab === 'reactivos'} onClick={() => setTab('reactivos')}>Reactivos</TabButton>
      </div>

      {tab === 'cola' ? (
        <>
          <div className="flex flex-wrap gap-2">
            <FilterChip active={estado === ''} onClick={() => setEstado('')}>Todas</FilterChip>
            {ESTADOS.map((e) => (
              <FilterChip key={e} active={estado === e} onClick={() => setEstado(e)}>{e.replace('_', ' ')}</FilterChip>
            ))}
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            {isLoading ? (
              <p className="p-6 text-sm text-slate-500">Cargando…</p>
            ) : solicitudes.length === 0 ? (
              <p className="p-6 text-sm text-slate-500">No hay solicitudes.</p>
            ) : (
              <div className="grid divide-y divide-slate-100 sm:grid-cols-2 lg:grid-cols-3 sm:divide-y-0 sm:gap-4 sm:p-4">
                {solicitudes.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => setDetalleId(s.id)}
                    className="text-left p-4 sm:rounded-xl sm:border sm:border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                  >
                    <div className="flex items-center justify-between">
                      <EstadoBadge estado={s.estado} />
                      {s.cobrado && <span className="text-xs text-green-600">pagada</span>}
                    </div>
                    <p className="mt-2 text-sm font-semibold text-slate-800"><PrecioDual usd={s.total} tasaUsd={tasaUsd} /></p>
                    <p className="text-xs text-slate-400">{new Date(s.fecha).toLocaleString()}</p>
                  </button>
                ))}
              </div>
            )}
          </div>
        </>
      ) : (
        <ReactivosTab />
      )}

      {detalleId && <DetalleModal solicitudId={detalleId} rol={profile?.role} onClose={() => setDetalleId(null)} />}
    </div>
  )
}

function ReactivosTab() {
  const queryClient = useQueryClient()
  const [error, setError] = useState<string | null>(null)
  const { data: reactivos = [], isLoading } = useQuery<Reactivo[]>({
    queryKey: ['reactivos'],
    queryFn: async () => (await api.get('/reactivos')).data,
  })

  const add = useMutation({
    mutationFn: (p: unknown) => api.post('/reactivos', p),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reactivos'] })
      setError(null)
    },
    onError: (e) => setError(getApiError(e)),
  })

  function handleAdd(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    add.mutate({
      nombre: fd.get('nombre'),
      lote: fd.get('lote'),
      cantidad: Number(fd.get('cantidad') || 0),
      alerta_minima: Number(fd.get('alerta_minima') || 0),
      proveedor: fd.get('proveedor'),
    })
    e.currentTarget.reset()
  }

  return (
    <div className="space-y-4">
      <form onSubmit={handleAdd} className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-5 sm:grid-cols-5">
        <Field label="Nombre *"><input name="nombre" required className={inputCls} /></Field>
        <Field label="Lote"><input name="lote" className={inputCls} /></Field>
        <Field label="Cantidad"><input name="cantidad" type="number" defaultValue={0} className={inputCls} /></Field>
        <Field label="Alerta mínima"><input name="alerta_minima" type="number" defaultValue={0} className={inputCls} /></Field>
        <div className="flex items-end gap-2">
          <button type="submit" disabled={add.isPending} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50">Agregar</button>
        </div>
        {error && <p className="col-span-full rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      </form>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        {isLoading ? (
          <p className="p-6 text-sm text-slate-500">Cargando…</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr><th className="px-4 py-3">Nombre</th><th className="px-4 py-3">Lote</th><th className="px-4 py-3">Cantidad</th><th className="px-4 py-3">Estado</th><th className="px-4 py-3">Proveedor</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {reactivos.map((r) => {
                  const bajo = r.alerta_minima != null && r.cantidad <= r.alerta_minima
                  return (
                    <tr key={r.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-medium text-slate-800">{r.nombre}</td>
                      <td className="px-4 py-3 text-slate-500">{r.lote ?? '—'}</td>
                      <td className="px-4 py-3">{r.cantidad}</td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${bajo ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                          {bajo ? 'Bajo stock' : 'OK'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-500">{r.proveedor ?? '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

function DetalleModal({ solicitudId, rol, onClose }: { solicitudId: string; rol?: string; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [vals, setVals] = useState<Record<string, { valor: string; obs: string }>>({})
  const [csv, setCsv] = useState('')
  const [csvMsg, setCsvMsg] = useState<string | null>(null)
  const tasaUsd = useTasaUsd()

  const { data: solicitud, isLoading } = useQuery<SolicitudDetalle>({
    queryKey: ['solicitud', solicitudId],
    queryFn: async () => (await api.get(`/solicitudes/${solicitudId}`)).data,
  })

  const { data: preanalitica } = useQuery<PreanaliticaResp>({
    queryKey: ['preanalitica', solicitudId],
    queryFn: async () => (await api.get(`/preanalitica/solicitudes/${solicitudId}`)).data,
    enabled: rol === 'laboratorio',
  })

  const validarPreanalitica = useMutation({
    mutationFn: (checkpoints: string[]) =>
      api.post(`/preanalitica/solicitudes/${solicitudId}/validar`, { checkpoints }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['preanalitica', solicitudId] })
    },
    onError: (e) => setPreError(getApiError(e)),
  })

  const [preError, setPreError] = useState<string | null>(null)
  const [alertasGeneradas, setAlertasGeneradas] = useState<AlertaGenerada[]>([])

  const changeEstado = useMutation({
    mutationFn: (estado: string) => api.patch(`/solicitudes/${solicitudId}/estado`, { estado }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['solicitudes'] })
      queryClient.invalidateQueries({ queryKey: ['solicitud', solicitudId] })
    },
  })

  const uploadResultados = useMutation({
    mutationFn: (lineas: unknown[]) => api.post(`/solicitudes/${solicitudId}/resultados`, { lineas }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['solicitudes'] })
      queryClient.invalidateQueries({ queryKey: ['solicitud', solicitudId] })
      setVals({})
      setAlertasGeneradas((res.data as { alertas_generadas?: AlertaGenerada[] }).alertas_generadas ?? [])
    },
  })

  function submitResultados() {
    const lineas = (solicitud?.lineas ?? [])
      .filter((l) => !l.resultado && vals[l.id]?.valor?.trim())
      .map((l) => ({
        solicitud_detalle_id: l.id,
        valores: { resultado: vals[l.id].valor.trim() },
        observaciones: vals[l.id].obs.trim() || undefined,
      }))
    if (lineas.length === 0) return
    uploadResultados.mutate(lineas)
  }

  /** Carga masiva: `examen,valor,nota` por línea; asocia por nombre de examen. */
  function cargarCsv() {
    if (!solicitud) return
    const filas = csv.split('\n').map((l) => l.trim()).filter(Boolean)
    if (filas.length === 0) return
    const nuevos = { ...vals }
    let asociadas = 0
    let sinMatch: string[] = []
    for (const fila of filas) {
      const partes = fila.split(/[,;\t]/).map((p) => p.trim())
      const [nombre, valor, obs] = partes
      if (!nombre || !valor) continue
      const linea = solicitud.lineas.find(
        (l) => !l.resultado && l.examen.toLowerCase() === nombre.toLowerCase(),
      )
      if (linea) {
        nuevos[linea.id] = { valor, obs: obs ?? '' }
        asociadas++
      } else {
        sinMatch.push(nombre)
      }
    }
    setVals(nuevos)
    setCsvMsg(`${asociadas} examen(es) cargado(s)${sinMatch.length ? ` · sin coincidencia: ${[...new Set(sinMatch)].join(', ')}` : ''}`)
  }

  const esLab = rol === 'laboratorio'

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-6 sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between">
          <div>
            <h3 className="text-lg font-bold text-slate-800">{solicitud?.paciente?.nombre_completo ?? '…'}</h3>
            <p className="text-sm text-slate-500">{solicitud?.paciente?.cedula}</p>
          </div>
          <div className="flex items-center gap-2">
            {solicitud && <EstadoBadge estado={solicitud.estado} />}
            <button onClick={onClose} className="text-xl text-slate-400 hover:text-slate-600">×</button>
          </div>
        </div>

        {isLoading ? (
          <p className="mt-4 text-sm text-slate-500">Cargando…</p>
        ) : (
          <>
            <div className="mt-4 flex items-center justify-between text-sm">
              <span className={`font-semibold ${solicitud!.cobrado ? 'text-green-600' : 'text-red-600'}`}>
                {solicitud!.cobrado ? 'Pagada' : 'Pendiente de pago'}
              </span>
              <span className="font-bold text-slate-800">Total: <PrecioDual usd={solicitud!.total} tasaUsd={tasaUsd} /></span>
            </div>

            {esLab && !['listo', 'entregado'].includes(solicitud!.estado) && (
              <div className="mt-3 flex gap-2">
                {solicitud!.estado === 'pendiente' && (
                  <button onClick={() => changeEstado.mutate('en_proceso')} className="rounded-lg bg-amber-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-600">En proceso</button>
                )}
                <button onClick={() => changeEstado.mutate('listo')} className="rounded-lg bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700">Marcar listo</button>
              </div>
            )}

            <div className="mt-4 space-y-3">
              {solicitud!.lineas.map((l) => (
                <div key={l.id} className="rounded-lg border border-slate-200 p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-slate-800">{l.examen}</span>
                    <span className="text-xs text-slate-400"><PrecioDual usd={l.precio} tasaUsd={tasaUsd} /></span>
                  </div>
                  {l.resultado ? (
                    <p className="mt-1 text-xs text-green-700">
                      Resultado: {l.resultado.valores ? JSON.stringify(l.resultado.valores) : '—'}
                      {l.resultado.observaciones && <span className="text-slate-500"> · {l.resultado.observaciones}</span>}
                    </p>
                  ) : esLab ? (
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <input
                        placeholder="Valor / lectura"
                        className={inputCls}
                        value={vals[l.id]?.valor ?? ''}
                        onChange={(e) => setVals((v) => ({ ...v, [l.id]: { ...v[l.id], valor: e.target.value } }))}
                      />
                      <input
                        placeholder="Notas"
                        className={inputCls}
                        value={vals[l.id]?.obs ?? ''}
                        onChange={(e) => setVals((v) => ({ ...v, [l.id]: { ...v[l.id], obs: e.target.value } }))}
                      />
                    </div>
                  ) : (
                    <p className="mt-1 text-xs text-slate-400">Sin resultado.</p>
                  )}
                </div>
              ))}
            </div>

            {preanalitica?.config.habilitado && (
              <div className={`mt-4 rounded-xl border p-4 ${preanalitica.completado ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}>
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-slate-800">Validación pre-analítica</h4>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${preanalitica.completado ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                    {preanalitica.completado ? 'Completada' : 'Pendiente'}
                    {preanalitica.config.obligatorio ? ' · obligatoria' : ' · opcional'}
                  </span>
                </div>

                <ul className="mt-3 space-y-1.5">
                  {preanalitica.validaciones.map((v) => (
                    <li key={v.id} className="flex items-center gap-2 text-sm text-slate-700">
                      <span className={`flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold ${v.cumplido ? 'bg-emerald-500 text-white' : 'bg-slate-300 text-white'}`}>
                        {v.cumplido ? '✓' : ''}
                      </span>
                      {v.nombre}
                    </li>
                  ))}
                </ul>

                {!preanalitica.completado && esLab && (
                  <>
                    {preError && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{preError}</p>}
                    <button
                      onClick={() => validarPreanalitica.mutate(preanalitica.validaciones.map((v) => v.id))}
                      disabled={validarPreanalitica.isPending}
                      className="mt-3 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50"
                    >
                      {validarPreanalitica.isPending ? 'Guardando…' : 'Confirmar puntos verificados'}
                    </button>
                  </>
                )}
              </div>
            )}

            {alertasGeneradas.length > 0 && (
              <div className={`mt-4 rounded-xl border p-4 ${alertasGeneradas.some((a) => a.nivel === 'critico') ? 'border-red-300 bg-red-50' : 'border-amber-300 bg-amber-50'}`}>
                <p className="text-sm font-semibold text-slate-800">Alertas clínicas detectadas</p>
                <ul className="mt-2 space-y-1.5">
                  {alertasGeneradas.map((a, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <span className={`mt-0.5 rounded-full px-2 py-0.5 text-xs font-medium ${a.nivel === 'critico' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                        {a.nivel === 'critico' ? 'CRÍTICO' : 'ALERTA'}
                      </span>
                      <span className="text-slate-700">{a.motivo} (<strong>{a.parametro}</strong> = {a.valor})</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {esLab && solicitud!.lineas.some((l) => !l.resultado) && (
              <div className="mt-4 rounded-xl border border-slate-200 p-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Carga masiva (CSV)</p>
                  <button onClick={() => setCsv('')} className="text-xs text-slate-400 hover:text-slate-600">Limpiar</button>
                </div>
                <p className="mt-1 text-[10px] text-slate-400">Formato por línea: <code>examen,valor,nota</code></p>
                <textarea
                  value={csv}
                  onChange={(e) => setCsv(e.target.value)}
                  rows={4}
                  placeholder={'Hematología,13.5,g/l\nGlucosa,88,en ayunas'}
                  className="mt-2 w-full resize-y rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs outline-none focus:border-brand-500"
                />
                {csvMsg && <p className="mt-1 text-xs text-slate-600">{csvMsg}</p>}
                <button onClick={cargarCsv} disabled={!csv.trim()} className="mt-2 w-full rounded-lg border border-brand-500 px-3 py-2 text-xs font-semibold text-brand-700 hover:bg-brand-50 disabled:opacity-40">
                  Asociar y precargar resultados
                </button>
              </div>
            )}

            {esLab && solicitud!.lineas.some((l) => !l.resultado) && (
              <button onClick={submitResultados} disabled={uploadResultados.isPending} className="mt-4 w-full rounded-lg bg-brand-600 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50">
                {uploadResultados.isPending ? 'Guardando…' : 'Subir resultados'}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button onClick={onClick} className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${active ? 'bg-slate-800 text-white' : 'bg-white text-slate-600 hover:bg-slate-100'}`}>
      {children}
    </button>
  )
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button onClick={onClick} className={`rounded-full px-3 py-1 text-xs font-medium ${active ? 'bg-brand-600 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200'}`}>
      {children}
    </button>
  )
}

function EstadoBadge({ estado }: { estado: string }) {
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${ESTADO_STYLES[estado] ?? 'bg-slate-200 text-slate-600'}`}>{estado.replace('_', ' ')}</span>
}

const inputCls = 'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100'

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block"><span className="mb-1 block text-sm font-medium text-slate-700">{label}</span>{children}</label>
  )
}