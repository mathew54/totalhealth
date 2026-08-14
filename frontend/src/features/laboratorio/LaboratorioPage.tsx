import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent, type ReactNode } from 'react'
import { api, getApiError } from '../../lib/api'
import { useSessionStore } from '../../stores/sessionStore'
import PrintHeader from '../../components/ui/PrintHeader'
import PrecioDual from '../../components/PrecioDual'
import { useTasaUsd } from '../../lib/moneda'
import type { Paciente } from '../../lib/types'

interface Solicitud {
  id: string
  paciente_id: string
  estado: string
  cobrado: boolean
  fecha: string
  total: number
  paciente: { id: string; cedula: string; nombre_completo: string } | null
}

interface Linea {
  id: string
  examen_id: string
  examen: string
  precio: number
  resultado: { id: string; valores: Record<string, unknown> | null; observaciones: string | null } | null
}

interface SolicitudDetalle extends Solicitud {
  lineas: Linea[]
}

interface Examen {
  id: string
  nombre: string
  categoria: string | null
  precio: number
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
  anulada: 'bg-red-100 text-red-700',
}

export default function LaboratorioPage() {
  const queryClient = useQueryClient()
  const [tab, setTab] = useState<'cola' | 'reactivos'>('cola')
  const [estado, setEstado] = useState<string>('')
  const [detalleId, setDetalleId] = useState<string | null>(null)
  const [crearAbierto, setCrearAbierto] = useState(false)
  const profile = useSessionStore((s) => s.profile)

  const { data: solicitudes = [], isLoading } = useQuery<Solicitud[]>({
    queryKey: ['solicitudes', estado],
    queryFn: async () =>
      (
        await api.get('/solicitudes', {
          params: estado === 'anulada' ? { estado: 'anulada', incluir_anuladas: 'true' } : estado ? { estado } : {},
        })
      ).data,
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
        {tab === 'cola' && (
          <button onClick={() => setCrearAbierto((v) => !v)} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700">
            {crearAbierto ? 'Cancelar' : '+ Nueva solicitud'}
          </button>
        )}
      </div>

      {crearAbierto && <NuevaSolicitudForm onCancel={() => setCrearAbierto(false)} />}

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
            <FilterChip active={estado === 'anulada'} onClick={() => setEstado('anulada')}>Anuladas</FilterChip>
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
                    <p className="mt-2 text-sm font-semibold text-slate-800">{s.paciente?.nombre_completo ?? 'Paciente'}</p>
                    <p className="text-xs text-slate-400">{s.paciente?.cedula ?? ''}</p>
                    <p className="mt-1 text-sm font-semibold text-slate-800"><PrecioDual usd={s.total} tasaUsd={tasaUsd} /></p>
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

      {detalleId && (
        <DetalleModal
          solicitudId={detalleId}
          rol={profile?.role}
          onClose={() => setDetalleId(null)}
          onMutado={() => queryClient.invalidateQueries({ queryKey: ['solicitudes'] })}
        />
      )}
    </div>
  )
}

function NuevaSolicitudForm({ onCancel }: { onCancel: () => void }) {
  const queryClient = useQueryClient()
  const [pacienteId, setPacienteId] = useState('')
  const [examenes, setExamenes] = useState<string[]>([])
  const [q, setQ] = useState('')
  const [fecha, setFecha] = useState(() => {
    const d = new Date()
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
    return d.toISOString().slice(0, 16)
  })
  const [error, setError] = useState<string | null>(null)
  const tasaUsd = useTasaUsd()

  const { data: pacientes = [] } = useQuery<Paciente[]>({
    queryKey: ['pacientes', 'solicitud', q],
    queryFn: async () => (await api.get('/pacientes', { params: { q } })).data,
  })

  const { data: catalogo = [] } = useQuery<Examen[]>({
    queryKey: ['examenes', 'solicitud'],
    queryFn: async () => (await api.get('/examenes')).data,
  })

  const crear = useMutation({
    mutationFn: (payload: { paciente_id: string; examenes: string[]; fecha: string; nota?: string }) => api.post('/solicitudes', payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['solicitudes'] })
      setError(null)
      onCancel()
    },
    onError: (e) => setError(getApiError(e)),
  })

  const seleccionados = catalogo.filter((c) => examenes.includes(c.id))
  const total = seleccionados.reduce((acc, c) => acc + Number(c.precio), 0)

  function toggleExamen(id: string) {
    setExamenes((v) => (v.includes(id) ? v.filter((x) => x !== id) : [...v, id]))
  }

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!pacienteId || examenes.length === 0) return
    const fd = new FormData(e.currentTarget)
    crear.mutate({ paciente_id: pacienteId, examenes, fecha: new Date(fecha).toISOString(), nota: String(fd.get('nota') ?? '').trim() || undefined })
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5">
      <Field label="Fecha y hora *">
        <input
          type="datetime-local"
          value={fecha}
          onChange={(e) => setFecha(e.target.value)}
          className={inputCls}
        />
        <p className="mt-1 text-xs text-slate-400">Define la fecha y hora de la solicitud; las listas se ordenan por este valor (más recientes primero).</p>
      </Field>

      <div className="grid gap-4 lg:grid-cols-2">
        <Field label="Paciente *">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por cédula o nombre…"
            className={inputCls}
          />
          <div className="mt-1 max-h-40 overflow-y-auto rounded-lg border border-slate-200">
            {pacientes.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setPacienteId(p.id)}
                className={`flex w-full items-center justify-between px-3 py-1.5 text-left text-sm hover:bg-slate-50 ${pacienteId === p.id ? 'bg-brand-50' : ''}`}
              >
                <span className="font-medium text-slate-800">{p.nombre_completo}</span>
                <span className="text-xs text-slate-400">{p.cedula}</span>
              </button>
            ))}
            {pacientes.length === 0 && <p className="px-3 py-2 text-xs text-slate-400">Sin resultados.</p>}
          </div>
        </Field>

        <Field label="Exámenes *">
          <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-2">
            {catalogo.map((c) => (
              <label key={c.id} className="flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-slate-50">
                <input type="checkbox" checked={examenes.includes(c.id)} onChange={() => toggleExamen(c.id)} className="accent-brand-600" />
                <span className="flex-1 text-slate-700">{c.nombre}</span>
                <span className="text-xs text-slate-400"><PrecioDual usd={Number(c.precio)} tasaUsd={tasaUsd} /></span>
              </label>
            ))}
          </div>
        </Field>
      </div>

      <Field label="Nota">
        <textarea name="nota" rows={2} placeholder="Indicaciones para la toma de muestra…" className={inputCls} />
      </Field>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-600">
          {seleccionados.length} examen(es) · Total <strong><PrecioDual usd={total} tasaUsd={tasaUsd} /></strong>
        </p>
        <div className="flex gap-2">
          <button type="button" onClick={onCancel} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">
            Cancelar
          </button>
          <button
            type="submit"
            disabled={!pacienteId || examenes.length === 0 || crear.isPending}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {crear.isPending ? 'Creando…' : 'Crear solicitud'}
          </button>
        </div>
      </div>
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
    </form>
  )
}

function EditarExamenesForm({ solicitudId, iniciales, onDone }: { solicitudId: string; iniciales: string[]; onDone: () => void }) {
  const queryClient = useQueryClient()
  const [examenes, setExamenes] = useState<string[]>(iniciales)
  const [error, setError] = useState<string | null>(null)
  const tasaUsd = useTasaUsd()

  const { data: catalogo = [] } = useQuery<Examen[]>({
    queryKey: ['examenes', 'solicitud'],
    queryFn: async () => (await api.get('/examenes')).data,
  })

  const guardar = useMutation({
    mutationFn: (payload: { examenes: string[] }) => api.patch(`/solicitudes/${solicitudId}`, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['solicitudes'] })
      queryClient.invalidateQueries({ queryKey: ['solicitud', solicitudId] })
      setError(null)
      onDone()
    },
    onError: (e) => setError(getApiError(e)),
  })

  const total = catalogo.filter((c) => examenes.includes(c.id)).reduce((acc, c) => acc + Number(c.precio), 0)

  function toggleExamen(id: string) {
    setExamenes((v) => (v.includes(id) ? v.filter((x) => x !== id) : [...v, id]))
  }

  return (
    <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
      <p className="text-sm font-semibold text-slate-800">Editar exámenes</p>
      <div className="mt-2 max-h-40 space-y-1 overflow-y-auto rounded-lg border border-slate-200 bg-white p-2">
        {catalogo.map((c) => (
          <label key={c.id} className="flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-slate-50">
            <input type="checkbox" checked={examenes.includes(c.id)} onChange={() => toggleExamen(c.id)} className="accent-brand-600" />
            <span className="flex-1 text-slate-700">{c.nombre}</span>
            <span className="text-xs text-slate-400"><PrecioDual usd={Number(c.precio)} tasaUsd={tasaUsd} /></span>
          </label>
        ))}
      </div>
      {error && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <div className="mt-3 flex items-center justify-between gap-2">
        <p className="text-sm text-slate-600">{examenes.length} examen(es) · Total <strong><PrecioDual usd={total} tasaUsd={tasaUsd} /></strong></p>
        <button
          onClick={() => guardar.mutate({ examenes })}
          disabled={examenes.length === 0 || guardar.isPending}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {guardar.isPending ? 'Guardando…' : 'Guardar cambios'}
        </button>
      </div>
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

function DetalleModal({ solicitudId, rol, onClose, onMutado }: { solicitudId: string; rol?: string; onClose: () => void; onMutado?: () => void }) {
  const queryClient = useQueryClient()
  const [vals, setVals] = useState<Record<string, { valor: string; obs: string }>>({})
  const [csv, setCsv] = useState('')
  const [csvMsg, setCsvMsg] = useState<string | null>(null)
  const [editando, setEditando] = useState(false)
  const [error, setError] = useState<string | null>(null)
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

  const anular = useMutation({
    mutationFn: (activa: boolean) => api.post(`/solicitudes/${solicitudId}/anular`, { activa }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['solicitudes'] })
      queryClient.invalidateQueries({ queryKey: ['solicitud', solicitudId] })
      setEditando(false)
      setError(null)
      onMutado?.()
    },
    onError: (e) => setError(getApiError(e)),
  })

  const esLab = rol === 'laboratorio'
  const puedeEditar = ['laboratorio', 'secretaria', 'admin', 'super_root', 'medico'].includes(rol ?? '')
  const esPendiente = solicitud?.estado === 'pendiente'
  const esAnulada = solicitud?.estado === 'anulada'

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

            {puedeEditar && (
              <div className="mt-3 flex flex-wrap gap-2">
                {esPendiente && !esAnulada && (
                  <button onClick={() => setEditando((v) => !v)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
                    {editando ? 'Cancelar edición' : 'Editar exámenes'}
                  </button>
                )}
                {esAnulada ? (
                  <button onClick={() => anular.mutate(false)} disabled={anular.isPending} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
                    {anular.isPending ? '…' : 'Reactivar solicitud'}
                  </button>
                ) : (
                  <button
                    onClick={() => { if (confirm('¿Anular (esconder) esta solicitud? Desaparecerá de la cola y de los resultados del paciente.')) anular.mutate(true) }}
                    disabled={anular.isPending}
                    className="rounded-lg border border-red-200 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                  >
                    {anular.isPending ? '…' : 'Anular / Esconder'}
                  </button>
                )}
              </div>
            )}

            {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

            {editando && esPendiente && (
              <EditarExamenesForm solicitudId={solicitudId} iniciales={solicitud!.lineas.map((l) => l.examen_id)} onDone={() => { setEditando(false); onMutado?.() }} />
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