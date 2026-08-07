-- 0018_cuestionario_historial.sql
-- TotalHealth: Cuestionario de historial médico (anamnesis) con checklist
-- dinámico, campos condicionales y cierre de observaciones. Multiperfil: lo
-- responde el paciente (portal) o el personal médico (staff). Mientras la
-- consulta no termina el cuestionario vive en "borrador" y se edita en sitio;
-- al consolidarse queda inmutable y las ediciones posteriores se registran como
-- adenda con marca de agua (fecha, hora, ID del médico y firma digital).
-- El borrado es soft-delete restringido a administradores con re-autenticación
-- explícita y justificación auditable.

-- ========================== CUESTIONARIO ==========================
create table if not exists public.cuestionarios_historial (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid references public.clinicas(id) on delete set null,
  paciente_id uuid not null references public.pacientes(id) on delete cascade,
  consulta_id uuid references public.consultas(id) on delete set null,
  origen text not null default 'paciente' check (origen in ('paciente', 'medico')),
  creado_por_paciente uuid references public.pacientes(id) on delete set null,
  creado_por_medico uuid references public.profiles(id) on delete set null,
  titulo text not null default 'Cuestionario de historial médico',
  estado text not null default 'borrador' check (estado in ('borrador', 'consolidado', 'eliminado')),
  respuestas jsonb not null default '{}'::jsonb,
  consolidado_at timestamptz,
  deleted_at timestamptz,
  deleted_por uuid references public.profiles(id) on delete set null,
  deleted_justificacion text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Adendas: ediciones tras la consolidación. Inmutables, con marca de agua
-- (fecha, hora, ID del médico y firma digital). No se modifica el original.
create table if not exists public.cuestionario_adendas (
  id uuid primary key default gen_random_uuid(),
  cuestionario_id uuid not null references public.cuestionarios_historial(id) on delete cascade,
  medico_id uuid not null references public.profiles(id) on delete restrict,
  respuestas jsonb not null,
  firma_hash text not null,
  created_at timestamptz not null default now()
);

-- Registro de borrados (soft delete): justificación administrativa + snapshot.
create table if not exists public.cuestionario_borrados (
  id uuid primary key default gen_random_uuid(),
  cuestionario_id uuid not null references public.cuestionarios_historial(id) on delete cascade,
  eliminado_por uuid references public.profiles(id) on delete set null,
  justificacion text not null,
  snapshot jsonb not null,
  created_at timestamptz not null default now()
);

-- ========================== ÍNDICES ==========================
create index if not exists idx_cuestionario_paciente on public.cuestionarios_historial(paciente_id, estado, created_at desc);
create index if not exists idx_cuestionario_consulta on public.cuestionarios_historial(consulta_id);
create index if not exists idx_cuestionario_adendas on public.cuestionario_adendas(cuestionario_id, created_at asc);

-- ========================== RLS ==========================
alter table public.cuestionarios_historial enable row level security;
alter table public.cuestionario_adendas enable row level security;
alter table public.cuestionario_borrados enable row level security;

-- Lectura global para el staff autenticado (cuerpo médico). El portal accede vía
-- service role del backend; la lectura paciente/tutor se resuelve en la API.
create policy cuestionario_read on public.cuestionarios_historial for select to authenticated using (true);

-- Escritura: solo personal médico activo puede crear/actualizar respuestas
-- (el portal autenticado por OTP opera con service role en el backend).
create policy cuestionario_insert on public.cuestionarios_historial for insert to authenticated
  with check (exists (
    select 1 from profiles p where p.id = auth.uid()
      and p.role in ('medico', 'admin', 'super_root')
  ));
create policy cuestionario_update on public.cuestionarios_historial for update to authenticated
  using (exists (
    select 1 from profiles p where p.id = auth.uid()
      and p.role in ('medico', 'admin', 'super_root')
  ));
create policy cuestionario_delete on public.cuestionarios_historial for delete to authenticated
  using (is_role('admin') or is_super_root());

create policy adendas_read on public.cuestionario_adendas for select to authenticated using (true);
create policy adendas_insert on public.cuestionario_adendas for insert to authenticated
  with check (exists (
    select 1 from profiles p where p.id = auth.uid()
      and p.role in ('medico', 'admin', 'super_root')
  ));

create policy borrados_read on public.cuestionario_borrados for select to authenticated
  using (is_role('admin') or is_super_root());
create policy borrados_insert on public.cuestionario_borrados for insert to authenticated
  with check (is_role('admin') or is_super_root());

drop trigger if exists trg_cuestionarios_updated on public.cuestionarios_historial;
create trigger trg_cuestionarios_updated before update on public.cuestionarios_historial
  for each row execute function set_updated_at();
