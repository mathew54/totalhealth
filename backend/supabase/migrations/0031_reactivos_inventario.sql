-- 0031_reactivos_inventario.sql
-- TotalHealth: inventario de reactivos por LOTES + kardex de movimientos.
--
-- Modelo:
--   reactivos             → catálogo (ítem). `cantidad` = stock UTILIZABLE
--                           (suma de lotes en estado 'activo').
--   reactivo_lotes        → cada recepción es un lote con su vencimiento.
--   reactivo_movimientos  → kardex inmutable (entradas/salidas/ajustes/consumo).
--
-- Las columnas legacy `lote` / `fecha_vencimiento` de reactivos se conservan
-- por compatibilidad con la UI actual y se mantienen sincronizadas al lote
-- activo que expira primero (FEFO). El stock previo se migra creando un lote
-- por fila existente.

-- 1) Catálogo: unidad de medida, costo y updated_at.
alter table public.reactivos add column if not exists unidad text not null default 'unidades';
alter table public.reactivos add column if not exists costo_unitario numeric(12,3);
alter table public.reactivos add column if not exists updated_at timestamptz not null default now();

-- 2) Lotes: una fila por recepción.
create table if not exists public.reactivo_lotes (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid references public.clinicas(id) on delete cascade,
  reactivo_id uuid not null references public.reactivos(id) on delete cascade,
  lote text not null,
  fecha_vencimiento date,
  cantidad numeric(12,3) not null default 0,
  cantidad_inicial numeric(12,3) not null default 0,
  costo_unitario numeric(12,3),
  estado text not null default 'activo' check (estado in ('activo', 'vencido', 'agotado')),
  fecha_recepcion date not null default current_date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 3) Kardex de movimientos (auditoría inmutable).
--    `cantidad` es con signo: entrada (+), salida/consumo/vencido (−),
--    ajuste (delta con signo).
create table if not exists public.reactivo_movimientos (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid references public.clinicas(id) on delete cascade,
  reactivo_id uuid not null references public.reactivos(id) on delete cascade,
  lote_id uuid references public.reactivo_lotes(id) on delete set null,
  tipo text not null check (tipo in ('entrada', 'salida', 'ajuste', 'consumo', 'vencido')),
  cantidad numeric(12,3) not null,
  cantidad_anterior numeric(12,3),
  cantidad_posterior numeric(12,3),
  motivo text,
  usuario_id uuid references public.profiles(id) on delete set null,
  solicitud_detalle_id uuid references public.solicitudes_detalle(id) on delete set null,
  fecha timestamptz not null default now()
);

-- 4) Índices.
create index if not exists idx_reactivo_lotes_reactivo on public.reactivo_lotes(reactivo_id);
create index if not exists idx_reactivo_lotes_estado on public.reactivo_lotes(estado, fecha_vencimiento);
create index if not exists idx_reactivo_mov_reactivo on public.reactivo_movimientos(reactivo_id, fecha desc);
create index if not exists idx_reactivo_mov_lote on public.reactivo_movimientos(lote_id);

-- 5) RLS (mismo criterio que reactivos: laboratorio/admin/super_root).
alter table public.reactivo_lotes enable row level security;
alter table public.reactivo_movimientos enable row level security;

do $$ begin
  create policy reactivo_lotes_lab on public.reactivo_lotes for all to authenticated
    using (is_role('laboratorio') or is_role('admin') or is_super_root());
exception when duplicate_object then null; end $$;

do $$ begin
  create policy reactivo_movimientos_lab on public.reactivo_movimientos for all to authenticated
    using (is_role('laboratorio') or is_role('admin') or is_super_root());
exception when duplicate_object then null; end $$;

-- 6) Triggers de updated_at.
drop trigger if exists trg_reactivos_updated on public.reactivos;
create trigger trg_reactivos_updated before update on public.reactivos
  for each row execute function set_updated_at();

drop trigger if exists trg_reactivo_lotes_updated on public.reactivo_lotes;
create trigger trg_reactivo_lotes_updated before update on public.reactivo_lotes
  for each row execute function set_updated_at();

-- 7) Migración del stock previo: una fila por lote. Los lotes ya vencidos
--    quedan en estado 'vencido' y NO se suman al stock utilizable.
insert into public.reactivo_lotes (clinica_id, reactivo_id, lote, fecha_vencimiento, cantidad, cantidad_inicial, estado, fecha_recepcion, created_at, updated_at)
select
  clinica_id,
  id,
  coalesce(nullif(lote, ''), 'LOTE-INICIAL'),
  fecha_vencimiento,
  cantidad,
  cantidad,
  case when fecha_vencimiento is not null and fecha_vencimiento < current_date then 'vencido' else 'activo' end,
  created_at::date,
  created_at,
  created_at
from public.reactivos
where cantidad > 0 or (lote is not null and lote <> '');

-- 8) Recalcula el stock utilizable del catálogo (suma de lotes activos) y
--    sincroniza los campos legacy con el lote activo que expira primero.
update public.reactivos r set cantidad = coalesce((
  select sum(l.cantidad) from public.reactivo_lotes l
  where l.reactivo_id = r.id and l.estado = 'activo'
), 0);

update public.reactivos r set
  lote = f.lote,
  fecha_vencimiento = f.fecha_vencimiento
from (
  select distinct on (l.reactivo_id) l.reactivo_id, l.lote, l.fecha_vencimiento
  from public.reactivo_lotes l
  where l.estado = 'activo'
  order by l.reactivo_id, l.fecha_vencimiento asc nulls last, l.created_at asc
) f
where f.reactivo_id = r.id;