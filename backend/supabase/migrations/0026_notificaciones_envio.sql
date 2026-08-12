-- 0026_notificaciones_envio.sql
-- TotalHealth: envío real de notificaciones.
-- Añade destino explícito, marca de envío real y log de fallos.
-- `tipo` admite: cita | resultado | domicilio | turno | pago.
-- `canal` admite: push | whatsapp | sms | email.

alter table public.notificaciones
  add column if not exists telefono text,
  add column if not exists sent_at timestamptz,
  add column if not exists error text,
  add column if not exists updated_at timestamptz not null default now();

create index if not exists idx_notificaciones_estado_telefono on public.notificaciones(estado, telefono);