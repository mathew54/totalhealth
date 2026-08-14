// Roles del sistema. Constantes ÚNICAS para middleware, validaciones y
// consistencia con las políticas RLS de las migraciones.

export const MEDICO_ROLES = ['medico', 'admin', 'super_root'] as const;

export const ROLES_SECRETARIA_ADMIN = ['secretaria', 'admin', 'super_root'] as const;

export const ROLES_ADMIN_SUPER = ['admin', 'super_root'] as const;

export type Rol = (typeof MEDICO_ROLES)[number];