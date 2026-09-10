-- 0049_pagos_monto_mayor_cero.sql
-- Revierte 0048: el monto del pago debe ser > 0 (no se permiten pagos de $0).

do $$
declare
  restriccion text;
  fuente text;
begin
  select c.conname, pg_get_constraintdef(c.oid)
    into restriccion, fuente
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'pagos'
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) like '%monto%'
    limit 1;

  if restriccion is not null then
    if position('> 0' in fuente) = 0 then
      execute format('alter table public.pagos drop constraint %I', restriccion);
      alter table public.pagos add constraint pagos_monto_check check (monto > 0);
    end if;
  else
    alter table public.pagos add constraint pagos_monto_check check (monto > 0);
  end if;
end $$;
