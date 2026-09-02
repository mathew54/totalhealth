# Plan: Conexión Exámenes ↔ Reactivos (consumo automático de insumos)

## Problema actual

El módulo de reactivos no sabe qué examen consume qué insumo. No existe ninguna
relación entre `examenes_laboratorio` y `reactivos`. Hoy el consumo se decide
manualmente: al cargar un resultado, el laboratorio envía un array `reactivos`
por línea (`solicitudes.routes.ts:657-680`). Si no lo manda, **no descuenta nada**,
y no hay ninguna definición reusable del tipo *"Glicemia consume 1 tubo tapa
gris + 1 inyectadora 5ml"*.

Consecuencias:
- No hay alerta preventiva de stock para los exámenes programados.
- El consumo varía según quién cargue el resultado.
- No se puede predecir cuánto inventario se necesita por examen.
- La columna `categoria` de exámenes es solo una etiqueta de agrupación visual
  (Hematología, Química,…), no sirve para este problema.

## Alcanze

Crear una **receta de insumos por examen** configurable en Admin, que el sistema
consuma automáticamente (FEFO por lote) al emitir resultados.

## Modelo de datos

Nueva tabla pivote:

```
examenes_reactivos (
  id           uuid PK,
  clinica_id   uuid FK clinicas,
  examen_id    uuid FK examenes_laboratorio (on delete cascade),
  reactivo_id  uuid FK reactivos           (on delete cascade),
  cantidad     numeric(12,3) not null default 1,   -- unidades por examen
  created_at   timestamptz default now(),
  unique (examen_id, reactivo_id)
)
```

- Una fila = "este examen consume N unidades de este insumo".
- El lote de dónde se descuenta lo sigue resolviendo `consumirReactivo` (FEFO
  sobre `reactivo_lotes` activos que expiran primero). No hace falta almacenar
  lote aquí.
- RRLLS igual que reactivos (laboratorio/admin/super_root).

## Cambios

### 1. Migración SQL
`backend/supabase/migrations/0038_examenes_reactivos.sql`
- crear tabla `examenes_reactivos`
- índices (`examen_id`, `reactivo_id`)
- RLS + políticas
- trigger updated_at si aplica

### 2. Backend — servicio reactivos
`backend/src/services/reactivosService.ts`
- `listarReactivosDeExamen(examenId)`: filas de la pivote + nombre del reactivo.
- `asignarReactivosAExamen(examenId, items[])`: upsert de la receta (borra las
  no contempladas).
- `consumirReactivosDeExamen(examenId, solicitudDetalleId, usuarioId)`:
  recorre la receta y llama `consumirReactivo` por cada ítem. Devuelve los
  consumos y los errores de stock insuficiente (sin bloquear la emisión).
- Flag para activar/desactivar el descuento automático por examen (`auto` en la
  fila), para exámenes cuyo consumo no debe registrarse.

### 3. Backend — endpoints Admin
`backend/src/modules/admin/admin.routes.ts`
- `GET /api/admin/examenes/:id/reactivos` → receta del examen.
- `PUT /api/admin/examenes/:id/reactivos` → guarda la receta.

### 4. Backend — consumo automático al emitir resultados
`backend/src/modules/solicitudes/solicitudes.routes.ts` (bloque 652-680)
- Al insertar cada resultado, resolver el `examen_id` de la línea y llamar
  `consumirReactivosDeExamen` **antes** de (o en lugar de) usar el array manual.
- Mantener compatibilidad: si el frontend manda `reactivos[]` explícitos, se
  usan esos; si no, se usa la receta de `examenes_reactivos`.
- Agregar al payload de respuesta el desglose `consumo_reactivos` ya existente.

### 5. Frontend — Admin Exámenes
`frontend/src/features/admin/AdminPage.tsx` (`ExamenesTab`)
- Columnas/acción "Reactivos" por examen que abre un selector modal: lista de
  reactivos activos del catálogo + cantidad por examen, con guardado vía
  `PUT /api/admin/examenes/:id/reactivos`.

### 6. Seed
Enlazar los exámenes demo a sus reactivos del seed (`backend/src/mock/seed.ts` →
tabla `examenes_reactivos`): Hematología→HemoCue, Glicemia→tiras glucosa,
Colesterol→reactivo enzimático, Uroanálisis→tiras orina, TSH→kit (auto=false).

## Criterios de aceptación
- En Admin, cada examen permite asignar sus insumos/cantidad.
- Al emitir un resultado, el stock descuenta automáticamente según la receta
  (FEFO por lote), sin intervención manual.
- Stock insuficiente se reporta en la respuesta sin romper la carga.
- La trazabilidad por examen (`consumo_resumen.por_examen`) sigue funcionando.

## Orden de ejecución
1. Migración SQL.
2. Servicio reactivos (listar/asignar/consumir por examen).
3. Endpoints Admin.
4. Consumo automático en solicitudes.
5. Frontend Admin.
6. Verificación (build / lint / typecheck).