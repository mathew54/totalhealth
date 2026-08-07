-- 0021_perfiles_especialidades.sql
-- TotalHealth: perfiles flexibles y multiespecialidad.
--
-- Un médico puede tener N especialidades registradas en su perfil (array),
-- colegiatura/licencia, firma/sello digital y una configuración de dashboard
-- (vista por especialidad activa vs. vista consolidada de todas sus
-- especialidades). Se conserva `especialidad`/`categoria_medica` como la
-- especialidad primaria (primera del array) para no romper los filtros
-- existentes (agenda, reservas online, disponibilidad).

-- 1) Columnas nuevas del perfil.
alter table public.profiles
  add column if not exists especialidades text[] not null default '{}',
  add column if not exists colegiatura text,
  add column if not exists firma_digital text,
  add column if not exists especialidad_activa text,
  add column if not exists dashboard_config jsonb not null default '{"vista":"consolidada"}'::jsonb;

-- 2) Backfill: migra la especialidad única existente al array y a la activa.
update public.profiles
  set especialidades = array_remove(array[especialidad], null),
      especialidad_activa = especialidad
  where especialidad is not null
    and coalesce(array_length(especialidades, 1), 0) = 0;

-- 3) Saneamiento: la especialidad activa debe pertenecer al array de la persona.
update public.profiles
  set especialidad_activa = especialidades[1]
  where especialidad_activa is not null
    and not (especialidad_activa = any (especialidades));

-- 4) Índice GIN para búsqueda por especialidades.
create index if not exists idx_profiles_especialidades on public.profiles using gin (especialidades);

-- 5) RLS: las políticas existentes (profiles_self / profiles_update_self /
--    profiles_admin_clinic / profiles_super) ya cubren la tabla completa, así
--    que las columnas nuevas heredan esos permisos. Reafirmamos la actualización
--    del propio perfil (necesaria para el selector de especialidad activa).
do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'profiles' and policyname = 'profiles_update_self') then
    create policy profiles_update_self on public.profiles for update to authenticated
      using (auth.uid() = id) with check (auth.uid() = id);
  end if;
end $$;
