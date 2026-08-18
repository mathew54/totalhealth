-- 0034_caja_turnos.sql
-- TotalHealth: caja por turnos (apertura/cierre con arqueo de efectivo).
-- Modelo: la secretaria abre un turno con un monto inicial en caja; cada cobro
-- queda asociado al turno activo (`pagos.turno_id`); al cerrar se concilia el
-- efectivo contado (USD y Bs.) contra el esperado (inicial + cobros en efectivo),
-- y la diferencia (sobrante/faltante) se expresa en USD base.
--
-- Acceso: MISMA autorización que pagos/facturas -> secretaria/admin/super_root.

create table if not exists public.caja_turnos (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references public.clinicas(id) on delete cascade,
  abierta_por uuid not null references public.profiles(id) on delete set null,
  fecha_apertura timestamptz not null default now(),
  monto_inicial numeric(12,2) not null default 0,
  estado text not null default 'abierta' check (estado in ('abierta','cerrada')),
  fecha_cierre timestamptz,
  cierre_por uuid references public.profiles(id) on delete set null,
  efectivo_esperado_usd numeric(12,2) not null default 0,
  efectivo_esperado_bs numeric(12,2) not null default 0,
  efectivo_real_usd numeric(12,2) not null default 0,
  efectivo_real_bs numeric(12,2) not null default 0,
  monto_esperado_caja_usd numeric(12,2) not null default 0,
  monto_real_caja_usd numeric(12,2) not null default 0,
  diferencia_usd numeric(12,2) not null default 0,
  tasa_usd numeric(14,4),
  observaciones text,
  created_at timestamptz not null default now()
);

alter table public.pagos
  add column if not exists turno_id uuid references public.caja_turnos(id) on delete set null;

create index if not exists idx_caja_turnos_clinica_fecha on public.caja_turnos(clinica_id, fecha_apertura);
create index if not exists idx_pagos_turno on public.pagos(turno_id);

-- ===== RLS (mismo criterio que pagos/facturas) =====
alter table public.caja_turnos enable row level security;

do $$ begin
  create policy caja_turnos_secretaria on public.caja_turnos for insert to authenticated
    with check (is_role('secretaria') or is_role('admin') or is_super_root());
  create policy caja_turnos_read on public.caja_turnos for select to authenticated
    using (is_role('secretaria') or is_role('admin') or is_super_root());
  create policy caja_turnos_update on public.caja_turnos for update to authenticated
    using (is_role('secretaria') or is_role('admin') or is_super_root())
    with check (is_role('secretaria') or is_role('admin') or is_super_root());
exception when duplicate_object then null;
end $$;