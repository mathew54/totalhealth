# Guía de despliegue (proyecto de prueba)

> Guardado el 2026-08-05 para realizar los despliegues (Netlify + backend).
> Pasos y variables verificadas con `npm run build` en verde y 39 tests del backend pasando.
>
> Desplegado 2026-08-07:
> - **Frontend (demo)**: https://totalhealth-demo.netlify.app
> - **Backend**: https://totalhealth-backend.onrender.com (health: `/api/health`)
> - **Repo**: https://github.com/mathew54/totalhealth
> - Render creado por API: `runtime=node`, rootDir vacío, `npm ci --include=dev && npm run build -w backend`, start `npm run start -w backend`, plan free.
>
> Redespliegue 2026-08-12 (commit `619b76e`): módulo de notificaciones con **envío real por
> WhatsApp** (teléfonos E.164). El backend de prueba quedó con `MESSAGING_PROVIDER=whatsapp`.

## Arquitectura

- **Frontend**: Vite + React → se despliega como estático en **Netlify**.
- **Backend**: Express (TypeScript) → **no corre en Netlify**, debe alojarse aparte
  (Render / Railway / Fly.io) con el modo mock activo (`USE_MOCK=true`).

## Estado actual de los cambios hechos

1. **CRUD del cuestionario movido al módulo de historial** (rutas en `backend/src/modules/historial/cuestionarios/`):

   | Ruta nueva |
   |---|---|
   | `GET /api/historial/cuestionarios/definicion` |
   | `GET /api/historial/pacientes/:id/cuestionarios?estado=` |
   | `POST /api/historial/pacientes/:id/cuestionarios` |
   | `GET /api/historial/cuestionarios/:id` |
   | `PATCH /api/historial/cuestionarios/:id/respuestas` |
   | `POST /api/historial/cuestionarios/:id/consolidar` |
   | `POST /api/historial/cuestionarios/:id/adendas` |
   | `DELETE /api/historial/cuestionarios/:id` |

   El antiguo `/api/cuestionarios` responde 404. El portal usa su propio
   `/api/portal/*`. Frontend actualizado: `CuestionarioModal`,
   `CuestionarioExpediente`, `ResumenAnamnesis`.

2. **Ajustes para despliegue ya aplicados**:
   - `frontend/src/lib/api.ts`: baseURL usa `VITE_API_URL` (fallback `/api` en dev).
   - Mocks: se muestran con `import.meta.env.DEV` **o** `VITE_SHOW_MOCKS=true`.
   - `frontend/netlify.toml`: build raíz, publish `frontend/dist`, redirect SPA `/* → /index.html`.

3. **Notificaciones con envío por WhatsApp** (commit `619b76e`, 2026-08-12):
   - `services/notifier.ts` + `modules/notificaciones`: cola de recordatorios, envío de
     pendientes, generación manual de recordatorios y **envío inmediato de resultados**.
   - Proveedor `MESSAGING_PROVIDER=whatsapp`: OTP y recordatorios salen por el dispositivo
     de la clínica (Baileys). Teléfonos normalizados a E.164 (`services/phoneNumber.ts`).
   - **Aislamiento de tests**: `backend/vitest.config.ts` + `backend/tests/setup.ts` fuerzan
     el proveedor `mock` en la suite aunque el `.env` local use `whatsapp` (80 tests en verde).

## Paso 1 — Backend (Render / Railway / Fly.io)

1. Subir/desplegar el workspace `backend/` (comando de arranque: `npm run start`
   tras `npm run build`, o `npm run dev` en servicios que hagan watch).
2. Variables de entorno del backend:

   | Variable | Valor recomendado |
   |---|---|
   | `NODE_ENV` | `production` |
   | `PORT` | `4000` (o el que asigne la plataforma) |
   | `USE_MOCK` | `true` (data ficticia para el usuario de prueba) |
   | `SUPABASE_URL` | *(vacía / omitida → fuerza modo mock)* |
   | `CORS_ORIGIN` | `https://TU-APP.netlify.app` (o `*` para pruebas) |
   | `PAYMENT_PROVIDER` | `mock` |
   | `MESSAGING_PROVIDER` | `whatsapp` (envío real de OTP/recordatorios por el dispositivo de la clínica; usa `mock` si no hay dispositivo vinculado) |
   | `WHATSAPP_SESSION_DIR` | `.wa-session` (directorio de credenciales Baileys del dispositivo vinculado) |
   | `WHATSAPP_PAIS_CODIGO` | `58` (código de país para normalizar teléfonos a E.164 sin `+`) |
   | `LOGIN_MAX_INTENTOS` | `5` (intentos fallidos antes de bloquear) |
   | `LOGIN_LOCK_MIN` | `15` (minutos de bloqueo al superar intentos) |
   | `FIELD_ENCRYPTION_KEY` | clave maestra AES-256-GCM para `telefono`/`firma_digital` (genera una fuerte; sin ella los campos van en claro) |

> ⚠️ **WhatsApp real en Render free:** el disco es efímero, así que `.wa-session`
> (la sesión Baileys) se pierde en cada redeploy/reinicio y hay que **re-vincular**
> el dispositivo en Administración → Configuración. Para persistirla haría falta un
> disco persistente (plan de pago) o guardar la sesión en Redis/DB.

3. Verificar: `GET https://TU-BACKEND/api/health` → `{ status: "ok", mock: true }`
   y `GET https://TU-BACKEND/api/mocks` responde con credenciales demo.
4. WhatsApp: con sesión de **admin**, `GET /api/admin/whatsapp` → `{estado}` y, si
   `MESSAGING_PROVIDER=whatsapp`, vincular el dispositivo vía `POST /api/admin/whatsapp/qr`
   (o `/pairing`) desde la app en Administración → Configuración.

## Paso 2 — Frontend (Netlify)

1. Conectar el repo a Netlify (o usar `netlify deploy` desde la raíz del repo).
2. Configuración (el `frontend/netlify.toml` ya define build/publish/redirects):

   - Build command: `npm ci && npm run build -w frontend`
   - Publish directory: `frontend/dist`

3. Variables de entorno del build en Netlify:

   | Variable | Valor |
   |---|---|
   | `VITE_API_URL` | `https://TU-BACKEND/api` (apunta al backend del Paso 1) |
   | `VITE_SHOW_MOCKS` | `true` (para que el usuario de prueba vea el explorador Mocks) |

4. Verificar tras el deploy:
   - `https://TU-APP.netlify.app` carga el login.
   - Login con credenciales demo (ver `/api/mocks` → `demoCedulas`, contraseña `demo1234`).
   - Rutas client-side (ej. `/historial`, `/mocks`) no dan 404 (redirect SPA).
   - El ítem "Mocks (dev)" aparece en el menú si `VITE_SHOW_MOCKS=true`.

## Credenciales demo (modo mock)

| Rol | Cédula |
|---|---|
| Super root | `V-11111111` |
| Admin | `V-11222333` |
| Médico | `V-99888777` |
| Laboratorio | `V-44556677` |
| Secretaría | `V-33445566` |

Contraseña única: `demo1234`

## Notas

- Los endpoints de mocks del backend son públicos (solo existen con `USE_MOCK=true`,
  es decir, dev o backend de prueba). En producción real apagar con `USE_MOCK=false` + `SUPABASE_URL`.
- El cron de tasas (`jobs/syncTasas.ts`) corre diario a las `30 6 * * * America/Caracas`.
- Commands útiles:
  - `npm run build` → compila backend (`backend/dist`) y frontend (`frontend/dist`).
  - `npm test -w backend` → 39 tests.
  - `npm run typecheck -w backend|frontend`.
