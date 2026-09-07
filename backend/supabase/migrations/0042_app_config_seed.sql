-- 0042_app_config_seed.sql
-- TotalHealth: asegura la fila única de configuración global (id = true).
-- Proyectos existentes (migraciones aplicadas a mano / parciales) pueden tener
-- la tabla vacía, lo que hacía fallar PUT /api/admin/config con
-- "Cannot coerce the result to a single JSON object" (update sobre 0 filas +
-- .single()). Esta migración siembra el default solo si falta.
-- La contraseña/uso: la app escribe con la service role key, que ignora RLS.

insert into public.app_config (
  id, razon_social, rif, direccion, telefono, logo_url, header_color,
  iva, igtf, contribuyente_especial, retencion_iva_pct, retencion_islr_pct,
  updated_at
)
select
  true,
  'Clínica TotalHealth',
  '',
  '',
  '',
  '/favicon.svg',
  '#8b5cf6',
  0.16,
  0.03,
  false,
  0.75,
  0.03,
  now()
where not exists (select 1 from public.app_config where id = true);