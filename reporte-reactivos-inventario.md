# Reporte: Módulo de Reactivos y su relación con el Inventario

**Fecha:** 2026-08-17
**Alcance:** Comparación entre el estándar de la industria (LIS/LIMS médicos) y el módulo de Reactivos de TotalHealth. Conclusión: qué falta.

---

## 1. Cómo lo hacen las apps médicas/lab de referencia

Referencias analizadas: QBench, Spectrum QMS/LIMS, LAIMA, Labsistant, eHospitalSuite LIS, INFOMED sLis Enterprise, ISWE LIMS, Fast Inventory, Medrara, Lab Logs, Simple Lab Tools.

### 1.1 Modelo de datos (catálogo + lotes + movimientos)

Las apps serias **no** guardan el stock en una sola fila por ítem. Usan una estructura de 3 capas:

| Capa | Descripción | Ejemplos |
|---|---|---|
| **Catálogo / ítem** | Definición del reactivo (nombre, código/SKU, categoría, unidad de medida, proveedor, costo) | `reactivos` en TotalHealth |
| **Lote / batch** | Cada recepción es un lote con su propio número, **fecha de producción**, **fecha de vencimiento**, cantidad y estado (activo / cuarentena / agotado / vencido) | `reactivo_lotes` |
| **Movimientos / kardex** | Registro inmutable de cada entrada, salida, consumo, ajuste y transferencia (quién, cuándo, cuánto, de qué lote, a qué prueba/orden) | `reactivo_movimientos` |

- **LAIMA / Labsistant / Fast Inventory:** el stock se calcula por lotes ("no solo saber que tienes 500 unidades, sino qué lotes componen esas 500 y cuándo expira cada uno").
- **Spectrum:** lotes con estado de cuarentena, trazabilidad batch→resultado, y manejo de "reactivos madre" que generan soluciones con nueva fecha de vencimiento.

### 1.2 La relación Reactivos ↔ Inventario (el punto clave)

En un LIS el módulo de reactivos **no es un inventario aislado**: está acoplado al flujo de pruebas. Los patrones que se repiten:

1. **Consumo automático por prueba.** Al procesar/emitir un examen, el sistema descuenta stock automáticamente o exige elegir el lote usado antes de permitir el resultado (QBench "automate stock consumption with the running of each test or test batch"; Spectrum "prompts the analyst to select the reagent batch, verifying its validity before allowing the test to proceed").
2. **Bloqueo de reactivos vencidos.** No se permite usar (ni siquiera seleccionar) un lote vencido para emitir un resultado; si se fuerza, requiere confirmación y motivo (QBench "block the usage of expired stock"; LAIMA "expired or non-FEFO choices require confirmation and a reason").
3. **FEFO / FIFO.** Al consumir, se prioriza el lote que expira primero (FEFO) o el más antiguo (FIFO), para reducir desperdicio (Spectrum, Fast Inventory, LAIMA).
4. **Alerta de stock bajo y reabastecimiento.** Umbral mínimo configurable por ítem ("alerta mínima", "panic limit") que dispara alertas y sugerencias de **orden de reposición** calculadas con el consumo histórico (INFOMED "automatic indenting based on consumption"; eHospitalSuite "reorder alerts").
5. **Alerta de vencimiento.** Notificaciones con antelación configurable (90/60/30 días, o lead-time por ítem) (Spectrum, ShelfLifePro, Fast Inventory).
6. **Costo por prueba / costo de inventario.** Se registra costo por lote y se calcula costo por uso, margen y análisis de gasto (QBench "per-use cost"; LAIMA spend analytics).
7. **Pronóstico y dashboards.** Consumo real por prueba, días hasta agotamiento ("consumption velocity"), tendencias para planificar compras (Labsistant, Medrara).
8. **Trazabilidad y auditoría.** Cada movimiento queda con usuario, fecha, cantidad, lote y contexto (orden de prueba). Los resultados quedan ligados al lote para trazabilidad regulatoria (CLIA/CAP/ISO 15189) y recall.
9. **Ubicación/almacenamiento y condiciones.** Jerarquía de ubicación (edificio/cuarto/congelador/estante), y en labs avanzados monitoreo de temperatura y condiciones de almacenamiento (Spectrum, LAIMA, Labsistant).
10. **Recepciones de compra.** Flujo de recepción de pedidos/órdenes de compra con OCR de factura, alta de lote, costo y proveedor (ShelfLifePro, INFOMED).

---

## 2. Nuestro módulo actual (estado real)

### Backend — `backend/src/modules/laboratorio/reactivos.routes.ts`

- `GET /api/reactivos` → lista todo, ordenado por nombre (sin filtro por clínica).
- `POST /api/reactivos` → inserta (fija `clinica_id` del usuario).
- `PATCH /api/reactivos/:id` → edición parcial (sin uso desde la UI).
- **No existe `DELETE`.**
- Tabla única `reactivos` (`0001_schema.sql:155-165`): `id, clinica_id, nombre, lote, fecha_vencimiento, cantidad numeric(12,3), alerta_minima, proveedor, created_at`. **Sin** `updated_at`, unidad de medida, ubicación, costo ni estado.

### Frontend — `frontend/src/features/laboratorio/LaboratorioPage.tsx` (tab "Reactivos")

- Solo **crear** (nombre, lote, cantidad, alerta mínima) y **listar**.
- Badge "Bajo stock" calculado en el navegador (`cantidad <= alerta_minima`).
- El formulario **no envía** `fecha_vencimiento` ni `proveedor` (aunque el backend los acepta); la columna fecha de vencimiento **no se muestra en ningún lado**.
- Sin edición, sin borrado, sin entradas/salidas, sin historial, sin alertas.

---

## 3. Comparativa

| Funcionalidad | Estándar industria | TotalHealth | Estado |
|---|---|---|---|
| Catálogo de reactivos (CRUD completo) | ✅ | CRUD parcial | ⚠️ Parcial |
| Unidad de medida (ml, unidades, mg…) | ✅ | ❌ | ❌ Ausente |
| **Lotes por ítem** (varias recepciones) | ✅ | 1 lote por fila | ❌ Ausente |
| **Kardex / movimientos** (entradas, salidas, ajustes) | ✅ | ❌ | ❌ Ausente |
| **Consumo automático al emitir resultado** | ✅ | ❌ | ❌ Ausente |
| Bloqueo de vencidos al usar | ✅ | ❌ | ❌ Ausente |
| FEFO/FIFO al consumir | ✅ | ❌ | ❌ Ausente |
| Alerta de stock bajo (backend + notificaciones) | ✅ | solo badge visual | ⚠️ Parcial |
| **Alerta de vencimiento / caducidad** | ✅ | campo muerto | ❌ Ausente |
| Costo por prueba / costo de inventario | ✅ | ❌ | ❌ Ausente |
| Reposición automática / sugerencia de orden | ✅ | ❌ | ❌ Ausente |
| Pronóstico y dashboards de consumo | ✅ | ❌ | ❌ Ausente |
| Trazabilidad lote → resultado | ✅ | ❌ | ❌ Ausente |
| Auditoría (usuario/fecha/contexto por movimiento) | ✅ | ❌ | ❌ Ausente |
| Ubicación/almacenamiento | ✅ | ❌ | ❌ Ausente |
| Recepción de compras / lotes | ✅ | ❌ | ❌ Ausente |
| Multi-clínica consistente | ✅ | fuga en GET | ⚠️ Parcial |
| Tests automatizados del módulo | ✅ | ❌ | ❌ Ausente |

---

## 4. Lo que falta en nuestra app (gaps)

### Crítico (calidad clínica y funcionalidad básica)
1. **Tabla de lotes (`reactivo_lotes`)** y separar el stock por lote. Hoy `reactivos` mezcla lote+cantidad en una fila: no puedes recibir 2 lotes del mismo reactivo ni rastrear cuál expira.
2. **Kardex de movimientos (`reactivo_movimientos`)** inmutable: entradas, salidas, consumo, ajustes, con usuario, fecha, cantidad y lote.
3. **Consumo de stock integrado con el flujo de laboratorio**: al emitir resultados de una solicitud, seleccionar el reactivo+lote usado y **descontar stock automáticamente**; bloquear el uso de lotes vencidos.
4. **Alerta de vencimiento**: job diario que detecte lotes por vencer (p. ej. 30 días) y vencidos, y que los marque como no utilizables + notificación al rol laboratorio.
5. **Alerta de stock bajo real**: detección en backend + notificación, no solo el badge del navegador.

### Importante (gestión)
6. **Editar y eliminar desde la UI** (hoy el PATCH existe en backend sin frontend; no hay DELETE), con confirmación y registro de auditoría.
7. **Unidad de medida** (`unidad`/`unidades`) para que `cantidad` sea significativa.
8. **FEFO/FIFO**: al registrar consumo, sugerir/priorizar el lote que expira primero.
9. **Costos**: costo por lote y costo por prueba (para margen y reportes financieros).
10. **Filtrado multi-clínica correcto en GET** (igual que el insert) y RLS coherente.

### Deseable (madurez)
11. **Dashboards**: stock bajo, por vencer, consumo por prueba, días hasta agotamiento.
12. **Sugerencia de reposición** basada en consumo histórico.
13. **Ubicación de almacenamiento** (congelador/estante) por lote.
14. **Importación masiva** (Excel/CSV) y **códigos de barras/QR** para escaneo de entrada/salida.
15. **Trazabilidad lote → resultado** y reportes de auditoría para cumplimiento (CLIA/CAP/ISO 15189).

---

## 5. Recomendación de implementación por fases

**Fase 1 — Base de datos y trazabilidad (esencial):**
Migración nueva con `reactivo_lotes` y `reactivo_movimientos`; agregar `unidad` a `reactivos`; migrar el stock existente creando un lote por fila actual; job de vencimientos; endpoints de entradas/salidas/ajustes.

**Fase 2 — Integración con el laboratorio (el "se afecta con el inventario"):**
Al emitir resultados en `POST /solicitudes/:id/resultados`, registrar consumo del reactivo seleccionado, descontar stock del lote y bloquear vencidos. Notificaciones de stock bajo y vencimiento.

**Fase 3 — Gestión y reportes:**
UI de edición/borrado, FEFO, costos, dashboards de consumo y reposición.

---

*Referencias: QBench (qbench.com), Spectrum QMS/LIMS (sofcom.net), LAIMA (laimabio.com), Labsistant (labsistant.com), eHospitalSuite LIS (ehospitalsuite.com), INFOMED sLis (infomedcs.com), ISWE LIMS (lims.co.zm), Fast Inventory (fastinventorysoftware.com), Medrara (medrara.app).*