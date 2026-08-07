# Historial Médico Digital e Integración de Laboratorio — Diseño

Deliverable del pendiente "Historial Médico Digital e Integración de Laboratorio"
de `pendientes.md`. Define la arquitectura de permisos para las **7 categorías de
especialidades**, el modelo de datos y las reglas de negocio de auditoría, firmas
digitales y control de adendas. Implementación de referencia en
`backend/src/modules/historial/` (migración `0017_historial_medico.sql`) y
`frontend/src/features/historial/HistorialPage.tsx`.

---

## 1. Matriz de permisos por categoría de especialidad

### 1.1 Categorías de médicos

| # | Categoría (`categorias_medicas.id`) | Especialidades |
|---|--------------------------------------|----------------|
| 1 | `atencion_primaria` — Atención Primaria y Medicina General | Medicina General, Pediatría, Geriatría |
| 2 | `especialidades_clinicas` — Especialidades Clínicas | Cardiología, Neurología, Gastroenterología, Endocrinología… |
| 3 | `especialidades_quirurgicas` — Especialidades Quirúrgicas | Cirugía General, Traumatología, Neurocirugía… |
| 4 | `medico_quirurgicas` — Médico-Quirúrgicas | Gineco/Obstetricia, Urología, Oftalmología, ORL |
| 5 | `diagnostico_apoyo` — Diagnóstico y Apoyo Clínico | Patología, Radiología, Imagenología |
| 6 | `critica_urgencias` — Medicina Crítica y Urgencias | Intensivistas, Anestesiólogos, Emergentólogos |
| 7 | `salud_publica` — Salud Pública y Otras | Fisiatría, Medicina Ocupacional, del Deporte |

Cada perfil médico tiene `profiles.categoria_medica` (asignada por el admin).
Un perfil puede cambiar de categoría (históricamente no se reescribe: la
categoría de cada registro se guarda como *snapshot* en `historial_clinico.categoria_origen`).

### 1.2 Política core CRUD

La política es **uniforme para las 7 categorías** (lectura abierta; escritura
estricta y trazable; sin borrado). La categoría solo modula quién puede
*responder interconsultas* y qué formularios dinámicos se ofrecen.

| Acción | médico | admin | super_root | laboratorio | secretaria |
|--------|:------:|:-----:|:----------:|:-----------:|:----------:|
| **READ** historial compartido de cualquier paciente | ✅ | ✅ | ✅ | ❌ | ❌ |
| **READ** alertas críticas (banner global) | ✅ | ✅ | ✅ | ✅ | ✅ |
| **CREATE** registro (consulta/procedimiento/interconsulta) | ✅¹ | ✅ | ✅ | ❌ | ❌ |
| **CREATE** corrección (Adenda / Fe de Erratas) | autor² | ✅ | ✅ | ❌ | ❌ |
| **UPDATE/DELETE** registro o corrección | ❌ | ❌ | ❌ | ❌ | ❌ |
| Notas privadas: ver/crear/editar | solo autor | solo autor | ✅ | ❌ | ❌ |
| Alertas críticas: crear | ✅ | ✅ | ✅ | ❌ | ❌ |
| Alertas críticas: desactivar | ❌ | ✅ | ✅ | ❌ | ❌ |
| Interconsultas: derivar (crear) | ✅ | ✅ | ✅ | ❌ | ❌ |
| Interconsultas: responder | destino³ | ✅ | ✅ | ❌ | ❌ |

¹ Para el rol **médico**, el registro solo se acepta si es el `medico_id` de la
`consulta` asociada (create "durante consulta/procedimiento/interconsulta").
² El rol **médico** solo corrige registros de los que es autor; admin/super_root
corrigen cualquiera. La corrección jamás muta el registro original.
³ El **médico** responde solo interconsultas de su `categoria_medica`, las
asignadas a él (`medico_destino_id`) o las que originó; admin/super_root todas.

### 1.3 Trazabilidad

Cada operación de escritura queda en `audit_logs` (tabla existente) y cada
registro/corrección lleva `firma_hash` (SHA-256 de `medico_id:created_at:contenido`),
inmutable. No existe ruta DELETE en `/api/historial/*`.

---

## 2. Modelo de datos (ERD)

```
categorias_medicas (id, nombre, descripcion, orden)
      │ 1
      │ n
especialidades_medicas (id, categoria→categorias_medicas, nombre)

profiles (id, role, clinica_id, …, especialidad, categoria_medica→categorias_medicas)

pacientes (id, cedula, …)          consultas (id, paciente_id, medico_id, …)
      │                                   │
      ├─< historial_clinico (id, clinica_id, paciente_id, consulta_id?, medico_id,
      │       tipo, categoria_origen→categorias_medicas, titulo, contenido jsonb,
      │       firma_hash, created_at)
      │            │ 1
      │            │ n
      │     historial_correcciones (id, historial_id, tipo fe_errata|adenda,
      │           contenido jsonb, medico_id, firma_hash, created_at)
      │
      ├─< notas_privadas (id, paciente_id, consulta_id?, medico_id, contenido, …)
      │
      ├─< alertas_criticas (id, clinica_id, paciente_id, tipo
      │       alergia|enfermedad_cronica|medicamento_critico, descripcion,
      │       severidad alta|media, activa, creado_por, created_at)
      │
      └─< interconsultas (id, clinica_id, paciente_id, consulta_origen_id?,
            medico_origen_id, categoria_destino, especialidad_destino?,
            medico_destino_id?, motivo, hipotesis?, estado
            enviada|aceptada|completada|cancelada, respuesta?, medico_responde_id?, …)
```

**Invariantes**

- `historial_clinico`, `historial_correcciones` y `interconsultas`: sin
  UPDATE/DELETE de contenido — solo se insertan (inmutabilidad). El único UPDATE
  permitido es el *estado* de una interconsulta.
- `notas_privadas`: UPDATE restringido al autor (`medico_id = auth.uid()`).
- `alertas_criticas`: UPDATE limitado a `admin`/`super_root` y solo para
  `activa` (desactivar, nunca borrar).
- `profiles.categoria_medica` es opcional: un perfil sin categoría puede leer y
  crear registros, pero no aparece como destino de interconsultas.

**RLS (migración `0017`)**

- `historial_clinico` / `historial_correcciones`: `select` a cualquier
  autenticado; `insert` si `profiles.role in (medico, admin, super_root)`.
- `notas_privadas`: `select`/`update` solo `medico_id = auth.uid()` o super_root.
- `alertas_criticas`: `select` abierto; `insert` médico; `update` admin/super_root.
- `interconsultas`: `select` abierto; `insert` médico; `update` admin o médico de
  la categoría destino / asignado / origen.

---

## 3. Reglas de negocio

### 3.1 Auditoría

- Todo `historial_clinico`, `historial_correcciones` y `interconsultas` es un
  **append-only** log clínico: no hay `DELETE` en API ni RLS. La corrección de un
  error se expresa como **Fe de Erratas** (corrige lo escrito) o **Adenda**
  (complementa), ambas vinculadas por `historial_id`.
- El `created_at` se fija en el servidor; no se acepta del cliente.
- La categoría de origen se **deriva del perfil** en el servidor
  (`categoriaDeMedico`) y no se acepta del cuerpo de la petición (anti-spoofing).
- `audit_logs` registra las operaciones sensibles (patrón `services/auditoria.ts`
  ya usado en portal). El frontend no muestra datos de otros roles por construcción
  (endpoints devuelven solo lo autorizado).

### 3.2 Firmas digitales

- Cada registro y cada corrección recibe `firma_hash = SHA-256(medico_id + created_at + contenido)`.
- La firma se muestra en la UI (hash truncado) junto al autor, fecha/hora y la
  marca de agua **"FE DE ERRATAS" / "ADENDA"** superpuesta sobre la corrección.
- Al completar una interconsulta se registra `medico_responde_id` (quién firmó la
  respuesta).

### 3.3 Control de adendas

- Corregir un registro exige ser **autor** o **admin/super_root** (médico ajeno → 403).
- La corrección nunca edita `historial_clinico`: el original conserva su `firma_hash`.
- La lista del expediente muestra las correcciones anidadas bajo su registro en
  orden cronológico (una corrección puede ser Fe de Erratas **o** Adenda, no mixta).

### 3.4 Módulos implementados

- **A. Banner Global de Alertas Críticas**: `alertas_criticas.activa=true` del
  paciente renderizado en encabezado rojo permanente del expediente (alergias,
  crónicas, medicamentos críticos). Lectura también para laboratorio/secretaria.
- **B. Privacidad de notas**: historial compartido (`historial_clinico`, READ
  médico) vs. notas privadas (`notas_privadas`, solo autor).
- **C. Interconsultas y Referencias**: derivación por `categoria_destino`
  (opcionalmente `especialidad_destino`/`medico_destino_id`), hipótesis inicial y
  bandeja del especialista con ciclo `enviada → aceptada → completada` (o cancelada).
- **D. Formularios dinámicos por especialidad**: `historial_clinico.contenido`
  es JSONB estructurado (los formularios de cardiología, radiología, etc. escriben
  su propio esquema; el catálogo `especialidades_medicas` alimenta la UI).
- **E. Interconexión Laboratorio/Imagenología**: la interconexión con órdenes,
  muestras y PDFs firmados se apoya en los módulos ya existentes (`solicitudes`,
  `resultados`, `preanalitica`, `imagenes_clinicas`, `storageService`); el historial
  referencia resultados e imágenes vía registros de tipo `resultado`.
