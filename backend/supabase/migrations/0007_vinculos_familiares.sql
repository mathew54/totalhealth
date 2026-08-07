-- 0007_vinculos_familiares.sql
-- TotalHealth: Fase C - perfiles familiares (dependientes vinculados a cuenta principal).

create table public.vinculos_familiares (
  id uuid primary key default gen_random_uuid(),
  paciente_id uuid not null references public.pacientes(id) on delete cascade,
  dependiente_id uuid not null references public.pacientes(id) on delete cascade,
  parentesco text not null,
  created_at timestamptz not null default now(),
  unique (paciente_id, dependiente_id)
);

create index idx_vinculos_paciente on public.vinculos_familiares(paciente_id);
create index idx_vinculos_dependiente on public.vinculos_familiares(dependiente_id);

alter table public.consultas add column if not exists origen text not null default 'staff';

-- RLS
alter table public.vinculos_familiares enable row level security;
do $$ begin
  create policy vinculos_admin on public.vinculos_familiares for all to authenticated
    using (is_role('admin') or is_role('secretaria') or is_super_root())
    with check (is_role('admin') or is_role('secretaria') or is_super_root());
exception when duplicate_object then null;
end $$;
