-- 0019_tasas_dolarapi.sql
-- TotalHealth: la fuente primaria de cotizaciones pasa a la API pública
-- ve.dolarapi.com (respuesta JSON estable). El scraping del HTML del BCV queda
-- como respaldo. Se amplía el origen permitido en tasas_cambio a 'dolarapi'.

alter table public.tasas_cambio
  drop constraint if exists tasas_cambio_origen_check;

alter table public.tasas_cambio
  add constraint tasas_cambio_origen_check
  check (origen in ('manual', 'bcv', 'dolarapi'));