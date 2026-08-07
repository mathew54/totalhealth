-- 0016_identidad_menores_tasas.sql
-- TotalHealth:
--  1. Tipos de documento de identidad VE (V/E/J/P/C) y pacientes menores.
--  2. Tasas de cambio del día (scraping BCV o manual) para el header de la web.

-- ======================= 1) Identidad y menores =======================
-- Un menor sin documento legal propio no tiene cédula: se identifica por su
-- representante (padre/madre) y el vínculo de representación.
alter table public.pacientes alter column cedula drop not null;
alter table public.pacientes drop constraint if exists pacientes_cedula_key;
create unique index if not exists pacientes_cedula_unique on public.pacientes(cedula) where cedula is not null;

alter table public.pacientes
  add column if not exists tipo_documento text not null default 'V',
  add column if not exists es_menor boolean not null default false,
  add column if not exists representante_id uuid references public.pacientes(id) on delete set null,
  add column if not exists parentesco_representante text;

create index if not exists idx_pacientes_representante on public.pacientes(representante_id);

-- ======================= 2) Tasas de cambio del día =======================
create table if not exists public.tasas_cambio (
  id uuid primary key default gen_random_uuid(),
  fecha date not null,
  moneda text not null check (moneda in ('USD', 'EUR')),
  valor numeric(18,4) not null check (valor > 0),
  origen text not null default 'manual' check (origen in ('manual', 'bcv')),
  activa boolean not null default false,
  actualizado_por uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (fecha, moneda, origen)
);

create index if not exists idx_tasas_fecha on public.tasas_cambio(fecha, moneda);

-- RLS: la leen todos los autenticados (header); la gestionan admin/super_root.
alter table public.tasas_cambio enable row level security;

do $$ begin
  create policy tasas_read on public.tasas_cambio for select to authenticated
    using (true);
  create policy tasas_write on public.tasas_cambio for all to authenticated
    using (is_role('admin') or is_super_root())
    with check (is_role('admin') or is_super_root());
exception when duplicate_object then null;
end $$;
