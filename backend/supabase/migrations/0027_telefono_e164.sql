-- 0027_telefono_e164.sql
-- Teléfonos en formato E.164 estricto (+CC + número nacional sin separadores ni
-- ceros a la izquierda). La persistencia ya usa un único campo string
-- (`telefono`) en todas las tablas; esta migración solo normaliza los datos
-- legados (espacios, guiones, paréntesis y ceros iniciales) para que la API
-- pueda separar `country_code` / `local_number` de forma fiable.
--
-- NOTA: solo se tocan valores en claro. Los valores cifrados en reposo
-- (`enc:v1:...`) se normalizan en la capa de aplicación al leerlos/escribirlos.

create or replace function normalizar_telefono_e164(t text) returns text as $$
begin
  if t is null or t = '' then return t; end if;
  if t like 'enc:v1:%' then return t; end if;

  -- Quita espacios, guiones, paréntesis y puntos.
  t := regexp_replace(t, '[\s\-().]', '', 'g');
  if t ~ '^\+' then
    -- Quita un 0 inicial del número nacional (ej. +58 0412-... → +58412...).
    return regexp_replace(t, '^\+(\d{1,3})0(\d+)', E'+\\1\\2');
  end if;

  -- Sin prefijo de país: se asume Venezuela (+58) y se quita el 0 inicial.
  t := regexp_replace(t, '^0+', '');
  return '+58' || t;
end;
$$ language plpgsql;

update public.pacientes
  set telefono = normalizar_telefono_e164(telefono)
  where telefono is not null and telefono <> '';

update public.profiles
  set telefono = normalizar_telefono_e164(telefono)
  where telefono is not null and telefono <> '';

update public.clinicas
  set telefono = normalizar_telefono_e164(telefono)
  where telefono is not null and telefono <> '';

update public.app_config
  set telefono = normalizar_telefono_e164(telefono)
  where telefono is not null and telefono <> '';

update public.muestras_domicilio
  set telefono = normalizar_telefono_e164(telefono)
  where telefono is not null and telefono <> '';

update public.notificaciones
  set telefono = normalizar_telefono_e164(telefono)
  where telefono is not null and telefono <> '';

drop function normalizar_telefono_e164(text);
