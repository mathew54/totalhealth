-- 0037_retenciones_config.sql
-- TotalHealth: retenciones de impuestos configurables (leyes fiscales VE).
--   app_config → + retencion_iva_pct (fracción; 0.75 = 75%, Ley IVA art. 27-28)
--                + retencion_islr_pct (fracción; 0.03 = 3% servicios, Decreto 1.808)
-- Los montos retenidos se guardan en pagos.retencion_iva/retencion_islr y
-- facturas.retencion_iva/retencion_islr (columnas existentes desde la 0033).

alter table public.app_config
  add column if not exists retencion_iva_pct numeric(5,2) not null default 0.75,
  add column if not exists retencion_islr_pct numeric(5,2) not null default 0.03;
