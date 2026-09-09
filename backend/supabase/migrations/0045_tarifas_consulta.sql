-- 0045_tarifas_consulta.sql
-- TotalHealth: tarifas de consulta + cobro unificado desde caja.
-- Objetivo: permitir cobrar consultas médicas (agenda) desde el mismo módulo
-- de caja que ya existe para laboratorio, usando tarifas configurables.

-- ===== Tabla de tarifas de consulta =====
create table if not exists public.tarifas_consulta (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid references public.clinicas(id) on delete cascade,
  nombre text not null,
  tipo text not null default 'consulta_general'
    check (tipo in ('consulta_general','especialista','domicilio','telemedicina','control')),
  medico_id uuid references public.profiles(id) on delete set null,
  precio_usd numeric(12,2) not null check (precio_usd >= 0),
  impuesto text not null default 'gravado'
    check (impuesto in ('gravado','exento','no_sujeto')),
  duracion_min int,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Evita duplicar tarifa por médico+tipo dentro de una clínica (permite null medico_id = default).
create unique index if not exists idx_tarifas_clinica_tipo_medico
  on public.tarifas_consulta(clinica_id, tipo, medico_id);

-- ===== Columnas nuevas en consultas =====
alter table public.consultas
  add column if not exists tipo_consulta text not null default 'consulta_general',
  add column if not exists tarifa_consulta_id uuid references public.tarifas_consulta(id) on delete set null,
  add column if not exists monto_base_usd numeric(12,2) not null default 0,
  add column if not exists estado_pago text not null default 'pendiente'
    check (estado_pago in ('pendiente','pagada','parcial','anulada'));

create index if not exists idx_consultas_estado_pago on public.consultas(estado_pago);

-- ===== RLS para tarifas_consulta =====
-- Helpers de rol/clínica. Se redefinen aquí porque `current_role` es palabra
-- reservada en PostgreSQL (no puede ser nombre de función), así que no se
-- pueden tomar de 0002_rls.sql. Son idempotentes (create or replace).
create or replace function th_current_role()
returns rol
security definer set search_path = public
language sql stable as $$
  select p.role from profiles p where p.id = auth.uid();
$$;

create or replace function th_is_role(check_role rol)
returns boolean
security definer set search_path = public
language sql stable as $$
  select th_current_role() = check_role;
$$;

create or replace function th_is_super_root()
returns boolean
security definer set search_path = public
language sql stable as $$
  select th_current_role() = 'super_root';
$$;

alter table public.tarifas_consulta enable row level security;

do $$ begin
  -- Lectura: todos los autenticados (médicos necesitan ver tarifas al agendar).
  create policy tarifas_read on public.tarifas_consulta for select to authenticated
    using (true);
  -- Escritura: solo admin/super_root (gestión de catálogo).
  create policy tarifas_admin on public.tarifas_consulta for all to authenticated
    using (th_is_role('admin') or th_is_super_root())
    with check (th_is_role('admin') or th_is_super_root());
exception when duplicate_object then null;
end $$;
