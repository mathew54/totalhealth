import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent, type ReactNode } from 'react'
import { api, getApiError } from '../../lib/api'
import { useSessionStore } from '../../stores/sessionStore'
import PrintHeader from '../../components/ui/PrintHeader'
import PrecioDual from '../../components/PrecioDual'
import { useTasaUsd } from '../../lib/moneda'

interface Consulta {
  id: string
  paciente_id: string
  medico_id: string
  fecha_hora: string
  motivo: string | null
  diagnostico: string | null
  notas: string | null
  estado: string
}

interface Paciente {
  id: string
  cedula: string
  nombre_completo: string
}

interface Medico {
  id: string
  nombre_completo: string
  especialidad: string | null
  categoria_medica: string | null
}

const today = () => new Date().toISOString().slice(0, 10)

export default function ConsultasPage() {
  const queryClient = useQueryClient()
  const profile = useSessionStore((s) => s.profile)
  const role = profile?.role ?? 'secretaria'

  const [fecha, setFecha] = useState(today())
  const [showForm, setShowForm] = useState(false)
  const [detalleId, setDetalleId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const { data: consultas = [], isLoading } = useQuery<Consulta[]>({
    queryKey: ['consultas', fecha],
    queryFn: async () => (await api.get('/consultas', { params: { fecha } })).data,
  })

  const { data: medicos = [] } = useQuery<Medico[]>({
    queryKey: ['consultas', 'medicos'],
    queryFn: async () => (await api.get('/consultas/medicos')).data,
    enabled: role !== 'medico',
  })

  const createConsulta = useMutation({
    mutationFn: (payload: unknown) => api.post('/consultas', payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['consultas'] })
      setShowForm(false)
      setError(null)
    },
    onError: (err) => setError(getApiError(err)),
  })

  function handleCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    createConsulta.mutate({
      paciente_id: fd.get('paciente_id'),
      medico_id: fd.get('medico_id') || undefined,
      fecha_hora: new Date(`${fd.get('fecha')}T${fd.get('hora') || '09:00'}:00`).toISOString(),
      motivo: fd.get('motivo'),
    })
  }

  return (
    <div className="space-y-5">
      <PrintHeader />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Agenda de consultas</h1>
          <p className="text-sm text-slate-500">{role === 'medico' ? 'Tus consultas' : 'Consultas de la clínica'}</p>
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
        >
          {showForm ? 'Cancelar' : '+ Nueva consulta'}
        </button>
      </div>

      <div className="flex items-center gap-3">
        <input
          type="date"
          value={fecha}
          onChange={(e) => setFecha(e.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
        />
      </div>

      {showForm && (
        <PacientePicker key={String(showForm)} onSubmit={handleCreate} medicos={medicos} role={role} error={error} submitting={createConsulta.isPending} />
      )}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        {isLoading ? (
          <p className="p-6 text-sm text-slate-500">Cargando…</p>
        ) : consultas.length === 0 ? (
          <p className="p-6 text-sm text-slate-500">No hay consultas para esta fecha.</p>
        ) : (
          <div className="grid divide-y divide-slate-100 sm:grid-cols-2 lg:grid-cols-3 sm:divide-y-0 sm:gap-4 sm:p-4">
            {consultas.map((c) => (
              <ConsultaCard
                key={c.id}
                consulta={c}
                isMine={role === 'medico' && c.medico_id === profile?.id}
                onClick={() => setDetalleId(c.id)}
              />
            ))}
          </div>
        )}
      </div>

      {detalleId && <DetalleModal consultaId={detalleId} onClose={() => setDetalleId(null)} />}
    </div>
  )
}

function ConsultaCard({ consulta, isMine, onClick }: { consulta: Consulta; isMine: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className="text-left p-4 sm:rounded-xl sm:border sm:border-slate-200 hover:border-slate-300 hover:bg-slate-50">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-slate-800">{new Date(consulta.fecha_hora).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
        <EstadoBadge estado={consulta.estado} />
      </div>
      <p className="mt-1 text-sm font-medium text-slate-700">{consulta.motivo ?? 'Sin motivo'}</p>
      {isMine && <p className="mt-1 text-xs text-brand-600">Tu consulta</p>}
      {consulta.diagnostico && <p className="mt-1 line-clamp-2 text-xs text-slate-500">{consulta.diagnostico}</p>}
    </button>
  )
}

function PacientePicker({ onSubmit, medicos, role, error, submitting }: {
  onSubmit: (e: FormEvent<HTMLFormElement>) => void
  medicos: Medico[]
  role: string
  error: string | null
  submitting: boolean
}) {
  const [q, setQ] = useState('')
  const { data: pacientes = [], isLoading } = useQuery<Paciente[]>({
    queryKey: ['pacientes', 'picker', q],
    queryFn: async () => (await api.get('/pacientes', { params: { q } })).data,
  })
  const [selectedId, setSelectedId] = useState('')
  const [especialidad, setEspecialidad] = useState('')

  const especialidades = [...new Set(medicos.map((m) => m.especialidad).filter(Boolean) as string[])].sort()
  const filtrados = especialidad ? medicos.filter((m) => m.especialidad === especialidad) : medicos

  return (
    <form onSubmit={onSubmit} className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-5">
      <div className="space-y-2">
        <label className="block text-sm font-medium text-slate-700">Buscar paciente *</label>
        <div className="flex gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cédula o nombre…"
            className="w-full max-w-md rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
          />
        </div>
        {isLoading ? (
          <p className="text-xs text-slate-500">Buscando…</p>
        ) : (
          <div className="max-h-40 overflow-y-auto rounded-lg border border-slate-200">
            {pacientes.map((p) => (
              <label key={p.id} className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm hover:bg-slate-50">
                <input type="radio" name="paciente_id" value={p.id} onChange={() => setSelectedId(p.id)} required />
                <span className="font-medium">{p.nombre_completo}</span>
                <span className="text-xs text-slate-400">{p.cedula}</span>
              </label>
            ))}
            {pacientes.length === 0 && <p className="px-3 py-2 text-xs text-slate-500">Escribe para buscar…</p>}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {role !== 'medico' && (
          <>
            <Field label="Especialidad *">
              <select
                value={especialidad}
                onChange={(e) => setEspecialidad(e.target.value)}
                required
                className={inputCls}
              >
                <option value="" disabled>Elegir…</option>
                {especialidades.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </Field>
            <Field label="Médico *">
              <select name="medico_id" required disabled={!especialidad} defaultValue="" className={inputCls}>
                <option value="" disabled>
                  {especialidad ? (filtrados.length ? 'Elegir…' : 'Sin médicos en esa especialidad') : 'Primero elige la especialidad'}
                </option>
                {filtrados.filter((m) => m.id).map((m) => (
                  <option key={m.id} value={m.id}>{m.nombre_completo}</option>
                ))}
              </select>
            </Field>
          </>
        )}
        <Field label="Fecha *"><input name="fecha" type="date" required defaultValue={today()} className={inputCls} /></Field>
        <Field label="Hora"><input name="hora" type="time" defaultValue="09:00" className={inputCls} /></Field>
        <Field label="Motivo"><input name="motivo" className={inputCls} /></Field>
      </div>

      <div>
        {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <button type="submit" disabled={submitting || !selectedId} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50">
          {submitting ? 'Agendando…' : 'Agendar consulta'}
        </button>
      </div>
    </form>
  )
}

function DetalleModal({ consultaId, onClose }: { consultaId: string; onClose: () => void }) {
  const queryClient = useQueryClient()
  const profile = useSessionStore((s) => s.profile)
  const [error, setError] = useState<string | null>(null)
  const [showSolicitud, setShowSolicitud] = useState(false)

  const { data: consulta, isLoading } = useQuery<Consulta & { paciente: Paciente }>({
    queryKey: ['consulta', consultaId],
    queryFn: async () => (await api.get(`/consultas/${consultaId}`)).data,
  })

  const { data: historial } = useQuery<{ consultas: Consulta[] }>({
    queryKey: ['consulta', consultaId, 'historial'],
    queryFn: async () => (await api.get(`/consultas/${consultaId}/historial`)).data,
  })

  const setDiagnostico = useMutation({
    mutationFn: (payload: unknown) => api.patch(`/consultas/${consultaId}/diagnostico`, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['consultas'] })
      queryClient.invalidateQueries({ queryKey: ['consulta', consultaId] })
      setError(null)
    },
    onError: (err) => setError(getApiError(err)),
  })

  function handleDiag(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    setDiagnostico.mutate({ diagnostico: fd.get('diagnostico'), notas: fd.get('notas') || undefined })
  }

  const esMedicoAutor = profile?.role === 'medico' && consulta?.medico_id === profile.id

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-6 sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between">
          <div>
            <h3 className="text-lg font-bold text-slate-800">{consulta?.paciente?.nombre_completo ?? '…'}</h3>
            <p className="text-sm text-slate-500">{consulta?.paciente?.cedula}</p>
          </div>
          <button onClick={onClose} className="text-xl text-slate-400 hover:text-slate-600">×</button>
        </div>

        {isLoading ? (
          <p className="mt-4 text-sm text-slate-500">Cargando…</p>
        ) : (
          <>
            <div className="mt-4 rounded-lg border border-slate-200 p-3 text-sm">
              <p className="text-slate-500">{consulta ? new Date(consulta.fecha_hora).toLocaleString() : ''} · <EstadoBadge estado={consulta!.estado} /></p>
              <p className="mt-1 text-slate-700">{consulta!.motivo ?? 'Sin motivo'}</p>
            </div>

            {esMedicoAutor && consulta!.estado !== 'cancelada' && (
              <button
                onClick={() => setShowSolicitud(true)}
                className="mt-3 rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
              >
                Solicitar exámenes de laboratorio
              </button>
            )}

            <div className="mt-4">
              <h4 className="mb-1 text-sm font-semibold text-slate-700">Diagnóstico</h4>
              {consulta?.diagnostico ? (
                <p className="rounded-lg bg-green-50 p-3 text-sm text-slate-700">{consulta.diagnostico}</p>
              ) : esMedicoAutor ? (
                <form onSubmit={handleDiag} className="space-y-2">
                  <textarea name="diagnostico" required placeholder="Diagnóstico…" rows={2} className={inputCls} />
                  <textarea name="notas" placeholder="Notas (opcional)" rows={2} className={inputCls} />
                  {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
                  <button type="submit" disabled={setDiagnostico.isPending} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50">
                    {setDiagnostico.isPending ? 'Guardando…' : 'Registrar diagnóstico y cerrar'}
                  </button>
                </form>
              ) : (
                <p className="text-xs text-slate-400">Pendiente.</p>
              )}
            </div>

            <div className="mt-4">
              <h4 className="mb-1 text-sm font-semibold text-slate-700">Historial del paciente</h4>
              <div className="space-y-2">
                {(historial?.consultas ?? []).slice(0, 5).map((c) => (
                  <div key={c.id} className="rounded-lg border border-slate-200 p-2 text-xs">
                    <span className="text-slate-400">{new Date(c.fecha_hora).toLocaleDateString()}</span>
                    {' — '}{c.motivo ?? 'Sin motivo'} {c.diagnostico && <span className="text-brand-600">· {c.diagnostico}</span>}
                  </div>
                ))}
                {(historial?.consultas ?? []).length === 0 && <p className="text-xs text-slate-400">Sin consultas previas.</p>}
              </div>
            </div>
          </>
        )}
      </div>

      {showSolicitud && consulta && (
        <SolicitarExamenes
          consultaId={consulta.id}
          pacienteId={consulta.paciente_id}
          onClose={() => setShowSolicitud(false)}
        />
      )}
    </div>
  )
}

function SolicitarExamenes({ consultaId, pacienteId, onClose }: { consultaId: string; pacienteId: string; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const tasaUsd = useTasaUsd()

  const { data: examenes = [] } = useQuery<{ id: string; nombre: string; precio: number; categoria: string | null }[]>({
    queryKey: ['examenes'],
    queryFn: async () => (await api.get('/examenes')).data,
  })

  const crear = useMutation({
    mutationFn: () => api.post('/solicitudes', { consulta_id: consultaId, paciente_id: pacienteId, examenes: [...selected] }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['solicitudes'] })
      onClose()
    },
    onError: (e) => setError(getApiError(e)),
  })

  const total = examenes.filter((e) => selected.has(e.id)).reduce((acc, e) => acc + e.precio, 0)

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-6 sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between">
          <h3 className="text-lg font-bold text-slate-800">Solicitar exámenes</h3>
          <button onClick={onClose} className="text-xl text-slate-400 hover:text-slate-600">×</button>
        </div>

        <div className="mt-4 space-y-2">
          {examenes.map((e) => (
            <label key={e.id} className="flex cursor-pointer items-center justify-between rounded-lg border border-slate-200 p-3 hover:bg-slate-50">
              <div>
                <p className="text-sm font-medium text-slate-800">{e.nombre}</p>
                <p className="text-xs text-slate-400">{e.categoria ?? 'General'}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm text-slate-600"><PrecioDual usd={e.precio} tasaUsd={tasaUsd} /></span>
                <input type="checkbox" checked={selected.has(e.id)} onChange={() => toggle(e.id)} className="h-4 w-4 accent-brand-600" />
              </div>
            </label>
          ))}
          {examenes.length === 0 && <p className="text-sm text-slate-500">Catálogo vacío.</p>}
        </div>

        {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        <div className="mt-4 flex items-center justify-between">
          <span className="text-sm font-bold text-slate-800">Total: <PrecioDual usd={total} tasaUsd={tasaUsd} /></span>
          <button
            onClick={() => crear.mutate()}
            disabled={selected.size === 0 || crear.isPending}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {crear.isPending ? 'Enviando…' : 'Enviar solicitud'}
          </button>
        </div>
      </div>
    </div>
  )
}

function EstadoBadge({ estado }: { estado: string }) {
  const styles: Record<string, string> = {
    programada: 'bg-blue-100 text-blue-700',
    en_curso: 'bg-amber-100 text-amber-700',
    completada: 'bg-green-100 text-green-700',
    cancelada: 'bg-slate-200 text-slate-600',
  }
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${styles[estado] ?? 'bg-slate-200 text-slate-600'}`}>{estado.replace('_', ' ')}</span>
}

const inputCls = 'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100'

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-700">{label}</span>
      {children}
    </label>
  )
}