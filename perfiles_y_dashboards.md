# Perfiles y Dashboards por Rol — Multiespecialidad

Documento de entregables de la feature «Gestión de acceso para los tres perfiles de
usuario» (Secretaría, Laboratorio/Bioanalistas y Cuerpo Médico con N especialidades).

Índice:

1. [Esquema de datos](#1-esquema-de-datos)
2. [Arquitectura del dashboard médico](#2-arquitectura-del-dashboard-médico)
3. [Especificación de seguridad](#3-especificación-de-seguridad)

---

## 1. Esquema de datos

### Modelo de perfil (tabla `profiles`)

El perfil de usuario evolucionó de «un rol + una especialidad» a un **perfil
flexible** capaz de soportar un cuerpo médico con N especialidades.

| Columna | Tipo | Descripción |
| --- | --- | --- |
| `id` | `uuid` PK | Id del usuario (mismo id que Supabase Auth). |
| `role` | `text` | Rol activo (el de la sesión/token). |
| `roles` | `text[]` | Todos los roles asignados por el admin. |
| `clinica_id` | `uuid FK` | Clínica a la que pertenece. |
| `nombre_completo`, `cedula`, `telefono`, `email`, `activo` | — | Datos de identidad (la cédula se normaliza con prefijo V/E/J/P/C). |
| `especialidades` | `text[] NOT NULL DEFAULT '{}'` | **IDs del catálogo `especialidades_medicas`** (fuente de verdad, hasta 10). |
| `especialidad` | `text` | **Nombre** de la primera especialidad. Se conserva por compatibilidad con agenda, reservas online y listados que filtran por texto. |
| `especialidad_activa` | `text` | ID de la especialidad con la que el médico está trabajando actualmente (contexto del dashboard). |
| `categoria_medica` | `text` | Categoría (una de las 7 de `categorias_medicas`) derivada de la especialidad primaria. |
| `colegiatura` | `text` | Colegiatura / licencia profesional. |
| `firma_digital` | `text` | Hash o referencia al sello/firma digital del profesional. |
| `dashboard_config` | `jsonb NOT NULL DEFAULT '{"vista":"consolidada"}'` | Preferencias del dashboard del médico (`vista`: `activa` \| `consolidada`). |

### DDL

Migración: [`backend/supabase/migrations/0021_perfiles_especialidades.sql`](backend/supabase/migrations/0021_perfiles_especialidades.sql)

```sql
-- Perfil médico multiespecialidad
alter table public.profiles
  add column if not exists especialidades text[] not null default '{}',
  add column if not exists colegiatura text,
  add column if not exists firma_digital text,
  add column if not exists especialidad_activa text,
  add column if not exists dashboard_config jsonb not null default '{"vista":"consolidada"}'::jsonb;

-- Backfill desde la especialidad única existente
update public.profiles
  set especialidades = array[especialidad],
      especialidad_activa = especialidad,
      categoria_medica = (select categoria from public.especialidades_medicas e where e.id = public.profiles.especialidad)
  where especialidad is not null and (especialidades is null or array_length(especialidades, 1) is null);

-- Índice para búsquedas por especialidad
create index if not exists idx_profiles_especialidades on public.profiles using gin (especialidades);
```

> La RLS existente (`profiles_self`, `profiles_update_self`, `profiles_admin_clinic`,
> `profiles_super`) cubre las columnas nuevas al estar definida a nivel de fila, no de columna.

### JSON de ejemplo (GET `/api/auth/me`)

```json
{
  "id": "10000000-...-003",
  "role": "medico",
  "roles": ["medico", "secretaria"],
  "nombre_completo": "Dra. María Fernández",
  "especialidades": ["medicina_general", "pediatria"],
  "especialidad": "Medicina General",
  "especialidad_activa": "medicina_general",
  "categoria_medica": "atencion_primaria",
  "colegiatura": "V-99888777",
  "firma_digital": "sha256:demo-firma-maria",
  "dashboard_config": { "vista": "consolidada" }
}
```

### Endpoints

| Método | Ruta | Descripción |
| --- | --- | --- |
| `POST` | `/api/auth/perfil` | Actualiza contexto del perfil: `especialidad_activa` (debe estar en `especialidades`), `dashboard_config.vista`, `colegiatura`, `firma_digital`. No escala roles. |
| `POST` | `/api/admin/staff` | Alta de personal con `especialidades[]`, `colegiatura`, `firma_digital`. |
| `PATCH` | `/api/admin/staff/:id` | Actualización; normaliza el array, deriva primaria + categoría. |
| `GET` | `/api/admin/staff` | Lista con las nuevas columnas. |
| `GET` | `/api/historial/especialidades` | Catálogo `categorias_medicas` (7) + `especialidades_medicas`. |

El backend deriva automáticamente, en `admin.routes.ts` (`prepararPerfilMedico`):

- `especialidad` = nombre de la primera del array (para agenda/reservas).
- `especialidad_activa` = primera del array (o la última elegida vía `/auth/perfil`).
- `categoria_medica` = categoría de la primera especialidad.

---

## 2. Arquitectura del dashboard médico

### Principios

- **Registro estático, montaje dinámico.** `WIDGETS_POR_CATEGORIA`
  (`frontend/src/features/dashboard/widgets/registry.ts`) declara los widgets de cada
  una de las 7 categorías. Los componentes se montan/desmontan según la categoría de
  la especialidad activa (vista `activa`) o de todas las especialidades del perfil
  (vista `consolidada`). El registro es un objeto plano, sin import dinámico: evita
  parpadeos de carga y simplifica el bundle.

- **Categorías = catálogo.** Las 7 categorías del registro coinciden con las filas de
  `categorias_medicas`: `atencion_primaria`, `especialidades_clinicas`,
  `especialidades_quirurgicas`, `medico_quirurgicas`, `diagnostico_apoyo`,
  `critica_urgencias`, `salud_publica`.

- **Widgets reales vs. «Próximamente».** Cada `WidgetDef` tiene `componente:
  ComponentType | null`. Los `null` renderizan una tarjeta placeholder, lo que permite
  planificar el roadmap completo sin dejar secciones vacías. Widgets funcionales
  (por categoría):

  - **Atención Primaria**: IMC, dosis pediátrica, Cockcroft-Gault, riesgo
    cardiovascular (conteo de factores), carnet de vacunación (esquema VE),
    Índice de Barthel, detector de polifarmacia y curvas de crecimiento OMS/CDC
    (percentiles P3–P97 por edad, tablas WHO 2006, 0–60 meses).
  - **Clínicas**: PHQ-9, tendencias de parámetros desde resultados firmados y
    notas de evolución privadas (solo autor, persistidas).
  - **Quirúrgicas**: checklist OMS, reporte operatorio y visor de imágenes
    (galería `imagenes_clinicas` + lightbox con zoom/arrastre).
  - **Médico-Quirúrgicas**: gestograma, control prenatal, PSA y diario miccional.
  - **Diagnóstico/Apoyo**: dictado por voz (Web Speech API), plantilla BI-RADS
    y genograma familiar (árbol SVG de 3 generaciones).
  - **Crítica/Urgencias**: Glasgow, SOFA, infusiones y hoja anestésica.
  - **Salud Pública**: rehabilitación, certificados y cadena de custodia (SHA-256).

  Los 5 widgets que estaban «Próximamente» (curvas OMS/CDC, tendencias, notas
  privadas, genograma y visor de imágenes) quedaron funcionales; solo permanece
  como placeholder opcional `escalas-psicometricas` (GAD-7, MoCA).

  - **Tendencias desde resultados**: nuevo `GET /api/solicitudes/pacientes/:id/
    resultados` devuelve el historial de resultados de un paciente
    (`examen`, `valores`, `fecha`, `bioanalista_id`, `firma_hash`,
    `procesado_at`); `TendenciasParametros.tsx` lo grafica con `recharts`
    (selector de examen/parámetro) y el `PacientePicker.tsx` reutilizable
    (selector global por cédula/nombre) alimenta a los widgets por paciente.

### Laboratorio (LMS)

- **Etiqueta QR**: `EtiquetaQRSolicitud.tsx` genera un QR por solicitud en cola
  (`TOTALHEALTH|SOLICITUD|<id>|<paciente>`) y una etiqueta PDF imprimible
  (`qrcode` + `jspdf`).
- **Carga masiva**: en el detalle de una solicitud (LaboratorioPage) se puede
  pegar CSV `examen,valor,nota`; se asocia por nombre de examen y precarga los
  campos antes de subir.
- **Firma digital del bioanalista**: migración `0022` añade `resultados.firma_hash`;
  al subir resultados el backend calcula `sha256(bioanalista_id, detalle, valores,
  observaciones)` (node:crypto) y lo persiste junto a `bioanalista_id`.

### Estructura de archivos

```
frontend/src/features/dashboard/
├── DashboardPage.tsx          # Enruta por rol activo (raíz "/")
├── StatCard.tsx               # Tarjeta de métrica reutilizable
├── MedicoDashboard.tsx        # Selector de vista + grillas por categoría + agenda/bandeja
├── SecretariaDashboard.tsx    # Cola, citas, caja y recordatorios + accesos rápidos
├── LaboratorioDashboard.tsx   # Cola pre-analítica, en proceso, alertas críticas, domicilios
├── AdminDashboard.tsx         # Personal por rol, reportería y accesos rápidos
└── widgets/
    ├── Widget.tsx             # Tarjeta base
    ├── registry.ts            # WIDGETS_POR_CATEGORIA (registro por categoría)
    ├── CalculadoresMedicos.tsx      # IMC, dosis pediátrica, gestograma, Glasgow, Cockcroft-Gault, checklist OMS
    ├── CalculadoresAvanzados.tsx    # Riesgo CV, Barthel, polifarmacia, vacunación, prenatal, infusiones, PSA, SOFA, diario miccional
    ├── FormulariosMedicos.tsx       # PHQ-9, reporte operatorio, BI-RADS, dictado por voz, lienzo anatómico, hoja anestésica, rehabilitación, certificados, cadena de custodia, esquemas
    ├── CurvasCrecimiento.tsx        # Curvas OMS/CDC: tablas WHO 2006 + interpolación de percentiles
    ├── TendenciasParametros.tsx     # Gráficas recharts del historial de resultados firmados
    ├── NotasPrivadas.tsx            # Notas de evolución solo-autor (GET/POST /historial/.../notas)
    ├── Genograma.tsx                # Árbol familiar SVG de 3 generaciones, client-side
    ├── VisorImagenes.tsx            # Galería de imágenes clínicas + lightbox con zoom/pan
    ├── PacientePicker.tsx           # Selector reutilizable de pacientes (GET /pacientes?q=)
    └── EtiquetaQRSolicitud.tsx      # QR + etiqueta PDF para la cola de laboratorio
```

### Estado del médico multiespecialidad

- El **selector de especialidad activa** vive en `StaffLayout.tsx` (visible solo para
  `role === 'medico'` con `especialidades.length > 0`). Persiste con
  `PATCH /api/auth/perfil` y actualiza el store (`sessionStore.setEspecialidadActiva`).
- El **toggle de vista** (activa/consolidada) vive en `MedicoDashboard` y persiste con
  `sessionStore.setDashboardVista` → `PATCH /api/auth/perfil`.
- Los componentes consultan el estado desde `useSessionStore()`, por lo que la grilla
  reacciona sin recargas.

### Flujo de render del médico

1. `profile.role === 'medico'` → `MedicoDashboard`.
2. Se resuelve la categoría de la especialidad activa (catálogo en
   `frontend/src/lib/especialidades.ts`).
3. `vista === 'activa'` (o una sola especialidad) → una sección con los widgets de esa
   categoría.
4. `vista === 'consolidada'` → una sección por cada categoría distinta del perfil.

---

## 3. Especificación de seguridad

### Reglas de acceso (RBAC)

Los roles se centralizan en `backend/src/modules/auth/types.ts` y se aplican con los
middlewares `requireRole`/`requireRoles`:

| Recurso | Secretaría | Laboratorio | Médico | Admin | Super root |
| --- | --- | --- | --- | --- | --- |
| `/api/auth/me`, `/api/auth/perfil` | ✔ (propio) | ✔ (propio) | ✔ (propio) | ✔ | ✔ |
| `/api/admin/staff` (crear/listar/editar) | ✘ | ✘ | ✘ | ✔ (solo su clínica) | ✔ (todas) |
| `/api/admin/*` (reportería, exámenes, config) | ✘ | ✘ | ✘ | ✔ | ✔ |
| `/api/turnos`, `/api/consultas`, `/api/pagos` | ✔ | ✔ | ✔ | ✔ | ✔ |
| `/api/solicitudes`, `/api/resultados`, `/api/alertas` | ✔ | ✔ | ✔ | ✔ | ✔ |
| `/api/domicilios`, `/api/notificaciones` | ✔ | ✔ | ✔ | ✔ | ✔ |
| `/api/historial/**` (expediente) | ✔ | ✔ (firma) | ✔ (firma) | ✔ | ✔ |

Restricciones adicionales ya implementadas:

- **Escalado de privilegios**: solo `super_root` puede asignar el rol `admin`
  (`admin.routes.ts`).
- **Aislamiento por clínica**: el admin solo ve/edita el personal de `clinica_id`
  propia; `super_root` ve todas.
- **Contexto propio**: un médico solo cambia su propia `especialidad_activa`, y esta
  debe pertenecer a su array `especialidades` (validación en `PATCH /api/auth/perfil`).
- **Filtrado por rol**: `GET /api/consultas` y `GET /api/solicitudes` filtran por
  `medico_id` cuando el llamador es médico.

### Credenciales, cifrado y tokens

- **Autenticación**: cédula normalizada + contraseña contra Supabase Auth; JWT firmado
  con `SUPABASE_JWT_SECRET`; sesión con `access_token` + `refresh_token`.
- **Contraseñas**: gestionadas por Supabase Auth (hash `bcrypt`-compatible), nunca en
  `profiles`.
- **Claves**: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET` viven
  en `backend/.env` (nunca versionadas).
- **Firma digital**: `firma_digital` guarda un hash (p. ej. `sha256:…`) o referencia;
  la aplicación **nunca** expone la clave privada. Para firma real de documentos se
  recomienda integración con una PKI externa (HSM/TSP) firmando en el cliente y
  verificando contra `firma_hash` del registro.
- **Tokens en el cliente**: se almacenan en memoria/sesión del store y se inyectan vía
  `Authorization: Bearer`; el frontend no persiste la clave maestra.

### Inmutabilidad y pista de auditoría

- **Registros clínicos**: la tabla `historial_clinico` es de **solo escritura**; toda
  corrección se registra como **Fe de Erratas / Adenda** en `historial_correcciones`
  con su propio `firma_hash`, `medico_id` y `created_at`. Nunca se actualiza el
  registro original.
- **Firma por autor**: al crear o corregir un registro se persiste `firma_hash` del
  autor (`historial.routes.ts`).
- **Auditoría de admin**: `GET /api/admin/auditoria` consulta `auditoria_log`
  (acciones de admin sobre personal/catálogo/finanzas).
- **Caja/finanzas**: los pagos reembolsados no se borran; se marcan `estado =
  reembolsado` y se excluyen del reportería, preservando el rastro.
- **Horas en zona local**: todas las fechas de "hoy" se calculan en
  `America/Caracas` (`fechaHoyCaracas` en `backend/src/services/bcv.ts`) para evitar
  el desfase UTC en turnos, tasas, portal y reportes.

### Recomendaciones pendientes (roadmap)

- ~~Bloqueo de cuenta por intentos fallidos~~ **Implementado**: migración
  `0023_login_lockout.sql` añade `profiles.login_intentos` y
  `profiles.bloqueado_hasta`; `POST /api/auth/login` cuenta fallos
  (`LOGIN_MAX_INTENTOS`, default 5) y bloquea por `LOGIN_LOCK_MIN` (default 15)
  devolviendo **423** `ACCOUNT_LOCKED` con `retry_after` (incluso con la
  contraseña correcta). Un login correcto reinicia los contadores; una cédula
  inexistente responde 401 genérico sin contabilizar (evita enumeración).
  Servicio `backend/src/services/loginLockout.ts` (mock + Supabase real);
  tests en `backend/tests/login_lockout.test.ts` (4/4).
- ~~Cifrado en reposo de columnas sensibles~~ **Implementado** (app-layer):
  `backend/src/services/cifrado.ts` cifra con **AES-256-GCM** (node:crypto,
  IV 12 B + auth tag) y clave `FIELD_ENCRYPTION_KEY` (derivada por SHA-256) los
  campos `profiles.telefono`, `profiles.firma_digital` y `pacientes.telefono`
  (formato `enc:v1:`). Se cifra al escribir (admin staff, `PATCH /api/auth/
  perfil`, pacientes create/update) y se descifra al leer (`/auth/me`, staff
  list, pacientes list/detail, consulta, OTP del portal y notificador). Modo
  transparente sin clave (dev/mock); valores en claro legados se devuelven tal
  cual; clave incorrecta → fail-open. Tests `backend/tests/cifrado.test.ts`
  (8/8, incluye flujo HTTP de staff y pacientes).
- ~~MFA (TOTP/WebAuthn) para `admin` y `super_root`~~ **Implementado** (TOTP
  RFC 6238): migración `0024` (`profiles.mfa_secret` cifrado en reposo con
  `cifrado.ts`, `profiles.mfa_activo`); `backend/src/services/totp.ts` y
  `mfaSessions.ts` (token MFA de 5 min en memoria, máx. 5 intentos → **423**).
  Login con MFA activo responde `{mfa_required, mfa_token}` y se completa en
  `POST /api/auth/mfa/verify-login`; gestión en `/auth/mfa/estado|setup|verify|
  desactivar` (solo admin/super_root). Frontend: paso de código en `LoginPage`,
  página `/seguridad` con QR (lib `qrcode`) y activación/desactivación. Tests
  `backend/tests/mfa.test.ts` (9/9).
- Rotación automática de `SUPABASE_JWT_SECRET` y auditoría de accesos a `profiles`.
