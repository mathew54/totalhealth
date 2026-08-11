# Pendientes — TotalHealth

Brechas detectadas al comparar el estado construido con **`propuesta.md`**.
El núcleo (SPEC M1–M4: auth/RBAC, pacientes, consultas, solicitudes, resultados,
pagos de caja, portal OTP) ya está funcional. Este archivo recoge lo que falta.

## Nuevo desarrollo — WhatsApp real (Baileys) como método de mensajería

- [x] **WhatsApp como método de mensajería real del backend (Baileys) + módulo de**
  vinculación en Administración → Configuración.
  1. **Servicio** `services/whatsappService.ts`: singleton con sesión persistente
     `useMultiFileAuthState` en `.wa-session/` (gitignored). Expone estado,
     generación de **QR** (data URL PNG) y **código de emparejamiento**
     (`requestPairingCode`), envío de mensajes de texto y desvinculación. Maneja
     reconexión automática en `515 restartRequired` y logout en `401 loggedOut`.
     Normaliza teléfonos VE a E.164 sin `+` (código de país configurable,
     `WHATSAPP_PAIS_CODIGO=58` por defecto).
  2. **Provider** `messagingProvider.ts`: nuevo `WhatsAppProvider`
     (`MESSAGING_PROVIDER=whatsapp`). `sendOtp` (canal sms/whatsapp) y
     `sendNotify` (canales sms/whatsapp/push) despachan por WhatsApp real;
     los canales email siguen usando mock/ocupan SMTP. Reutilizado por
     `notifier.ts` (recordatorios/resultados/domicilio) y el OTP del portal.
  3. **API admin** `modules/whatsapp/whatsapp.routes.ts` (protegida
     `authRequired` + `role admin/super_root`): `GET /api/admin/whatsapp`
     (estado), `POST /qr` (QR PNG), `POST /pairing {telefono}` (código de
     emparejamiento), `POST /test {destino,mensaje}` (envío de prueba) y
     `POST /logout`. Validación zod de teléfono/mensaje.
  4. **Frontend** `WhatsAppConfig.tsx` insertado en `ConfigTab` (AdminPage)
     debajo de "Color del header": estado con badge auto-refresco (5 s),
     opción "Generar QR" o "Código de emparejamiento" (muestra el código en
     grande), mensaje de prueba, botón desvincular.
   5. **Verificado**: backend typecheck/build/72 tests (nuevo
      `whatsapp.test.ts`: auth, estado, validación de números, normalización
      VE); frontend typecheck y lint; **envío real** de "Prueba de totalHealth"
      entregado a +584244458116 vía el servicio integrado (id del mensaje
      3EB00A4758F35F0BB5ED74) con la sesión del dispositivo vinculado.

## Correcciones al flujo de vinculación (reporte del cliente)

Reporte: al pulsar "Generar QR" nunca aparecía QR escaneable, y el emparejamiento
fallaba con "comprueba que el número de teléfono es correcto".

Causa raíz: `backend/.wa-session/creds.json` quedó con `me` seteado pero
`registered: false` (sesión parcial/corrupta de un intento previo). En
`node_modules/@whiskeysockets/baileys/lib/Socket/socket.js` `validateConnection()`
(líneas 320-327): si `creds.me` existe, Baileys intenta **LOGIN** en vez de
**registro** → nunca emite QR. Además, `requestPairingCode` se llamaba antes de
que el socket estuviera conectado.

- [x] `credsDisco()` + `limpiarSesionParcial()`: detecta sesión parcial
  (`!registered && me`) y borra `.wa-session/` automáticamente antes de vincular.
- [x] `iniciarVinculacion()`: cierra el socket anterior (flag
  `cerradoVoluntariamente`), resetea estado y limpia sesión parcial antes de
  cada QR/pairing; `desconectarWhatsApp()` también marca `cerradoVoluntariamente`.
- [x] Guarda de socket obsoleto en `crearSocket()`: el handler de
  `connection.update` del socket viejo se ignora si `sock !== socketActual`,
  evitando reconexiones duplicadas tras una nueva vinculación/logout.
- [x] Registro de listeners ANTES de crear el socket en `obtenerQrWhatsApp` y
  `solicitarCodigoEmparejamiento`: Baileys emite `connecting` (y el primer QR)
  durante la creación del socket (`process.nextTick`); esperarlo después
  producía timeout.
- [x] `solicitarCodigoEmparejamiento`: espera evento `connecting` + 1.5 s de
  margen antes de `requestPairingCode`; el código se devuelve en formato
  `XXXX-XXXX` (con guion), como lo pide WhatsApp.
- [x] `estadoWhatsApp()`: reporta `conectado` si el disco tiene sesión
  registrada aunque el socket aún no abra.
- [x] Frontend `WhatsAppConfig.tsx`: QR más grande (h-52 w-52) con marco, botón
  "Generando QR…" mientras carga, limpieza de QR/código al conectar,
  `refetchInterval` 3 s. Eliminada redeclaración de `activo` y `activo2` huérfano.
- [x] Verificado: QR real (data URL PNG) y código de emparejamiento real
  (formato `XXXX-XXXX`) generados tras borrar la sesión corrupta; backend
  typecheck/72 tests OK; frontend typecheck OK.

## Fase A — Valor inmediato (bajo/medio esfuerzo)

- [x] QR/código seguro para compartir un resultado con un médico externo.
  `POST /api/portal/compartir-resultado` genera token firmado (HS256, 1 h) por
  paciente+resultado; `GET /api/portal/compartido/:token` lo lee en modo público
  de solo lectura. Frontend: botón "Compartir QR" con modal (QR + enlace) y vista
  pública en `/portal/compartido/:token` (`ResultadoCompartido.tsx`).
- [x] Gráficas de evolución por examen numérico (glucosa, hemoglobina, perfil lipídico).
  Tab "Evolución" en el portal con `recharts` (chunk lazy) a partir de
  `resultados.valores`. Datos de prueba históricos en `mock/seed.ts` y `seed.sql`
  (series de glicemia y colesterol del paciente demo Juan Pérez).
- [x] Histórico financiero del paciente en el portal (pagos realizados/pendientes).
  `GET /api/portal/mis-pagos` (token de portal) devuelve pagos, solicitudes sin
  cobrar, total pagado y total pendiente. Tab "Pagos" en el portal.
- [x] Catálogo de exámenes con `condiciones_previas` y `tiempo_entrega`. Backend
  (migración `0005`, CRUD admin, endpoint público `/api/portal/catalogo`, validators)
  + tab "Exámenes" en el portal con precio, duración, entrega y condiciones previas.

## Fase B — Pagos y facturación (alto esfuerzo)

- [x] Pasarela de pagos integrada: transferencias, pago móvil (VE) y divisas (USD).
  Abstracción `PaymentProvider` (`services/paymentProvider.ts`, mock + plantilla
  pasarela real por `PAYMENT_PROVIDER`). Estados `pendiente → pagado → reembolsado`
  con validación, `PATCH /pagos/:id/estado`, `POST /pagos/:id/reembolsar`. Moneda
  BS/USD y método (efectivo/punto/transferencia/pago_móvil/zelle).
- [x] Módulo de descuentos en solicitudes/consultas (campo `descuento`, motivo, autorización).
  Columnas `descuento/descuento_motivo/descuento_autorizado_por` (migración `0006`),
  aplicables en el cobro de laboratorio con validación 0..total.
- [x] Facturación electrónica: comprobante de pago, recibo y factura fiscal descargable (VE).
  `services/invoice.ts` (IVA 16%, montos en letras, número de control/serie) +
  `GET /pagos/:id/factura` y descarga PDF desde Caja (`lib/facturaPdf.ts`).

## Fase C — Experiencia paciente (alto esfuerzo)

- [x] Perfiles familiares: vinculación de dependientes (hijos, adultos mayores) a una cuenta principal.
  Backend: tabla `vinculos_familiares` (migración `0007`) + módulo `familia`
  (`GET/POST/DELETE /api/familia`, resuelve nombres de dependientes) + portal
  `GET /api/portal/mis-dependientes`. Frontend: tab "Familia" en el portal
  (`PortalPage`) listando dependientes con parentesco y nacimiento.
- [x] Reserva online autogestionada con disponibilidad en tiempo real filtrado por
  especialidad/médico/sede. Reprogramación y cancelación por el paciente.
  Backend: migración `0011` (`profiles.especialidad`, `disponibilidad_medico`,
  `consultas.origen`/`reservada_por`) + endpoints de portal
  `GET /medicos`, `GET /disponibilidad?medico_id=&fecha=`, `POST /reservar`,
  `GET /mis-reservas`, `PATCH /reservas/:id/reprogramar`,
  `POST /reservas/:id/cancelar`. Frontend: tab "Reservas" en el portal
  (`Reservas.tsx`) con lista de médicos, slots libres, reserva, reprogramación
  y cancelación.
- [x] Recordatorios automáticos (push/WhatsApp/SMS) de citas y resultados.
  Backend: tabla `notificaciones` (migración `0008`), `services/notifier.ts`
  (agendar/enviar pendientes/recordatorio de cita/resultado listo/domicilio),
  módulo `notificaciones`. Frontend: página "Recordatorios"
  (`NotificacionesPage`) con cola de pendientes/enviadas y botón
  "Enviar pendientes" (job).
- [x] Toma de muestras a domicilio con rastreo de la visita.
  Backend: tabla `muestras_domicilio` (migración `0009`), módulo `domicilios`
  (cola + `PATCH :id` estado/ubicación + notificación). Frontend: página
  "Domicilios" (`DomiciliosPage`) con nueva solicitud, filtros por estado y
  avance de estados (solicitada→programada→en_ruta→tomada→completada).
- [x] Sala de espera / control de turnos y validación pre-analítica de órdenes.
  Backend: tabla `turnos` (migración `0010`), módulo `turnos` (número
  secuencial del día, cola por fecha/estado, `PATCH :id/estado`). Frontend:
  página "Sala de espera" (`TurnosPage`) con crear turno (paciente + prioridad),
  tarjetas en espera/atendidos y acciones llamar/atender/saltar/cancelar.
  Pantalla pública en `/portal/turnos` (`PantallaTurnos`) vía
  `GET /api/portal/turnos-hoy` (turno en consulta + cola en espera, sin datos
  personales, auto-refresco 5 s) y enlace "Sala de espera" en el header del portal.
- [x] Validación pre-analítica de órdenes (checklist antes de la toma/resultado).
  Backend: migración `0012`, tablas `checkpoints_preanalitica` y
  `solicitudes_preanalitica`, toggle en `app_config.preanalitica`
  ({habilitado, obligatorio}), módulo `preanalitica`
  (GET catálogo, PUT config, POST/PATCH checkpoints, GET estado por solicitud,
  POST validar). Gate en `POST /solicitudes/:id/resultados`: si la validación
  es obligatoria y hay checkpoints activos incompletos, bloquea la subida con
  "validación pre-analítica pendiente". Frontend: bloque de checklist en el
  detalle de LaboratorioPage (confirmar puntos → validar) y panel de
  configuración (toggle habilitado/obligatorio + alta/desactivación de
  checkpoints) en AdminPage → Configuración.

## Backend y frontend de Fase C — completado

Módulos nuevos implementados y verificados en modo mock (`npm run typecheck/
build/test` backend y frontend, `npx oxlint src`, smoke test de API vía proxy):

- `familia` + portal `mis-dependientes` (nombres resueltos manualmente, funciona
  en mock y Supabase real)
- `notificaciones` + `services/notifier.ts` (agendar/recordatorio cita/resultado/domicilio)
- `domicilios` (cola CRUD + `PATCH :id` estado/ubicación) + notificación al paciente
- `turnos` (crear con número secuencial, cola del día, `PATCH :id/estado`)
- `preanalitica` (checkpoints + validación por solicitud + toggle config + gate en resultados)

Disparo automático: al agendar una consulta (staff u online) se crean
recordatorios de cita (24 h y 1 h antes); al liberar una solicitud completa se
notifica al paciente que su resultado está disponible.

Migrations nuevas: `0008_notificaciones.sql`, `0009_muestras_domicilio.sql`,
`0010_turnos.sql`, `0011_reserva_online.sql`, `0012_preanalitica.sql`. Seed
ampliado (`notificaciones`, `muestras_domicilio`, `turnos`, `vinculos_familiares`,
`consultas.origen`, `disponibilidad_medico`, `profiles.especialidad`,
`checkpoints_preanalitica`, `solicitudes_preanalitica`, `app_config.preanalitica`).

Nota: el mock no resuelve joins FK automáticamente; los módulos de Fase C
resuelven los nombres de pacientes/dependientes manualmente (patrón igual a
`mis-resultados`), robusto también contra Supabase real.

Nota: el GET `/api/preanalitica` (catálogo) devuelve todos los checkpoints con
su `activo` para permitir reactivarlos desde el admin; el endpoint de estado por
solicitud (`/api/preanalitica/solicitudes/:id`) filtra solo los activos.

## Fase D — Clínica y normativa (alto esfuerzo)

- [x] Alertas clínicas automáticas cuando un parámetro supera niveles críticos de referencia.
  Umbrales por examen → flag al cargar resultado + aviso resaltado en ficha.
  Backend: migración `0013`, tablas `parametros_referencia` (rango normal/crítico por
  examen+clave) y `alertas_clinicas` (registro por resultado + `leida`), módulo `alertas`
  (GET parámetros, GET alertas con filtros paciente/solicitud/no leídas, POST/PATCH/DELETE
  umbrales, PATCH `:id/leida`), motor `evaluarAlertas`/`registrarAlertas` que, al cargar
  resultados, extrae el número del valor y lo compara con los umbrales (alerta o crítico).
  `POST /solicitudes/:id/resultados` devuelve `alertas_generadas`; `mis-resultados` del portal
  incluye las alertas de cada resultado. Frontend: página "Alertas clínicas"
  (`AlertasPage`, críticas/sin revisar, marcar leída, filtro), gestión de umbrales en
  Admin → Umbrales, banner de alertas al subir resultados en LaboratorioPage y aviso
  resaltado en la ficha de resultados del portal.
- [x] Visualizador de imágenes médicas (MVP con imágenes en storage).
  Backend: migración `0014`, tabla `imagenes_clinicas` (url, tipo rx/ecografia/
  tomografia/resonancia/foto/otro, región, descripción, paciente, consulta),
  módulo `imagenes` (GET filtros paciente/consulta/tipo, POST data URL base64
  por staff, DELETE solo admin). Frontend: página "Imágenes"
  (`ImagenesPage`) con adjuntar imagen (FileReader→dataURL, vista previa),
  galería por paciente y lightbox de visualización.
- [x] Integración LIS/HIS/EMR vía API REST + mapeo LOINC.
  Backend: migración `0015` (`codigo_loinc`, `codigo_externo`, `fecha_mapeo`
  en `examenes_laboratorio`), diccionario base LOINC con sugerencias por nombre,
  `GET /api/admin/integracion/loinc` (estado de mapeo con sugerencia automática)
  y `POST /api/admin/integracion/loinc/adoptar`. Frontend: tab "Integración" en
  Admin (resumen mapeados/pendientes, adoptar sugerencia por examen).

## Infraestructura / Seguridad (transversal)

- [x] Notificador real para OTP y recordatorios.
  Nuevo `messagingProvider.ts` (abstracción mock ↔ SMTP/Twilio). El OTP del
  portal ya se despacha por el proveedor: en dev expone `dev_codigo`, en
  producción se entrega fuera de banda al teléfono (y no se filtra el código).
  Config por env: `MESSAGING_PROVIDER`, `SMTP_*`. El job de recordatorios
  `enviarNotificacionesPendientes` también despacha por canal real.
- [x] Registro de auditoría para portal (descargas de resultados, intentos OTP).
  Nuevo servicio `auditoria.ts` (`registrarAuditoria` + IP) sobre la tabla ya
  existente `audit_logs`. Se registran `PORTAL_OTP_FALLIDO`, `PORTAL_LOGIN_OK`
  y `PORTAL_COMPARTIR_RESULTADO` (cedula/pid + IP), legibles vía
  `GET /api/admin/auditoria`. Fail-open: no interrumpe la operación principal.
- [x] Validación batch de firmas/URLs firmadas de Storage (SUPA 15 min) en producción.
  Nuevo `storageService.ts`: `createSignedUrl` (real→Supabase Storage, mock→URL
  con `?e=`+`sig=`) y `validarRenovarFirmas` (renueva vencidas/por vencer).
  `POST /api/admin/storage/validar-firmas` firma/renueva los PDF de `resultados`.
- [x] PWA: verificar service worker y caché sin PDFs; code-splitting por ruta.
  SW manual (`sw.js`) con network-first para navegación y cache-first para
  assets; no cachea `/api` ni PDFs. Se añadió mensaje `SKIP_WAITING` para
  actualización en caliente + `UpdateBanner` (hook `useServiceWorkerUpdate`).
  Code-splitting verificado: chunk por página vía `lazy()` (AdminPage,
  PortalPage, LaboratorioPage, ImagenesPage, etc.).

## Nuevas funcionalidades (solicitadas)

- [x] Al crear un paciente, ofrecer la opción de **agregar un hijo** y rellenar
  sus datos (menores sin cédula propia). Backend: migración `0016`
  (`pacientes.cedula` nullable con índice único parcial, columnas
  `tipo_documento`, `es_menor`, `representante_id`, `parentesco_representante`);
  `POST /api/pacientes` acepta `es_menor`+`representante_id` (el menor se
  identifica por el representante) y `hijo` (alta simultánea del menor vinculado
  como dependiente con parentesco "hijo"); `GET /pacientes/:id` devuelve el
  `representante` resuelto; la búsqueda encuentra menores por el documento/nombre
  del representante. Frontend: PacientesPage con tipo de documento, checkbox
  "Es menor de edad" (selector de representante) y sección "Agregar un hijo en el
  alta". Demo: Samuel Pérez (menor de Juan Pérez) en `seed.ts`.
- [x] Soporte de **todos los tipos de documentos de identidad de Venezuela** en
  login, creación de usuarios y pacientes: `V`, `P`, `J`, `C` y `E`. Regex
  `DOCUMENTO_REGEX` + `normalizeDocumento` normalizan prefijo y formato
  (`V-12345678`, `J-12345678-0`, `P-1234567`, etc.). Se aplica en login staff,
  alta de personal (admin), pacientes y el OTP del portal (generar-código/verificar).
  Frontend: selector de tipo de documento en PacientesPage y placeholders
  actualizados en Login, portal y PersonalTab.
- [x] **Módulo de tasas de cambio del día**:
  1. **Scraping** a la web del Banco Central de Venezuela (BCV) para extraer el
     valor de las tasas del **Dólar (USD)** y **Euro (EUR)** del día
     (`services/bcv.ts`: parseo de formato venezolano 1.234,56, extracción por
     id/class/texto, timeout 15 s y error amigable si el sitio no responde).
  2. Opción de **crear una tasa del día manualmente** (admin).
  3. **Seleccionar** cuál tasa se usa activamente en el día (scraping automática
     o manual) por `activa` en `tasas_cambio` (migración `0016`).
  4. La tasa seleccionada se muestra en el **header** de la web, lado derecho
     (componente `TasaHeader` en el header del portal y del staff; tab "Tasas de
     cambio" en Administración con crear manual, actualizar desde el BCV y usar
     una tasa como activa). Público `GET /api/tasas` (con respaldo al último día
     con datos); admin `GET/POST /api/admin/tasas`, `POST /scraping`,
     `POST /seleccionar`.
- [x] **Historial Médico Digital e Integración de Laboratorio** (diseño de
  arquitectura: permisos, flujos de trabajo y modelo de datos). Gestiona el
  acceso para **7 categorías de especialidades** con lectura abierta entre
  médicos y controles de escritura estrictos y trazables.
  1. **Categorías de médicos**: (1) Atención Primaria y Medicina General
     (Medicina General, Pediatría, Geriatría); (2) Especialidades Clínicas
     (Cardiología, Neurología, Gastroenterología, Endocrinología…);
     (3) Especialidades Quirúrgicas (Cirugía General, Traumatología,
     Neurocirugía…); (4) Médico-Quirúrgicas (Gineco/Obstetricia, Urología,
     Oftalmología, ORL); (5) Diagnóstico y Apoyo Clínico (Patología, Radiología,
     Imagenología); (6) Medicina Crítica y Urgencias (Intensivistas,
     Anestesiólogos, Emergentólogos); (7) Salud Pública y Otras (Fisiatría,
     Medicina Ocupacional, del Deporte).
  2. **Política core CRUD**: **lectura global (READ)** de TODO médico verificado
     sobre el historial y resultados de laboratorio de cualquier paciente (sin
     permisos especiales ni desbloqueos de urgencia); **CREATE/UPDATE** solo para
     médicos activos durante consulta/procedimiento/interconsulta; **DELETE
     desactivado por completo** — correcciones como "Fe de Erratas" o "Adenda"
     vinculadas al registro original con marca de agua (fecha, hora, ID del
     médico y firma digital). Auditoría completa e inmutabilidad.
  3. **Módulos obligatorios**:
     - **A. Banner Global de Alertas Críticas**: encabezado permanente en rojo
       visible a todas las especialidades (alergias confirmadas, enfermedades
       crónicas relevantes, medicamentos críticos como anticoagulantes).
     - **B. Privacidad de notas**: Historial Clínico Compartido (visible a todos
       los médicos y exportable) vs. Notas Privadas de Consulta (visibles solo
       por el médico autor).
     - **C. Interconsultas y Referencias**: derivación activa a otra especialidad
       con hipótesis inicial y notificación al especialista asignado.
     - **D. Formularios Dinámicos por Especialidad**: UI adaptada según la
       especialidad (diagramas/parámetros para cardiología, esquemas anatómicos
       para quirúrgicas, informes estructurados para radiología/patología).
     - **E. Interconexión Laboratorio/Imagenología**: órdenes, trazabilidad de
       muestras, PDFs firmados digitalmente y tendencias/gráficas evolutivas.
  4. **Entregables**: (1) Matriz de Permisos por Especialidad (CRUD por cada una
     de las 7 categorías); (2) Diagrama Entidad-Relación / modelo de datos
     (Pacientes, Consultas, Adendas/Versiones, Notas Privadas, Alertas);
     (3) Especificación de reglas de negocio para auditoría, firmas digitales y
     control de adendas.

  Implementado: catálogo de **7 categorías** (`categorias_medicas`) y
  especialidades (`especialidades_medicas`), `profiles.categoria_medica` (asignable
  en Administración → Personal). Backend: migración `0017_historial_medico.sql`
  (tablas `historial_clinico`, `historial_correcciones`, `notas_privadas`,
  `alertas_criticas`, `interconsultas` + RLS) y módulo `historial`
  (`GET /pacientes/:id` expediente, `POST /historial`, `POST /:id/correcciones`,
  notas privadas solo autor, `POST/PATCH alertas`, `POST/GET/PATCH interconsultas`).
  Frontend: página "Historial médico" (`HistorialPage.tsx`) con banner rojo
  permanente de alertas críticas (módulo A), notas compartidas vs. privadas
  (módulo B), derivación/bandeja de interconsultas (módulo C) y registro
  `contenido` JSONB para formularios dinámicos (módulo D); la interconexión con
  laboratorio/imagenología (módulo E) se apoya en `solicitudes`/`resultados`/
  `preanalitica`/`imagenes_clinicas` existentes.   Inmutabilidad: sin DELETE, las
  correcciones se vinculan con marca de agua y firma SHA-256. Diseño completo en
  `historial_medico.md` (matriz CRUD por categoría, ERD, reglas de auditoría/
  firmas/adendas).
- [x] **CRUD completo de Pacientes**: el módulo solo permitía crear/buscar y el
  backend ya tenía `PUT /pacientes/:id`, pero la UI no los exponía y no había
  DELETE. **Implementado** (backend `pacientes.routes.ts`): `DELETE
  /api/pacientes/:id` con **borrado lógico** (`deleted_at`) y guardas de
  integridad (no se elimina a un representante de menores ni a una cabeza de
  dependientes → 409); `PUT` ahora verifica existencia, permite cambiar la
  cédula (con detección de duplicados excluyendo al propio paciente y a los
  eliminados) y normaliza el documento; los listados excluyen eliminados,
  `GET /:id` responde 404 para eliminados y el alta reutiliza cédulas de
  registros eliminados. Además se corrigió un bug latente: el listado daba 400
  cuando `q` venía vacío (`?q=`) porque el schema exigía `min(1)`; ahora acepta
  `''`. Frontend (`PacientesPage.tsx`): botones **Editar** y **Eliminar** en la
  ficha, modal de edición precargado (incluye cambio de documento y su
  normalización) y modal de confirmación de eliminado; invalida caché y
  actualiza la ficha tras editar. Smoke `/tmp/opencode/smoke_pacientes.ts`:
  **10/10 ok**. Verificado: backend typecheck/build/21 tests; frontend
  typecheck/oxlint/build.
- [x] En la **Agenda** (`/consultas`), al crear una consulta: (1) seleccionar
  primero la **especialidad** con la que el paciente desea chequearse y que la
  lista de médicos se filtre automáticamente a quienes la atienden; (2) corregir
  la lista de médicos vacía en modo mock (el formulario usaba `/admin/staff`,
  restringido a admin/super_root → 403 para secretaría). Backend:
  `GET /api/consultas/medicos` (médicos activos con `especialidad`/
  `categoria_medica`, accesible a todo el staff). Frontend: selector de
  especialidad antes del médico en `ConsultasPage`/`PacientePicker`, con la
  lista de médicos filtrada por especialidad.

## Nuevo desarrollo — Cuestionario de Historial Médico (Anamnesis)

**Implementado.** Checklist dinámico de anamnesis multiperfil (paciente o
médico), con campos condicionales y cierre de observaciones. Estados
borrador/consolidado, adendas inmutables con marca de agua y borrado restringido
a administrador con re-autenticación explícita y justificación auditada.

### 1. Gestión CRUD y Permisos de Administración
- [x] **CREATE**: Pacientes (portal) o médicos (staff) pueden iniciar y guardar
  un nuevo cuestionario de historial médico.
- [x] **READ**: Disponible para el paciente (propietario/tutor) y el cuerpo médico.
- [x] **UPDATE**: El paciente o el médico pueden modificar las respuestas antes de
  la consulta. Una vez que la cita finaliza y el historial se consolida, cualquier
  edición posterior genera un nuevo registro/adenda con marca de agua y fecha.
- [x] **DELETE**: Prohibición de borrado directo. La eliminación de un cuestionario
  o de respuestas queda ESTRICTAMENTE RESTRINGIDA a usuarios con Rol de
  Administrador, requiriendo autenticación administrativa explícita (contraseña)
  y justificación registrada en el Log de Auditoría (Soft-Delete).

### 2. Compatibilidad Multiperfil (Cuentas Familiares / Hijos)
- [x] El cuestionario debe poder responderse para el usuario principal o para
  cualquiera de sus dependientes asociados (ej. "Hijo 1", "Hijo 2", "Adulto
  Mayor a cargo").
- [x] El sistema asocia las respuestas directamente al ID único del expediente
  del paciente seleccionado.

### 3. Lógica de Checklist Dinámico + Campos Condicionales
- [x] Cada punto del checklist se presenta como casilla de selección
  (checkbox / switch toggle).
- [x] Comportamiento condicional: al marcar "SÍ" (true) en una opción (ej.
  "Alergias a Medicamentos"), se despliega automáticamente un campo de texto
  dinámico habilitado para especificar los detalles.
- [x] Si la casilla permanece desmarcada ("NO" / false), el campo de texto
  adicional permanece oculto o deshabilitado.

### 4. Campo Abierto Final
- [x] Al final de todos los bloques, se incluye obligatoriamente un campo de
  texto libre con el título "Otros / Observaciones Adicionales" para ingresar
  cualquier condición o detalle no contemplado.

### Estructura de Secciones y Opciones (4 módulos + cierre)
- Módulo 1 — Estilo de Vida y Hábitos: Alimentación; Actividad Física;
  Trastornos del Sueño/Insomnio; Consumo de Alcohol/Tabaco/Vapeo; Estrés o
  Afecciones de Salud Mental.
- Módulo 2 — Antecedentes Médicos Personales: Enfermedades Crónicas; Consumo de
  Medicamentos Continuos; Alergias a Medicamentos/Alimentos/Insumos; Cirugías e
  Hospitalizaciones Previas; Esquema de Vacunación Incompleto/Pendiente.
- Módulo 3 — Antecedentes Heredofamiliares: Cáncer; Enfermedades
  Cardiovasculares/Infartos; Diabetes o Enfermedades Renales.
- Módulo 4 — Revisión por Sistemas (Síntomas Activos): Cardiovasculares;
  Gastrointestinales; Neurológicos; Urológicos/Ginecológicos.
- Módulo 5 — Cierre de Anamnesis: textarea obligatorio "Otros / Observaciones
  Adicionales".

### Entregables
1. **Estructura de datos (JSON Schema)**: schema zod que modela las operaciones
   CRUD, almacenando estados (`boolean`), detalles (`string`), metadatos de
   auditoría (creador, fecha) y banderas de aprobación administrativa para
   eliminación/edición.
2. **Flujo de autorización de Administrador**: middleware/endpoint que exige
   re-autenticación con credenciales administrativas (contraseña) + justificación
   para la acción DELETE, registrando todo en `audit_logs`.
3. **Guía de componentes UI/UX**: wizard paso a paso (Layout por módulos),
   estados de edición/lectura y mensajes de alerta en borrado.

- [x] **Módulo de Agenda con vistas Día / Semana / Mes** integrado a la sala de
  espera. Backend: `GET /api/consultas` acepta `desde`/`hasta` (rango para
  semana/mes) y enriquece cada consulta con `paciente`, `medico`
  (especialidad/categoría) y el `turno` de la cola asociado (`estado`, `numero`,
  `prioridad`), de modo que lo que ocurra en la sala de espera se refleja en la
  agenda (En cola / Llamado / Atendido / Saltado / Cancelado). Frontend:
  `ConsultasPage` con selector Día/Semana/Mes, navegación anterior/hoy/
  siguiente, filtro por estado ("Por atender" oculta completadas/canceladas),
  auto-refresco 15 s, agrupación por especialidad → médico con horario, vista
  semanal en rejilla médico×día y vista mensual tipo calendario que salta al
  día al pulsar una celda. Al hacer clic en una cita se abre el resumen
  (paciente, médico, especialidad, estado del turno) con botón **"Ir a la sala
  de espera"** que navega a `/turnos?consulta=<id>`; `TurnosPage` resalta y
  hace scroll al turno vinculado (auto-refresco 10 s). Corregido además el seed:
  las consultas de hoy usaban `fecha_hora` solo fecha (vista de día vacía);
  ahora usan ISO datetime en hora de Caracas (`hoyA`).

## Nuevo desarrollo — Perfiles y Dashboards por Rol (Multiespecialidad)

La plataforma debe gestionar el acceso para tres perfiles de usuario principales:
**Secretaría/Recepción**, **Laboratorio/Bioanalistas** y **Cuerpo Médico**
(con N especialidades o roles simultáneos).

### 1. Reglas de perfil y multiespecialidad
- [x] Perfil médico flexible: un médico puede tener **N especialidades**
  (ej. "Dr. Pérez" = [Cirujano General, Traumatólogo]) registradas en su perfil.
- [x] **Selector de Especialidad Activa** en la UI + modo **Dashboard
  Consolidado** que carga los widgets de todas sus especialidades.
- [x] Estructura de perfil: ID, rol principal, **colegiatura/licencia**,
  **array de especialidades**, **firma/sello digital** y **configuración de
  dashboard** (vista activa/consolidada).

### 2. Matriz de dashboards por rol principal
- [x] **Secretaría**: resumen de cola de turnos, citas programadas, caja del
  día, recordatorios pendientes + accesos rápidos (registro de pacientes,
  turnos, facturación, notificaciones).
- [x] **Laboratorio (LMS)**: cola pre-analítica (pendientes / en proceso),
  alertas de valores críticos sin revisar, tomas a domicilio, **etiqueta QR
  imprimible por solicitud** (QR + PDF vía `qrcode`/`jspdf`), **carga masiva de
  resultados** (pasta CSV `examen,valor,nota`, asocia por nombre y precarga el
  formulario en LaboratorioPage) y **firma digital del bioanalista** (cada
  resultado se firma con `firma_hash` SHA-256 en `resultados`, migración
  `0022`, + `bioanalista_id` del autor) + accesos rápidos.
- [x] **Médico (widgets por categoría de especialidad activa)**: registro
  `WIDGETS_POR_CATEGORIA` con las 7 categorías. Implementados:

  - **Atención Primaria**: IMC, dosis pediátrica, Cockcroft-Gault, riesgo
    cardiovascular (conteo de factores), carnet de vacunación (esquema VE),
    Índice de Barthel (VGI) y detector de polifarmacia.
  - **Clínicas**: escala PHQ-9 (cribado de depresión).
  - **Quirúrgicas**: checklist OMS y reporte operatorio estructurado.
  - **Médico-Quirúrgicas**: gestograma, control prenatal (altura uterina),
    interpretación de PSA y diario miccional.
  - **Diagnóstico/Apoyo**: dictado por voz (Web Speech API) y plantilla
    BI-RADS.
  - **Crítica/Urgencias**: Glasgow, escala SOFA, calculadora de infusiones y
    hoja anestésica.
  - **Salud Pública**: plan de rehabilitación, certificados de salud y cadena
    de custodia con hash SHA-256 (Web Crypto).

  Completados también: **curvas de crecimiento OMS/CDC** (tablas WHO 2006,
  interpolación de percentiles P3–P97 por edad en 0–60 meses), **tendencias de
  parámetros** desde resultados firmados (nuevo `GET /api/solicitudes/pacientes/
  :id/resultados` devuelve historial con `firma_hash` y `bioanalista_id`),
  **notas de evolución privadas persistentes** (solo visibles para el autor, vía
  endpoints existentes del módulo historial), **genograma familiar** (árbol SVG
  de 3 generaciones anotable, client-side) y **visor de imágenes** (galería
  reutilizando `imagenes_clinicas`, lightbox con zoom y arrastre).

### 3. Entregables
- [x] Esquema de datos (DDL/JSON) para usuario, roles y matriz de permisos.
- [x] Arquitectura del dashboard médico (carga/desmontaje dinámico de widgets
  con 2+ especialidades activas).
- [x] Especificación de seguridad (reglas de acceso, encriptación de datos
  sensibles, inmutabilidad de historiales / audit trail).

Estado: implementado y verificado el **modelo de datos** (migración `0021`:
`profiles.especialidades[]`, `colegiatura`, `firma_digital`,
`especialidad_activa`, `dashboard_config`), `PATCH /api/auth/perfil`, extensión
de staff, **selector de especialidad activa** en el header y el **dashboard
dinámico por rol** (`DashboardPage` + registro de widgets por categoría).
Widgets registrados sin placeholders en todas las categorías. Backend: 35/35
tests, typecheck y build OK; frontend: typecheck y build OK (smoke de 12 checks
sobre los endpoints nuevos). Diseño y seguridad en `perfiles_y_dashboards.md`.