-- 0004_app_config.sql
-- TotalHealth: configuración global de marca (razón social, logo, tema).
-- Fila única: `id = true`. La leen todas las autenticados; la editan admin/super_root.

create table public.app_config (
  id boolean primary key default true check (id = true),
  razon_social text not null default 'TotalHealth',
  rif text not null default '',
  logo_url text not null default '',
  header_color text not null default '#8b5cf6',
  updated_at timestamptz not null default now()
);

-- RLS
alter table public.app_config enable row level security;

do $$ begin
  create policy app_config_read on public.app_config for select to authenticated
    using (true);
  create policy app_config_write on public.app_config for update to authenticated
    using (is_role('admin') or is_super_root())
    with check (is_role('admin') or is_super_root());
end $$;

-- Fila única por defecto (evita que falten datos de marca).
insert into public.app_config (id, razon_social, rif, logo_url, header_color)
values (true, 'TotalHealth C.A.', 'J-00000000-0', '', '#8b5cf6')
on conflict (id) do nothing;
