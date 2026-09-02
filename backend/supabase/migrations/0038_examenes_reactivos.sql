-- 0038_examenes_reactivos.sql
-- TotalHealth: receta de insumos por examen (examen → reactivo + cantidad).
--
-- Conecta el catálogo de exámenes con el inventario de reactivos. Cada fila
-- define cuántas unidades de un reactivo consume un examen. Al emitir un
-- resultado, el backend descuenta automáticamente el stock por FEFO (el lote
-- lo resuelve `consumirReactivo` sobre reactivo_lotes activos).
--
-- `auto` permite declarar la receta sin que el sistema la descuente
-- automáticamente (p. ej. insumos que solo se registran manualmente).

create table if not exists public.examenes_reactivos (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid references public.clinicas(id) on delete cascade,
  examen_id uuid not null references public.examenes_laboratorio(id) on delete cascade,
  reactivo_id uuid not null references public.reactivos(id) on delete cascade,
  cantidad numeric(12,3) not null default 1 check (cantidad > 0),
  auto boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (examen_id, reactivo_id)
);

create index if not exists idx_examenes_reactivos_examen on public.examenes_reactivos(examen_id);
create index if not exists idx_examenes_reactivos_reactivo on public.examenes_reactivos(reactivo_id);

alter table public.examenes_reactivos enable row level security;
do $$ begin
  create policy examenes_reactivos_lab on public.examenes_reactivos for all to authenticated
    using (is_role('laboratorio') or is_role('admin') or is_super_root());
exception when duplicate_object then null; end $$;

drop trigger if exists trg_examenes_reactivos_updated on public.examenes_reactivos;
create trigger trg_examenes_reactivos_updated before update on public.examenes_reactivos
  for each row execute function set_updated_at();