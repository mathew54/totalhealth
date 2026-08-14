# Propuestas de mejora UX — Dashboards por perfil

Documento de benchmarking y propuesta: se comparan los dashboards actuales de
TotalHealth (Médico, Laboratorio/Bioanalista, Secretaría, Admin) con los patrones
de diseño documentados en la industria para apps médicas y sistemas de
información de laboratorio (LIS/LIMS). El objetivo es mejorar la experiencia del
usuario según su perfil.

Índice:

1. [Metodología y fuentes](#1-metodología-y-fuentes)
2. [Principios de diseño recopilados de la industria](#2-principios-de-diseño-recopilados-de-la-industria)
3. [Análisis comparativo por perfil](#3-análisis-comparativo-por-perfil)
4. [Propuestas de mejora por perfil](#4-propuestas-de-mejora-por-perfil)
5. [Roadmap priorizado](#5-roadmap-priorizado)

---

## 1. Metodología y fuentes

Se investigó documentación actual (2025–2026) sobre diseño de dashboards
clínicos, EHR/EMR y sistemas de laboratorio (LIS). Fuentes principales:

- **Aufait UX — *Healthcare Dashboard UI/UX Design: Best Practices 2026***.
  Estudio de usabilidad (Impact Research, 218 usuarios clínicos) sobre los
  atributos que más valoran los clínicos.
- **Fuselab Creative — *Healthcare Dashboard Design Best Practices***.
  Patrones de EHR reales (Health Monitor, ClyHealth, DHCS): velocidad de
  lectura, capas por prioridad, color como señal, vistas por rol.
- **LIMS IQ — *Clinical Lab KPIs and the Lab Analytics Dashboard***.
  Dashboards operativos de laboratorio por rol (técnico, supervisor, director,
  CFO) y KPIs (TAT, QC, backlog, alertas críticas).

Se contrastó contra el código real del repositorio:

- `frontend/src/features/dashboard/{Medico,Secretaria,Laboratorio,Admin}Dashboard.tsx`
- `frontend/src/features/dashboard/StatCard.tsx` y `widgets/registry.ts`
- Rutas/endpoints disponibles en `backend/src/modules/*`

---

## 2. Principios de diseño recopilados de la industria

Atributos que los usuarios clínicos priorizan (según el estudio citado):

1. Navegación fácil e intuitiva.
2. Acceso a datos históricos del paciente.
3. Diseño simple, sin desorden.
4. Alta usabilidad general.
5. Descripciones claras y concisas.
6. Presentación de datos consistente y fiable.
7. Variedad de tipos de gráfico para mejor insight.
8. Cumplimiento de accesibilidad (WCAG/ADA).
9. Compatibilidad móvil.
10. Analítica predictiva.

Patrones estructurales recurrentes en dashboards de salud bien diseñados:

- **Datos críticos a velocidad de lectura (scan-speed).** Lo más importante se
  lee sin clics; el detalle queda a una acción (progressive disclosure /
  arquitectura en capas).
- **Capas por prioridad, no por categoría.** Primero los indicadores críticos,
  luego el detalle clínico, y más profundo el historial completo.
- **Color como señal, no decoración.** Un solo color de alerta con significado
  consistente (rojo = anormal/crítico). Paleta contenida y contraste accesible.
- **Vistas por rol.** Mismo dataset, filtros y agregaciones distintos por rol
  (técnico vs. supervisor vs. director).
- **Antifatiga de alarmas.** Jerarquía estricta de interrupción: solo lo que
  cambia la decisión en el próximo minuto interrumpe con fuerza.
- **Estados vacíos, de carga y de error explícitos.** Una celda en blanco no
  debe leerse como un valor normal.
- **Densidad que respeta al lector.** El clínico quiere señal en el ruido, no
  menos datos; pero con jerarquía visual.
- **KPIs ligados a una decisión** por perfil, con baseline y umbrales de alerta.
- **Frescura de datos visible.** En un dashboard clínico, dato obsoleto es peor
  que no tenerlo.

---

## 3. Análisis comparativo por perfil

### 3.1 Médico — `MedicoDashboard.tsx`

**Estado actual**

- Cabecera con selector de vista `activa` / `consolidada` y selector de
  especialidad (en `StaffLayout`).
- Dos tarjetas: `AgendaDelDia` (5 consultas) y `BandejaInterconsultas`
  (pendientes con badge).
- Grilla de widgets por categoría de especialidad (montaje dinámico vía
  `WIDGETS_POR_CATEGORIA`), muchos con `Proximamente`.

**Frente a las mejores prácticas**

| Aspecto | Estado actual | Brecha |
| --- | --- | --- |
| Datos críticos a velocidad de lectura | Sin panel de alertas/pendientes críticos del paciente | Falta capa de señal crítica |
| Acceso a historial | Existe vía widgets por paciente (PacientePicker/Tendencias) | No se promueve desde el dashboard |
| Capas por prioridad | Solo dos capas planas (agenda + widgets) | No hay jerarquía crítica → detalle |
| Color como señal | `StatCard` con tonos, pero sin semántica unificada de alerta | Falta lenguaje de color consistente |
| Carga cognitiva | Muchos widgets apilados; grid de 3 columnas denso | Riesgo de saturación en vista consolidada |
| Estados vacíos/carga | Sí hay "Sin consultas", pero widgets con placeholder "Próximamente" | Placeholders restan confianza |

### 3.2 Laboratorio / Bioanalista — `LaboratorioDashboard.tsx`

**Estado actual**

- 4 StatCards: pendientes, en proceso, alertas críticas, domicilios.
- Banner de alertas críticas cuando `criticas > 0`.
- Etiqueta QR + "Próximas solicitudes en cola" (6 items).
- Accesos rápidos (4 tarjetas Link).

**Frente a las mejores prácticas**

| Aspecto | Estado actual | Brecha |
| --- | --- | --- |
| KPIs operativos | Pendientes / en proceso / alertas / domicilios | Sin **TAT** (turn-around time), sin **backlog por antigüedad**, sin **QC** |
| Vistas por rol | Un único dashboard para todos | No distingue técnico vs. supervisor/director |
| Alertas críticas | Banner + contador | Sin jerarquía ni hora de notificación ni tiempo de respuesta |
| Datos críticos | Las alertas están abajo en el flujo | Deberían ser lo primero y lo más visible |
| Antifatiga | Cuenta total de alertas | Falta filtrar por severidad/crítica |
| Antigüedad/backlog | Lista plana de 6 solicitudes | Sin orden por tiempo de espera ni prioridad (stat) |

### 3.3 Secretaría — `SecretariaDashboard.tsx`

**Estado actual**

- Saludo + 3 StatCards (cola, domicilios, recordatorios).
- 3 tarjetas de accesos rápidos.
- No muestra citas del día ni caja del día, aunque son tareas centrales.

**Frente a las mejores prácticas**

| Aspecto | Estado actual | Brecha |
| --- | --- | --- |
| Tareas operativas del día | Solo 3 accesos rápidos | Sin citas/turnos del día, sin resumen de caja |
| Datos de decisión rápida | Cuenta de cola | Falta "próximo turno", lista de hoy, pagos del día |
| Jerarquía | Todo igual de plano | Falta lo que exige acción ahora |
| Anticipación | — | Sin proyección de turnos ni recordatorios accionables |

### 3.4 Admin — `AdminDashboard.tsx`

**Estado actual**

- 4 StatCards de personal (activos, médicos, laboratorio, secretaría).
- 3 StatCards financieras (ingresos, movimientos, tasa).
- 4 accesos rápidos.

**Frente a las mejores prácticas**

| Aspecto | Estado actual | Brecha |
| --- | --- | --- |
| Dashboard operativo vs. financiero | Mezcla personal + finanzas | Sin tendencia/evolución (solo valores actuales) |
| Datos históricos/trends | Ninguno | Falta comparativa por período |
| Vistas por rol | Uno solo | No separa ejecutivo vs. operativo |
| Alertas institucionales | — | Sin excepciones (denials, backlog, inactividad) |

---

## 4. Propuestas de mejora por perfil

### 4.1 Médico

1. **Capa de señal crítica en la parte superior.** Reutilizar el flujo de
   `GET /alertas?solo_no_leidas=true` y de resultados críticos: un panel
   compacto "Pendientes de revisión" (valores críticos, interconsultas, ordenes
   por atender) antes de la grilla. Solo lo accionable, con jerarquía de
   interrupción (evitar fatiga).
2. **Progressive disclosure del historial.** Sustituir "Próximamente" por
   acceso directo al expediente del paciente (`/expediente`) desde los widgets
   por paciente, con un botón "Ver expediente completo". Promover `TendenciasParametros`
   como acceso de primer nivel al historial del paciente activo.
3. **Reducir carga cognitiva en vista consolidada.** Colapsar por defecto las
   categorías secundarias y expandir solo la especialidad activa (acordeón /
   tabs), en vez de un grid de 3 columnas con todos los widgets a la vez.
4. **Lenguaje de color unificado.** Definir que rojo = crítico/anormal en todo
   el dashboard (y la app); usar gris/neutro para el resto. Reforzar en `StatCard`
   y en widgets clínicos (p. ej. resultados fuera de rango en rojo).
5. **Estados explícitos.** Reemplazar placeholders "Próximamente" por estados
   vacíos claros ("Herramienta no disponible") para no restar confianza.
6. **Frescura de datos visible.** Mostrar "actualizado hace X min" en agenda y
   alertas.

### 4.2 Laboratorio / Bioanalista

1. **KPIs operativos de laboratorio** (dato ya disponible en parte vía
   `solicitudes`): añadir
   - **TAT (turn-around time)**: tiempo desde recepción a resultado, desglosado
     por examen/prioridad (stat vs. rutina) y etapa (preanalítica → proceso →
     reporte).
   - **Backlog por antigüedad**: solicitudes pendientes/en proceso agrupadas por
     rango de edad (hoy, +1 día, +2 días) para detectar cuellos de botella.
   - **Domicilios/Tomas**: además del conteo, listar rutas pendientes.
2. **Jerarquía de alertas críticas arriba y filtrada por severidad.** Mover las
   alertas al tope; distinguir "crítico" (rojo) de "fuera de rango" (ámbar);
   mostrar tiempo transcurrido desde la detección y botón directo a la bandeja
   `/alertas`.
3. **Vistas por rol del laboratorio.** Separar:
   - Vista **técnico/bioanalista**: cola pre-analítica, en proceso, carga de
     resultados, alertas por analizar.
   - Vista **supervisor/director**: TAT, QC, backlog, volumen por examen,
     domicilios y productividad.
   Reutilizar `profile.role`/roles para decidir la vista por defecto.
4. **Cola priorizada por tiempo de espera.** Ordenar las solicitudes por hora de
   creación ascendente y marcar las que superan un umbral TAT (badge "stat",
   badge "retraso").
5. **Acceso directo al paciente desde la cola.** Cada solicitud enlaza a
   `/expediente` y a la ficha para agilizar contexto preanalítico.

### 4.3 Secretaría

1. **Resumen operativo del día centrado en tareas reales.** Añadir, además de
   cola:
   - **Citas/turnos del día**: listado del día con hora y estado (pendiente,
     llamado, atendido), con el próximo turno destacado.
   - **Caja del día**: total cobrado hoy (`GET /pagos` o reportería) y
     movimientos recientes.
2. **Lista de recordatorios accionables.** En vez de solo el contador, mostrar
   los 3–5 próximos recordatorios pendientes con acción ("Enviar ahora") hacia
   `/notificaciones`.
3. **Jerarquía de acción.** Priorizar visualmente lo que exige acción ahora
   (próximo paciente, pago pendiente, recordatorio vencido) sobre el conteo
   genérico.
4. **Accesos rápidos contextuales.** Sustituir tarjetas estáticas por accesos
   que dependan de la hora/contexto (p. ej. "Atender próximo turno" → `/turnos`).

### 4.4 Admin

1. **Separar vista ejecutiva (financiera) y vista operativa (personal).**
   - Vista financiera: ingresos, movimientos y **tasa** con **tendencia por
     período** (días/semana), no solo el valor del día.
   - Vista operativa: personal activo por rol, con indicador de inactividad y
     accesos a gestión.
2. **Añadir comparativa histórica.** Usar reportería para mostrar evolución
   (ingresos/movimientos por día) en lugar de un solo valor puntual.
3. **Excepciones institucionales.** Panel de "requiere atención": staff
   inactivo, parámetros de referencia sin revisar, alertas de seguridad/MFA,
   reembolsos recientes (ya trazables por el modelo `estado = reembolsado`).
4. **Vistas por rol dentro de admin.** `super_root` ve todas las clínicas; el
   admin de clínica solo la propia. Respetar el aislamiento por `clinica_id` ya
   existente en el backend.

---

## 5. Roadmap priorizado

Priorización por impacto percibido vs. esfuerzo, aprovechando datos y endpoints
que ya existen.

**Fase 1 — Señal y jerarquía (impacto alto, esfuerzo bajo)**
- Panel de señal crítica en Médico (reusa `/alertas`).
- Mover alertas al tope y filtrar por severidad en Laboratorio.
- Estados vacíos/loading/error consistentes (eliminar "Próximamente" como
  placeholder de confianza).
- Lenguaje de color unificado (rojo = crítico) en `StatCard` y widgets.

**Fase 2 — KPIs operativos (impacto alto, esfuerzo medio)**
- TAT y backlog por antigüedad en Laboratorio (agrupar `solicitudes` con
  `procesado_at`/`created_at`).
- Caja del día + citas del día en Secretaría.
- Tendencia financiera y de personal en Admin (reusa `/admin/reporteria`).

**Fase 3 — Vistas por rol (impacto medio, esfuerzo medio-alto)**
- Separar vistas de laboratorio (técnico vs. supervisor/director).
- Separar vista ejecutiva vs. operativa en Admin.
- Promover acceso al expediente/historial desde widgets del médico.

**Fase 4 — Anticipación y accesibilidad (impacto medio, esfuerzo alto)**
- Analítica predictiva simple (p. ej. estimación de TAT, proyección de turnos).
- Revisión WCAG AA de contraste, navegación por teclado y lectores de pantalla.
- Compatibilidad móvil real de los dashboards (hoy orientados a escritorio).

---

### Decisiones abiertas para el equipo

1. ¿Se mantiene el placeholder "Próximamente" o se oculta hasta implementar el
   widget (recomendado para reducir ruido)?
2. ¿El laboratorio requiere vista por rol ya, o basta con un toggle manual
   (como el de vista activa/consolidada del médico)?
3. ¿Se validan las propuestas con usuarios reales (una entrevista por perfil)
   antes de construir, siguiendo la recomendación de la industria de diseñar
   contra datos reales y flujos reales?
