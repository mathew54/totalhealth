-- 0006_descuentos_pagos.sql
-- TotalHealth: Fase B - descuentos en solicitudes y campos de pasarela de pagos.

alter table public.solicitudes
  add column if not exists descuento numeric(12,2) not null default 0,
  add column if not exists descuento_motivo text,
  add column if not exists descuento_autorizado_por uuid references public.profiles(id) on delete set null;

alter table public.pagos
  add column if not exists moneda text not null default 'BS',
  add column if not exists provider_ref text,
  add column if not exists provider text,
  add column if not exists descuento numeric(12,2) not null default 0,
  add column if not exists iva numeric(12,2) not null default 0;

-- Permitir a secretaria/admin actualizar el cobro (estado pendiente->pagado->reembolsado).
do $$ begin
  create policy pagos_secretaria_update on public.pagos for update to authenticated
    using (is_role('secretaria') or is_role('admin') or is_super_root())
    with check (is_role('secretaria') or is_role('admin') or is_super_root());
exception when duplicate_object then null;
end $$;