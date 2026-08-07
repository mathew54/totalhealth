-- 0008_notificaciones.sql
-- TotalHealth: Fase C - recordatorios notificaciones (citas, resultados).

create table public.notificaciones (
  id uuid primary key default gen_random_uuid(),
  paciente_id uuid not null references public.pacientes(id) on delete cascade,
  canal text not null default 'push', -- push | whatsapp | sms
  tipo text not null, -- cita | resultado | domicilio
  mensaje text not null,
  programada_para timestamptz,
  estado text not null default 'pendiente', -- pendiente | enviada | fallida
  enviada_at timestamptz,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index idx_notificaciones_pendiente on public.notificaciones(estado, programada_para);
create index idx_notificaciones_paciente on public.notificaciones(paciente_id);

alter table public.notificaciones enable row level security;
do $$ begin
  create policy notif_admin on public.notificaciones for all to authenticated
    using (is_role('secretaria') or is_role('admin') or is_super_root())
    with check (is_role('secretaria') or is_role('admin') or is_super_root());
exception when duplicate_object then null;
end $$;