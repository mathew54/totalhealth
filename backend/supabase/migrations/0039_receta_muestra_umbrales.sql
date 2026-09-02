-- 0039_receta_muestra_umbrales.sql
-- TotalHealth: recolección de muestras por examen + umbrales por edad/sexo.
--
-- 1) examenes_laboratorio: datos de recolección de la muestra (tubo, tipo,
--    volumen) que completan la receta de insumos (examenes_reactivos).
-- 2) parametros_referencia: umbrales clínicos dependientes de edad (años) y
--    sexo del paciente, típicos de los LIS (rangos de referencia por grupo).

-- 1) Recolección de muestra por examen.
alter table public.examenes_laboratorio
  add column if not exists tipo_muestra text,
  add column if not exists tubo text,
  add column if not exists volumen_muestra text;

-- 2) Umbrales por edad y sexo.
alter table public.parametros_referencia
  add column if not exists edad_min int,
  add column if not exists edad_max int,
  add column if not exists sexo text check (sexo in ('M', 'F') or sexo is null);