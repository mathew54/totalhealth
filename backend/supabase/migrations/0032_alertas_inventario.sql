-- 0032_alertas_inventario.sql
-- TotalHealth: alertas internas de inventario para el rol laboratorio.
--
-- Notas de stock bajo, agotados, vencidos y por vencer (30 días). Se generan en
-- el backend (job diario + tras cada movimiento de stock) y se resuelven
-- automáticamente cuando el stock vuelve a niveles seguros. `leida` la marca el
-- usuario desde la UI; una alerta abierta no se duplica.

create table if not exists public.alertas_inventario (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid references public.clinicas(id) on delete cascade,
  reactivo_id uuid not null references public.reactivos(id) on delete cascade,
  lote_id uuid references public.reactivo_lotes(id) on delete set null,
  tipo text not null check (tipo in ('bajo_stock', 'agotado', 'vencido', 'por_vencer')),
  mensaje text not null,
  leida boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_alertas_inventario_clinica on public.alertas_inventario(clinica_id, leida);
create index if not exists idx_alertas_inventario_reactivo on public.alertas_inventario(reactivo_id);

alter table public.alertas_inventario enable row level security;
do $$ begin
  create policy alertas_inventario_lab on public.alertas_inventario for all to authenticated
    using (is_role('laboratorio') or is_role('admin') or is_super_root());
exception when duplicate_object then null; end $$;