-- 0011_reserva_online.sql
-- TotalHealth: Fase C - reserva online autogestionada.

-- Especialidad del médico para filtrado por especialidad.
alter table public.profiles
  add column if not exists especialidad text;

-- Horarios de atención por médico (slot de consulta). La disponibilidad en
-- tiempo real se obtiene restando las consultas programadas del médico.
create table public.disponibilidad_medico (
  id uuid primary key default gen_random_uuid(),
  medico_id uuid not null references public.profiles(id) on delete cascade,
  clinica_id uuid references public.clinicas(id) on delete set null,
  dia int not null check (dia between 0 and 6), -- 0=Domingo … 6=Sábado
  hora_inicio time not null,
  hora_fin time not null,
  duracion_min int not null default 30,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (medico_id, dia)
);

create index idx_disp_medico on public.disponibilidad_medico(medico_id, dia);

-- Permite que el paciente reprograme/cancele su propia reserva online.
alter table public.consultas add column if not exists origen text not null default 'staff';
alter table public.consultas add column if not exists reservada_por uuid
  references public.pacientes(id) on delete set null;

alter table public.disponibilidad_medico enable row level security;
do $$ begin
  create policy disp_admin on public.disponibilidad_medico for all to authenticated
    using (is_role('admin') or is_role('secretaria') or is_super_root())
    with check (is_role('admin') or is_role('secretaria') or is_super_root());
exception when duplicate_object then null;
end $$;