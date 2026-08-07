-- 0009_muestras_domicilio.sql
-- TotalHealth: Fase C - toma de muestras a domicilio con rastreo.

create table public.muestras_domicilio (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid references public.clinicas(id) on delete set null,
  paciente_id uuid not null references public.pacientes(id) on delete cascade,
  solicitud_id uuid references public.solicitudes(id) on delete set null,
  direccion text not null,
  telefono text,
  fecha_visita timestamptz,
  estado text not null default 'solicitada', -- solicitada | programada | en_ruta | tomada | completada | cancelada
  ubicacion text, -- rastreo en vivo (lat,lng o descripción)
  notas text,
  creado_por uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_domicilio_paciente on public.muestras_domicilio(paciente_id);
create index idx_domicilio_estado on public.muestras_domicilio(estado);

alter table public.muestras_domicilio enable row level security;
do $$ begin
  create policy domicilio_lab on public.muestras_domicilio for all to authenticated
    using (is_role('laboratorio') or is_role('secretaria') or is_role('admin') or is_super_root())
    with check (is_role('laboratorio') or is_role('secretaria') or is_role('admin') or is_super_root());
exception when duplicate_object then null;
end $$;