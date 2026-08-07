-- 0020_pagos_tasa_usd.sql
-- TotalHealth: precios base USD y equivalencia en Bs. con la tasa del día.
-- Los precios de servicios/exámenes/consultas se almacenan y calculan en USD.
-- El cobro puede registrarse en Bs. (conversión automática) o USD; se guarda la
-- tasa del día usada en el cobro para facturar/convertir de forma fiel.

alter table public.pagos
  add column if not exists tasa_usd numeric(14,4);
