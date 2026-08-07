# TotalHealth — Manual de Módulos

> Sistema de gestión clínica y laboratorio para Venezuela (historia clínica, laboratorio, caja, agenda, portal del paciente).
> Moneda base de los precios: **USD**, con equivalencia en Bs. usando la **tasa del día** (USD/EUR).

---

## 1. Introducción y arquitectura

- **Frontend:** React + Vite + TypeScript. Rutas en `frontend/src/App.tsx`, pantallas en `frontend/src/features/`.
- **Backend:** Node + Express + Supabase. Rutas montadas en `backend/src/routes/index.ts`, módulos en `backend/src/modules/`.
- **Modo demo (mock):** por defecto el backend corre en modo mock (`USE_MOCK=true`) con datos de ejemplo en memoria; las credenciales demo se muestran en `/mocks`. En producción se usa Supabase real.
- **Roles (RBAC):** `super_root`, `admin`, `medico`, `laboratorio`, `secretaria`. La matriz de navegación está en `frontend/src/lib/rbac.ts`.

| Rol | Ámbito |
|---|---|
| **Super root** | Acceso total (sin restricciones). |
| **Administrador** | Gestión de personal, catálogo, caja, tasas, reportería, auditoría, configuración. |
| **Médico** | Agenda/consultas, órdenes de exámenes, historial clínico, imágenes, cuestionarios. |
| **Laboratorio** | Carga de resultados, alertas clínicas, inventario de reactivos, domicilios. |
| **Secretaría** | Registro de pacientes, caja, turnos, recordatorios, domicilios, agenda. |

---

## 2. Módulos del frontend (pantallas)

### 2.1 Autenticación — `features/auth` (`/login` → `LoginPage.tsx`)
**Objetivo:** Iniciar sesión para el personal clínico y administrativo. Permite elegir con qué rol entrar cuando el usuario tiene varios asignados. Consume `POST /api/auth/login`, `/refresh`, `/logout` y `/switch-role`.
- **Bloqueo por intentos fallidos:** `loginLockout.ts` cuenta fallos por cédula
  (`profiles.login_intentos`, migración `0023`); al superar `LOGIN_MAX_INTENTOS`
  (5) la cuenta queda bloqueada `LOGIN_LOCK_MIN` (15) y el login responde **423
  `ACCOUNT_LOCKED`** con `retry_after`, incluso con la contraseña correcta. Un
  login exitoso reinicia los contadores.
- **Cifrado en reposo:** `services/cifrado.ts` cifra con AES-256-GCM
  (`FIELD_ENCRYPTION_KEY`) los campos `telefono` y `firma_digital`
  (staff/pacientes) al escribirlos y los descifra al leerlos; sin la clave
  configurada el modo es transparente (dev/mock).
- **Segundo factor (MFA):** los roles `admin`/`super_root` pueden activar TOTP
  en `/seguridad` (QR + confirmación). Con MFA activo el login responde
  `{mfa_required, mfa_token}` y `LoginPage` pide el código de 6 dígitos, que se
  valida en `POST /api/auth/mfa/verify-login`. El secreto se cifra en reposo
  (columna `mfa_secret`) y el token MFA expira a los 5 min (máx. 5 intentos → 423).

### 2.2 Inicio (`/` → `PlaceholderPage`)
**Objetivo:** Página de bienvenida del staff. Es un lanzador que redirige según el rol del usuario (accesible a todos los roles).

### 2.3 Pacientes — `features/pacientes` (`/pacientes` → `PacientesPage.tsx`)
**Objetivo:** Alta, búsqueda, edición y gestion de pacientes (adultos y menores), ciudadanos por cédula venezolana (V/E/J/P/C) y registro de datos demográficos y contacto.
- Roles: **secretaría, admin**.
- Backend: `modules/pacientes` (`GET/POST/PUT/DELETE /api/pacientes`; alta de menor con representante o de hijo junto al responsable).

### 2.4 Agenda / Consultas — `features/consultas` (`/consultas` → `ConsultasPage.tsx`)
**Objetivo:** Agenda del día del médico: ver/crear consultas, registrar motivo, diagnóstico y notas, y **ordenar exámenes de laboratorio** con precios en USD + equivalencia en Bs.
- Roles: **médico, secretaría, admin**.
- Backend: `modules/consultas` (agenda, detalle, historial del paciente, diagnóstico) y `modules/solicitudes` (creación de órdenes de exámenes).

### 2.5 Laboratorio — `features/laboratorio` (`/laboratorio` → `LaboratorioPage.tsx`)
**Objetivo:** Gestión de la **cola de laboratorio**: ver solicitudes pendientes/en proceso, subir **resultados de análisis** por línea, y la orden pasa automáticamente a "listo". Muestra los cobros en USD con su equivalencia en Bs.
- Roles: **laboratorio, admin**.
- Backend: `modules/solicitudes` (subida de resultados, estados `pendiente → en_proceso → listo`), `modules/laboratorio/reactivos` (inventario).

### 2.6 Caja — `features/pagos` (`/pagos` → `PagosPage.tsx`)
**Objetivo:** **Cobro de solicitudes y consultas** en la moneda base **USD**, con conversión automática a **Bs.** usando la tasa del día. Emite **factura/recibo en PDF** (con línea "Base en USD / Equivalente en Bs."), reporte del día y reembolsos.
- Roles: **secretaría, admin**.
- Backend: `modules/pagos` (`POST /pagos/laboratorio`, `GET /pagos`, `GET /pagos/:id/factura`, `PATCH estado`, `POST reembolsar`). Utilidades de conversión en `services/moneda.ts`.

### 2.7 Historial clínico — `features/historial` (`/historial` → `HistorialPage.tsx`)
**Objetivo:** **Expediente digital del paciente**: registros clínicos, historia clínica compartida/privada, interconsultas, correcciones, alertas críticas y **cuestionario de anamnesis** (formulario). Organizado por especialidad y por paciente.
- Roles: **médico, admin, super_root**.
- Backend: `modules/historial` (registros, especialidades, interconsultas, correcciones) y `modules/historial/cuestionarios` (definición + registro de anamnesis y adendas con firma digital).

### 2.8 Imágenes médicas — `features/imagenes` (`/imagenes` → `ImagenesPage.tsx`)
**Objetivo:** Adjuntar y consultar **imágenes clínicas** (radiografias RX, ecografías, tomografías, resonancias, fotos, otras) vinculadas a pacientes/consultas, con galería.
- Roles: **médico, laboratorio, secretaría, admin**.
- Backend: `modules/imagenes` (`GET/POST /imagenes`).

### 2.9 Sala de espera — `features/turnos` (`/turnos` → `TurnosPage.tsx`)
**Objetivo:** Asignar y gestionar **turnos** de pacientes por día (número de cola, estado: `esperando → llamado → atendido`), con cola consistente por clínica.
- Roles: **secretaría, admin**.
- Backend: `modules/turnos` (`GET/POST /turnos`, `PATCH estado`). La fecha se maneja en hora de **Caracas**.

### 2.10 Recordatorios — `features/notificaciones` (`/notificaciones` → `NotificacionesPage.tsx`)
**Objetivo:** Ver **recordatorios/citas** (whatsapp/email): pendientes por enviar y ya enviadas, con botón para disparar el envío manual.
- Roles: **secretaría, admin**.
- Backend: `modules/notificaciones` (`GET /notificaciones`, `POST /enviar-pendientes`), `services/notifier.ts` y `services/messagingProvider.ts`.

### 2.11 Alertas clínicas — `features/alertas` (`/alertas` → `AlertasPage.tsx`)
**Objetivo:** Configurar **umbrales de referencia** por examen (parámetro crítico min/max) y ver **alertas clínicas** generadas cuando un resultado está fuera de rango; marcarlas como leídas.
- Roles: **laboratorio, admin**.
- Backend: `modules/alertas` (`GET /parametros`, `POST/PATCH/DELETE parametros`, `GET /alertas`, `PATCH leida`).

### 2.12 Imágenes arriba / Adjuntos — (ver 2.8)
### 2.13 Administración — `features/admin` (`/admin` → `AdminPage.tsx`)
**Objetivo:** Panel central de administración con pestañas:
- **Personal:** crear/editar usuarios del staff y asignar roles (`GET/POST/PATCH /admin/staff`).
- **Exámenes:** catálogo de exámenes con **precio en USD** y equivalencia en Bs.
- **Umbrales:** umbrales de referencia clínica (ver 2.11).
- **Tasas de cambio:** ver/historial, crear manual, **escanear dolarapi/BCV** y seleccionar la tasa activa del día (USD/EUR).
- **Reportería:** reportes de caja/cobranza en USD normalizado (`GET /admin/reporteria`).
- **Auditoría:** log de acciones de los usuarios (`GET /admin/auditoria`).
- **Configuración:** ajustes globales (branding/header/IVA) y validación global de seguridad.
- Roles: **admin, super_root**.
- Backend: `modules/admin`, `modules/tasas`.

### 2.14 Mocks (desarrollo) — `features/mocks` (`/mocks` → `MocksPage.tsx`)
**Objetivo:** Explorador de datos de prueba (solo en `npm run dev`): credenciales demo, tablas y conteos, y botón para **restablecer** el seed mock.
- Backend: `modules/mocks` (`GET /api/mocks`, `/tables`, `/reset`).

---

## 3. Portal del paciente — `features/portal` (`/portal` → `PortalPage.tsx`)
**Objetivo:** Acceso del paciente (con código/token de portal) para autogestionar su salud sin depender del staff. Pestañas:
- **Resultados:** mis resultados de exámenes y evolución clínica en el tiempo.
- **Evolución:** gráficas/evolución de parámetros a lo largo del tiempo (`Evolucion.tsx`).
- **Pagos:** pagos realizados y pendientes, con totales **USD + equivalencia en Bs.**.
- **Exámenes:** catálogo de exámenes con precio USD y valor Bs.
- **Récipes:** recetas médicas recibidas.
- **Consultas:** historial de consultas del paciente.
- **Familia:** vínculo a dependientes (padres/hijos) con sus mismos datos.
- **Reservas:** **reservar / cancelar / reprogramar** citas online con disponibilidad de los médicos.
- **Mi historial:** completar y mantener el **cuestionario de anamnesis**.
- **Turnos:** pantalla pública de sala de espera (`/portal/turnos`).

Backend: `modules/portal` (verificación por código/ OTP, resultados compartidos por token, catálogo, pagos, récipes, consultas, dependientes, médicos, disponibilidad, reservas, cuestionario, turnos de hoy).

### Compartir resultados
- `compartir-resultado` → genera un **token único** para compartir, accesible sin login en `/portal/compartido/:token` (`ResultadoCompartido.tsx`). Servicio `PreviewResultado`/`CompartirModal` en el portal.

---

## 4. Módulos transversales (backend)

| Módulo | Objetivo | Endpoints principales |
|---|---|---|
| **auth** | Login (con 2FA opcional), refresh, logout, cambio de rol, sesión actual | `POST /auth/login`, `/refresh`, `/logout`, `/switch-role`, `GET /auth/me`, `GET/POST /auth/mfa/estado\|setup\|verify\|desactivar`, `POST /auth/mfa/verify-login` |
| **tasas** | Tasa de cambio del día USD/EUR (dolarapi primario, BCV respaldo, o manual) | `GET /api/tasas`, `GET/POST /admin/tasas`, `POST /admin/tasas/scraping`, `POST /seleccionar` |
| **admin** | Personal, audit, reportería, exámenes, catálogo, integración LIS/loinc, config, validar firmas | ver 2.13 |
| **pacientes** | CRUD pacientes (adultos y menores) | `GET/POST/PUT/DELETE /api/pacientes` |
| **consultas** | Agenda y registro de consultas (diagnóstico, notas) | `GET/POST /consultas`, `GET /consultas/:id`, `PATCH /diagnostico`, `GET /historial` |
| **examenes** | Catálogo de exámenes de laboratorio | `GET/POST /examenes`, `GET /medicos` |
| **solicitudes** | Órdenes de lab: crear, listar, resultados, pre-analitico | `POST /solicitudes`, `GET`, `PATCH estado`, `POST /:id/resultados` |
| **pagos** | Cobro USD/Bs., factura PDF, reporte, reembolso | `POST /pagos/laboratorio`, `GET /pagos`, `GET /:id/factura`, `PATCH estado`, `POST reembolsar` |
| **laboratorio/reactivos** | Inventario de reactivos/consumibles | `GET/POST /reactivos`, `PATCH /reactivos/:id` |
| **portal** | Portal del paciente (ver Sección 3) | `POST /generar-codigo`, `/verificar`, `mis-resultados`, `mis-pagos`, `catalogo`, `reservar`, `turnos-hoy`, etc. |
| **config** | Configuración pública de la clínica (branding) | `GET /config` |
| **notificaciones** | Recordatorios de citas (enviar pendientes) | `GET /notificaciones`, `POST /enviar-pendientes` |
| **domicilios** | **Tomas de muestras a domicilio** | `GET/POST /domicilios`, `PATCH /domicilios/:id` |
| **turnos** | Cola/sala de espera por día | `GET/POST /turnos`, `PATCH /turnos/:id/estado` |
| **familia** | Vínculos familiares (responsable/hijos) | `GET/POST /familia`, `DELETE /familia/:id` |
| **preanalitica** | Checkpoints pre-analíticos de una orden | `GET /preanalitica`, `GET /solicitudes/:id`, `POST validar` |
| **alertas** | Umbrales y alertas clínicas automáticas | `GET/POST/PATCH/DELETE /parametros`, `GET /alertas`, `PATCH /:id/leida` |
| **imagenes** | Imágenes clínicas adjuntadas | `GET/POST /imagenes` |
| **historial** | Expediente digital + interconsultas + anamnesis | `GET /historial`, `GET /pacientes/:id`, `GET /interconsultas`, `POST corregir` y `modules/historial/cuestionarios` |
| **tasas** | Ver Sección 2.13 y módulo tasas | `GET /tasas`, `POST /admin/tasas/scraping`, etc. |
| **mocks** | Datos demo para desarrollo | `GET /mocks`, `/tables`, `POST /reset` |

---

## 5. Moneda: USD base con equivalencia en Bolívares
- Los **precios** de exámenes/consultas se almacenan y calculan en **USD**.
- La **caja** cobra en USD y convierte automáticamente a **Bs.** con la **tasa del día** (si no hay tasa configurada, avisa).
- La **tasa del día** (USD/EUR) se obtiene de **dolarapi** (fuente primaria) con respaldo de **BCV** scraping; también se puede ingresar/exportar manualmente en Administración → Tasas de cambio.
- La equivalencia USD↔Bs. se muestra en todo el proyecto (staff, portal del paciente y factura PDF) vía `services/moneda.ts` (backend) y `lib/moneda.ts` + componente `PrecioDual` (frontend).
- **Importante:** Todas las fechas de "hoy" del sistema usan la zona horaria **America/Caracas** para evitar desfases con la tasa del día.

---

## 6. Notas y pendientes conocidos
- El smoke test (`backend/scripts/smoke.ts`) reporta fallos **preexistentes** ajenos a la moneda: las rutas de cuestionarios se montan en `/api/historial/...` y el smoke intenta `/api/cuestionarios` (404), y el flujo de subida de resultados depende de la config de **pre-analítica** (se consulta en `app_config`).
- Revisar `pendientes.md`, `propuesta.md`, `SPEC.md` y `DEPLOY.md` para visión de producto y despliegue.