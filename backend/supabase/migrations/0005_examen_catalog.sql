-- 0005_examen_catalog.sql
-- TotalHealth: enriquecer catálogo de exámenes con condiciones previas
-- (ajuno, recolección de muestras) y tiempo estimado de entrega.

alter table examenes_laboratorio
  add column condiciones_previas text,
  add column tiempo_entrega text;