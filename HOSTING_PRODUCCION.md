# Hosting para producción — Investigación de precios (ago 2026)

> Contexto: TotalHealth = SPA (React/Vite) + API Node/Express + PostgreSQL.
> El punto crítico: **WhatsApp (Baileys) necesita un proceso siempre encendido y sesión persistente**.
> Evitar el Free de Render (duerme tras ~15 min y pierde `.wa-session` en cada redeploy).

## Opciones gratuitas ($0)

| Proveedor | Plan | Precio | Resumen |
|---|---|---|---|
| Netlify | Free | $0 | Front estático, 100GB de banda, SSL gratis. Límite de builds/mes. |
| Vercel | Hobby | $0 | Front estático, 100GB de banda + 1M edge requests/mes. |
| Render | Free (web) | $0 | Backend Node/Express. **Duerme tras ~15 min** (primeros ~50s de carga) y disco efímero (pierde sesión WhatsApp en redeploy). |
| Railway | Free Trial | $0 | $5 de créditos durante 30 días. Uso por consumo: mem $0.00000386/GB-s, egress $0.05/GB. |
| Neon | Free | $0 | PostgreSQL, 0.5GB, 100 CU-horas/mes, escala a cero en 5 min. |
| Supabase | Free | $0 | PostgreSQL + auth, 500MB, 50k MAU, pausa tras 1 semana inactivo. |
| Cloudflare Pages | Free | $0 | Front estático, banda ilimitada. |

## De $5 a $25

| Proveedor | Plan | Precio | Resumen |
|---|---|---|---|
| Railway | Hobby | $5/mes | Backend **siempre encendido** (no duerme), $5 de uso incluido + volumen persistente (útil para `.wa-session`). **Favorito para el backend.** |
| Heroku | Eco | $5/mes | Backend 0.5GB, **duerme tras 30 min**. 2 tipos de proceso. |
| Heroku Postgres | Essential-0 | $5/mes | BD Postgres 1GB, 20 conexiones, RAM compartida. |
| Heroku | Basic | $7/mes | Backend siempre encendido, 0.5GB, SSL. Sin filesystem persistente. |
| Netlify | Personal | $9/mes | Front, 1TB de banda, +1000 builds/mes. |
| Heroku Postgres | Essential-1 | $9/mes | BD 10GB, 20 conexiones. |
| Fly.io | pay-as-you-go | desde ~$2/mes | Backend por máquina: shared-cpu-1x ~$2-6/mes según RAM (+$5/GB extra/mes). Escala a cero posible. Requiere tarjeta. |
| Vercel | Pro | $20/mes | Front, 1TB de banda + 10M edge requests. |
| Netlify | Pro | $20/mes | Front, 1TB de banda, builds ilimitados. |
| Railway | Pro | $20/mes | $20 de uso incluido por workspace, prioridad. |
| Heroku Postgres | Essential-2 | $20/mes | BD 32GB, 40 conexiones. |
| Render | Pro | $25/mes + compute | Backend **siempre encendido**, sin dormir. Compute extra por uso (~$1.5+/mes por instancia small). |
| Heroku | Standard-1X | $25/mes | Backend 0.5GB siempre encendido, escalable. |
| Supabase | Pro | $25/mes | BD 8GB + backups diarios (7 días) + $10 créditos compute (cubre 1 instancia Micro). |
| Heroku Postgres | Standard-0 | $50/mes | BD dedicada 4GB RAM/64GB disco, 120 conexiones. |

## $100+ (solo si escalas mucho)

| Proveedor | Plan | Precio | Resumen |
|---|---|---|---|
| Fly.io | performance | $30-500+/mes | Máquinas dedicadas (1x performance desde $32/mes con 2GB). |
| Heroku | Standard-2X/Performance | $50-750/mes | Escalado vertical. |
| Neon | Scale | pay-as-you-go | $0.222/CU-hora, HIPAA/SOC2/SLA. Producción seria. |
| Render | Scale | $499/mes | Alto rendimiento, autoscaling. |
| Supabase | Team | $599/mes | Equipos grandes. |

## Recomendación

**Opción A — mínimo coste (~$5/mes):**
- **Front**: Netlify Free ($0) — ya desplegado.
- **Backend**: Railway Hobby ($5/mes) — siempre encendido + volumen para `.wa-session`.
- **BD**: Neon Free ($0) o Supabase Free ($0) si se mantiene el mock.

**Opción B — producción sólida (~$65-70/mes):**
- **Front**: Netlify Pro o Vercel Pro ($20/mes).
- **Backend**: Railway Pro ($20/mes) o Render Pro ($25/mes + compute).
- **BD**: Supabase Pro ($25/mes) — con auth, backups y compute incluido.

> Nota clave: sea cual sea la opción, **persistir la sesión de WhatsApp en la BD**
> (guardar `.wa-session` en una tabla de Supabase/Neon) para que un redeploy no la rompa.

## Tarifas de referencia (uso por consumo)

- **Railway**: memoria $0.00000386/GB-s, CPU $0.00000772/vCPU-s, volúmenes $0.00000006/GB-s, egress $0.05/GB.
- **Neon**: compute $0.106/CU-hora (Launch) o $0.222/CU-hora (Scale); almacenamiento $0.35/GB-mes; egress 500GB incluidos, luego $0.10/GB; ramas extra $1.50/branch-mes.
- **Fly.io**: egress a internet $0.02/GB (NA/EU), $0.04/GB (APAC/Sudamérica), $0.12/GB (África/India); volúmenes $0.15/GB-mes; IP dedicada $2/mes; certs Let's Encrypt gratis (primeras 10).