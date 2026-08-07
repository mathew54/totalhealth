-- 0003_rpc.sql
-- TotalHealth: funciones RPC del portal público (acceso por cédula + OTP).
-- Todas son security definer. El backend verifica el JWT del portal y
-- llama a estas funciones con el p_paciente_id ya autenticado.

-- Genera y registra un código OTP para un paciente por cédula.
-- NO devuelve el código por seguridad; va por SMS/WhatsApp.
create or replace function generar_codigo_otp(p_cedula text)
returns json
language plpgsql
security definer set search_path = public
as $$
declare
  v_paciente public.pacientes;
  v_codigo text;
  v_hash text;
begin
  select * into v_paciente
    from public.pacientes
    where lower(cedula) = lower(p_cedula) and deleted_at is null
    limit 1;

  if v_paciente.id is null then
    return json_build_object('success', false, 'message', 'Paciente no encontrado');
  end if;

  -- Limpiar códigos previos sin consumir
  delete from public.portal_codigos
    where paciente_id = v_paciente.id and consumido = false and expira_at < now();

  v_codigo := lpad(floor(random() * 1000000)::text, 6, '0');
  v_hash := encode(hmac(v_codigo, 'portal-otp-' || v_paciente.id::text, 'sha256'), 'hex');

  insert into public.portal_codigos (paciente_id, codigo_hash, expira_at)
    values (v_paciente.id, v_hash, now() + interval '5 minutes');

  -- Integración SMS/WhatsApp pendiente (Twilio, etc.). En dev se loguea el código.
  perform pg_notify('portal_otp', json_build_object(
    'paciente_id', v_paciente.id,
    'telefono', v_paciente.telefono,
    'codigo', v_codigo
  )::text);

  return json_build_object(
    'success', true,
    'message', 'Código enviado al teléfono registrado',
    'enmascarado', concat('***', substr(coalesce(v_paciente.telefono, ''), -4))
  );
end;
$$;

-- Valida OTP y confirma la identidad del paciente.
-- Devuelve los datos mínimos del paciente para que el backend emita su JWT.
create or replace function verificar_codigo_otp(p_cedula text, p_codigo text)
returns json
language plpgsql
security definer set search_path = public
as $$
declare
  v_paciente public.pacientes;
  v_registro public.portal_codigos;
  v_hash text;
begin
  select * into v_paciente
    from public.pacientes
    where lower(cedula) = lower(p_cedula) and deleted_at is null
    limit 1;

  if v_paciente.id is null then
    return json_build_object('success', false, 'message', 'Paciente no encontrado');
  end if;

  v_hash := encode(hmac(p_codigo, 'portal-otp-' || v_paciente.id::text, 'sha256'), 'hex');

  select * into v_registro
    from public.portal_codigos
    where paciente_id = v_paciente.id
      and codigo_hash = v_hash
      and consumido = false
      and expira_at > now()
    order by created_at desc
    limit 1;

  if v_registro.id is null then
    update public.portal_codigos set intentos = intentos + 1
      where paciente_id = v_paciente.id and consumido = false;
    return json_build_object('success', false, 'message', 'Código inválido o expirado');
  end if;

  update public.portal_codigos set consumido = true where id = v_registro.id;

  return json_build_object(
    'success', true,
    'paciente', json_build_object(
      'id', v_paciente.id,
      'cedula', v_paciente.cedula,
      'nombre_completo', v_paciente.nombre_completo
    )
  );
end;
$$;

-- Resultados del paciente (PDFs) — solo con p_paciente_id verificado por el backend.
create or replace function mis_resultados(p_paciente_id uuid)
returns setof public.resultados
language plpgsql
security definer set search_path = public
as $$
begin
  return query
    select r.*
    from public.resultados r
    join public.solicitudes_detalle sd on sd.id = r.solicitud_detalle_id
    join public.solicitudes s on s.id = sd.solicitud_id
    where s.paciente_id = p_paciente_id
    order by r.procesado_at desc;
end;
$$;

-- Récipes activos del paciente.
create or replace function mis_recipes(p_paciente_id uuid)
returns setof public.recipes
language plpgsql
security definer set search_path = public
as $$
begin
  return query
    select r.*
    from public.recipes r
    where r.paciente_id = p_paciente_id
      and r.estado = 'activo'
    order by r.fecha_emision desc;
end;
$$;

-- Histórico resumido de consultas completadas.
create or replace function mis_consultas(p_paciente_id uuid)
returns setof public.consultas
language plpgsql
security definer set search_path = public
as $$
begin
  return query
    select c.*
    from public.consultas c
    where c.paciente_id = p_paciente_id
      and c.estado = 'completada'
    order by c.fecha_hora desc;
end;
$$;
