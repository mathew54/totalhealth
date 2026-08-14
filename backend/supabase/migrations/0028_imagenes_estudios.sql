-- 0028_imagenes_estudios.sql
-- TotalHealth: estructura de ESTUDIOS de imagen (agrupación por estudio con
-- metadatos clínicos), serie/orden dentro de cada estudio, auditoría de accesos
-- y enlaces de compartición con expiración.

-- Un estudio agrupa una o más imágenes (serie) de una misma exploración.
create table if not exists public.estudios_imagen (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid references public.clinicas(id) on delete cascade,
  paciente_id uuid not null references public.pacientes(id) on delete cascade,
  consulta_id uuid references public.consultas(id) on delete set null,
  tipo text not null default 'rx' check (tipo in ('rx', 'ecografia', 'tomografia', 'resonancia', 'foto', 'otro')),
  region text,
  titulo text,
  hallazgos text,
  impresion text,
  estado text not null default 'pendiente' check (estado in ('pendiente', 'leido')),
  medico_id uuid references public.profiles(id) on delete set null,
  creado_por uuid references public.profiles(id) on delete set null,
  fecha_estudio timestamptz not null default now(),
  retencion_hasta date,
  token text,
  token_expira timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Las imágenes ahora pertenecen a un estudio y se ordenan dentro de él (serie).
alter table public.imagenes_clinicas add column if not exists estudio_id uuid references public.estudios_imagen(id) on delete cascade;
alter table public.imagenes_clinicas add column if not exists orden int not null default 0;

-- Auditoría de accesos a estudios (quién vio / exportó / compartió).
create table if not exists public.imagenes_accesos (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid references public.clinicas(id) on delete cascade,
  estudio_id uuid references public.estudios_imagen(id) on delete cascade,
  usuario_id uuid references public.profiles(id) on delete set null,
  accion text not null default 'ver' check (accion in ('ver', 'exportar', 'compartir')),
  created_at timestamptz not null default now()
);

create index if not exists idx_estudios_paciente on public.estudios_imagen(paciente_id, fecha_estudio desc);
create index if not exists idx_estudios_consulta on public.estudios_imagen(consulta_id);
create index if not exists idx_imagenes_estudio on public.imagenes_clinicas(estudio_id, orden);
create index if not exists idx_imagenes_accesos_estudio on public.imagenes_accesos(estudio_id);

alter table public.estudios_imagen enable row level security;
alter table public.imagenes_accesos enable row level security;

drop policy if exists estudios_read_all on public.estudios_imagen;
create policy estudios_read_all on public.estudios_imagen
  for select to authenticated using (true);

drop policy if exists estudios_insert_staff on public.estudios_imagen;
create policy estudios_insert_staff on public.estudios_imagen
  for insert to authenticated with check (true);

drop policy if exists estudios_update_staff on public.estudios_imagen;
create policy estudios_update_staff on public.estudios_imagen
  for update to authenticated using (true);

drop policy if exists estudios_delete_staff on public.estudios_imagen;
create policy estudios_delete_staff on public.estudios_imagen
  for delete to authenticated using (true);

drop policy if exists accesos_insert_auth on public.imagenes_accesos;
create policy accesos_insert_auth on public.imagenes_accesos
  for insert to authenticated with check (true);

drop policy if exists accesos_read_admin on public.imagenes_accesos;
create policy accesos_read_admin on public.imagenes_accesos
  for select to authenticated using (exists (
    select 1 from profiles p where p.id = auth.uid()
      and p.role in ('admin', 'super_root')
  ));