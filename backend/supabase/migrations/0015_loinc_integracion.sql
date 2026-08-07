-- 0015_loinc_integracion.sql
-- TotalHealth: mapeo LOINC y códigos de integración LIS/HIS/EMR.
-- Permite mapear cada examen del catálogo a un código LOINC estándar y a un
-- código externo usado por el sistema de origen (HL7/FHIR). También se habilita
-- la bandera de "mapeado" para validar la integración.

alter table public.examenes_laboratorio
  add column if not exists codigo_loinc text,
  add column if not exists codigo_externo text,
  add column if not exists fecha_mapeo timestamptz;

create index if not exists idx_examenes_loinc on public.examenes_laboratorio(codigo_loinc);
create index if not exists idx_examenes_externo on public.examenes_laboratorio(codigo_externo);