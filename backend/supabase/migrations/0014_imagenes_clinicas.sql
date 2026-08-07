-- 0014_imagenes_clinicas.sql
-- TotalHealth: visualizador de imágenes médicas (MVP).
-- Almacena referencias de imágenes clínicas (URL de storage o data URL) con
-- metadatos de estudio, región y descripción, vinculadas a paciente y consulta.

create table if not exists public.imagenes_clinicas (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid references public.clinicas(id) on delete cascade,
  paciente_id uuid not null references public.pacientes(id) on delete cascade,
  consulta_id uuid references public.consultas(id) on delete set null,
  url text not null, -- data URL (MVP/mock) o path de Storage (Supabase real)
  tipo text not null default 'rx' check (tipo in ('rx', 'ecografia', 'tomografia', 'resonancia', 'foto', 'otro')),
  region text,
  descripcion text,
  creado_por uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_imagenes_paciente on public.imagenes_clinicas(paciente_id, created_at desc);
create index if not exists idx_imagenes_consulta on public.imagenes_clinicas(consulta_id);

alter table public.imagenes_clinicas enable row level security;

drop policy if exists imagenes_read_all on public.imagenes_clinicas;
create policy imagenes_read_all on public.imagenes_clinicas
  for select to authenticated using (true);

drop policy if exists imagenes_insert_staff on public.imagenes_clinicas;
create policy imagenes_insert_staff on public.imagenes_clinicas
  for insert to authenticated
  with check (true);

drop policy if exists imagenes_delete_admin on public.imagenes_clinicas;
create policy imagenes_delete_admin on public.imagenes_clinicas
  for delete to authenticated
  using (exists (
    select 1 from profiles p where p.id = auth.uid()
      and p.role in ('admin', 'super_root')
  ));