-- 0036_comercial.sql
-- TotalHealth: módulo comercial (Fase D).
-- Paquetes/combos, convenios con aseguradoras/empresas, promociones por vigencia
-- y tarjetas de prepago. Todo en USD (moneda base); los descuentos se resuelven
-- en el cobro como una cascada: paquete/promoción -> descuento manual -> convenio.

-- ===== Paquetes / combos =====
create table if not exists public.paquetes (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  descripcion text,
  precio numeric(12,2) not null check (precio > 0),
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.paquete_examenes (
  id uuid primary key default gen_random_uuid(),
  paquete_id uuid not null references public.paquetes(id) on delete cascade,
  examen_id uuid not null references public.examenes_laboratorio(id) on delete cascade,
  unique (paquete_id, examen_id)
);

alter table public.solicitudes
  add column if not exists paquete_id uuid references public.paquetes(id) on delete set null;

create index if not exists idx_paquetes_activo on public.paquetes(activo);

-- ===== Convenios (aseguradoras / empresas) =====
create table if not exists public.convenios (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  rif text,
  descuento_porcentaje numeric(5,2) not null default 0 check (descuento_porcentaje >= 0 and descuento_porcentaje <= 100),
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.pacientes
  add column if not exists convenio_id uuid references public.convenios(id) on delete set null;

create index if not exists idx_convenios_activo on public.convenios(activo);

-- ===== Promociones por vigencia =====
create table if not exists public.promociones (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  descuento_porcentaje numeric(5,2) not null check (descuento_porcentaje > 0 and descuento_porcentaje <= 100),
  fecha_inicio date not null,
  fecha_fin date not null check (fecha_fin >= fecha_inicio),
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.promocion_examenes (
  id uuid primary key default gen_random_uuid(),
  promocion_id uuid not null references public.promociones(id) on delete cascade,
  examen_id uuid not null references public.examenes_laboratorio(id) on delete cascade,
  unique (promocion_id, examen_id)
);

create index if not exists idx_promociones_vigencia on public.promociones(activo, fecha_inicio, fecha_fin);

-- ===== Tarjetas de prepago =====
create table if not exists public.tarjetas_prepago (
  id uuid primary key default gen_random_uuid(),
  paciente_id uuid not null references public.pacientes(id) on delete cascade unique,
  saldo_usd numeric(12,2) not null default 0 check (saldo_usd >= 0),
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.pagos
  add column if not exists convenio_id uuid references public.convenios(id) on delete set null,
  add column if not exists paquete_id uuid references public.paquetes(id) on delete set null,
  add column if not exists prepago_usado_usd numeric(12,2) not null default 0;

-- ===== RLS =====
-- Referencias comerciales: lectura para cualquier rol autenticado (se usan al
-- crear solicitudes y al cobrar); escritura solo admin/super_root.
do $$ begin
  alter table public.paquetes enable row level security;
  create policy paquetes_read on public.paquetes for select to authenticated using (true);
  create policy paquetes_write on public.paquetes for insert to authenticated
    with check (is_role('admin') or is_super_root());
  create policy paquetes_update on public.paquetes for update to authenticated
    using (is_role('admin') or is_super_root()) with check (is_role('admin') or is_super_root());
  create policy paquetes_delete on public.paquetes for delete to authenticated
    using (is_role('admin') or is_super_root());
exception when duplicate_object then null;
end $$;

do $$ begin
  alter table public.paquete_examenes enable row level security;
  create policy paquete_examenes_read on public.paquete_examenes for select to authenticated using (true);
  create policy paquete_examenes_write on public.paquete_examenes for insert to authenticated
    with check (is_role('admin') or is_super_root());
  create policy paquete_examenes_delete on public.paquete_examenes for delete to authenticated
    using (is_role('admin') or is_super_root());
exception when duplicate_object then null;
end $$;

do $$ begin
  alter table public.convenios enable row level security;
  create policy convenios_read on public.convenios for select to authenticated using (true);
  create policy convenios_write on public.convenios for insert to authenticated
    with check (is_role('admin') or is_super_root());
  create policy convenios_update on public.convenios for update to authenticated
    using (is_role('admin') or is_super_root()) with check (is_role('admin') or is_super_root());
  create policy convenios_delete on public.convenios for delete to authenticated
    using (is_role('admin') or is_super_root());
exception when duplicate_object then null;
end $$;

do $$ begin
  alter table public.promociones enable row level security;
  create policy promociones_read on public.promociones for select to authenticated using (true);
  create policy promociones_write on public.promociones for insert to authenticated
    with check (is_role('admin') or is_super_root());
  create policy promociones_update on public.promociones for update to authenticated
    using (is_role('admin') or is_super_root()) with check (is_role('admin') or is_super_root());
  create policy promociones_delete on public.promociones for delete to authenticated
    using (is_role('admin') or is_super_root());
exception when duplicate_object then null;
end $$;

do $$ begin
  alter table public.promocion_examenes enable row level security;
  create policy promocion_examenes_read on public.promocion_examenes for select to authenticated using (true);
  create policy promocion_examenes_write on public.promocion_examenes for insert to authenticated
    with check (is_role('admin') or is_super_root());
  create policy promocion_examenes_delete on public.promocion_examenes for delete to authenticated
    using (is_role('admin') or is_super_root());
exception when duplicate_object then null;
end $$;

-- Tarjetas de prepago: lectura/escritura con la misma autorización de caja.
do $$ begin
  alter table public.tarjetas_prepago enable row level security;
  create policy prepago_read on public.tarjetas_prepago for select to authenticated
    using (is_role('secretaria') or is_role('admin') or is_super_root());
  create policy prepago_insert on public.tarjetas_prepago for insert to authenticated
    with check (is_role('secretaria') or is_role('admin') or is_super_root());
  create policy prepago_update on public.tarjetas_prepago for update to authenticated
    using (is_role('secretaria') or is_role('admin') or is_super_root())
    with check (is_role('secretaria') or is_role('admin') or is_super_root());
exception when duplicate_object then null;
end $$;