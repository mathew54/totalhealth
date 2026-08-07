-- 0010_turnos.sql
-- TotalHealth: Fase C - sala de espera / control de turnos.

create table public.turnos (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid references public.clinicas(id) on delete set null,
  paciente_id uuid not null references public.pacientes(id) on delete cascade,
  consulta_id uuid references public.consultas(id) on delete set null,
  numero integer not null,
  fecha date not null default current_date,
  estado text not null default 'esperando', -- esperando | llamado | atendido | saltado | cancelado
  prioridad text not null default 'normal', -- normal | prioridad | urgente
  creado_por uuid references public.profiles(id) on delete set null,
  hora_creado timestamptz not null default now(),
  hora_llamado timestamptz,
  hora_atendido timestamptz
);

create index idx_turnos_fecha on public.turnos(fecha, numero);
create index idx_turnos_estado on public.turnos(estado);

alter table public.turnos enable row level security;
do $$ begin
  create policy turnos_staff on public.turnos for all to authenticated
    using (is_role('secretaria') or is_role('admin') or is_super_root())
    with check (is_role('secretaria') or is_role('admin') or is_super_root());
exception when duplicate_object then null;
end $$;