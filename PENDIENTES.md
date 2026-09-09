# TotalHealth — Pendientes de Desarrollo

## Estado Actual
- **Frontend**: React 19 + TypeScript + Vite + TailwindCSS v4
- **Backend**: Node.js + Express + TypeScript + Supabase (PostgreSQL)
- **Mock**: In-memory store para desarrollo sin Supabase
- **Auth**: Supabase Auth (staff) + OTP (pacientes)

---

## FASE 0 — Fixes Críticos

### 0.1 Email duplicado (Paciente → Personal)
- **Problema**: `POST /api/admin/staff` falla si el email ya existe en `auth.users`
- **Solución**: Antes de `createUser()`, buscar email existente. Si existe, agregar roles al perfil existente en vez de fallar
- **Archivos**: `admin.routes.ts`, `admin.validators.ts`, `mock/client.ts`, `AdminPage.tsx`
- **Estado**: 🔴 Pendiente

---

## FASE 1 — Funcionalidades Nuevas (27 puntos)

### 1.1 Recordatorios de medicamentos
- **Descripción**: Push/WhatsApp con horarios programados para cada medicamento de la receta
- **Backend**: Nuevo campo `recordatorios` en `recipes_detalle`, job cron para despachar
- **Frontend**: Toggle de recordatorios en receta, vista en portal del paciente
- **Estado**: 🔴 Pendiente

### 1.2 Gráficas de evolución de signos vitales
- **Descripción**: Charts interactivos (peso, presión, glucosa, IMC, SpO2) en portal del paciente
- **Backend**: Endpoint `GET /api/portal/signos-vitales` que extrae de evoluciones
- **Frontend**: Recharts AreaChart/LineChart en portal
- **Estado**: 🔴 Pendiente

### 1.3 Chat seguro paciente↔clínica
- **Descripción**: Mensajes bidireccionales con persistencia
- **Backend**: Tabla `mensajes`, endpoints CRUD, notificación en tiempo real
- **Frontend**: Componente chat en portal y en expediente del médico
- **Estado**: 🔴 Pendiente (diferir a fase posterior)

### 1.4 Carga de documentos por paciente
- **Descripción**: Paciente sube imagen/archivo desde el portal
- **Backend**: Upload a Supabase Storage bucket `documentos_paciente`
- **Frontend**: Dropzone en portal, vista en expediente
- **Estado**: 🔴 Pendiente (diferir a fase posterior)

### 1.5 Compartir resultados vía QR
- **Descripción**: Generación de QR desde el portal para compartir resultados
- **Backend**: Ya existe `ResultadoCompartido`, falta endpoint de generación desde portal
- **Frontend**: Botón "Compartir" en cada resultado del portal
- **Estado**: 🟡 Parcial (falta generación desde portal)

---

## FASE 2 — Módulo Médico

### 2.1 Telemedicina
- **Descripción**: Videollamada integrada o enlace externo (Jitsi/Google Meet)
- **Backend**: Generación de enlace único por consulta, campo `url_telemedicina` en consultas
- **Frontend**: Botón "Iniciar telemedicina" en consulta en curso
- **Estado**: 🔴 Pendiente

### 2.2 Receta digital con QR
- **Descripción**: Cada receta tiene un QR que verifica autenticidad + lista de medicamentos
- **Backend**: Generar hash de la receta, endpoint de verificación
- **Frontend**: QR en receta impresa, vista de verificación pública
- **Estado**: 🔴 Pendiente

### 2.3 Historial de alergias/contraindicaciones
- **Descripción**: Panel visible al prescribir medicamentos
- **Backend**: Tabla `alergias_paciente` o campo en `pacientes`, visible en recipes
- **Frontend**: Alerta visual al crear receta si hay alergias registradas
- **Estado**: 🔴 Pendiente

### 2.4 Agenda personal del médico
- **Descripción**: Vista filtrada solo con las citas del médico logueado
- **Backend**: Ya existe `disponibilidad_medico`, falta endpoint dedicado
- **Frontend**: Nueva vista "Mi Agenda" en sección médico
- **Estado**: 🔴 Pendiente

---

## FASE 3 — Módulo Laboratorio

### 3.1 Control de calidad interno (Levey-Jennings)
- **Descripción**: Gráficas de control de calidad por reactivo/parámetro
- **Backend**: Tabla `controles_calidad`, endpoints CRUD + cálculo de estadísticas
- **Frontend**: Gráficas Levey-Jennings, reglas de Westgard
- **Estado**: 🔴 Pendiente

### 3.2 Integración con analizadores automáticos
- **Descripción**: Importación de resultados vía HL7/ASTM
- **Backend**: Parser HL7, endpoint de importación batch
- **Frontend**: UI de importación y revisión antes de confirmar
- **Estado**: 🔴 Pendiente (diferir a fase posterior - requiere hardware)

### 3.3 Tracking de muestras en tiempo real
- **Descripción**: Estados visuales de cada muestra (recepción → análisis → completado)
- **Backend**: Campo `estado_muestra` en `solicitudes_detalle`, historial de estados
- **Frontend**: Timeline visual por solicitud en laboratorio
- **Estado**: 🔴 Pendiente

### 3.4 Impresión de etiquetas QR
- **Descripción**: Formato minimalista con QR + detalles lado izquierdo
- **Backend**: Ya existe `EtiquetaQRSolicitud`, mejorar formato
- **Frontend**: Nuevo componente `EtiquetaMuestra` con layout minimalista
- **Estado**: 🔴 Pendiente

### 3.5 Panel de TAT (Turnaround Time)
- **Descripción**: Métricas de tiempo promedio por examen
- **Backend**: Query de cálculo de TAT desde `created_at` hasta `procesado_at`
- **Frontend**: Dashboard cards con TAT promedio, gráficas por examen
- **Estado**: 🔴 Pendiente

---

## FASE 4 — Módulo Administrativo

### 4.1 Dashboard métricas avanzadas
- **Descripción**: Ingresos por médico, por especialidad, por día de semana, tendencias
- **Backend**: Endpoints de agregación en `admin/reporteria`
- **Frontend**: Recharts BarChart, LineChart, PieChart en AdminDashboard
- **Estado**: 🔴 Pendiente

### 4.2 Inventario general
- **Descripción**: Papelería, insumos, equipos (no solo reactivos de lab)
- **Backend**: Tabla `inventario_general`, CRUD + movimientos
- **Frontend**: Nueva sección en Admin o LabDashboard
- **Estado**: 🔴 Pendiente

### 4.3 Gestión multi-clínica UI
- **Descripción**: Selector de clínica activa, dashboard consolidado
- **Backend**: Ya existe `clinica_id` + `switch-clinic`, falta UI
- **Frontend**: Dropdown de selección de clínica en sidebar
- **Estado**: 🔴 Pendiente

### 4.4 Reportes exportables PDF/Excel
- **Descripción**: Exportar facturación, pacientes, consultas a PDF/Excel
- **Backend**: Ya existe `facturaPdf.ts`, extender a otros módulos
- **Frontend**: Botón de exportación en cada tabla principal
- **Estado**: 🔴 Pendiente

### 4.5 Permisos granulares por módulo
- **Descripción**: Control fino de acceso por acción (crear, editar, eliminar) por módulo
- **Backend**: Tabla `permisos`, middleware de verificación
- **Frontend**: UI de asignación de permisos en admin
- **Estado**: 🔴 Pendiente (diferir a fase posterior)

---

## FASE 5 — Integraciones

### 5.1 Pasarela de pagos
- **Descripción**: Pago Móvil, Zelle, tarjeta de crédito/débito
- **Backend**: Implementar `PasarelaProvider` real en `paymentProvider.ts`
- **Frontend**: Formulario de pago con selección de método y confirmación
- **Estado**: 🔴 Pendiente

### 5.2 WhatsApp Business API
- **Descripción**: Coexistencia de Baileys (personal) + API oficial (producción)
- **Backend**: Nuevo `WhatsAppBusinessProvider` en `messagingProvider.ts`
- **Frontend**: Selector de proveedor en configuración
- **Estado**: 🔴 Pendiente

### 5.3 Impresión directa
- **Descripción**: Imprimir reportes/facturas desde el navegador
- **Frontend**: `window.print()` con estilos `@media print`
- **Estado**: 🟡 Parcial (ya existe `PrintHeader`)

---

## FASE 6 — Seguridad y Compliance

### 6.1 Trazabilidad completa (Audit Trail)
- **Descripción**: Usuario, timestamp, IP, cambios antes/después
- **Backend**: Mejorar `auditoria.ts` con snapshots `old`/`new`
- **Frontend**: Viewer mejorado con diff visual
- **Estado**: 🟡 Parcial (ya existe `audit_logs`)

### 6.2 Políticas de retención de datos
- **Descripción**: Borrado automático después de X años
- **Backend**: Job cron que limpia datos según política
- **Estado**: 🔴 Pendiente (diferir a fase posterior)

### 6.3 Exportación de datos del paciente
- **Descripción**: Right to be forgotten (GDPR-like)
- **Backend**: Endpoint de exportación + borrado lógico
- **Estado**: 🔴 Pendiente (diferir a fase posterior)

---

## FASE 7 — Optimizaciones de Funcionalidades Existentes

### 7.1 Reportería mejorada
- **Actual**: Solo total por tipo de pago
- **Mejora**: Por médico, por especialidad, por día de semana, gráficas Recharts
- **Archivos**: `admin.routes.ts` (reporteria), `AdminDashboard.tsx`

### 7.2 Expediente — Panel de alergias
- **Actual**: No existe panel dedicado
- **Mejora**: Panel prominente con alergias + contraindicaciones visible al prescribir

### 7.3 Portal — Gráficas de evolución
- **Actual**: Solo muestra resultados como lista
- **Mejora**: Gráficas de tendencia de parámetros clave

### 7.4 Notificaciones automáticas por eventos
- **Actual**: Recordatorios manuales + cita
- **Mejora**: Automáticas por: resultado listo, cita próxima, medicamento pendiente, pago pendiente

### 7.5 Agenda personal del médico
- **Actual**: Ve toda la agenda de la clínica
- **Mejora**: Filtro "Solo mis citas" con vista propia

---

## Orden de Desarrollo (Recomendado)

1. **Fix email duplicado** (crítico)
2. **Punto 14**: QR labels minimalistas
3. **Punto 22**: WhatsApp Business API
4. **Punto 7**: Receta digital con QR
5. **Punto 9**: Alergias/contraindicaciones
6. **Punto 2**: Gráficas evolución signos vitales
7. **Punto 1**: Recordatorios medicamentos
8. **Punto 6**: Telemedicina
9. **Punto 13**: Tracking muestras
10. **Punto 16**: Dashboard métricas avanzadas
11. **Punto 19**: Reportes exportables
12. **Punto 11**: Control calidad Levey-Jennings
13. **Punto 17**: Inventario general
14. **Punto 21**: Pasarela de pagos
15. **Punto 25**: Trazabilidad completa
16. **Optimizaciones** ( Reportería, Expediente, Portal, Notificaciones, Agenda )

---

*Última actualización: 2026-09-04*

---

## ✅ Progreso (dones)

### Fix 0.1 — Email duplicado (Paciente → Personal)
- **Hecho**: `POST /api/admin/staff` ahora busca el email con `listUsers`; si ya existe fusiona roles al perfil existente (`merged: true`) o crea el perfil del usuario auth existente sin fallar.
- **Archivos**: `backend/src/modules/admin/admin.routes.ts`, `admin.validators.ts`, `mock/client.ts`, `frontend/src/features/admin/AdminPage.tsx`.
- **Verificado**: `tsc --noEmit` limpio en backend y frontend.

### Punto 14 — Etiquetas QR minimalistas (detalles izq. + QR der.)
- **Hecho**: `EtiquetaQRSolicitud.tsx` rediseñado con layout landscape de 2 columnas: detalles de la muestra a la izquierda y QR a la derecha, fondo oscuro elegante.
- **Archivo**: `frontend/src/features/dashboard/widgets/EtiquetaQRSolicitud.tsx`.

### Punto 9 — Alergias/contraindicaciones
- **Hecho**: Backend `atencion.routes.ts` con CRUD de `pacientes_alergias` (tipo, severidad, reacción), query por paciente (para alertar al prescribir). Migración `0040`.
- **Frontend**: `features/atencion/AtencionPage.tsx` (alta/baja/eliminar).

### Punto 1 — Recordatorios de medicamentos
- **Hecho**: Backend CRUD de `medicamento_recordatorios` en `atencion.routes.ts` (hora HH:mm, canal push/whatsapp/sms, activo).
- **Pendiente backend**: job cron que despache los recordatorios vía notifier.

### Punto 6 — Telemedicina
- **Hecho**: Backend `PUT /api/atencion/consultas/:id/telemedicina` (guarda `url_telemedicina` + `es_telemedicina`). Migración `0040`.
- **Pendiente frontend**: botón en consulta en curso.

### Punto 13 — Tracking de muestras
- **Hecho parcial**: Migración `0040` agrega `solicitudes_detalle.estado_muestra`.
- **Pendiente**: endpoint de cambio de estado + timeline frontend.

### Punto 11 — Control de calidad Levey-Jennings
- **Hecho**: Backend `calidad.routes.ts` CRUD de controles + mediciones (Levey-Jennings). `GET /:id/mediciones`, `POST /:id/mediciones` con regla de ±2/±3 SD.
- **Frontend**: `features/calidad/CalidadPage.tsx` con gráfico Levey-Jennings básico.

### Punto 17 — Inventario general
- **Hecho**: Backend `inventario.routes.ts` CRUD + movimientos entrada/salida y alerta de stock mínimo.
- **Frontend**: `features/inventario/InventarioPage.tsx`.

### Punto 3.5 — Panel de TAT (Turnaround Time)
- **Hecho**: Backend `GET /api/atencion/tat` (promedio por examen/categoría). Frontend en `AtencionPage.tsx`.

### Migración
- **Creada**: `backend/supabase/migrations/0040_nuevas_funcionalidades.sql` (alergias, recordatorios, muestras, telemedicina, inventario, QC).

### Rutas / navegación
- **Backend**: módulos `atencion`, `inventario`, `calidad` registrados en `routes/index.ts`.
- **Frontend**: rutas `/atencion`, `/inventario`, `/calidad` en `App.tsx` + items de nav en `rbac.ts`.
