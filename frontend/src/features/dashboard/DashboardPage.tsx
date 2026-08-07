import { Navigate } from 'react-router-dom'
import { useSessionStore } from '../../stores/sessionStore'
import { ROL_LABELS } from '../../lib/rbac'
import MedicoDashboard from './MedicoDashboard'
import SecretariaDashboard from './SecretariaDashboard'
import LaboratorioDashboard from './LaboratorioDashboard'
import AdminDashboard from './AdminDashboard'

/** Página de inicio según el rol activo del usuario. */
export default function DashboardPage() {
  const { profile } = useSessionStore()
  if (!profile) return <Navigate to="/login" replace />

  switch (profile.role) {
    case 'medico':
      return <MedicoDashboard />
    case 'laboratorio':
      return <LaboratorioDashboard />
    case 'secretaria':
      return <SecretariaDashboard />
    case 'admin':
    case 'super_root':
      return <AdminDashboard />
    default:
      return (
        <div>
          <h2 className="text-xl font-bold text-slate-800">
            Bienvenido, {profile.nombre_completo}
          </h2>
          <p className="text-sm text-slate-500">Rol: {ROL_LABELS[profile.role] ?? profile.role}</p>
        </div>
      )
  }
}
