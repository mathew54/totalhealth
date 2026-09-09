-- 0046_tarifas_especialidad.sql
-- TotalHealth: las tarifas de consulta pueden vincularse a una especialidad.
-- Permite filtrar, al configurar la tarifa, los médicos que manejan esa
-- especialidad (y, en el futuro, asignar la tarifa directo por especialidad).

alter table public.tarifas_consulta
  add column if not exists especialidad text references public.especialidades_medicas(id) on delete set null;

create index if not exists idx_tarifas_especialidad on public.tarifas_consulta(especialidad);