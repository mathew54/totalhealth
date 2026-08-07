import { useState } from 'react'
import { Navigate, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { navForRole, ROL_LABELS, type Rol } from '../lib/rbac'
import { useSessionStore } from '../stores/sessionStore'
import { headerTextColor, useConfigStore } from '../lib/configStore'
import TasaHeader from '../components/TasaHeader'
import { resolverEspecialidad, useCatalogoEspecialidades } from '../lib/especialidades'

export default function StaffLayout() {
  const { session, profile, setActiveRole, setEspecialidadActiva } = useSessionStore()
  const items = navForRole(profile?.role ?? 'secretaria')
  const [mobileOpen, setMobileOpen] = useState(false)
  const [roleOpen, setRoleOpen] = useState(false)
  const [espOpen, setEspOpen] = useState(false)
  const navigate = useNavigate()
  const { data: catalogo } = useCatalogoEspecialidades()
  const { razon_social, logo_url, header_color, theme, toggleTheme } = useConfigStore()

  if (!session || !profile) return <Navigate to="/login" replace />

  const multiRole = (profile.roles?.length ?? 0) > 1

  async function switchRole(r: Rol) {
    setRoleOpen(false)
    await setActiveRole(r)
  }

  const esMedico = profile.role === 'medico'
  const especialidades = profile.especialidades ?? []
  const especialidadActiva =
    profile.especialidad_activa ?? especialidades[0] ?? null
  const especialidadActivaLabel = resolverEspecialidad(especialidadActiva, catalogo).nombre

  async function switchEspecialidad(id: string) {
    setEspOpen(false)
    await setEspecialidadActiva(id)
  }

  const initials = profile.nombre_completo
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()

  const headerText = headerTextColor(header_color)
  const headerStyle = { backgroundColor: header_color, color: headerText }

  return (
    <div className="flex min-h-screen bg-slate-50">
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 transform bg-slate-900 text-slate-100 transition-transform lg:static lg:translate-x-0 ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <div className="flex h-16 items-center justify-between border-b border-slate-700 px-4" style={headerStyle}>
          <span className="flex min-w-0 items-center gap-2">
            {logo_url && <img src={logo_url} alt="" className="h-7 w-7 shrink-0 object-contain" />}
            <span className="truncate text-base font-bold">{razon_social}</span>
          </span>
          <button className="lg:hidden" onClick={() => setMobileOpen(false)} aria-label="Cerrar menú">
            <span className="text-xl">×</span>
          </button>
        </div>

        <nav className="space-y-1 p-3">
          {items.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === '/'}
              onClick={() => setMobileOpen(false)}
              className={({ isActive }) =>
                `block rounded-lg px-3 py-2 text-sm font-medium transition ${
                  isActive ? 'bg-brand-600 text-white' : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="absolute bottom-0 left-0 right-0 border-t border-slate-700 p-4">
          <div className="border-b border-slate-700 pb-3">
            <TasaHeader />
          </div>
          <div className="flex items-center gap-3 pt-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-600 text-xs font-bold">
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{profile.nombre_completo}</p>
              <div className="relative">
                <button
                  onClick={() => multiRole && setRoleOpen((v) => !v)}
                  className={`flex items-center gap-1 text-xs capitalize text-slate-400 ${multiRole ? 'hover:text-white' : ''}`}
                  title={multiRole ? 'Cambiar rol activo' : undefined}
                >
                  {ROL_LABELS[profile.role] ?? profile.role.replace('_', ' ')}
                  {multiRole && <span className="text-slate-500">▾</span>}
                </button>
                {roleOpen && multiRole && (
                  <div className="absolute bottom-full left-0 mb-2 w-44 rounded-lg border border-slate-700 bg-slate-800 p-1 shadow-lg">
                    {profile.roles.map((r) => (
                      <button
                        key={r}
                        onClick={() => switchRole(r)}
                        className={`block w-full rounded px-3 py-1.5 text-left text-xs ${
                          r === profile.role ? 'bg-brand-600 text-white' : 'text-slate-300 hover:bg-slate-700'
                        }`}
                      >
                        {ROL_LABELS[r] ?? r}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {esMedico && especialidades.length > 0 && (
                <div className="relative mt-1">
                  <button
                    onClick={() => especialidades.length > 1 && setEspOpen((v) => !v)}
                    className={`flex max-w-full items-center gap-1 text-xs text-brand-300 ${
                      especialidades.length > 1 ? 'hover:text-brand-200' : ''
                    }`}
                    title={especialidades.length > 1 ? 'Cambiar especialidad activa' : 'Especialidad activa'}
                  >
                    <span className="truncate">{especialidadActivaLabel}</span>
                    {especialidades.length > 1 && <span className="shrink-0">▾</span>}
                  </button>
                  {espOpen && especialidades.length > 1 && (
                    <div className="absolute bottom-full left-0 mb-2 w-44 rounded-lg border border-slate-700 bg-slate-800 p-1 shadow-lg">
                      {especialidades.map((id) => (
                        <button
                          key={id}
                          onClick={() => switchEspecialidad(id)}
                          className={`block w-full truncate rounded px-3 py-1.5 text-left text-xs ${
                            id === especialidadActiva ? 'bg-brand-600 text-white' : 'text-slate-300 hover:bg-slate-700'
                          }`}
                        >
                          {resolverEspecialidad(id, catalogo).nombre}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
            <button
              onClick={toggleTheme}
              className="rounded-full border border-slate-700 p-1.5 text-slate-300 hover:text-white"
              title={theme === 'dark' ? 'Modo claro' : 'Modo oscuro'}
            >
              {theme === 'dark' ? '☀️' : '🌙'}
            </button>
            <button
              onClick={async () => { await useSessionStore.getState().logout(); navigate('/login') }}
              className="text-xs text-slate-400 hover:text-white"
              title="Cerrar sesión"
            >
              Salir
            </button>
          </div>
        </div>
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-30 bg-black/50 lg:hidden" onClick={() => setMobileOpen(false)} />
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 items-center justify-between px-4 lg:hidden" style={headerStyle}>
          <button className="text-xl" onClick={() => setMobileOpen(true)} aria-label="Abrir menú">
            ☰
          </button>
          <span className="flex min-w-0 items-center gap-2">
            {logo_url && <img src={logo_url} alt="" className="h-6 w-6 object-contain" />}
            <span className="truncate font-semibold">{razon_social}</span>
          </span>
          <TasaHeader />
          <span className="w-6" />
        </header>

        <main className="flex-1 p-4 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
