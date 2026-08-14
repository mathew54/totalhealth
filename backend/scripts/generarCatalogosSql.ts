/**
 * Genera la migración SQL de los catálogos a partir de la fuente ÚNICA en
 * TypeScript (src/data/catalogos.ts y src/data/paises.ts).
 *
 * Uso: npx tsx scripts/generarCatalogosSql.ts
 *
 * Así, el mock (seed) y la migración de Supabase nunca divergen: ambos derivan
 * de los mismos módulos de datos.
 */
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { CATEGORIAS_MEDICAS, CHECKPOINTS_PREANALITICA, ESPECIALIDADES_MEDICAS } from '../src/data/catalogos.js'
import { PAISES } from '../src/data/paises.js'

const SQL: string[] = []
SQL.push(`-- 0030_catalogos_paises_iva.sql (GENERADO por scripts/generarCatalogosSql.ts)
-- NO editar a mano: se regenera desde backend/src/data/catalogos.ts y paises.ts.

-- ===== Catálogo de especialidades =====
insert into public.categorias_medicas (id, nombre, descripcion, orden) values
${CATEGORIAS_MEDICAS.map((c) => `  ('${c.id}', '${c.nombre.replace(/'/g, "''")}', '${c.descripcion.replace(/'/g, "''")}', ${c.orden})`).join(',\n')}
on conflict (id) do update set nombre = excluded.nombre, descripcion = excluded.descripcion, orden = excluded.orden;

insert into public.especialidades_medicas (id, categoria, nombre) values
${ESPECIALIDADES_MEDICAS.map((e) => `  ('${e.id}', '${e.categoria}', '${e.nombre.replace(/'/g, "''")}')`).join(',\n')}
on conflict (id) do update set categoria = excluded.categoria, nombre = excluded.nombre;

-- ===== Checkpoints pre-analíticos por defecto =====
insert into public.checkpoints_preanalitica (clinica_id, nombre) values
${CHECKPOINTS_PREANALITICA.map((n) => `  (null, '${n.replace(/'/g, "''")}')`).join(',\n')}
on conflict do nothing;

-- ===== Catálogo de países (selector E.164) =====
create table if not exists public.paises (
  id text primary key,
  nombre text not null,
  codigo text not null
);
alter table public.paises enable row level security;

insert into public.paises (id, nombre, codigo) values
${PAISES.map((p) => `  ('${p.iso2}', '${p.nombre.replace(/'/g, "''")}', '${p.codigo}')`).join(',\n')}
on conflict (id) do nothing;

do $$ begin
  create policy paises_read on public.paises for select to authenticated using (true);
end $$;

-- ===== IVA parametrizable (app_config) =====
alter table public.app_config
  add column if not exists iva numeric(5, 2) not null default 0.16;

update public.app_config set iva = 0.16 where iva is null or iva <= 0;
`)

const dest = resolve(process.cwd(), 'supabase/migrations/0030_catalogos_paises_iva.sql')
writeFileSync(dest, SQL.join('\n'))
console.log(`Generada: ${dest}`)