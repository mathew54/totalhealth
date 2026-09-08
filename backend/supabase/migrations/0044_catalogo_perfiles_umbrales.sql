-- 0044_catalogo_perfiles_umbrales.sql
-- TotalHealth: catálogo inicial de exámenes de los 4 perfiles clínicos
-- (Hematológico, Bioquímico, Hepático, Lipídico) con sus valores de
-- referencia por grupo etario y sexo, típicos de un LIS.
--
-- Cambios de esquema:
--   1) parametros_referencia: se elimina el único por (examen_id, parametro)
--      para permitir varios rangos por edad/sexo del mismo parámetro.
--   2) parametros_referencia: nueva columna codigo_loinc (LOINC del analito).
--
-- La siembra es idempotente: no duplica exámenes (por codigo_loinc) ni
-- umbrales ya existentes (misma combinación examen/parámetro/edad/sexo).

alter table public.parametros_referencia
  drop constraint if exists parametros_referencia_examen_id_parametro_key;

alter table public.parametros_referencia
  add column if not exists codigo_loinc text;

create index if not exists idx_parametros_examen_parametro
  on public.parametros_referencia(examen_id, parametro);

-- ---------------------------------------------------------------------------
-- 1) Catálogo de exámenes de los perfiles (rangos/analitos).
--    Incluye los 3 exámenes base ya existentes en la semilla (idempotente por
--    nombre) para que una BD nueva creada solo por migraciones los tenga.
-- ---------------------------------------------------------------------------
with datos (nombre, categoria, precio, interno, duracion_min, condiciones_previas, tiempo_entrega, codigo_loinc, codigo_externo, tipo_muestra, tubo, volumen_muestra) as (
  values
    ('Hematología completa', 'Hematología', 15, true, 45, null, 'Mismo día', '58410-2', 'HEMO-01', 'Sangre total', 'Lila (EDTA)', '3 mL'),
    ('Glicemia en ayunas',    'Química',     10, true, 20, 'Ayuno de 8 a 12 horas', '24 horas', '2345-7', 'GLI-01', 'Suero', 'Rojo (s/Gel)', '2 mL'),
    ('Colesterol total',      'Química',     12, true, 25, 'Ayuno de 12 horas',     '24 horas', '2093-3', 'COL-01', 'Suero', 'Rojo (s/Gel)', '2 mL'),
    ('Creatinina',            'Química',     10, true, 25, null,                   '24 horas', '2160-0', 'CRE-01', 'Suero', 'Rojo (s/Gel)', '2 mL'),
    ('Urea',                  'Química',     10, true, 25, null,                   '24 horas', '3057-3', 'URE-01', 'Suero', 'Rojo (s/Gel)', '2 mL'),
    ('Sodio (Na+)',           'Química',     10, true, 25, null,                   '24 horas', '2951-2', 'SOD-01', 'Suero', 'Rojo (s/Gel)', '2 mL'),
    ('Potasio (K+)',          'Química',     10, true, 25, null,                   '24 horas', '2823-3', 'POT-01', 'Suero', 'Rojo (s/Gel)', '2 mL'),
    ('Bilirrubina total',     'Química',     10, true, 25, 'Evitar exposición prolongada de la muestra a la luz', '24 horas', '1975-2', 'BIL-01', 'Suero', 'Rojo (s/Gel)', '2 mL'),
    ('TGP (ALT)',             'Química',     12, true, 25, null,                   '24 horas', '1742-6', 'ALT-01', 'Suero', 'Rojo (s/Gel)', '2 mL'),
    ('TGO (AST)',             'Química',     12, true, 25, null,                   '24 horas', '1920-8', 'AST-01', 'Suero', 'Rojo (s/Gel)', '2 mL'),
    ('Fosfatasa alcalina',    'Química',     12, true, 25, null,                   '24 horas', '6768-6', 'FAL-01', 'Suero', 'Rojo (s/Gel)', '2 mL'),
    ('Triglicéridos',         'Química',     12, true, 25, 'Ayuno de 12 horas',     '24 horas', '2571-8', 'TRI-01', 'Suero', 'Rojo (s/Gel)', '2 mL'),
    ('Colesterol HDL',        'Química',     12, true, 25, 'Ayuno de 12 horas',     '24 horas', '2085-9', 'HDL-01', 'Suero', 'Rojo (s/Gel)', '2 mL')
)
insert into public.examenes_laboratorio
  (clinica_id, nombre, categoria, precio, interno, duracion_min, condiciones_previas, tiempo_entrega, codigo_loinc, codigo_externo, tipo_muestra, tubo, volumen_muestra, activo)
select null, d.nombre, d.categoria, d.precio, d.interno, d.duracion_min, d.condiciones_previas, d.tiempo_entrega, d.codigo_loinc, d.codigo_externo, d.tipo_muestra, d.tubo, d.volumen_muestra, true
from datos d
where not exists (
  select 1 from public.examenes_laboratorio e
  where e.codigo_loinc = d.codigo_loinc or e.nombre ilike d.nombre
);

-- ---------------------------------------------------------------------------
-- 2) Valores de referencia por examen/parámetro y grupo de edad/sexo.
--    Vínculo con el examen por codigo_loinc. Cada fila anida además el LOINC
--    del analito (columna codigo_loinc de parametros_referencia).
-- ---------------------------------------------------------------------------
with datos (examen_loinc, parametro, nombre, unidad, normal_min, normal_max, critico_min, critico_max, edad_min, edad_max, sexo, loinc) as (
  values
    -- Perfil hematológico (Hematología completa - 58410-2).
    ('58410-2', 'hemoglobina',     'Hemoglobina',        'g/dL', 14.0,    24.0,    null, null, 0,     0,     null, '718-7'),
    ('58410-2', 'hemoglobina',     'Hemoglobina',        'g/dL', 11.5,    14.5,    null, null, 2,     12,    null, '718-7'),
    ('58410-2', 'hemoglobina',     'Hemoglobina',        'g/dL', 13.5,    17.5,    null, null, null,  null,  'M',  '718-7'),
    ('58410-2', 'hemoglobina',     'Hemoglobina',        'g/dL', 12.0,    15.5,    null, null, null,  null,  'F',  '718-7'),
    ('58410-2', 'hematocrito',     'Hematocrito',        '%',    44.0,    64.0,    null, null, 0,     0,     null, '4544-3'),
    ('58410-2', 'hematocrito',     'Hematocrito',        '%',    35.0,    43.0,    null, null, 2,     12,    null, '4544-3'),
    ('58410-2', 'hematocrito',     'Hematocrito',        '%',    42.0,    52.0,    null, null, null,  null,  'M',  '4544-3'),
    ('58410-2', 'hematocrito',     'Hematocrito',        '%',    37.0,    48.0,    null, null, null,  null,  'F',  '4544-3'),
    ('58410-2', 'leucocitos',      'Glóbulos blancos',   '/µL',  9000,    30000,   null, null, 0,     0,     null, '6690-2'),
    ('58410-2', 'leucocitos',      'Glóbulos blancos',   '/µL',  5000,    19500,   null, null, 0,     0,     null, '6690-2'),
    ('58410-2', 'leucocitos',      'Glóbulos blancos',   '/µL',  4000,    11000,   null, null, null,  null,  null, '6690-2'),
    ('58410-2', 'plaquetas',       'Plaquetas',          '/µL',  150000,  450000,  null, null, null,  null,  null, '777-3'),

    -- Perfil bioquímico.
    ('2345-7', 'glicemia',         'Glicemia en ayunas', 'mg/dL', 40,    90,     null, null, 0,    0,    null, '2339-0'),
    ('2345-7', 'glicemia',         'Glicemia en ayunas', 'mg/dL', 70,    110,    50,   250,  null, null, null, '2339-0'),
    ('2160-0', 'creatinina',       'Creatinina',         'mg/dL', 0.3,   1.0,    null, null, 0,    0,    null, '2160-0'),
    ('2160-0', 'creatinina',       'Creatinina',         'mg/dL', 0.2,   0.7,    null, null, 0,    12,   null, '2160-0'),
    ('2160-0', 'creatinina',       'Creatinina',         'mg/dL', 0.5,   1.2,    null, null, null, null, null, '2160-0'),
    ('3057-3', 'urea',             'Urea',               'mg/dL', 5,     18,     null, null, 0,    17,   null, '3057-3'),
    ('3057-3', 'urea',             'Urea',               'mg/dL', 15,    45,     null, null, null, null, null, '3057-3'),
    ('2951-2', 'sodio',            'Sodio',              'mEq/L', 135,   145,    null, null, null, null, null, '2951-2'),
    ('2823-3', 'potasio',          'Potasio',            'mEq/L', 3.7,   5.9,    null, null, 0,    0,    null, '2823-3'),
    ('2823-3', 'potasio',          'Potasio',            'mEq/L', 3.5,   5.1,    null, null, null, null, null, '2823-3'),

    -- Perfil hepático y enzimático.
    ('1975-2', 'bilirrubina_total','Bilirrubina total',  'mg/dL', null,  12.0,   null, null, 0,    0,    null, '1975-2'),
    ('1975-2', 'bilirrubina_total','Bilirrubina total',  'mg/dL', 0.2,   1.2,    null, null, null, null, null, '1975-2'),
    ('1742-6', 'alt',              'TGP (ALT)',          'U/L',   13,    45,     null, null, 0,    0,    null, '1742-6'),
    ('1742-6', 'alt',              'TGP (ALT)',          'U/L',   5,     55,     null, null, null, null, null, '1742-6'),
    ('1920-8', 'ast',              'TGO (AST)',          'U/L',   15,    60,     null, null, 0,    0,    null, '1920-8'),
    ('1920-8', 'ast',              'TGO (AST)',          'U/L',   5,     40,     null, null, null, null, null, '1920-8'),
    ('6768-6', 'fosfatasa_alcalina','Fosfatasa alcalina','U/L',   150,   450,    null, null, 0,    17,   null, '6768-6'),
    ('6768-6', 'fosfatasa_alcalina','Fosfatasa alcalina','U/L',   30,    120,    null, null, null, null, null, '6768-6'),

    -- Perfil lipídico.
    ('2093-3', 'colesterol_total', 'Colesterol total',   'mg/dL', null,  170,    null, null, 0,    17,   null, '2093-3'),
    ('2093-3', 'colesterol_total', 'Colesterol total',   'mg/dL', null,  200,    null, 240,  null, null, null, '2093-3'),
    ('2571-8', 'trigliceridos',    'Triglicéridos',      'mg/dL', null,  90,     null, null, 0,    17,   null, '2571-8'),
    ('2571-8', 'trigliceridos',    'Triglicéridos',      'mg/dL', null,  150,    null, null, null, null, null, '2571-8'),
    ('2085-9', 'hdl',              'Colesterol HDL',     'mg/dL', 40,    null,   null, null, null, null, 'M',  '2085-9'),
    ('2085-9', 'hdl',              'Colesterol HDL',     'mg/dL', 50,    null,   null, null, null, null, 'F',  '2085-9')
)
insert into public.parametros_referencia
  (clinica_id, examen_id, parametro, nombre, unidad, normal_min, normal_max, critico_min, critico_max, activo, edad_min, edad_max, sexo, codigo_loinc)
select null, e.id, d.parametro, d.nombre, d.unidad, d.normal_min, d.normal_max, d.critico_min, d.critico_max, true, d.edad_min, d.edad_max, d.sexo, d.loinc
from datos d
join public.examenes_laboratorio e on e.codigo_loinc = d.examen_loinc
where not exists (
  select 1 from public.parametros_referencia p
  where p.examen_id = e.id
    and p.parametro = d.parametro
    and p.edad_min is not distinct from d.edad_min
    and p.edad_max is not distinct from d.edad_max
    and p.sexo is not distinct from d.sexo
);