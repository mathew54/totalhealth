-- 0001_schema.sql
-- TotalHealth: esquema relacional núcleo.

create extension if not exists "pgcrypto";

-- ========================== ENUMS ==========================
create type rol as enum ('super_root', 'admin', 'medico', 'laboratorio', 'secretaria');
create type estado_consulta as enum ('programada', 'en_curso', 'completada', 'cancelada');
create type estado_solicitud as enum ('pendiente', 'en_proceso', 'listo', 'entregado');
create type estado_pago as enum ('pendiente', 'pagado', 'reembolsado');
create type estado_recipe as enum ('activo', 'cancelado', 'expirado');
create type tipo_pago as enum ('consulta', 'laboratorio');

-- ========================== TABLAS ==========================

create table clinicas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  rif text not null unique,
  direccion text,
  telefono text,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role rol not null default 'medico',
  clinica_id uuid references clinicas(id) on delete set null,
  nombre_completo text not null,
  cedula text unique,
  telefono text,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table pacientes (
  id uuid primary key default gen_random_uuid(),
  cedula text not null unique,
  nombre_completo text not null,
  fecha_nacimiento date,
  telefono text,
  email text,
  direccion text,
  sexo text check (sexo in ('M','F')),
  clinica_id uuid references clinicas(id) on delete set null,
  fecha_consentimiento timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table consultas (
  id uuid primary key default gen_random_uuid(),
  paciente_id uuid not null references pacientes(id) on delete cascade,
  medico_id uuid not null references profiles(id) on delete restrict,
  clinica_id uuid references clinicas(id) on delete set null,
  fecha_hora timestamptz not null,
  motivo text,
  diagnostico text,
  notas text,
  estado estado_consulta not null default 'programada',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table examenes_laboratorio (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid references clinicas(id) on delete cascade,
  nombre text not null,
  categoria text,
  precio numeric(12,2) not null default 0,
  interno boolean not null default true,
  duracion_min int,
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

create table solicitudes (
  id uuid primary key default gen_random_uuid(),
  consulta_id uuid references consultas(id) on delete set null,
  paciente_id uuid not null references pacientes(id) on delete restrict,
  medico_id uuid not null references profiles(id) on delete restrict,
  clinica_id uuid references clinicas(id) on delete set null,
  fecha timestamptz not null default now(),
  estado estado_solicitud not null default 'pendiente',
  cobrado boolean not null default false,
  nota text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table solicitudes_detalle (
  id uuid primary key default gen_random_uuid(),
  solicitud_id uuid not null references solicitudes(id) on delete cascade,
  examen_id uuid not null references examenes_laboratorio(id) on delete restrict,
  resultado_id uuid,
  precio numeric(12,2) not null default 0
);

create table resultados (
  id uuid primary key default gen_random_uuid(),
  solicitud_detalle_id uuid not null references solicitudes_detalle(id) on delete cascade,
  bioanalista_id uuid references profiles(id) on delete set null,
  valores jsonb,
  pdf_path text,
  observaciones text,
  procesado_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table solicitudes_detalle
  add constraint fk_solicitudes_detalle_resultado
  foreign key (resultado_id) references resultados(id) on delete set null;

create table recipes (
  id uuid primary key default gen_random_uuid(),
  consulta_id uuid references consultas(id) on delete set null,
  paciente_id uuid not null references pacientes(id) on delete restrict,
  medico_id uuid not null references profiles(id) on delete restrict,
  clinica_id uuid references clinicas(id) on delete set null,
  fecha_emision timestamptz not null default now(),
  fecha_expiracion timestamptz,
  estado estado_recipe not null default 'activo',
  created_at timestamptz not null default now()
);

create table recipes_detalle (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references recipes(id) on delete cascade,
  medicamento text not null,
  presentacion text,
  dosis text,
  frecuencia text,
  indicaciones text,
  duracion text
);

create table pagos (
  id uuid primary key default gen_random_uuid(),
  tipo tipo_pago not null,
  solicitud_id uuid references solicitudes(id) on delete set null,
  consulta_id uuid references consultas(id) on delete set null,
  paciente_id uuid not null references pacientes(id) on delete restrict,
  clinica_id uuid references clinicas(id) on delete set null,
  monto numeric(12,2) not null check (monto > 0),
  metodo text,
  secretaria_id uuid references profiles(id) on delete set null,
  fecha timestamptz not null default now(),
  estado estado_pago not null default 'pagado'
);

create table reactivos (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid references clinicas(id) on delete cascade,
  nombre text not null,
  lote text,
  fecha_vencimiento date,
  cantidad numeric(12,3) not null default 0,
  alerta_minima numeric(12,3),
  proveedor text,
  created_at timestamptz not null default now()
);

-- OTP de la consulta pública por cédula
create table portal_codigos (
  id uuid primary key default gen_random_uuid(),
  paciente_id uuid not null references pacientes(id) on delete cascade,
  codigo_hash text not null,
  expira_at timestamptz not null,
  consumido boolean not null default false,
  intentos int not null default 0,
  created_at timestamptz not null default now()
);

create table audit_logs (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid references profiles(id) on delete set null,
  accion text not null,
  tabla text,
  registro_id uuid,
  detalles jsonb,
  ip text,
  fecha timestamptz not null default now()
);

-- ========================== ÍNDICES ==========================
create index idx_pacientes_cedula on pacientes(cedula);
create index idx_consultas_paciente on consultas(paciente_id, fecha_hora);
create index idx_consultas_medico on consultas(medico_id, fecha_hora);
create index idx_solicitudes_estado on solicitudes(estado, fecha);
create index idx_solicitudes_cobrado on solicitudes(cobrado);
create index idx_resultados_detalle on resultados(solicitud_detalle_id);
create index idx_recipes_paciente on recipes(paciente_id);
create index idx_recipes_estado on recipes(estado);
create index idx_pagos_fecha on pagos(fecha);
create index idx_audit_fecha on audit_logs(fecha);
create index idx_portal_codigos_paciente on portal_codigos(paciente_id);

-- ========================== TRIGGERS ==========================
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at := now();
  return new;
end;
$$ language plpgsql;

create trigger trg_profiles_updated before update on profiles
  for each row execute function set_updated_at();
create trigger trg_pacientes_updated before update on pacientes
  for each row execute function set_updated_at();
create trigger trg_consultas_updated before update on consultas
  for each row execute function set_updated_at();
create trigger trg_solicitudes_updated before update on solicitudes
  for each row execute function set_updated_at();
