-- 0012_preanalitica.sql
-- TotalHealth: validación pre-analítica de órdenes de laboratorio.
-- Configurable: puede activarse/desactivarse y ser o no obligatoria.

-- Configuración global del módulo (fila única app_config).
alter table public.app_config
  add column if not exists preanalitica jsonb not null default '{"habilitado": true, "obligatorio": true}'::jsonb;

-- Catálogo de puntos de verificación pre-analíticos (configurable por admin).
create table public.checkpoints_preanalitica (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid references public.clinicas(id) on delete cascade,
  nombre text not null,
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

-- Validación realizada por solicitud de laboratorio.
create table public.solicitudes_preanalitica (
  id uuid primary key default gen_random_uuid(),
  solicitud_id uuid not null references public.solicitudes(id) on delete cascade,
  checkpoint_id uuid not null references public.checkpoints_preanalitica(id) on delete cascade,
  cumplido boolean not null default true,
  validado_por uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (solicitud_id, checkpoint_id)
);

create index idx_preana_checkpoint on public.checkpoints_preanalitica(activo);
create index idx_preana_solicitud on public.solicitudes_preanalitica(solicitud_id);

-- Checkpoints por defecto (fila única de clínica demo).
insert into public.checkpoints_preanalitica (clinica_id, nombre) values
  (null, 'Identidad del paciente confirmada'),
  (null, 'Ayuno / condiciones previas cumplidas'),
  (null, 'Tubo o recipiente correcto y etiquetado'),
  (null, 'Registrada la hora de la toma'),
  (null, 'Muestra en buen estado y sin hemólisis')
on conflict do nothing;

-- RLS
alter table public.checkpoints_preanalitica enable row level security;
alter table public.solicitudes_preanalitica enable row level security;

do $$ begin
  create policy preana_checkpoints_admin on public.checkpoints_preanalitica for all to authenticated
    using (is_role('admin') or is_role('laboratorio') or is_role('secretaria') or is_super_root())
    with check (is_role('admin') or is_super_root());
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy preana_solicitud_admin on public.solicitudes_preanalitica for all to authenticated
    using (is_role('admin') or is_role('laboratorio') or is_role('secretaria') or is_super_root())
    with check (is_role('admin') or is_role('laboratorio') or is_role('secretaria') or is_super_root());
exception when duplicate_object then null;
end $$;