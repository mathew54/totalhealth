-- 0033_facturacion_ve.sql
-- TotalHealth: facturación VE persistida + multimoneda fiscal.
-- Objetivo: no romper el contrato actual de pagos; solo se AGREGAN tablas,
-- columnas opcionales con defaults y endpoints nuevos.
--
--   facturas          → documento fiscal persistido (factura/recibo/nota_credito)
--   factura_lineas    → líneas del documento (impuesto gravado/exento/no_sujeto)
--   pagos             → + base_gravada, base_exenta, igtf, factura_id
--   pacientes         → + rif, direccion_fiscal (datos fiscales del receptor)
--   examenes_laboratorio → + impuesto (gravado | exento | no_sujeto)
--   app_config        → + igtf (porcentaje), contribuyente_especial

-- ===== Facturas =====
create table if not exists public.facturas (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid references public.clinicas(id) on delete set null,
  pago_id uuid references public.pagos(id) on delete set null,
  solicitud_id uuid references public.solicitudes(id) on delete set null,
  consulta_id uuid references public.consultas(id) on delete set null,
  paciente_id uuid not null references public.pacientes(id) on delete restrict,
  tipo_documento text not null default 'factura' check (tipo_documento in ('factura','recibo','nota_credito','nota_debito')),
  serie text not null,
  numero_factura text not null,
  numero_control text not null,
  moneda text not null default 'USD',
  tasa_usd numeric(14,4),
  base_gravada numeric(12,2) not null default 0,
  base_exenta numeric(12,2) not null default 0,
  iva numeric(12,2) not null default 0,
  descuento numeric(12,2) not null default 0,
  igtf numeric(12,2) not null default 0,
  retencion_iva numeric(12,2) not null default 0,
  retencion_islr numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  receptor_razon_social text not null default '',
  receptor_rif text,
  receptor_direccion text,
  estatus text not null default 'emitida' check (estatus in ('emitida','anulada')),
  emitida_por uuid references public.profiles(id) on delete set null,
  fecha_emision timestamptz not null default now(),
  anulada_por uuid references public.profiles(id) on delete set null,
  anulada_en timestamptz,
  motivo_anulacion text,
  created_at timestamptz not null default now()
);

create table if not exists public.factura_lineas (
  id uuid primary key default gen_random_uuid(),
  factura_id uuid not null references public.facturas(id) on delete cascade,
  descripcion text not null,
  cantidad numeric(12,3) not null default 1,
  precio_unitario numeric(12,2) not null default 0,
  impuesto text not null default 'gravado' check (impuesto in ('gravado','exento','no_sujeto')),
  iva_linea numeric(12,2) not null default 0,
  total_linea numeric(12,2) not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_facturas_clinica_fecha on public.facturas(clinica_id, fecha_emision);
create index if not exists idx_facturas_pago on public.facturas(pago_id);
create index if not exists idx_factura_lineas_factura on public.factura_lineas(factura_id);

-- ===== Columnas nuevas en tablas existentes (todas con default, no destructivas) =====
alter table public.pagos
  add column if not exists base_gravada numeric(12,2) not null default 0,
  add column if not exists base_exenta numeric(12,2) not null default 0,
  add column if not exists igtf numeric(12,2) not null default 0,
  add column if not exists retencion_iva numeric(12,2) not null default 0,
  add column if not exists retencion_islr numeric(12,2) not null default 0,
  add column if not exists factura_id uuid references public.facturas(id) on delete set null;

alter table public.pacientes
  add column if not exists rif text,
  add column if not exists direccion_fiscal text;

alter table public.examenes_laboratorio
  add column if not exists impuesto text not null default 'gravado'
    check (impuesto in ('gravado','exento','no_sujeto'));

alter table public.app_config
  add column if not exists igtf numeric(5,2) not null default 0.03,
  add column if not exists contribuyente_especial boolean not null default false;

-- ===== RLS (mismo criterio que pagos: secretaria/admin/super_root) =====
alter table public.facturas enable row level security;
alter table public.factura_lineas enable row level security;

do $$ begin
  create policy facturas_secretaria on public.facturas for insert to authenticated
    with check (is_role('secretaria') or is_role('admin') or is_super_root());
  create policy facturas_read on public.facturas for select to authenticated
    using (is_role('secretaria') or is_role('admin') or is_super_root());
  create policy facturas_update on public.facturas for update to authenticated
    using (is_role('secretaria') or is_role('admin') or is_super_root())
    with check (is_role('secretaria') or is_role('admin') or is_super_root());
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy factura_lineas_secretaria on public.factura_lineas for insert to authenticated
    with check (is_role('secretaria') or is_role('admin') or is_super_root());
  create policy factura_lineas_read on public.factura_lineas for select to authenticated
    using (is_role('secretaria') or is_role('admin') or is_super_root());
exception when duplicate_object then null;
end $$;