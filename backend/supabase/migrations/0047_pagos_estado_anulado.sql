-- 0047_pagos_estado_anulado.sql
-- TotalHealth: soporte del estado "anulado" en pagos y solicitudes.
-- El botón Anular del reporte de pagos (caja) ahora cambia el estado del pago
-- a 'anulado' (deja de contar como ingreso) y, según la decisión del usuario,
-- la consulta/solicitud vuelve a cobros pendientes o queda anulada.

-- pagos.estado usa el tipo enum estado_pago; se agrega 'anulado'.
-- (No usar ADD VALUE IF NOT EXISTS: PostgreSQL no lo soporta para enums.)
do $$
begin
  if not exists (
    select 1 from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    where t.typname = 'estado_pago' and e.enumlabel = 'anulado'
  ) then
    alter type public.estado_pago add value 'anulado';
  end if;
end $$;

-- solicitudes.estado usa el tipo enum estado_solicitud; la ruta de anulación
-- (POST /solicitudes/:id/anular) ya persistía 'anulada', pero el enum original
-- (pendiente, en_proceso, listo, entregado) no lo incluía: se agrega aquí.
do $$
begin
  if not exists (
    select 1 from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    where t.typname = 'estado_solicitud' and e.enumlabel = 'anulada'
  ) then
    alter type public.estado_solicitud add value 'anulada';
  end if;
end $$;