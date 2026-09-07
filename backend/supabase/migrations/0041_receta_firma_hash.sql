-- 0041_receta_firma_hash.sql
-- TotalHealth: firma digital de recetas para verificación de autenticidad
-- mediante QR (Punto 7). Añade un hash criptográfico por receta y lo calcula
-- de forma retroactiva para las recetas existentes.

-- 1) Columna para la firma/autenticidad de la receta.
alter table public.recipes
  add column if not exists firma_hash text;

-- 2) Función de firma: SHA-256 sobre id + paciente + fecha de emisión, en base16.
create or replace function public.firmar_recipe()
returns trigger
language plpgsql
security definer
as $$
begin
  new.firma_hash := encode(
    digest(
      new.id::text || '|' || coalesce(new.paciente_id::text, '') || '|' || coalesce(new.fecha_emision::text, ''),
      'sha256'
    ),
    'hex'
  );
  return new;
end;
$$;

-- Trigger para firmar al insertar o cuando cambien datos firmables.
drop trigger if exists trg_recipes_firma on public.recipes;
create trigger trg_recipes_firma
  before insert or update of id, paciente_id, fecha_emision on public.recipes
  for each row execute function public.firmar_recipe();

-- 3) Backfill retroactivo de recetas existentes (por si alguna quedó sin hash).
update public.recipes
set firma_hash = encode(
  digest(id::text || '|' || coalesce(paciente_id::text, '') || '|' || coalesce(fecha_emision::text, ''),
    'sha256'),
  'hex'
)
where firma_hash is null;

-- 4) Columna de auditoría/última actualización para el tracking de muestras.
alter table public.solicitudes_detalle
  add column if not exists updated_at timestamptz not null default now();
