export type Rol = 'super_root' | 'admin' | 'medico' | 'laboratorio' | 'secretaria';

export interface DashboardConfig {
  vista: 'activa' | 'consolidada'
}

export interface Profile {
  id: string;
  role: Rol; // rol activo (el de la sesión actual)
  roles: Rol[]; // roles asignados por el admin
  clinica_id: string | null;
  nombre_completo: string;
  cedula?: string | null;
  telefono?: string | null;
  activo?: boolean;
  especialidad?: string | null; // primaria (nombre) — filtros agenda/reservas
  especialidades?: string[]; // IDs del catálogo (multiespecialidad)
  especialidad_activa?: string | null; // contexto actual del médico
  categoria_medica?: string | null;
  colegiatura?: string | null;
  firma_digital?: string | null;
  dashboard_config?: DashboardConfig;
  mfa_activo?: boolean;
}

export interface Session {
  access_token: string;
  refresh_token: string;
  expires_at?: number;
  user: { id: string; email: string };
}

export interface NavItem {
  label: string;
  path: string;
  roles: Rol[];
}

// Matriz RBAC del frontend (espejo de las políticas RLS del backend).
export const NAV_ITEMS: NavItem[] = [
  { label: 'Inicio', path: '/', roles: ['super_root', 'admin', 'medico', 'laboratorio', 'secretaria'] },
  { label: 'Pacientes', path: '/pacientes', roles: ['medico', 'secretaria', 'admin'] },
  { label: 'Agenda', path: '/consultas', roles: ['medico', 'secretaria', 'admin'] },
  { label: 'Laboratorio', path: '/laboratorio', roles: ['laboratorio', 'admin'] },
  { label: 'Domicilios', path: '/domicilios', roles: ['secretaria', 'laboratorio', 'admin'] },
  { label: 'Sala de espera', path: '/turnos', roles: ['secretaria', 'admin'] },
  { label: 'Recordatorios', path: '/notificaciones', roles: ['secretaria', 'admin'] },
  { label: 'Alertas clínicas', path: '/alertas', roles: ['laboratorio', 'admin'] },
  { label: 'Historial médico', path: '/historial', roles: ['medico', 'admin', 'super_root'] },
  { label: 'Imágenes', path: '/imagenes', roles: ['medico', 'laboratorio', 'secretaria', 'admin'] },
  { label: 'Caja', path: '/pagos', roles: ['secretaria', 'admin'] },
  { label: 'Administración', path: '/admin', roles: ['admin', 'super_root'] },
  { label: 'Seguridad', path: '/seguridad', roles: ['admin', 'super_root'] },
];

// Explorador de datos mock: en desarrollo (npm run dev) o si el build activa
// VITE_SHOW_MOCKS=true. En un build de producción sin esa env no aparece.
if (import.meta.env.DEV || import.meta.env.VITE_SHOW_MOCKS === 'true') {
  NAV_ITEMS.push({ label: 'Mocks (dev)', path: '/mocks', roles: ['super_root', 'admin', 'medico', 'laboratorio', 'secretaria'] });
}

export function canAccess(path: string, role: Rol): boolean {
  return NAV_ITEMS.some((item) => path.startsWith(item.path) && item.roles.includes(role));
}

export function navForRole(role: Rol): NavItem[] {
  return NAV_ITEMS.filter((item) => item.roles.includes(role));
}

export const ROL_LABELS: Record<Rol, string> = {
  super_root: 'Super root',
  admin: 'Administrador',
  medico: 'Médico',
  laboratorio: 'Laboratorio',
  secretaria: 'Secretaría',
};