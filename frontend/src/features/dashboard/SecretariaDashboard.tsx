import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { api } from '../../lib/api'
import { useSessionStore } from '../../stores/sessionStore'
import StatCard from './StatCard'

interface Turno {
  id: string
  estado: string
}
interface Notificacion {
  id: string
  estado: string
}
interface Domicilio {
  id: string
  estado: string
}

const acciones = [
  { label: 'Registrar paciente', to: '/pacientes', descripcion: 'Alta rápida de pacientes' },
  { label: 'Caja y facturación', to: '/pagos', descripcion: 'Cobros y reporte del día' },
  { label: 'Recordatorios', to: '/notificaciones', descripcion: 'Notificaciones a pacientes' },
]

export default function SecretariaDashboard() {
  const { profile } = useSessionStore()

  const { data: turnos = [] } = useQuery<Turno[]>({
    queryKey: ['turnos', 'resumen'],
    queryFn: async () => (await api.get('/turnos')).data,
  })
  const { data: notificaciones = [] } = useQuery<Notificacion[]>({
    queryKey: ['notificaciones', 'resumen'],
    queryFn: async () => (await api.get('/notificaciones')).data,
  })
  const { data: domicilios = [] } = useQuery<Domicilio[]>({
    queryKey: ['domicilios', 'resumen'],
    queryFn: async () => (await api.get('/domicilios')).data,
  })

  const enCola = turnos.filter((t) => t.estado === 'esperando' || t.estado === 'llamado').length
  const domiciliosActivos = domicilios.filter((d) => d.estado === 'programada' || d.estado === 'en_ruta').length
  const recordatorios = notificaciones.filter((n) => n.estado === 'pendiente').length

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-800">Bienvenida, {profile?.nombre_completo}</h2>
        <p className="text-sm text-slate-500">Resumen operativo del día en la recepción.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Pacientes en cola" valor={enCola} tono={enCola > 0 ? 'warning' : 'success'} hint="Turnos esperando o llamados" to="/turnos" />
        <StatCard label="Domicilios" valor={domiciliosActivos} hint="Programadas / en ruta" to="/domicilios" />
        <StatCard label="Recordatorios" valor={recordatorios} tono={recordatorios > 0 ? 'warning' : 'default'} hint="Notificaciones pendientes" to="/notificaciones" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
    </div>
  )
}
