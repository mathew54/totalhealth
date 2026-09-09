-- 0048_pagos_monto_cero.sql
-- TotalHealth: permite pagos con monto $0.00.
-- Una consulta puede costar $0 (tarifa gratis, caso de prueba) y un pago puede
-- quedar en $0 cuando el prepago cubre el total. El check original (monto > 0)
-- rechazaba ambos con "violates check constraint pagos_monto_check".

-- Relaja el check a monto >= 0 (idempotente): si el constraint vigente exige
-- monto > 0 lo reemplaza; si ya exige >= 0 no hace nada.
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
    -- Ya admite $0 (monto >= 0): no hacer nada. Si aún exige monto > 0, reemplazar.
    if position('>=' in fuente) = 0 then
      execute format('alter table public.pagos drop constraint %I', restriccion);
      alter table public.pagos add constraint pagos_monto_check check (monto >= 0);
    end if;
  else
    alter table public.pagos add constraint pagos_monto_check check (monto >= 0);
  end if;
end $$;