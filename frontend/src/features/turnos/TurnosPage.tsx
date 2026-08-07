import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { api, getApiError } from '../../lib/api'
import PrintHeader from '../../components/ui/PrintHeader'

interface Turno {
  id: string
  numero: number
  fecha: string
  estado: 'esperando' | 'llamado' | 'atendido' | 'saltado' | 'cancelado'
  prioridad: 'normal' | 'prioridad' | 'urgente'
  hora_creado: string
  hora_llamado: string | null
  hora_atendido: string | null
  paciente: { id: string; cedula: string; nombre_completo: string } | null
}

interface Paciente {
  id: string
  cedula: string
  nombre_completo: string
}

const PRIORIDAD_LABEL: Record<string, string> = { normal: 'Normal', prioridad: 'Prioridad', urgente: 'Urgente' }

export default function TurnosPage() {
  const queryClient = useQueryClient()
  const [error, setError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [selectedPaciente, setSelectedPaciente] = useState<string>('')
  const [prioridad, setPrioridad] = useState<'normal' | 'prioridad' | 'urgente'>('normal')

  const { data: turnos = [], isLoading } = useQuery<Turno[]>({
    queryKey: ['turnos', 'hoy'],
    queryFn: async () => (await api.get('/turnos')).data,
  })

  const { data: pacientes = [] } = useQuery<Paciente[]>({
    queryKey: ['pacientes', 'turnos'],
    queryFn: async () => (await api.get('/pacientes')).data,
    enabled: showForm,
  })

  const crearTurno = useMutation({
    mutationFn: (payload: { paciente_id: string; prioridad?: string }) => api.post('/turnos', payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['turnos'] })
      setShowForm(false)
      setSelectedPaciente('')
      setError(null)
    },
    onError: (e) => setError(getApiError(e)),
  })

  const cambiarEstado = useMutation({
    mutationFn: ({ id, estado }: { id: string; estado: string }) => api.patch(`/turnos/${id}/estado`, { estado }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['turnos'] }),
    onError: (e) => setError(getApiError(e)),
  })

  const activos = turnos.filter((t) => t.estado === 'esperando' || t.estado === 'llamado')
  const atendidos = turnos.filter((t) => t.estado === 'atendido')

  return (
    <div className="space-y-6">
      <PrintHeader />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Sala de espera</h1>
          <p className="text-sm text-slate-500">Control de turnos del día · {new Date().toLocaleDateString()}</p>
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
        >
          {showForm ? 'Cancelar' : '+ Nuevo turno'}
        </button>
      </div>

      {showForm && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Paciente *">
              <select
                value={selectedPaciente}
                onChange={(e) => setSelectedPaciente(e.target.value)}
                className={inputCls}
              >
                <option value="">Selecciona…</option>
                {pacientes.map((p) => (
                  <option key={p.id} value={p.id}>{p.nombre_completo} · {p.cedula}</option>
                ))}
              </select>
            </Field>
            <Field label="Prioridad">
              <select value={prioridad} onChange={(e) => setPrioridad(e.target.value as typeof prioridad)} className={inputCls}>
                <option value="normal">Normal</option>
                <option value="prioridad">Prioridad</option>
                <option value="urgente">Urgente</option>
              </select>
            </Field>
          </div>
          {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <button
            onClick={() => selectedPaciente && crearTurno.mutate({ paciente_id: selectedPaciente, prioridad })}
            disabled={!selectedPaciente || crearTurno.isPending}
            className="mt-4 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {crearTurno.isPending ? 'Creando…' : 'Generar turno'}
          </button>
        </div>
      )}

      <section>
        <h2 className="mb-3 text-sm font-semibold text-slate-700">En espera ({activos.length})</h2>
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          {isLoading ? (
            <p className="p-6 text-sm text-slate-500">Cargando…</p>
          ) : activos.length === 0 ? (
            <p className="p-6 text-sm text-slate-500">Sin turnos activos.</p>
          ) : (
            <div className="grid gap-px bg-slate-100 sm:grid-cols-2 lg:grid-cols-3">
              {activos.map((t) => (
                <TurnoCard key={t.id} turno={t} onEstado={(estado) => cambiarEstado.mutate({ id: t.id, estado })} />
              ))}
            </div>
          )}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-slate-700">Atendidos ({atendidos.length})</h2>
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          {atendidos.length === 0 ? (
            <p className="p-6 text-sm text-slate-500">Sin turnos atendidos todavía.</p>
          ) : (
            <div className="grid gap-px bg-slate-100 sm:grid-cols-2 lg:grid-cols-3">
              {atendidos.map((t) => (
                <TurnoCard key={t.id} turno={t} onEstado={(estado) => cambiarEstado.mutate({ id: t.id, estado })} />
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  )
}

function TurnoCard({ turno, onEstado }: { turno: Turno; onEstado: (estado: string) => void }) {
  const llamando = turno.estado === 'llamado'
  return (
    <div className={`flex flex-col gap-3 bg-white p-4 ${llamando ? 'ring-2 ring-inset ring-amber-400' : ''}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className={`text-3xl font-bold ${llamando ? 'text-amber-600' : 'text-slate-800'}`}>#{turno.numero}</p>
          <p className="text-sm font-medium text-slate-800">{turno.paciente?.nombre_completo ?? '—'}</p>
          <p className="text-xs text-slate-500">{turno.paciente?.cedula ?? ''}</p>
        </div>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${prioridadCls(turno.prioridad)}`}>
          {PRIORIDAD_LABEL[turno.prioridad]}
        </span>
      </div>

      {turno.estado === 'esperando' && (
        <button
          onClick={() => onEstado('llamado')}
          className="rounded-lg bg-amber-500 px-3 py-2 text-xs font-semibold text-white transition hover:bg-amber-600"
        >
          Llamar
        </button>
      )}
      {llamando && (
        <div className="flex gap-2">
          <button
            onClick={() => onEstado('atendido')}
            className="flex-1 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-emerald-700"
          >
            Atender
          </button>
          <button
            onClick={() => onEstado('saltado')}
            className="flex-1 rounded-lg bg-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-300"
          >
            Saltar
          </button>
          <button
            onClick={() => onEstado('cancelado')}
            className="flex-1 rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-600 transition hover:bg-red-100"
          >
            Cancelar
          </button>
        </div>
      )}
      {turno.estado === 'atendido' && (
        <p className="text-xs text-slate-400">Atendido {turno.hora_atendido ? new Date(turno.hora_atendido).toLocaleTimeString() : ''}</p>
      )}
      {(turno.estado === 'saltado' || turno.estado === 'cancelado') && (
        <p className="text-xs font-medium uppercase text-slate-400">{turno.estado}</p>
      )}
    </div>
  )
}

function prioridadCls(p: string) {
  return p === 'urgente' ? 'bg-red-100 text-red-700'
    : p === 'prioridad' ? 'bg-amber-100 text-amber-700'
    : 'bg-slate-100 text-slate-600'
}

const inputCls = 'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100'

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block"><span className="mb-1 block text-sm font-medium text-slate-700">{label}</span>{children}</label>
  )
}