-- 0040_nuevas_funcionalidades.sql
-- TotalHealth: alergias del paciente, recordatorios de medicamentos,
-- tracking de muestras, telemedicina, inventario general y controles de calidad.

-- 1) Alergias / contraindicaciones del paciente (historial clínico).
create table if not exists public.pacientes_alergias (
  id uuid primary key default gen_random_uuid(),
  paciente_id uuid not null references public.pacientes(id) on delete cascade,
  tipo text not null default 'medicamento',       -- medicamento | alimento | otro
  nombre text not null,
  reaccion text,                                   -- descripción de la reacción
  severidad text check (severidad in ('leve','moderada','grave') or severidad is null),
  clinica_id uuid,
  activo boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_pacientes_alergias_paciente on public.pacientes_alergias(paciente_id);

-- 2) Recordatorios de medicamentos (por línea de receta).
create table if not exists public.medicamento_recordatorios (
  id uuid primary key default gen_random_uuid(),
  recipe_detalle_id uuid not null references public.recipes_detalle(id) on delete cascade,
  paciente_id uuid not null references public.pacientes(id) on delete cascade,
  hora time not null,
  activo boolean not null default true,
  canal text check (canal in ('push','whatsapp','sms')) not null default 'push',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_medicamento_recordatorios_paciente on public.medicamento_recordatorios(paciente_id);
create index if not exists idx_medicamento_recordatorios_detalle on public.medicamento_recordatorios(recipe_detalle_id);

-- 3) Tracking de muestras en tiempo real por línea de solicitud.
create table if not exists public.muestras_tracking (
  id uuid primary key default gen_random_uuid(),
  solicitud_detalle_id uuid not null references public.solicitudes_detalle(id) on delete cascade,
  solicitud_id uuid not null references public.solicitudes(id) on delete cascade,
  estado text not null default 'recibida',          -- recibida | en_analisis | completada
  usuario_id uuid,
  clinica_id uuid,
  notas text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_muestras_tracking_solicitud on public.muestras_tracking(solicitud_detalle_id);

-- Añadir columna de estado de muestra a solicitudes_detalle.
alter table public.solicitudes_detalle
  add column if not exists estado_muestra text default 'pendiente';

-- 4) Telemedicina: enlace de videollamada por consulta.
alter table public.consultas
  add column if not exists url_telemedicina text,
  add column if not exists es_telemedicina boolean not null default false;

-- 5) Inventario general (insumos, papelería, equipos — no solo reactivos).
create table if not exists public.inventario_general (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null,
  nombre text not null,
  categoria text,                                   -- papelería | insumos | equipos | limpieza | otro
  unidad text,
  cantidad numeric not null default 0,
  alerta_minima numeric,
  costo_unitario numeric,
  proveedor text,
  ubicacion text,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_inventario_general_clinica on public.inventario_general(clinica_id);

-- 6) Control de calidad interno del laboratorio (Levey-Jennings).
create table if not exists public.controles_calidad (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null,
  examen_id uuid references public.examenes_laboratorio(id) on delete set null,
  parametro text not null,                          -- clave del parámetro (ej. glicemia)
  nombre text not null,                             -- nombre del control
  lote text,
  media numeric not null,                           -- valor medio esperado
  desviacion_estandar numeric not null,             -- SD esperado
  unidad text,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_controles_calidad_clinica on public.controles_calidad(clinica_id);

-- Mediciones de control (puntos para las gráficas Levey-Jennings).
create table if not exists public.controles_calidad_mediciones (
  id uuid primary key default gen_random_uuid(),
  control_id uuid not null references public.controles_calidad(id) on delete cascade,
  valor numeric not null,
  fecha timestamptz not null default now(),
  usuario_id uuid,
  notas text,
  created_at timestamptz not null default now()
);
create index if not exists idx_controles_mediciones_control on public.controles_calidad_mediciones(control_id);
