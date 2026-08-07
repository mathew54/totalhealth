-- seed.sql
-- TotalHealth: trigger de auditoría + datos base de desarrollo.

-- ========================== TRIGGER AUDIT ==========================
create or replace function write_audit_log()
returns trigger
language plpgsql as $$
begin
  insert into public.audit_logs (
    usuario_id, accion, tabla, registro_id, detalles, ip
  )
  values (
    auth.uid(),
    tg_op,             -- INSERT / UPDATE / DELETE
    tg_table_name,
    case when tg_op = 'DELETE' then old.id else new.id end,
    jsonb_build_object('old', to_jsonb(old), 'new', to_jsonb(new)),
    nullif(current_setting('request.headers', true), '')::jsonb ->> 'x-forwarded-for'
  );
  return coalesce(new, old);
end;
$$;

-- Módulos sensibles que se auditan por defecto.
do $$ begin
  execute 'create trigger trg_audit_pacientes after insert or update or delete on public.pacientes for each row execute function write_audit_log()';
  execute 'create trigger trg_audit_consultas after insert or update or delete on public.consultas for each row execute function write_audit_log()';
  execute 'create trigger trg_audit_solicitudes after insert or update or delete on public.solicitudes for each row execute function write_audit_log()';
  execute 'create trigger trg_audit_resultados after insert or update or delete on public.resultados for each row execute function write_audit_log()';
  execute 'create trigger trg_audit_recipes after insert or update or delete on public.recipes for each row execute function write_audit_log()';
  execute 'create trigger trg_audit_pagos after insert or update or delete on public.pagos for each row execute function write_audit_log()';
end $$;

-- ========================== DATOS DEMO ==========================
-- Solo se ejecutan si las tablas están vacías.
insert into public.clinicas (id, nombre, rif, direccion, telefono)
select '00000000-0000-0000-0000-000000000001', 'Clínica Demo', 'J-00000000-0', 'Av. Principal', '+584121234567'
where not exists (select 1 from public.clinicas);

-- Los perfiles se crean desde el backend tras registrar usuarios en auth.users.
-- Ejemplo de admin (id real vendría de auth.users en producción):
-- insert into public.profiles (id, role, clinica_id, nombre_completo, cedula, telefono)
-- values ('<uuid-auth-user>', 'admin', '00000000-0000-0000-0000-000000000001', 'Admin Demo', 'V-12345678', '+584121234567');

-- ========================== TASAS DE CAMBIO ==========================
-- Tasa de referencia del día (manual) si la tabla está vacía.
do $$
begin
  if not exists (select 1 from public.tasas_cambio) then
    insert into public.tasas_cambio (fecha, moneda, valor, origen, activa)
    values
      (current_date, 'USD', 36.50, 'manual', true),
      (current_date, 'EUR', 39.80, 'manual', true)
    on conflict (fecha, moneda, origen) do nothing;
    raise notice 'tasas del día insertadas';
  end if;
end $$;

-- ========================== SERIE HISTÓRICA DE EVOLUCIÓN ==========================
-- Datos de prueba: serie de glicemia y colesterol del paciente demo Juan Pérez.
-- Requiere que existan: clínica demo, un médico de la clínica y un bioanalista.
do $$
declare
  v_clinica uuid;
  v_medico uuid;
  v_lab uuid;
  v_paciente uuid;
  v_ex_glic uuid;
  v_ex_col uuid;
  v_consult uuid;
  v_sol uuid;
  v_linea uuid;
begin
  select id into v_clinica from public.clinicas limit 1;
  if v_clinica is null then
    raise notice 'sin clínica, se omite la serie';
    return;
  end if;

  select id into v_medico from public.profiles where role = 'medico' limit 1;
  select id into v_lab from public.profiles where role = 'laboratorio' limit 1;
  if v_medico is null or v_lab is null then
    raise notice 'sin médico/bioanalista, se omite la serie';
    return;
  end if;

  select id into v_paciente from public.pacientes where cedula = 'V-12345678' limit 1;
  if v_paciente is null then
    raise notice 'sin paciente demo, se omite la serie';
    return;
  end if;

  select id into v_ex_glic from public.examenes_laboratorio where nombre = 'Glicemia en ayunas' and clinica_id = v_clinica limit 1;
  select id into v_ex_col from public.examenes_laboratorio where nombre = 'Colesterol total' and clinica_id = v_clinica limit 1;
  if v_ex_glic is null or v_ex_col is null then
    raise notice 'sin exámenes, se omite la serie';
    return;
  end if;

  -- Muestra histórica: glicemia y colesterol en los últimos ~34 días.
  if not exists (select 1 from public.resultados r
    join public.solicitudes_detalle sd on sd.id = r.solicitud_detalle_id
    join public.solicitudes s on s.id = sd.solicitud_id
    where s.paciente_id = v_paciente
      and sd.examen_id in (v_ex_glic, v_ex_col)) then

    insert into public.consultas (paciente_id, medico_id, clinica_id, fecha_hora, motivo, diagnostico, estado)
    values (v_paciente, v_medico, v_clinica, now() - interval '40 days', 'Control metabólico', 'Serie de evolución', 'completada')
    returning id into v_consult;

    -- glicemia: 3 puntos
    insert into public.solicitudes (consulta_id, paciente_id, medico_id, clinica_id, fecha, estado, cobrado)
    values (v_consult, v_paciente, v_medico, v_clinica, now() - interval '34 days', 'entregado', true)
    returning id into v_sol;
    insert into public.solicitudes_detalle (solicitud_id, examen_id, precio)
    values (v_sol, v_ex_glic, 10) returning id into v_linea;
    insert into public.resultados (solicitud_detalle_id, bioanalista_id, valores, procesado_at)
    values (v_linea, v_lab, jsonb_build_object('glicemia', '97 mg/dL'), now() - interval '34 days');

    insert into public.solicitudes (consulta_id, paciente_id, medico_id, clinica_id, fecha, estado, cobrado)
    values (v_consult, v_paciente, v_medico, v_clinica, now() - interval '20 days', 'entregado', true)
    returning id into v_sol;
    insert into public.solicitudes_detalle (solicitud_id, examen_id, precio)
    values (v_sol, v_ex_glic, 10) returning id into v_linea;
    insert into public.resultados (solicitud_detalle_id, bioanalista_id, valores, procesado_at)
    values (v_linea, v_lab, jsonb_build_object('glicemia', '102 mg/dL'), now() - interval '20 days');

    -- colesterol: 2 puntos
    insert into public.solicitudes (consulta_id, paciente_id, medico_id, clinica_id, fecha, estado, cobrado)
    values (v_consult, v_paciente, v_medico, v_clinica, now() - interval '27 days', 'entregado', true)
    returning id into v_sol;
    insert into public.solicitudes_detalle (solicitud_id, examen_id, precio)
    values (v_sol, v_ex_col, 12) returning id into v_linea;
    insert into public.resultados (solicitud_detalle_id, bioanalista_id, valores, procesado_at)
    values (v_linea, v_lab, jsonb_build_object('colesterol_total', '212 mg/dL', 'trigliceridos', '150 mg/dL'), now() - interval '27 days');

    insert into public.solicitudes (consulta_id, paciente_id, medico_id, clinica_id, fecha, estado, cobrado)
    values (v_consult, v_paciente, v_medico, v_clinica, now() - interval '13 days', 'entregado', true)
    returning id into v_sol;
    insert into public.solicitudes_detalle (solicitud_id, examen_id, precio)
    values (v_sol, v_ex_col, 12) returning id into v_linea;
    insert into public.resultados (solicitud_detalle_id, bioanalista_id, valores, procesado_at)
    values (v_linea, v_lab, jsonb_build_object('colesterol_total', '198 mg/dL', 'trigliceridos', '138 mg/dL'), now() - interval '13 days');

    raise notice 'serie de evolución insertada para el paciente demo';
  else
    raise notice 'la serie de evolución ya existe';
  end if;
end $$;

-- ========================== CUESTIONARIO DE HISTORIAL (DEMO) ==========================
-- Cuestionario de anamnesis para el paciente demo (Juan Pérez, V-12345678) si
-- aún no existe. Requiere la migración 0018 y un médico de la clínica.
do $$
declare
  v_clinica uuid;
  v_medico uuid;
  v_paciente uuid;
begin
  select id into v_clinica from public.clinicas limit 1;
  if v_clinica is null then
    raise notice 'sin clínica, se omite el cuestionario demo';
    return;
  end if;
  select id into v_medico from public.profiles where role in ('medico', 'admin') limit 1;
  select id into v_paciente from public.pacientes where cedula = 'V-12345678' limit 1;
  if v_medico is null or v_paciente is null then
    raise notice 'sin médico/paciente demo, se omite el cuestionario';
    return;
  end if;

  if not exists (select 1 from public.cuestionarios_historial where paciente_id = v_paciente) then
    insert into public.cuestionarios_historial (
      clinica_id, paciente_id, origen, creado_por_medico, estado, respuestas, consolidado_at
    ) values (
      v_clinica, v_paciente, 'medico', v_medico, 'consolidado',
      jsonb_build_object(
        'actividad_fisica', jsonb_build_object('marcado', true, 'detalle', 'Caminata 30 min, 3 veces por semana'),
        'enfermedades_cronicas', jsonb_build_object('marcado', true, 'detalle', 'Asma bronquial, 12 años de diagnóstico'),
        'alergias', jsonb_build_object('marcado', true, 'detalle', 'Penicilina: reacción anafiláctica previa'),
        'historial_cardiovascular', jsonb_build_object('marcado', true, 'detalle', 'Padre: infarto a los 60 años'),
        'observaciones', 'Paciente en control por asma; derivado a cardiología por palpitaciones.'
      ),
      now() - interval '6 days'
    );
    raise notice 'cuestionario demo insertado para %', v_paciente;
  else
    raise notice 'el cuestionario demo ya existe';
  end if;
end $$;