import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { useSessionStore } from '../../stores/sessionStore'
import StatCard from './StatCard'
import PrecioDual from '../../components/PrecioDual'
import { useTasaUsd } from '../../lib/moneda'
import { EmptyRow, LoadingRow, SectionCard } from './helpers'
import { duracionLegible, fechaHoyIso } from './dashboardUtils'

interface Turno {
  id: string
  estado: string
  hora_llamado: string | null
  hora_atendido: string | null
  paciente: { id: string; cedula: string; nombre_completo: string } | null
}
interface Notificacion {
  id: string
  estado: string
  mensaje: string
  programada_para: string | null
  tipo: string
}
interface Domicilio {
  id: string
  estado: string
}
interface Consulta {
  id: string
  paciente_id: string
  estado: string
  fecha_hora: string
  motivo: string | null
  paciente: { id: string; cedula: string; nombre_completo: string } | null
}
interface ReportePagos {
  total: number
  total_usd: number
  total_bs: number | null
  tasa_usd: number | null
  count: number
}

const acciones = [
  { label: 'Registrar paciente', to: '/pacientes', descripcion: 'Alta rápida de pacientes' },
  { label: 'Caja y facturación', to: '/pagos', descripcion: 'Cobros y reporte del día' },
  { label: 'Recordatorios', to: '/notificaciones', descripcion: 'Notificaciones a pacientes' },
]

export default function SecretariaDashboard() {
  const { profile } = useSessionStore()
  const tasaUsd = useTasaUsd()
  const hoy = fechaHoyIso()

  const { data: turnos = [], isLoading: cargandoTurnos } = useQuery<Turno[]>({
    queryKey: ['turnos', 'resumen'],
    queryFn: async () => (await api.get('/turnos')).data,
    refetchInterval: 30_000,
  })
  const { data: notificaciones = [] } = useQuery<Notificacion[]>({
    queryKey: ['notificaciones', 'resumen'],
    queryFn: async () => (await api.get('/notificaciones')).data,
  })
  const { data: domicilios = [] } = useQuery<Domicilio[]>({
    queryKey: ['domicilios', 'resumen'],
    queryFn: async () => (await api.get('/domicilios')).data,
  })
  const { data: consultas = [], isLoading: cargandoCitas } = useQuery<Consulta[]>({
    queryKey: ['consultas', 'hoy', 'resumen'],
    queryFn: async () => (await api.get('/consultas', { params: { fecha: hoy } })).data,
    refetchInterval: 60_000,
  })
  const { data: reporte, isLoading: cargandoCaja } = useQuery<ReportePagos>({
    queryKey: ['pagos', 'hoy', 'resumen'],
    queryFn: async () => (await api.get('/pagos', { params: { desde: hoy, hasta: hoy } })).data,
    refetchInterval: 60_000,
  })

  const enCola = turnos.filter((t) => t.estado === 'esperando' || t.estado === 'llamado')
  const domiciliosActivos = domicilios.filter((d) => d.estado === 'programada' || d.estado === 'en_ruta').length
  const recordatorios = notificaciones.filter((n) => n.estado === 'pendiente')
  const proximosRecordatorios = recordatorios.slice(0, 4)

  const citas = useMemo(
    () =>
      consultas
        .filter((c) => c.estado === 'programada' || c.estado === 'en_curso')
        .sort((a, b) => a.fecha_hora.localeCompare(b.fecha_hora)),
    [consultas],
  )
  const completadasHoy = consultas.filter((c) => c.estado === 'completada').length

  const duracionMediaTurno = useMemo(() => {
    const atendidos = turnos.filter((t) => t.estado === 'atendido' && t.hora_llamado && t.hora_atendido)
    if (atendidos.length === 0) return 0
    const total = atendidos.reduce((acc, t) => acc + (new Date(t.hora_atendido!).getTime() - new Date(t.hora_llamado!).getTime()), 0)
    return total / atendidos.length
  }, [turnos])

  const proyeccionTurno = useMemo(() => {
    if (enCola.length === 0) return null
    if (duracionMediaTurno <= 0) return { proximo: 0, cola: 0, sinBase: true }
    return { proximo: duracionMediaTurno, cola: duracionMediaTurno * enCola.length, sinBase: false }
  }, [enCola, duracionMediaTurno])

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-800">Bienvenida, {profile?.nombre_completo}</h2>
        <p className="text-sm text-slate-500">Resumen operativo del día en la recepción.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Pacientes en cola" valor={enCola.length} tono={enCola.length > 0 ? 'warning' : 'success'} hint="Turnos esperando o llamados" to="/turnos" />
        <StatCard label="Citas de hoy" valor={citas.length} hint={`${completadasHoy} completadas`} to="/consultas" />
        <StatCard label="Domicilios" valor={domiciliosActivos} hint="Programadas / en ruta" to="/domicilios" />
        <StatCard label="Recordatorios" valor={recordatorios.length} tono={recordatorios.length > 0 ? 'warning' : 'default'} hint="Notificaciones pendientes" to="/notificaciones" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard titulo="Caja del día" acciones={<Link to="/pagos" className="text-xs font-medium text-brand-600 hover:underline">Caja →</Link>}>
          {cargandoCaja ? (
            <LoadingRow mensaje="Calculando caja…" />
          ) : (
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                <p className="text-2xl font-bold text-emerald-700">
                  <PrecioDual usd={reporte?.total_usd ?? 0} tasaUsd={tasaUsd} bs={reporte?.total_bs} />
                </p>
                <p className="text-xs text-emerald-700">Cobrado hoy</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="text-2xl font-bold text-slate-800">{reporte?.count ?? 0}</p>
                <p className="text-xs text-slate-500">Movimientos</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="text-2xl font-bold text-slate-800">{completadasHoy}</p>
                <p className="text-xs text-slate-500">Citas completadas</p>
              </div>
            </div>
          )}
        </SectionCard>

        <SectionCard
          titulo="Próximas citas"
          acciones={<Link to="/consultas" className="text-xs font-medium text-brand-600 hover:underline">Agenda →</Link>}
        >
          {cargandoCitas ? (
            <LoadingRow mensaje="Cargando citas…" />
          ) : citas.length === 0 ? (
            <EmptyRow>Sin citas programadas para hoy.</EmptyRow>
          ) : (
            <ul className="space-y-2">
              {citas.slice(0, 5).map((c) => (
                <li
                  key={c.id}
                  className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-xs"
                >
                  <span className="truncate text-slate-700">{c.paciente?.nombre_completo ?? 'Paciente'}</span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="font-medium text-slate-500">
                      {new Date(c.fecha_hora).toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] uppercase ${c.estado === 'en_curso' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>
                      {c.estado.replace('_', ' ')}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>

      <SectionCard titulo="Sala de espera" acciones={<Link to="/turnos" className="text-xs font-medium text-brand-600 hover:underline">Gestionar →</Link>}>
        {cargandoTurnos ? (
          <LoadingRow mensaje="Cargando turnos…" />
        ) : enCola.length === 0 ? (
          <EmptyRow>Sin turnos en cola. Sala de espera despejada.</EmptyRow>
        ) : (
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-3">
              <span className="text-3xl font-bold text-slate-800">{enCola.length}</span>
              <span className="text-xs text-slate-500">en cola ahora</span>
            </div>
            <div className="rounded-lg bg-brand-50 px-3 py-2 text-xs text-brand-800">
              {proyeccionTurno?.sinBase ? (
                'Sin base de tiempos para estimar la espera todavía.'
              ) : proyeccionTurno ? (
                <>
                  El próximo turno se estima en <strong>{duracionLegible(proyeccionTurno.proximo)}</strong> · la cola se
                  despeja en <strong>{duracionLegible(proyeccionTurno.cola)}</strong>
                </>
              ) : null}
            </div>
          </div>
        )}
      </SectionCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard
          titulo="Próximos recordatorios"
          acciones={<Link to="/notificaciones" className="text-xs font-medium text-brand-600 hover:underline">Ver todos →</Link>}
        >
          {proximosRecordatorios.length === 0 ? (
            <EmptyRow>Sin recordatorios pendientes de envío.</EmptyRow>
          ) : (
            <ul className="space-y-2">
              {proximosRecordatorios.map((n) => (
                <li key={n.id} className="flex items-start justify-between gap-2 text-xs">
                  <span className="min-w-0 truncate text-slate-700">{n.mensaje}</span>
                  <span className="shrink-0 text-slate-400">
                    {n.programada_para
                      ? new Date(n.programada_para).toLocaleString('es-VE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
                      : '—'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard titulo="Accesos rápidos">
          <div className="grid gap-4 sm:grid-cols-3">
            {acciones.map((a) => (
              <Link
                key={a.to}
                to={a.to}
                className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-brand-400"
              >
                <h3 className="text-sm font-semibold text-brand-700">{a.label}</h3>
                <p className="mt-1 text-xs text-slate-500">{a.descripcion}</p>
              </Link>
            ))}
          </div>
        </SectionCard>
      </div>
    </div>
  )
}