-- Bloqueo de cuenta por intentos fallidos de login (staff/backoffice).
-- `login_intentos`: contador de intentos fallidos consecutivos.
-- `bloqueado_hasta`: fin de la ventana de bloqueo (null = sin bloqueo).
alter table public.profiles
  add column if not exists login_intentos integer not null default 0,
  add column if not exists bloqueado_hasta timestamptz;

-- Índice para el lookup por cédula + consulta del estado de bloqueo.
create index if not exists idx_profiles_login_lockout
  on public.profiles (cedula, login_intentos, bloqueado_hasta);
