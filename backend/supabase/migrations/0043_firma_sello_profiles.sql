-- 0043_firma_sello_profiles.sql
-- TotalHealth: firma del profesional responsable (bioanalista) + sello húmedo
-- para los reportes de resultados en PDF. Se guardan como data URL PNG
-- (patrón app_config.logo_url) en texto plano; `firma_digital` sigue siendo el
-- hash/legado cifrado de autenticidad.

alter table public.profiles
  add column if not exists firma_imagen text,
  add column if not exists sello_imagen text;