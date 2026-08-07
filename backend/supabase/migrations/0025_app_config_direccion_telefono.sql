-- 0025_app_config_direccion_telefono.sql
-- TotalHealth: datos de contacto de la razón social para documentos/reportes.
-- Se muestran en todos los PDFs (resultados, facturas) y cabeceras impresas.

alter table public.app_config
  add column if not exists direccion text not null default '',
  add column if not exists telefono text not null default '';

-- Actualizar la fila única por defecto con datos de contacto de ejemplo.
update public.app_config
set direccion = case when direccion = '' then 'Av. Principal, Caracas, Venezuela' else direccion end,
    telefono  = case when telefono = '' then '+58 412-1234567' else telefono end
where id = true;
