import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { api } from '../../lib/api'
import { useSessionStore } from '../../stores/sessionStore'
import StatCard from './StatCard'

interface Staff {
  id: string
  role: string
  roles: string[]
  activo: boolean
}
interface Reporteria {
  total: number
  total_bs: number
  count: number
  tasa_usd: number
}

const acciones = [
  { label: 'Gestión de personal', to: '/admin', descripcion: 'Perfiles, roles y especialidades' },
  { label: 'Historial clínico', to: '/historial', descripcion: 'Expedientes y correcciones' },
  { label: 'Reporte de caja', to: '/pagos', descripcion: 'Cobros del día' },
  { label: 'Catálogo de laboratorio', to: '/admin', descripcion: 'Exámenes y parámetros' },
]

export default function AdminDashboard() {
  const { profile } = useSessionStore()

  const { data: staff = [] } = useQuery<Staff[]>({
    queryKey: ['admin', 'staff', 'resumen'],
    queryFn: async () => (await api.get('/admin/staff')).data,
  })
  const { data: reporteria } = useQuery<Reporteria>({
    queryKey: ['admin', 'reporteria', 'resumen'],
    queryFn: async () => (await api.get('/admin/reporteria')).data,
  })

  const activos = staff.filter((s) => s.activo).length
  const medicos = staff.filter((s) => s.roles.includes('medico')).length
  const lab = staff.filter((s) => s.roles.includes('laboratorio')).length
  const secretarias = staff.filter((s) => s.roles.includes('secretaria')).length

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-800">Dashboard administrativo</h2>
        <p className="text-sm text-slate-500">Gestión institucional, {profile?.nombre_completo}.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Personal activo" valor={activos} hint={`${staff.length} registrados`} />
        <StatCard label="Médicos" valor={medicos} hint="Con colegiatura y especialidades" />
        <StatCard label="Laboratorio" valor={lab} hint="Bioanalistas" />
        <StatCard label="Secretaría" valor={secretarias} hint="Recepción" />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Ingresos del período" valor={reporteria ? `$${reporteria.total.toFixed(2)}` : '—'} tono="success" hint={reporteria ? `Bs ${reporteria.total_bs.toFixed(2)}` : undefined} />
        <StatCard label="Movimientos" valor={reporteria?.count ?? '—'} hint="Pagos registrados" />
        <StatCard label="Tasa de referencia" valor={reporteria?.tasa_usd ? `Bs ${reporteria.tasa_usd}` : '—'} hint="Del día" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {acciones.map((a) => (
          <Link
            key={a.to + a.label}
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
