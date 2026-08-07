-- 0017_historial_medico.sql
-- TotalHealth: Historial Médico Digital e Integración de Laboratorio.
-- 7 categorías de especialidades, lectura global entre médicos, escritura
-- estricta/trazable (sin DELETE), correcciones vinculadas (Fe de Erratas /
-- Adenda), notas privadas, banner de alertas críticas e interconsultas.

-- ========================== CATÁLOGO DE ESPECIALIDADES ==========================
create table if not exists public.categorias_medicas (
  id text primary key,
  nombre text not null,
  descripcion text,
  orden int not null default 0
);

create table if not exists public.especialidades_medicas (
  id text primary key,
  categoria text not null references public.categorias_medicas(id) on delete restrict,
  nombre text not null
);

-- Categoría de especialidad del médico (asignada en el perfil).
alter table public.profiles
  add column if not exists categoria_medica text references public.categorias_medicas(id) on delete set null;

insert into public.categorias_medicas (id, nombre, descripcion, orden) values
  ('atencion_primaria',   'Atención Primaria y Medicina General', 'Medicina General, Pediatría, Geriatría', 1),
  ('especialidades_clinicas', 'Especialidades Clínicas', 'Cardiología, Neurología, Gastroenterología, Endocrinología', 2),
  ('especialidades_quirurgicas', 'Especialidades Quirúrgicas', 'Cirugía General, Traumatología, Neurocirugía', 3),
  ('medico_quirurgicas',  'Médico-Quirúrgicas', 'Gineco/Obstetricia, Urología, Oftalmología, ORL', 4),
  ('diagnostico_apoyo',   'Diagnóstico y Apoyo Clínico', 'Patología, Radiología, Imagenología', 5),
  ('critica_urgencias',   'Medicina Crítica y Urgencias', 'Intensivistas, Anestesiólogos, Emergentólogos', 6),
  ('salud_publica',       'Salud Pública y Otras', 'Fisiatría, Medicina Ocupacional, del Deporte', 7)
on conflict (id) do nothing;

insert into public.especialidades_medicas (id, categoria, nombre) values
  ('medicina_general', 'atencion_primaria', 'Medicina General'),
  ('pediatria',        'atencion_primaria', 'Pediatría'),
  ('geriatria',        'atencion_primaria', 'Geriatría'),
  ('cardiologia',      'especialidades_clinicas', 'Cardiología'),
  ('neurologia',       'especialidades_clinicas', 'Neurología'),
  ('gastroenterologia','especialidades_clinicas', 'Gastroenterología'),
  ('endocrinologia',   'especialidades_clinicas', 'Endocrinología'),
  ('cirugia_general',  'especialidades_quirurgicas', 'Cirugía General'),
  ('traumatologia',    'especialidades_quirurgicas', 'Traumatología'),
  ('neurocirugia',     'especialidades_quirurgicas', 'Neurocirugía'),
  ('ginecologia',      'medico_quirurgicas', 'Ginecología y Obstetricia'),
  ('urologia',         'medico_quirurgicas', 'Urología'),
  ('oftalmologia',     'medico_quirurgicas', 'Oftalmología'),
  ('orl',              'medico_quirurgicas', 'Otorrinolaringología'),
  ('patologia',        'diagnostico_apoyo', 'Patología'),
  ('radiologia',       'diagnostico_apoyo', 'Radiología'),
  ('imagenologia',     'diagnostico_apoyo', 'Imagenología'),
  ('medicina_critica', 'critica_urgencias', 'Medicina Crítica'),
  ('anestesiologia',   'critica_urgencias', 'Anestesiología'),
  ('emergencias',      'critica_urgencias', 'Emergentología'),
  ('fisiatria',        'salud_publica', 'Fisiatría'),
  ('medicina_ocupacional', 'salud_publica', 'Medicina Ocupacional'),
  ('medicina_deporte', 'salud_publica', 'Medicina del Deporte')
on conflict (id) do nothing;

-- ========================== HISTORIAL CLÍNICO COMPARTIDO ==========================
-- Registro inmutable del historial compartido (módulo B). CREATE solo durante
-- consulta/procedimiento/interconsulta; sin UPDATE ni DELETE (corrección vía
-- historial_correcciones con marca de agua).
create table if not exists public.historial_clinico (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid references public.clinicas(id) on delete set null,
  paciente_id uuid not null references public.pacientes(id) on delete cascade,
  consulta_id uuid references public.consultas(id) on delete set null,
  medico_id uuid not null references public.profiles(id) on delete restrict,
  tipo text not null check (tipo in ('evolucion', 'procedimiento', 'interconsulta', 'resultado', 'otro')),
  categoria_origen text references public.categorias_medicas(id) on delete set null,
  titulo text not null,
  contenido jsonb not null default '{}'::jsonb,
  firma_hash text not null,
  created_at timestamptz not null default now()
);

-- Correcciones vinculadas al registro original (Fe de Erratas / Adenda) con
-- marca de agua: fecha, hora, ID del médico y firma digital. Inmutables.
create table if not exists public.historial_correcciones (
  id uuid primary key default gen_random_uuid(),
  historial_id uuid not null references public.historial_clinico(id) on delete cascade,
  tipo text not null check (tipo in ('fe_errata', 'adenda')),
  contenido jsonb not null default '{}'::jsonb,
  medico_id uuid not null references public.profiles(id) on delete restrict,
  firma_hash text not null,
  created_at timestamptz not null default now()
);

-- Notas Privadas de Consulta (módulo B): visibles solo para el médico autor.
create table if not exists public.notas_privadas (
  id uuid primary key default gen_random_uuid(),
  paciente_id uuid not null references public.pacientes(id) on delete cascade,
  consulta_id uuid references public.consultas(id) on delete set null,
  medico_id uuid not null references public.profiles(id) on delete restrict,
  contenido text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Banner Global de Alertas Críticas (módulo A): alergias confirmadas,
-- enfermedades crónicas relevantes y medicamentos críticos (anticoagulantes).
create table if not exists public.alertas_criticas (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid references public.clinicas(id) on delete set null,
  paciente_id uuid not null references public.pacientes(id) on delete cascade,
  tipo text not null check (tipo in ('alergia', 'enfermedad_cronica', 'medicamento_critico')),
  descripcion text not null,
  severidad text not null default 'alta' check (severidad in ('alta', 'media')),
  activa boolean not null default true,
  creado_por uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

-- Interconsultas y Referencias (módulo C): derivación a otra categoría de
-- especialidad con hipótesis inicial y especialista destino opcional.
create table if not exists public.interconsultas (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid references public.clinicas(id) on delete set null,
  paciente_id uuid not null references public.pacientes(id) on delete cascade,
  consulta_origen_id uuid references public.consultas(id) on delete set null,
  medico_origen_id uuid not null references public.profiles(id) on delete restrict,
  categoria_destino text not null references public.categorias_medicas(id) on delete restrict,
  especialidad_destino text references public.especialidades_medicas(id) on delete set null,
  medico_destino_id uuid references public.profiles(id) on delete set null,
  motivo text not null,
  hipotesis text,
  estado text not null default 'enviada' check (estado in ('enviada', 'aceptada', 'completada', 'cancelada')),
  respuesta text,
  medico_responde_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ========================== ÍNDICES ==========================
create index if not exists idx_historial_paciente on public.historial_clinico(paciente_id, created_at desc);
create index if not exists idx_historial_medico on public.historial_clinico(medico_id);
create index if not exists idx_historial_consulta on public.historial_clinico(consulta_id);
create index if not exists idx_correcciones_historial on public.historial_correcciones(historial_id);
create index if not exists idx_notas_paciente on public.notas_privadas(paciente_id, medico_id);
create index if not exists idx_alertas_criticas_paciente on public.alertas_criticas(paciente_id, activa);
create index if not exists idx_interconsultas_destino on public.interconsultas(categoria_destino, estado, created_at desc);
create index if not exists idx_interconsultas_paciente on public.interconsultas(paciente_id);
create index if not exists idx_profiles_categoria on public.profiles(categoria_medica);

-- ========================== RLS ==========================
alter table public.categorias_medicas enable row level security;
alter table public.especialidades_medicas enable row level security;
alter table public.historial_clinico enable row level security;
alter table public.historial_correcciones enable row level security;
alter table public.notas_privadas enable row level security;
alter table public.alertas_criticas enable row level security;
alter table public.interconsultas enable row level security;

-- Catálogos: lectura abierta a todo el staff autenticado.
create policy cat_medicas_read on public.categorias_medicas for select to authenticated using (true);
create policy esp_medicas_read on public.especialidades_medicas for select to authenticated using (true);

-- Personal médico (médico/admin/super_root) puede escribir en el historial.
create policy historial_read on public.historial_clinico for select to authenticated using (true);
create policy historial_insert on public.historial_clinico for insert to authenticated
  with check (exists (
    select 1 from profiles p where p.id = auth.uid()
      and p.role in ('medico', 'admin', 'super_root')
  ));

create policy correcciones_read on public.historial_correcciones for select to authenticated using (true);
create policy correcciones_insert on public.historial_correcciones for insert to authenticated
  with check (exists (
    select 1 from profiles p where p.id = auth.uid()
      and p.role in ('medico', 'admin', 'super_root')
  ));

-- Notas privadas: solo su autor (o super_root) puede leer/actualizar.
create policy notas_own on public.notas_privadas for select to authenticated
  using (medico_id = auth.uid() or is_super_root());
create policy notas_insert on public.notas_privadas for insert to authenticated
  with check (exists (
    select 1 from profiles p where p.id = auth.uid()
      and p.role in ('medico', 'admin', 'super_root')
  ));
create policy notas_update_own on public.notas_privadas for update to authenticated
  using (medico_id = auth.uid() or is_super_root())
  with check (medico_id = auth.uid() or is_super_root());

-- Banner de alertas críticas: lectura global, escritura médica, desactivación admin.
create policy alertas_criticas_read on public.alertas_criticas for select to authenticated using (true);
create policy alertas_criticas_insert on public.alertas_criticas for insert to authenticated
  with check (exists (
    select 1 from profiles p where p.id = auth.uid()
      and p.role in ('medico', 'admin', 'super_root')
  ));
create policy alertas_criticas_update on public.alertas_criticas for update to authenticated
  using (is_role('admin') or is_super_root());

-- Interconsultas: lectura global, derivación por personal médico, respuesta del
-- destino (categoría/especialidad) o admin.
create policy interconsultas_read on public.interconsultas for select to authenticated using (true);
create policy interconsultas_insert on public.interconsultas for insert to authenticated
  with check (exists (
    select 1 from profiles p where p.id = auth.uid()
      and p.role in ('medico', 'admin', 'super_root')
  ));
create policy interconsultas_update on public.interconsultas for update to authenticated
  using (is_role('admin') or is_super_root() or exists (
    select 1 from profiles p where p.id = auth.uid()
      and p.role = 'medico'
      and (
        p.categoria_medica = interconsultas.categoria_destino
        or p.id = interconsultas.medico_destino_id
        or p.id = interconsultas.medico_origen_id
      )
  ));

create or replace function trg_interconsultas_updated()
returns trigger as $$
begin
  new.updated_at := now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_interconsultas_updated on public.interconsultas;
create trigger trg_interconsultas_updated before update on public.interconsultas
  for each row execute function trg_interconsultas_updated();

drop trigger if exists trg_notas_privadas_updated on public.notas_privadas;
create trigger trg_notas_privadas_updated before update on public.notas_privadas
  for each row execute function set_updated_at();
