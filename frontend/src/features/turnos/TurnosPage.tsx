import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useRef, useState, type ReactNode, type Ref } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api, getApiError } from '../../lib/api'
import PrintHeader from '../../components/ui/PrintHeader'
import type { Paciente } from '../../lib/types'

interface Turno {
  id: string
  paciente_id: string
  consulta_id: string | null
  numero: number
  fecha: string
  estado: 'esperando' | 'llamado' | 'atendido' | 'saltado' | 'cancelado'
  prioridad: 'normal' | 'prioridad' | 'urgente'
  hora_creado: string
  hora_llamado: string | null
  hora_atendido: string | null
  paciente: { id: string; cedula: string; nombre_completo: string } | null
  medico: { nombre_completo: string; especialidad: string | null } | null
  hora_cita: string | null
}

interface Medico {
  id: string
  nombre_completo: string
  especialidad: string | null
}

interface CitaHoy {
  id: string
  paciente_id: string
  estado: string
}

const fechaHoy = () => new Date().toISOString().slice(0, 10)

const PRIORIDAD_LABEL: Record<string, string> = { normal: 'Normal', prioridad: 'Prioridad', urgente: 'Urgente' }

export default function TurnosPage() {
  const queryClient = useQueryClient()
  const [searchParams] = useSearchParams()
  const consultaDestacada = searchParams.get('consulta')
  const [error, setError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [selectedPaciente, setSelectedPaciente] = useState<string>('')
  const [prioridad, setPrioridad] = useState<'normal' | 'prioridad' | 'urgente'>('normal')
  const [especialidad, setEspecialidad] = useState('')
  const [medicoId, setMedicoId] = useState('')

  const { data: turnos = [], isLoading } = useQuery<Turno[]>({
    queryKey: ['turnos', 'hoy'],
    queryFn: async () => (await api.get('/turnos')).data,
    refetchInterval: 10000,
  })

  const turnoDestacado = useMemo(
    () => (consultaDestacada ? turnos.find((t) => t.consulta_id === consultaDestacada) ?? null : null),
    [turnos, consultaDestacada],
  )
  const destacadoRef = useRef<HTMLDivElement | null>(null)
  const turnoDestacadoId = turnoDestacado?.id

  useEffect(() => {
    if (turnoDestacadoId) {
      destacadoRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [turnoDestacadoId])

  const { data: pacientes = [] } = useQuery<Paciente[]>({
    queryKey: ['pacientes', 'turnos'],
    queryFn: async () => (await api.get('/pacientes')).data,
    enabled: showForm,
  })

  const { data: citasHoy = [] } = useQuery<CitaHoy[]>({
    queryKey: ['consultas', 'turnos', 'hoy'],
    queryFn: async () => (await api.get('/consultas', { params: { fecha: fechaHoy() } })).data,
    enabled: showForm,
  })

  const { data: medicos = [] } = useQuery<Medico[]>({
    queryKey: ['turnos', 'medicos'],
    queryFn: async () => (await api.get('/consultas/medicos')).data,
  })

  const especialidades = [...new Set(medicos.map((m) => m.especialidad).filter(Boolean) as string[])].sort()
  const medicosPorEspecialidad = especialidad ? medicos.filter((m) => m.especialidad === especialidad) : medicos

  const crearTurno = useMutation({
    mutationFn: (payload: { paciente_id: string; consulta_id?: string; prioridad?: string; medico_id?: string }) => api.post('/turnos', payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['turnos'] })
      queryClient.invalidateQueries({ queryKey: ['consultas'] })
      setShowForm(false)
      setSelectedPaciente('')
      setEspecialidad('')
      setMedicoId('')
      setError(null)
    },
    onError: (e) => setError(getApiError(e)),
  })

  const cambiarEstado = useMutation({
    mutationFn: ({ id, estado }: { id: string; estado: string }) => api.patch(`/turnos/${id}/estado`, { estado }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['turnos'] })
      queryClient.invalidateQueries({ queryKey: ['consultas'] })
    },
    onError: (e) => setError(getApiError(e)),
  })

  const asignarMedico = useMutation({
    mutationFn: ({ id, medico_id }: { id: string; medico_id: string }) => api.patch(`/turnos/${id}/medico`, { medico_id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['turnos'] })
      queryClient.invalidateQueries({ queryKey: ['consultas'] })
    },
    onError: (e) => setError(getApiError(e)),
  })

  function asignarMedicoDeTurno(id: string, medico: string) {
    asignarMedico.mutate({ id, medico_id: medico })
  }

  const enAtencion = turnos.filter((t) => t.estado === 'llamado')
  const enEspera = turnos.filter((t) => t.estado === 'esperando')
  const atendidos = turnos.filter((t) => t.estado === 'atendido')

  const citaPaciente = selectedPaciente
    ? citasHoy.find((c) => c.paciente_id === selectedPaciente && (c.estado === 'programada' || c.estado === 'en_curso'))
    : undefined
  const turnoPacienteYaExiste = selectedPaciente
    ? turnos.find((t) => t.paciente_id === selectedPaciente && (t.estado === 'esperando' || t.estado === 'llamado'))
    : undefined

  function generarTurno() {
    if (!selectedPaciente || turnoPacienteYaExiste) return
    crearTurno.mutate({
      paciente_id: selectedPaciente,
      consulta_id: citaPaciente?.id,
      prioridad,
      medico_id: medicoId || undefined,
    })
  }

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
            <Field label="Especialidad">
              <select
                value={especialidad}
                onChange={(e) => { setEspecialidad(e.target.value); setMedicoId('') }}
                className={inputCls}
              >
                <option value="">Selecciona…</option>
                {especialidades.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </Field>
            <Field label="Médico">
              <select
                value={medicoId}
                onChange={(e) => setMedicoId(e.target.value)}
                disabled={!especialidad}
                className={inputCls}
              >
                <option value="">
                  {especialidad ? (medicosPorEspecialidad.length ? 'Elegir…' : 'Sin médicos en esa especialidad') : 'Primero elige la especialidad'}
                </option>
                {medicosPorEspecialidad.map((m) => (
                  <option key={m.id} value={m.id}>{m.nombre_completo}</option>
                ))}
              </select>
            </Field>
          </div>
          <p className="mt-3 text-xs text-slate-500">
            La fecha y la hora se generan automáticamente para hoy, posterior al último paciente en cola.
          </p>
          {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          {selectedPaciente && turnoPacienteYaExiste && (
            <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">
              Este paciente ya está en la cola con el turno #{turnoPacienteYaExiste.numero}.
            </p>
          )}
          {selectedPaciente && citaPaciente && !turnoPacienteYaExiste && (
            <p className="mt-3 rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-700">
              Se vinculará a la consulta programada de hoy del paciente.
            </p>
          )}
          <button
            onClick={generarTurno}
            disabled={!selectedPaciente || Boolean(turnoPacienteYaExiste) || crearTurno.isPending}
            className="mt-4 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {crearTurno.isPending ? 'Creando…' : 'Generar turno'}
          </button>
        </div>
      )}

      <SeccionTurnos
        titulo="En atención"
        turnos={enAtencion}
        esVacia={() => isLoading ? 'Cargando…' : 'Sin turnos en atención.'}
        turnoDestacadoId={turnoDestacadoId}
        destacadoRef={destacadoRef}
        onEstado={cambiarEstado.mutate}
        medicos={medicos}
        onAsignarMedico={asignarMedicoDeTurno}
        guardando={asignarMedico.isPending}
        error={error}
      />

      <SeccionTurnos
        titulo="En espera"
        turnos={enEspera}
        esVacia={() => isLoading ? 'Cargando…' : 'Sin turnos en espera.'}
        turnoDestacadoId={turnoDestacadoId}
        destacadoRef={destacadoRef}
        onEstado={cambiarEstado.mutate}
        medicos={medicos}
        onAsignarMedico={asignarMedicoDeTurno}
        guardando={asignarMedico.isPending}
        error={error}
      />

      <SeccionTurnos
        titulo="Atendidos"
        turnos={atendidos}
        esVacia={() => 'Sin turnos atendidos todavía.'}
        turnoDestacadoId={turnoDestacadoId}
        destacadoRef={destacadoRef}
        onEstado={cambiarEstado.mutate}
        medicos={medicos}
        onAsignarMedico={asignarMedicoDeTurno}
        guardando={asignarMedico.isPending}
        error={error}
      />
    </div>
  )
}

function SeccionTurnos({ titulo, turnos, esVacia, turnoDestacadoId, destacadoRef, onEstado, medicos, onAsignarMedico, guardando, error }: {
  titulo: string
  turnos: Turno[]
  esVacia: () => string
  turnoDestacadoId?: string | null
  destacadoRef?: Ref<HTMLDivElement>
  onEstado: (payload: { id: string; estado: string }) => void
  medicos: Medico[]
  onAsignarMedico: (id: string, medicoId: string) => void
  guardando?: boolean
  error?: string | null
}) {
  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold text-slate-700">{titulo} ({turnos.length})</h2>
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        {turnos.length === 0 ? (
          <p className="p-6 text-sm text-slate-500">{esVacia()}</p>
        ) : (
          <div className="grid gap-px bg-slate-100 sm:grid-cols-2 lg:grid-cols-3">
            {turnos.map((t) => (
              <TurnoCard
                key={t.id}
                turno={t}
                destacado={turnoDestacadoId === t.id}
                ref={turnoDestacadoId === t.id ? destacadoRef : undefined}
                onEstado={(estado) => onEstado({ id: t.id, estado })}
                medicos={medicos}
                onAsignarMedico={(medicoId) => onAsignarMedico(t.id, medicoId)}
                guardando={guardando}
                error={error}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  )
}

function TurnoCard({ turno, destacado, ref, onEstado, medicos, onAsignarMedico, guardando, error }: {
  turno: Turno
  destacado?: boolean
  ref?: Ref<HTMLDivElement>
  onEstado: (estado: string) => void
  medicos: Medico[]
  onAsignarMedico: (medicoId: string) => void
  guardando?: boolean
  error?: string | null
}) {
  const llamando = turno.estado === 'llamado'
  const [esp, setEsp] = useState('')
  const [med, setMed] = useState('')
  const especialidades = [...new Set(medicos.map((m) => m.especialidad).filter(Boolean) as string[])].sort()
  const medicosFiltrados = esp ? medicos.filter((m) => m.especialidad === esp) : medicos
  return (
    <div
      ref={ref}
      className={`flex scroll-mt-6 flex-col gap-3 bg-white p-4 ${
        destacado ? 'ring-2 ring-inset ring-brand-500' : llamando ? 'ring-2 ring-inset ring-amber-400' : ''
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className={`text-3xl font-bold ${llamando ? 'text-amber-600' : 'text-slate-800'}`}>#{turno.numero}</p>
          <p className="text-sm font-medium text-slate-800">{turno.paciente?.nombre_completo ?? '—'}</p>
          <p className="text-xs text-slate-500">{turno.paciente?.cedula ?? ''}</p>
          {turno.medico ? (
            <p className="mt-0.5 text-xs text-brand-700">
              {[turno.medico.especialidad, turno.medico.nombre_completo].filter(Boolean).join(' · ')}
            </p>
          ) : (
            <p className="mt-0.5 text-xs italic text-slate-400">Médico por asignar</p>
          )}
          {turno.hora_cita && (
            <p className="mt-0.5 text-xs text-slate-400">
              Atención ~ {new Date(turno.hora_cita).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </p>
          )}
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
      {llamando && !turno.medico && (
        <div className="space-y-2 rounded-lg bg-slate-50 p-3">
          <select value={esp} onChange={(e) => { setEsp(e.target.value); setMed('') }} className={inputCls}>
            <option value="">Especialidad…</option>
            {especialidades.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <select value={med} onChange={(e) => setMed(e.target.value)} disabled={!esp} className={inputCls}>
            <option value="">
              {esp ? (medicosFiltrados.length ? 'Médico…' : 'Sin médicos en esa especialidad') : 'Primero elige la especialidad'}
            </option>
            {medicosFiltrados.map((m) => (
              <option key={m.id} value={m.id}>{m.nombre_completo}</option>
            ))}
          </select>
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
          <button
            onClick={() => { if (med) onAsignarMedico(med) }}
            disabled={!med || guardando}
            className="w-full rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50"
          >
            {guardando ? 'Guardando…' : 'Actualizar'}
          </button>
          <div className="flex gap-2">
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
        </div>
      )}
      {llamando && turno.medico && (
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