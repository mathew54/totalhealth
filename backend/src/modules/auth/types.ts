export type Rol = 'super_root' | 'admin' | 'medico' | 'laboratorio' | 'secretaria';

export const ROLES: readonly Rol[] = ['super_root', 'admin', 'medico', 'laboratorio', 'secretaria'];

// Contexto del usuario autenticado inyectado en `req` por el middleware de auth.
export interface AuthUser {
  id: string; // auth.users.id
  role: Rol; // rol activo (el de la sesión actual)
  roles: Rol[]; // todos los roles asignados por el admin
  clinicaId: string | null;
  nombre: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
      patientId?: string;
    }
  }
}