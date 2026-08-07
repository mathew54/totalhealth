-- MFA TOTP para el backoffice (admin/super_root).
-- `mfa_secret`: secreto TOTP cifrado en reposo (ver services/cifrado.ts).
-- `mfa_activo`: el secreto fue confirmado con un código válido.
alter table public.profiles
  add column if not exists mfa_secret text,
  add column if not exists mfa_activo boolean not null default false;
