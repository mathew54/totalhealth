-- 0002_rls.sql
-- TotalHealth: Row Level Security (defensa en profundidad sobre el RBAC del backend).

-- ========================== HELPERS ==========================
-- Determinan rol y clínica del usuario autenticado (auth.uid()).
create or replace function current_role()
returns rol
security definer set search_path = public
language sql stable as $$
  select p.role from profiles p where p.id = auth.uid();
$$;

create or replace function current_clinic()
returns uuid
security definer set search_path = public
language sql stable as $$
  select p.clinica_id from profiles p where p.id = auth.uid();
$$;

create or replace function is_role(check_role rol)
returns boolean
security definer set search_path = public
language sql stable as $$
  select current_role() = check_role;
$$;

-- super_root siempre puede todo: se evalúa en cada política.
create or replace function is_super_root()
returns boolean
security definer set search_path = public
language sql stable as $$
  select current_role() = 'super_root';
$$;

-- ========================== ENABLE RLS ==========================
alter table public.clinicas enable row level security;
alter table public.profiles enable row level security;
alter table public.pacientes enable row level security;
alter table public.consultas enable row level security;
alter table public.examenes_laboratorio enable row level security;
alter table public.solicitudes enable row level security;
alter table public.solicitudes_detalle enable row level security;
alter table public.resultados enable row level security;
alter table public.recipes enable row level security;
alter table public.recipes_detalle enable row level security;
alter table public.pagos enable row level security;
alter table public.reactivos enable row level security;
alter table public.portal_codigos enable row level security;
alter table public.audit_logs enable row level security;

-- ========================== CLINICAS ==========================
do $$ begin
  create policy clinicas_all_super on clinicas for all to authenticated
    using (is_super_root());
  create policy clinicas_read_own on clinicas for select to authenticated
    using (id = current_clinic());
end $$;

-- ========================== PROFILES ==========================
do $$ begin
  create policy profiles_self on profiles for select to authenticated
    using (id = auth.uid());
  create policy profiles_update_self on profiles for update to authenticated
    using (id = auth.uid()) with check (id = auth.uid());
  create policy profiles_super on profiles for all to authenticated
    using (is_super_root());
  create policy profiles_admin_clinic on profiles for all to authenticated
    using (is_role('admin') and clinica_id = current_clinic());
end $$;

-- ========================== PACIENTES ==========================
do $$ begin
  create policy pacientes_secretaria_admin on pacientes for select to authenticated
    using (is_role('secretaria') or is_role('admin') or is_super_root() or is_role('medico'));
  create policy pacientes_insert_staff on pacientes for insert to authenticated
    with check (is_role('secretaria') or is_role('admin') or is_super_root() or is_role('medico'));
  create policy pacientes_update_staff on pacientes for update to authenticated
    using (is_role('secretaria') or is_role('admin') or is_super_root() or is_role('medico'));
end $$;

-- ========================== CONSULTAS ==========================
do $$ begin
  create policy consultas_medico_own on public.consultas for select to authenticated
    using (is_role('medico') and medico_id = auth.uid());
  create policy consultas_medico_insert on public.consultas for insert to authenticated
    with check (is_role('medico') and medico_id = auth.uid());
  create policy consultas_medico_update on public.consultas for update to authenticated
    using (is_role('medico') and medico_id = auth.uid())
    with check (is_role('medico') and medico_id = auth.uid());
  create policy consultas_secretaria on public.consultas for select to authenticated
    using (is_role('secretaria'));
end $$;

-- ========================== EXAMENES ==========================
do $$ begin
  create policy examenes_read_all on public.examenes_laboratorio for select to authenticated
    using (true);
  create policy examenes_admin on public.examenes_laboratorio for all to authenticated
    using (is_role('admin') or is_super_root());
end $$;

-- ========================== SOLICITUDES ==========================
do $$ begin
  create policy solicitudes_medico on public.solicitudes for select to authenticated
    using (is_role('medico') and medico_id = auth.uid());
  create policy solicitudes_medico_insert on public.solicitudes for insert to authenticated
    with check (is_role('medico') and medico_id = auth.uid());
  create policy solicitudes_lab on public.solicitudes for select to authenticated
    using (is_role('laboratorio') or is_role('secretaria') or is_role('admin') or is_super_root());
  create policy solicitudes_lab_update on public.solicitudes for update to authenticated
    using (is_role('laboratorio') or is_role('admin') or is_super_root())
    with check (is_role('laboratorio') or is_role('admin') or is_super_root());
end $$;

-- ========================== RESULTADOS ==========================
do $$ begin
  create policy resultados_lab_insert on public.resultados for insert to authenticated
    with check (is_role('laboratorio') or is_super_root());
  create policy resultados_lab_update on public.resultados for update to authenticated
    using (is_role('laboratorio') or is_super_root());
end $$;

-- ========================== RECIPES ==========================
do $$ begin
  create policy recipes_medico on public.recipes for select to authenticated
    using (is_role('medico') and medico_id = auth.uid());
  create policy recipes_medico_insert on public.recipes for insert to authenticated
    with check (is_role('medico') and medico_id = auth.uid());
end $$;

-- ========================== PAGOS ==========================
do $$ begin
  create policy pagos_secretaria on public.pagos for insert to authenticated
    with check (is_role('secretaria') or is_role('admin') or is_super_root());
  create policy pagos_read on public.pagos for select to authenticated
    using (is_role('secretaria') or is_role('admin') or is_super_root());
end $$;

-- ========================== REACTIVOS ==========================
do $$ begin
  create policy reactivos_lab on public.reactivos for all to authenticated
    using (is_role('laboratorio') or is_role('admin') or is_super_root());
end $$;

-- ========================== PORTAL ==========================
-- La tabla de códigos OTP nunca es accesible directamente por el cliente.
do $$ begin
  create policy portal_codigos_super on public.portal_codigos for all to authenticated
    using (is_super_root());
end $$;

-- ========================== AUDIT ==========================
do $$ begin
  create policy audit_read on public.audit_logs for select to authenticated
    using (is_role('admin') or is_super_root());
end $$;