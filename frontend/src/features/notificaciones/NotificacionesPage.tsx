import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { api, getApiError } from '../../lib/api'
import PrintHeader from '../../components/ui/PrintHeader'
import PhoneInput from '../../components/ui/PhoneInput'
import { formatearTelefono } from '../../lib/phone'
import { PacientePicker, type PacienteMini } from '../dashboard/widgets/PacientePicker'

interface Notificacion {
  id: string
  paciente_id: string
  canal: 'push' | 'whatsapp' | 'sms' | 'email'
  tipo: 'cita' | 'resultado' | 'domicilio' | 'turno' | 'pago'
  mensaje: string
  telefono: string | null
  programada_para: string | null
  estado: 'pendiente' | 'enviada' | 'fallida'
  enviada_at: string | null
  sent_at: string | null
  error: string | null
  created_at: string
}

const TIPO_LABEL: Record<string, string> = {
  cita: 'Cita',
  resultado: 'Resultado',
  domicilio: 'Domicilio',
  turno: 'Turno',
  pago: 'Pago',
}
const CANAL_LABEL: Record<string, string> = { push: 'Push', whatsapp: 'WhatsApp', sms: 'SMS', email: 'Email' }

const inputCls = 'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none'

/** Convierte una fecha ISO a valor de <input type="datetime-local"> (hora local). */
function isoADatetimeLocal(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (x: number) => String(x).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default function NotificacionesPage() {
  const queryClient = useQueryClient()
  const [error, setError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)

  const { data: notificaciones = [], isLoading } = useQuery<Notificacion[]>({
    queryKey: ['notificaciones'],
    queryFn: async () => (await api.get('/notificaciones')).data,
  })

  const enviarPendientes = useMutation<{ enviadas: number; fallidas: number; total: number }>({
    mutationFn: async () => {
      const pendientes = notificaciones.filter((n) => n.estado === 'pendiente')
      return (await api.post('/notificaciones/enviar-pendientes', { ids: pendientes.map((n) => n.id) })).data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notificaciones'] })
      setError(null)
    },
    onError: (e) => setError(getApiError(e)),
  })

  const limpiarEnviadas = useMutation<{ eliminadas: number }>({
    mutationFn: async () => (await api.post('/notificaciones/limpiar-enviadas')).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notificaciones'] }),
    onError: (e) => setError(getApiError(e)),
  })

  const pendientes = notificaciones.filter((n) => n.estado === 'pendiente')
  const enviadas = notificaciones.filter((n) => n.estado === 'enviada')
  const fallidas = notificaciones.filter((n) => n.estado === 'fallida')

  const confirmarLimpieza = () => {
    if (enviadas.length === 0) return
    if (!window.confirm(`¿Eliminar los ${enviadas.length} recordatorio(s) enviado(s)? Esta acción no se puede deshacer.`)) return
    limpiarEnviadas.mutate()
  }

  return (
    <div className="space-y-6">
      <PrintHeader />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Recordatorios</h1>
          <p className="text-sm text-slate-500">Citas, resultados, turnos, domicilios y pagos</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setShowForm((v) => !v)}
            className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-brand-700 ring-1 ring-brand-200 hover:bg-brand-50"
          >
            {showForm ? 'Cancelar' : '+ Agregar notificación'}
          </button>
          <button
            onClick={confirmarLimpieza}
            disabled={limpiarEnviadas.isPending || enviadas.length === 0}
            className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-red-600 ring-1 ring-red-200 hover:bg-red-50 disabled:opacity-50"
          >
            {limpiarEnviadas.isPending ? 'Limpiando…' : 'Limpiar enviadas'}
          </button>
          <button
            onClick={() => enviarPendientes.mutate()}
            disabled={enviarPendientes.isPending || pendientes.length === 0}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {enviarPendientes.isPending ? 'Enviando…' : `Enviar pendientes (${pendientes.length})`}
          </button>
        </div>
      </div>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {enviarPendientes.isSuccess && enviarPendientes.data.enviadas > 0 && (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {enviarPendientes.data.enviadas} enviado(s).
          {enviarPendientes.data.fallidas > 0 ? ` ${enviarPendientes.data.fallidas} fallaron.` : ''}
        </p>
      )}
      {limpiarEnviadas.isSuccess && (
        <p className="rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-600">{limpiarEnviadas.data.eliminadas} historial(es) eliminado(s).</p>
      )}

      {showForm && <NuevaNotificacionForm onSaved={() => { setShowForm(false); queryClient.invalidateQueries({ queryKey: ['notificaciones'] }) }} />}

      <section>
        <h2 className="mb-3 text-sm font-semibold text-slate-700">Pendientes ({pendientes.length})</h2>
        <div className="space-y-2">
          {isLoading ? (
            <p className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500">Cargando…</p>
          ) : pendientes.length === 0 ? (
            <p className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500">Sin recordatorios pendientes.</p>
          ) : (
            pendientes.map((n) => <NotifCard key={n.id} n={n} />)
          )}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-slate-700">Enviadas ({enviadas.length})</h2>
        <div className="space-y-2">
          {enviadas.length === 0 ? (
            <p className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500">Sin historial.</p>
          ) : (
            enviadas.map((n) => <NotifCard key={n.id} n={n} />)
          )}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-slate-700">Fallidas ({fallidas.length})</h2>
        <div className="space-y-2">
          {fallidas.length === 0 ? (
            <p className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500">Sin errores.</p>
          ) : (
            fallidas.map((n) => <NotifCard key={n.id} n={n} />)
          )}
        </div>
      </section>
    </div>
  )
}

function NuevaNotificacionForm({ onSaved }: { onSaved: () => void }) {
  const [paciente, setPaciente] = useState<PacienteMini | null>(null)
  const [telefono, setTelefono] = useState('')
  const [telPartes, setTelPartes] = useState<{ country_code?: string; local_number?: string }>({})
  const [canal, setCanal] = useState<'push' | 'whatsapp' | 'sms' | 'email'>('sms')
  const [tipo, setTipo] = useState<Notificacion['tipo']>('cita')
  const [mensaje, setMensaje] = useState('')
  const [programadaPara, setProgramadaPara] = useState('')
  const [error, setError] = useState<string | null>(null)

  // Al elegir un paciente se precarga su teléfono registrado (si no se editó).
  useEffect(() => {
    if (paciente?.telefono) setTelefono(paciente.telefono)
  }, [paciente])

  const crear = useMutation({
    mutationFn: async () =>
      (await api.post('/notificaciones', {
        paciente_id: paciente!.id,
        telefono: telefono || paciente?.telefono || undefined,
        country_code: telPartes.country_code,
        local_number: telPartes.local_number,
        canal,
        tipo,
        mensaje,
        programada_para: new Date(programadaPara).toISOString(),
      })).data,
    onSuccess: () => onSaved(),
    onError: (e) => setError(getApiError(e)),
  })

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="mb-1 block text-xs font-semibold text-slate-500">Paciente / Destinatario *</label>
          <PacientePicker value={paciente} onChange={(p) => setPaciente(p)} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-500">Teléfono del destinatario</label>
          <PhoneInput
            value={telefono}
            onChange={(p) => {
              setTelefono(p.telefono ?? '')
              setTelPartes({ country_code: p.country_code, local_number: p.local_number })
            }}
            placeholder="+58 412 1234567"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-500">Categoría *</label>
          <select value={tipo} onChange={(e) => setTipo(e.target.value as Notificacion['tipo'])} className={inputCls}>
            {Object.entries(TIPO_LABEL).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-500">Canal *</label>
          <select value={canal} onChange={(e) => setCanal(e.target.value as Notificacion['canal'])} className={inputCls}>
            {Object.entries(CANAL_LABEL).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-500">Fecha y hora programada *</label>
          <input type="datetime-local" value={programadaPara} onChange={(e) => setProgramadaPara(e.target.value)} className={inputCls} />
        </div>
        <div className="sm:col-span-2">
          <label className="mb-1 block text-xs font-semibold text-slate-500">Mensaje *</label>
          <textarea value={mensaje} onChange={(e) => setMensaje(e.target.value)} rows={3} className={inputCls} placeholder="Contenido de la notificación…" />
        </div>
      </div>
      {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <button
        onClick={() => crear.mutate()}
        disabled={!paciente || !mensaje || !programadaPara || crear.isPending}
        className="mt-4 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
      >
        {crear.isPending ? 'Guardando…' : 'Agendar notificación'}
      </button>
    </div>
  )
}

function NotifCard({ n }: { n: Notificacion }) {
  const queryClient = useQueryClient()
  const [editando, setEditando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [canal, setCanal] = useState<Notificacion['canal']>(n.canal)
  const [tipo, setTipo] = useState<Notificacion['tipo']>(n.tipo)
  const [mensaje, setMensaje] = useState(n.mensaje)
  const [programadaPara, setProgramadaPara] = useState(isoADatetimeLocal(n.programada_para))
  const [telefono, setTelefono] = useState(n.telefono ?? '')
  const [telPartes, setTelPartes] = useState<{ country_code?: string; local_number?: string }>({})

  const invalidar = () => queryClient.invalidateQueries({ queryKey: ['notificaciones'] })

  const editar = useMutation({
    mutationFn: async () =>
      (
        await api.patch(`/notificaciones/${n.id}`, {
          canal,
          tipo,
          mensaje,
          programada_para: new Date(programadaPara).toISOString(),
          telefono: telefono || undefined,
          country_code: telPartes.country_code,
          local_number: telPartes.local_number,
        })
      ).data,
    onSuccess: () => {
      setEditando(false)
      setError(null)
      invalidar()
    },
    onError: (e) => setError(getApiError(e)),
  })

  const eliminar = useMutation({
    mutationFn: async () => (await api.delete(`/notificaciones/${n.id}`)).data,
    onSuccess: () => {
      setError(null)
      invalidar()
    },
    onError: (e) => setError(getApiError(e)),
  })

  const enviarAhora = useMutation({
    mutationFn: async () => (await api.post('/notificaciones/enviar-pendientes', { ids: [n.id] })).data,
    onSuccess: (data: { enviadas: number; fallidas: number }) => {
      invalidar()
      setError(data.enviadas > 0 ? null : data.fallidas > 0 ? 'No se pudo enviar. Revisa el estado de la notificación.' : 'Sin cambios.')
    },
    onError: (e) => setError(getApiError(e)),
  })

  const confirmarEliminar = () => {
    if (!window.confirm('¿Eliminar esta notificación? Esta acción no se puede deshacer.')) return
    eliminar.mutate()
  }

  const estadoCls =
    n.estado === 'enviada'
      ? 'bg-emerald-100 text-emerald-700'
      : n.estado === 'fallida'
        ? 'bg-red-100 text-red-700'
        : 'bg-amber-100 text-amber-700'

  if (editando) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Editar notificación</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-500">Categoría</label>
            <select value={tipo} onChange={(e) => setTipo(e.target.value as Notificacion['tipo'])} className={inputCls}>
              {Object.entries(TIPO_LABEL).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-500">Canal</label>
            <select value={canal} onChange={(e) => setCanal(e.target.value as Notificacion['canal'])} className={inputCls}>
              {Object.entries(CANAL_LABEL).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-500">Teléfono del destinatario</label>
            <PhoneInput
              value={telefono}
              onChange={(p) => {
                setTelefono(p.telefono ?? '')
                setTelPartes({ country_code: p.country_code, local_number: p.local_number })
              }}
              placeholder="+58 412 1234567"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-500">Fecha y hora programada</label>
            <input type="datetime-local" value={programadaPara} onChange={(e) => setProgramadaPara(e.target.value)} className={inputCls} />
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs font-semibold text-slate-500">Mensaje</label>
            <textarea value={mensaje} onChange={(e) => setMensaje(e.target.value)} rows={3} className={inputCls} />
          </div>
        </div>
        {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            onClick={() => editar.mutate()}
            disabled={!mensaje || !programadaPara || editar.isPending}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {editar.isPending ? 'Guardando…' : 'Guardar cambios'}
          </button>
          <button
            onClick={() => {
              setEditando(false)
              setError(null)
            }}
            className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
          >
            Cancelar
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="rounded-full bg-brand-50 px-2 py-0.5 font-medium text-brand-700">{TIPO_LABEL[n.tipo] ?? n.tipo}</span>
        <span className="text-slate-400">{CANAL_LABEL[n.canal] ?? n.canal}</span>
        {n.telefono && <span className="text-slate-400">{formatearTelefono(n.telefono)}</span>}
        <span className={`rounded-full px-2 py-0.5 font-medium ${estadoCls}`}>{n.estado}</span>
        {n.estado !== 'enviada' && (
          <button
            onClick={() => {
              setEditando(true)
              setError(null)
            }}
            className="rounded-lg bg-white px-2.5 py-1 font-medium text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
          >
            Editar
          </button>
        )}
        {n.estado !== 'enviada' && (
          <button
            onClick={() => enviarAhora.mutate()}
            disabled={enviarAhora.isPending}
            className="rounded-lg bg-white px-2.5 py-1 font-medium text-brand-700 ring-1 ring-brand-200 hover:bg-brand-50 disabled:opacity-50"
          >
            {enviarAhora.isPending ? 'Enviando…' : 'Enviar ahora'}
          </button>
        )}
        <button
          onClick={confirmarEliminar}
          disabled={eliminar.isPending}
          className="ml-auto rounded-lg bg-white px-2.5 py-1 font-medium text-red-600 ring-1 ring-red-200 hover:bg-red-50 disabled:opacity-50"
        >
          {eliminar.isPending ? 'Eliminando…' : 'Eliminar'}
        </button>
      </div>
      <p className="mt-2 text-sm text-slate-700">{n.mensaje}</p>
      {error && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <p className="mt-1 text-xs text-slate-400">
        {n.estado === 'enviada' && n.sent_at
          ? `Enviada ${new Date(n.sent_at).toLocaleString()}`
          : n.estado === 'fallida' && n.error
            ? `Fallida: ${n.error}`
            : `Programada ${n.programada_para ? new Date(n.programada_para).toLocaleString() : ''}`}
      </p>
    </div>
  )
}