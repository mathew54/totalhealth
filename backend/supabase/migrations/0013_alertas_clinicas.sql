-- 0013_alertas_clinicas.sql
-- TotalHealth: alertas clínicas automáticas por parámetros fuera de rango.
-- Umbrales de referencia por examen/parámetro + registro de alertas por resultado.

-- Umbrales de referencia por examen y parámetro (clave dentro de valores jsonb).
create table if not exists public.parametros_referencia (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid references public.clinicas(id) on delete cascade,
  examen_id uuid not null references public.examenes_laboratorio(id) on delete cascade,
  parametro text not null, -- clave del jsonb `valores`
  nombre text not null,    -- etiqueta legible del parámetro
  unidad text,
  normal_min numeric,
  normal_max numeric,
  critico_min numeric,
  critico_max numeric,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (examen_id, parametro)
);

-- Alerta clínica generada al cargar un resultado fuera de rango.
create table if not exists public.alertas_clinicas (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid references public.clinicas(id) on delete cascade,
  paciente_id uuid not null references public.pacientes(id) on delete cascade,
  examen_id uuid not null references public.examenes_laboratorio(id) on delete restrict,
  solicitud_detalle_id uuid not null references public.solicitudes_detalle(id) on delete cascade,
  resultado_id uuid references public.resultados(id) on delete set null,
  parametro text not null,
  valor text,
  unidad text,
  nivel text not null default 'alerta' check (nivel in ('alerta', 'critico')),
  motivo text not null,
  leida boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_alertas_paciente on public.alertas_clinicas(paciente_id, created_at desc);
create index if not exists idx_alertas_solicitud on public.alertas_clinicas(solicitud_detalle_id);
create index if not exists idx_parametros_examen on public.parametros_referencia(examen_id, activo);

alter table public.parametros_referencia enable row level security;
alter table public.alertas_clinicas enable row level security;

drop policy if exists parametros_read_all on public.parametros_referencia;
create policy parametros_read_all on public.parametros_referencia
  for select to authenticated using (true);

drop policy if exists parametros_admin on public.parametros_referencia;
create policy parametros_admin on public.parametros_referencia
  for all to authenticated
  using (clinica_id is null or exists (
    select 1 from profiles p where p.id = auth.uid()
      and p.clinica_id = parametros_referencia.clinica_id
      and p.role in ('admin', 'super_root')
  ))
  with check (clinica_id is null or exists (
    select 1 from profiles p where p.id = auth.uid()
      and p.clinica_id = parametros_referencia.clinica_id
      and p.role in ('admin', 'super_root')
  ));

drop policy if exists alertas_read_all on public.alertas_clinicas;
create policy alertas_read_all on public.alertas_clinicas
  for select to authenticated using (true);

drop policy if exists alertas_insert_lab on public.alertas_clinicas;
create policy alertas_insert_lab on public.alertas_clinicas
  for insert to authenticated
  with check (true);

drop policy if exists alertas_update_lab on public.alertas_clinicas;
create policy alertas_update_lab on public.alertas_clinicas
  for update to authenticated using (true);