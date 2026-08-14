import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { lazy, Suspense, useEffect, type ReactNode } from 'react'
import { useSessionStore } from './stores/sessionStore'
import { useConfigStore } from './lib/configStore'
import StaffLayout from './layouts/StaffLayout'
import UpdateBanner from './components/ui/UpdateBanner'

const LoginPage = lazy(() => import('./features/auth/LoginPage'))
const PortalPage = lazy(() => import('./features/portal/PortalPage'))
const ResultadoCompartido = lazy(() => import('./features/portal/ResultadoCompartido'))
const PantallaTurnos = lazy(() => import('./features/portal/PantallaTurnos'))
const DashboardPage = lazy(() => import('./features/dashboard/DashboardPage'))
const AdminPage = lazy(() => import('./features/admin/AdminPage'))
const SeguridadPage = lazy(() => import('./features/seguridad/SeguridadPage'))
const PacientesPage = lazy(() => import('./features/pacientes/PacientesPage'))
const ConsultasPage = lazy(() => import('./features/consultas/ConsultasPage'))
const LaboratorioPage = lazy(() => import('./features/laboratorio/LaboratorioPage'))
const PagosPage = lazy(() => import('./features/pagos/PagosPage'))
const TurnosPage = lazy(() => import('./features/turnos/TurnosPage'))
const DomiciliosPage = lazy(() => import('./features/domicilios/DomiciliosPage'))
const NotificacionesPage = lazy(() => import('./features/notificaciones/NotificacionesPage'))
const AlertasPage = lazy(() => import('./features/alertas/AlertasPage'))
const ImagenesPage = lazy(() => import('./features/imagenes/ImagenesPage'))
const ImagenCompartidaPage = lazy(() => import('./features/imagenes/ImagenCompartidaPage'))
const HistorialPage = lazy(() => import('./features/historial/HistorialPage'))
const ExpedientePage = lazy(() => import('./features/expediente/ExpedientePage'))
const MocksPage = lazy(() => import('./features/mocks/MocksPage'))

function Protected({ children }: { children: ReactNode }) {
  const session = useSessionStore((s) => s.session)
  const location = useLocation()
  if (!session) return <Navigate to="/login" state={{ from: location }} replace />
  return <>{children}</>
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/portal" element={<PortalPage />} />
      <Route path="/portal/compartido/:token" element={<ResultadoCompartido />} />
      <Route path="/portal/turnos" element={<PantallaTurnos />} />
      <Route path="/imagenes/compartir/:token" element={<ImagenCompartidaPage />} />

      <Route
        element={
          <Protected>
            <StaffLayout />
          </Protected>
        }
      >
        <Route path="/" element={<DashboardPage />} />
        <Route path="/pacientes" element={<PacientesPage />} />
        <Route path="/consultas" element={<ConsultasPage />} />
        <Route path="/laboratorio" element={<LaboratorioPage />} />
        <Route path="/domicilios" element={<DomiciliosPage />} />
        <Route path="/turnos" element={<TurnosPage />} />
        <Route path="/notificaciones" element={<NotificacionesPage />} />
        <Route path="/alertas" element={<AlertasPage />} />
        <Route path="/historial" element={<HistorialPage />} />
        <Route path="/expediente" element={<ExpedientePage />} />
        <Route path="/imagenes" element={<ImagenesPage />} />
        <Route path="/pagos" element={<PagosPage />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="/seguridad" element={<SeguridadPage />} />
      </Route>

      <Route path="/mocks" element={<MocksPage />} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  useEffect(() => {
    useConfigStore.getState().refresh()
  }, [])

  return (
    <BrowserRouter>
      <Suspense fallback={<div className="flex min-h-screen items-center justify-center text-slate-400">Cargando…</div>}>
        <AppRoutes />
      </Suspense>
      <UpdateBanner />
    </BrowserRouter>
  )
}