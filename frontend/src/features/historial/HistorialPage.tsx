import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { api } from '../../lib/api'
import { useSessionStore } from '../../stores/sessionStore'
import { useConfigStore } from '../../lib/configStore'
import { TIPO_LABEL, contenidoTexto } from '../../lib/historial'
import { descargarExpedientePdf, type DatosExpedientePdf } from '../../lib/expedientePdf'
import ResumenAnamnesis from './ResumenAnamnesis'
import type { Paciente } from '../../lib/types'
import type { Cuestionario, Definicion } from '../cuestionario/CuestionarioModal'

interface Correccion {
  id: string
  tipo: 'fe_errata' | 'adenda'
  contenido: Record<string, unknown>
  medico_nombre: string | null
  firma: string
  created_at: string
}

interface Registro {
  id: string
  tipo: string
  titulo: string
  contenido: Record<string, unknown>
  categoria_origen_nombre: string | null
  medico_id: string
  medico_nombre: string | null
  firma: string
  correcciones: Correccion[]
  created_at: string
}

interface AlertaCritica {
  id: string
  tipo: string
  descripcion: string
  severidad: 'alta' | 'media'
  activa: boolean
  created_at: string
}

interface Interconsulta {
  id: string
  estado: 'enviada' | 'aceptada' | 'completada' | 'cancelada'
  motivo: string
  hipotesis: string | null
  respuesta: string | null
  medico_origen_nombre: string | null
  medico_destino_nombre: string | null
  medico_responde_nombre: string | null
  categoria_destino_nombre: string | null
  especialidad_destino_nombre: string | null
  created_at: string
}

interface LineaResultado {
  id: string
  examen: string
  precio: number
  resultado: {
    id: string
    valores: Record<string, unknown> | null
    observaciones: string | null
    procesado_at: string | null
  } | null
}

interface ResultadoLaboratorio {
  id: string
  fecha: string
  estado: string
  cobrado: boolean
  lineas: LineaResultado[]
}

interface Evolucion {
  id: string
  subjetivo: string
  objetivo: string
  evaluacion: string
  plan: string
  signos_vitales: Record<string, number | null>
  especialidad_nombre?: string | null
  created_at: string
}

interface Expediente {
  paciente: Paciente
  alertas_criticas: AlertaCritica[]
  historial: Registro[]
  interconsultas: Interconsulta[]
  resultados_laboratorio: ResultadoLaboratorio[]
}

const ESTADO_RESULTADO_STYLE: Record<string, string> = {
  pendiente: 'bg-blue-100 text-blue-700',
  en_proceso: 'bg-amber-100 text-amber-700',
  listo: 'bg-green-100 text-green-700',
  entregado: 'bg-slate-200 text-slate-600',
}

const ESTADO_IC_STYLE: Record<string, string> = {
  enviada: 'bg-blue-100 text-blue-700',
  aceptada: 'bg-amber-100 text-amber-700',
  completada: 'bg-green-100 text-green-700',
  cancelada: 'bg-slate-200 text-slate-600',
}

/**
 * Historial Médico Digital — visor de lectura/impresión del expediente completo
 * del paciente. Todos los datos se muestran en modo lectura (el alta y la
 * gestión se hacen en el módulo Expediente); aquí se lee, se imprime y se
 * descarga en PDF: anamnesis, alertas, historial, evoluciones, interconsultas
 * y resultados de laboratorio.
 */
export default function HistorialPage() {
  const profile = useSessionStore((s) => s.profile)
  const role = profile?.role ?? 'secretaria'
  const puedeVerExpediente = ['medico', 'admin', 'super_root', 'secretaria'].includes(role)

  const [q, setQ] = useState('')
  const [pacienteId, setPacienteId] = useState<string | null>(null)

  const { data: pacientes = [] } = useQuery<Paciente[]>({
    queryKey: ['pacientes', 'historial', q],
    queryFn: async () => (await api.get('/pacientes', { params: { q } })).data,
    enabled: puedeVerExpediente,
  })

  return (
    <div className="space-y-5">
      <header className="print:hidden">
        <h1 className="text-xl font-bold text-slate-800">Historial Médico Digital</h1>
        <p className="text-sm text-slate-500">
          Lectura, impresión y descarga del expediente completo del paciente (anamnesis, historial,
          laboratorio y resultados). La gestión clínica se realiza en el módulo Expediente.
        </p>
      </header>

      <div className="print:hidden rounded-2xl border border-slate-200 bg-white p-4">
        <label className="mb-1 block text-sm font-medium text-slate-700">Buscar paciente por cédula o nombre</label>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="V-12345678 o nombre…"
          className="w-full max-w-md rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
        />
        <div className="mt-2 max-h-48 overflow-y-auto rounded-lg border border-slate-200">
          {pacientes.length === 0 && <p className="px-3 py-2 text-xs text-slate-400">Escribe para buscar…</p>}
          {pacientes.map((p) => (
            <button
              key={p.id}
              onClick={() => setPacienteId(p.id)}
              className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-slate-50 ${pacienteId === p.id ? 'bg-brand-50' : ''}`}
            >
              <span className="font-medium text-slate-800">{p.nombre_completo}</span>
              <span className="text-xs text-slate-400">{p.cedula ?? 'Menor de edad'}</span>
            </button>
          ))}
        </div>
      </div>

      {pacienteId ? (
        <ExpedienteVista key={pacienteId} pacienteId={pacienteId} />
      ) : (
        <p className="print:hidden rounded-2xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-400">
          Selecciona un paciente para abrir su expediente digital.
        </p>
      )}
    </div>
  )
}

function ExpedienteVista({ pacienteId }: { pacienteId: string }) {
  const profile = useSessionStore((s) => s.profile)
  const role = profile?.role ?? 'secretaria'
  const esPersonalMedico = ['medico', 'admin', 'super_root'].includes(role)
  const branding = useConfigStore()
  const [descargando, setDescargando] = useState(false)

  const { data: expediente, isLoading } = useQuery<Expediente>({
    queryKey: ['historial', 'expediente', pacienteId],
    queryFn: async () => (await api.get(`/historial/pacientes/${pacienteId}`)).data,
    enabled: true,
  })

  const { data: evoluciones = [] } = useQuery<Evolucion[]>({
    queryKey: ['historial', 'evoluciones', pacienteId],
    queryFn: async () => (await api.get('/expediente/evoluciones', { params: { paciente_id: pacienteId } })).data,
    enabled: esPersonalMedico,
  })

  const { data: def } = useQuery<Definicion>({
    queryKey: ['cuestionarios', 'definicion'],
    queryFn: async () => (await api.get('/historial/cuestionarios/definicion')).data,
    staleTime: Infinity,
  })

  const { data: lista = [] } = useQuery<Cuestionario[]>({
    queryKey: ['cuestionarios', 'expediente', pacienteId],
    queryFn: async () => (await api.get(`/historial/pacientes/${pacienteId}/cuestionarios`)).data,
  })

  const resumen = computarResumen(def, lista)

  async function descargar() {
    if (!expediente) return
    setDescargando(true)
    try {
      const datos: DatosExpedientePdf = {
        paciente: {
          nombre_completo: expediente.paciente.nombre_completo,
          cedula: expediente.paciente.cedula,
          telefono: expediente.paciente.telefono ?? null,
          fecha_nacimiento: expediente.paciente.fecha_nacimiento ?? null,
          sexo: expediente.paciente.sexo ?? null,
        },
        alertas: expediente.alertas_criticas ?? [],
        anamnesis: resumen.modulos,
        observaciones: resumen.observaciones,
        historial: esPersonalMedico ? (expediente.historial ?? []) : [],
        evoluciones: esPersonalMedico ? (evoluciones as DatosExpedientePdf['evoluciones']) : [],
        interconsultas: esPersonalMedico ? (expediente.interconsultas ?? []) : [],
        resultados: (expediente.resultados_laboratorio ?? []) as DatosExpedientePdf['resultados'],
        branding: {
          razon_social: branding.razon_social,
          rif: branding.rif,
          direccion: branding.direccion,
          telefono: branding.telefono,
          logo_url: branding.logo_url,
        },
      }
      await descargarExpedientePdf(datos)
    } finally {
      setDescargando(false)
    }
  }

  if (isLoading) return <p className="p-6 text-sm text-slate-500">Cargando expediente…</p>

  return (
    <div className="space-y-4">
      {/* Barra de acciones: imprimir / descargar PDF */}
      <div className="print:hidden flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-white p-4">
        <div>
          <p className="text-base font-bold text-slate-800">{expediente?.paciente?.nombre_completo ?? 'Paciente'}</p>
          <p className="text-sm text-slate-500">
            {expediente?.paciente?.cedula ?? 'Menor de edad'}
            {expediente?.paciente?.fecha_nacimiento ? ` · ${expediente.paciente.fecha_nacimiento}` : ''}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => window.print()}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            🖨 Imprimir
          </button>
          <button
            type="button"
            onClick={descargar}
            disabled={descargando || !expediente}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {descargando ? 'Generando PDF…' : '⬇ Descargar PDF'}
          </button>
        </div>
      </div>

      <AlertasReadOnly alertas={expediente?.alertas_criticas ?? []} />

      <ResumenAnamnesis pacienteId={pacienteId} />

      {esPersonalMedico && <HistorialReadOnly registros={expediente?.historial ?? []} />}

      {esPersonalMedico && <EvolucionesReadOnly evoluciones={evoluciones} />}

      {esPersonalMedico && <InterconsultasReadOnly interconsultas={expediente?.interconsultas ?? []} />}

      <ResultadosReadOnly resultados={expediente?.resultados_laboratorio ?? []} />
    </div>
  )
}

function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4">
      <h2 className="text-sm font-bold uppercase tracking-wide text-slate-700">{titulo}</h2>
      <div className="mt-3">{children}</div>
    </section>
  )
}

function AlertasReadOnly({ alertas }: { alertas: AlertaCritica[] }) {
  const activas = alertas.filter((a) => a.activa)
  if (activas.length === 0) return null
  return (
    <Seccion titulo="Alertas críticas del paciente">
      <ul className="space-y-1">
        {activas.map((a) => (
          <li key={a.id} className="flex items-start justify-between gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm">
            <span className="text-red-800">
              <span className="font-bold">{a.tipo.replace('_', ' ')}</span> — {a.descripcion}
            </span>
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${a.severidad === 'alta' ? 'bg-red-600 text-white' : 'bg-amber-400 text-amber-900'}`}>
              {a.severidad}
            </span>
          </li>
        ))}
      </ul>
    </Seccion>
  )
}

function HistorialReadOnly({ registros }: { registros: Registro[] }) {
  return (
    <Seccion titulo="Historial clínico compartido">
      {registros.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-400">
          El paciente no tiene registros en el historial compartido.
        </p>
      ) : (
        <div className="space-y-3">
          {registros.map((r) => (
            <div key={r.id} className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold capitalize text-slate-600">
                    {TIPO_LABEL[r.tipo] ?? r.tipo}
                  </span>
                  <h3 className="text-sm font-bold text-slate-800">{r.titulo}</h3>
                </div>
                <span className="text-xs text-slate-400">{new Date(r.created_at).toLocaleString('es-VE')}</span>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                {r.medico_nombre ?? 'Médico'}
                {r.categoria_origen_nombre ? ` · ${r.categoria_origen_nombre}` : ''}
              </p>
              <pre className="mt-2 whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-sm text-slate-700">{contenidoTexto(r.contenido)}</pre>
              <p className="mt-1 font-mono text-[10px] text-slate-300" title="Firma digital del registro">
                firma · {r.firma.slice(0, 12)}…
              </p>
              {r.correcciones.length > 0 && (
                <div className="mt-2 space-y-1">
                  {r.correcciones.map((c) => (
                    <div key={c.id} className="relative overflow-hidden rounded-lg border border-amber-300 bg-amber-50 p-2">
                      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                        <span className="rotate-[-18deg] text-2xl font-black uppercase tracking-widest text-amber-200/70">
                          {c.tipo === 'fe_errata' ? 'Fe de Erratas' : 'Adenda'}
                        </span>
                      </div>
                      <p className="relative text-xs font-semibold uppercase text-amber-700">{c.tipo.replace('_', ' ')}</p>
                      <p className="relative whitespace-pre-wrap text-xs text-slate-700">{contenidoTexto(c.contenido)}</p>
                      <p className="relative mt-1 text-[10px] text-slate-400">
                        {c.medico_nombre ?? 'Médico'} · {new Date(c.created_at).toLocaleString('es-VE')} · firma{' '}
                        {c.firma.slice(0, 10)}…
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </Seccion>
  )
}

function EvolucionesReadOnly({ evoluciones }: { evoluciones: Evolucion[] }) {
  return (
    <Seccion titulo="Evoluciones (SOAP)">
      {evoluciones.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-400">
          El paciente no tiene evoluciones registradas.
        </p>
      ) : (
        <div className="space-y-3">
          {evoluciones.map((ev) => (
            <div key={ev.id} className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs text-slate-400">{new Date(ev.created_at).toLocaleString('es-VE')}</span>
                {ev.especialidad_nombre && <span className="text-xs font-medium text-slate-500">{ev.especialidad_nombre}</span>}
              </div>
              {Object.keys(ev.signos_vitales ?? {}).length > 0 && (
                <p className="mt-2 text-xs text-slate-500">
                  <span className="font-semibold">Signos vitales:</span>{' '}
                  {Object.entries(ev.signos_vitales)
                    .filter(([, v]) => v !== null && v !== undefined)
                    .map(([k, v]) => `${k.replace(/_/g, ' ')}: ${String(v)}`)
                    .join(' · ') || '—'}
                </p>
              )}
              <dl className="mt-2 grid gap-2 sm:grid-cols-2">
                {(
                  [
                    ['Subjetivo', ev.subjetivo],
                    ['Objetivo', ev.objetivo],
                    ['Evaluación', ev.evaluacion],
                    ['Plan', ev.plan],
                  ] as const
                ).map(([label, texto]) =>
                  texto ? (
                    <div key={label} className="rounded-lg bg-slate-50 p-2">
                      <dt className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</dt>
                      <dd className="mt-0.5 whitespace-pre-wrap text-sm text-slate-700">{texto}</dd>
                    </div>
                  ) : null,
                )}
              </dl>
            </div>
          ))}
        </div>
      )}
    </Seccion>
  )
}

function InterconsultasReadOnly({ interconsultas }: { interconsultas: Interconsulta[] }) {
  return (
    <Seccion titulo="Interconsultas">
      {interconsultas.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-400">
          El paciente no tiene interconsultas registradas.
        </p>
      ) : (
        <div className="space-y-2">
          {interconsultas.map((i) => (
            <div key={i.id} className="rounded-xl border border-slate-200 bg-white p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-medium text-slate-800">{i.motivo}</span>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${ESTADO_IC_STYLE[i.estado] ?? 'bg-slate-200 text-slate-600'}`}>
                  {i.estado}
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                → {i.categoria_destino_nombre ?? i.especialidad_destino_nombre ?? 'Especialidad'} · de{' '}
                {i.medico_origen_nombre ?? 'Médico'}
                {i.medico_destino_nombre ? ` · para ${i.medico_destino_nombre}` : ''}
              </p>
              {i.hipotesis && <p className="mt-1 rounded bg-slate-50 p-2 text-xs text-slate-600">Hipótesis: {i.hipotesis}</p>}
              {i.respuesta && (
                <p className="mt-1 rounded bg-green-50 p-2 text-xs text-slate-700">
                  Respuesta: {i.respuesta} {i.medico_responde_nombre ? `— ${i.medico_responde_nombre}` : ''}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </Seccion>
  )
}

function ResultadosReadOnly({ resultados }: { resultados: ResultadoLaboratorio[] }) {
  return (
    <Seccion titulo="Laboratorio / Resultados">
      {resultados.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-400">
          El paciente no tiene exámenes de laboratorio registrados.
        </p>
      ) : (
        <div className="space-y-3">
          {resultados.map((s) => (
            <div key={s.id} className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-bold text-slate-800">Solicitud de exámenes</p>
                  <p className="text-xs text-slate-400">{new Date(s.fecha).toLocaleString('es-VE')}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${ESTADO_RESULTADO_STYLE[s.estado] ?? 'bg-slate-200 text-slate-600'}`}>
                    {s.estado.replace('_', ' ')}
                  </span>
                  {s.cobrado && <span className="text-xs text-green-600">pagada</span>}
                </div>
              </div>
              <div className="mt-3 space-y-2">
                {s.lineas.map((l) => (
                  <div key={l.id} className="rounded-lg border border-slate-100 p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-slate-800">{l.examen}</span>
                      {l.resultado && (
                        <span className="text-[10px] text-slate-400">
                          {l.resultado.procesado_at ? new Date(l.resultado.procesado_at).toLocaleString('es-VE') : ''}
                        </span>
                      )}
                    </div>
                    {l.resultado ? (
                      <p className="mt-1 text-sm text-slate-700">
                        Resultado: {l.resultado.valores ? JSON.stringify(l.resultado.valores) : '—'}
                        {l.resultado.observaciones && <span className="text-slate-500"> · {l.resultado.observaciones}</span>}
                      </p>
                    ) : (
                      <p className="mt-1 text-xs text-slate-400">Sin resultado.</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </Seccion>
  )
}

interface ResumenCalculado {
  modulos: { nombre: string; items: { etiqueta: string; detalle: string }[] }[]
  observaciones: string
}

/** Resumen de anamnesis (solo puntos marcados) a partir del cuestionario activo. */
function computarResumen(def: Definicion | undefined, lista: Cuestionario[]): ResumenCalculado {
  const vacio: ResumenCalculado = { modulos: [], observaciones: '' }
  if (!def) return vacio
  const activo = lista.find((c) => c.estado === 'consolidado') ?? lista.find((c) => c.estado === 'borrador')
  if (!activo) return vacio

  const porClave = new Map<string, { etiqueta: string; modulo: string }>()
  for (const m of def.modulos) {
    for (const item of m.items) porClave.set(item.clave, { etiqueta: item.etiqueta, modulo: m.nombre })
  }

  const modulos = def.modulos
    .map((m) => ({
      nombre: m.nombre,
      items: m.items
        .filter((item) => {
          const r = activo.respuestas?.[item.clave] as { marcado?: boolean; detalle?: string | null } | undefined
          return r?.marcado === true
        })
        .map((item) => {
          const r = activo.respuestas?.[item.clave] as { detalle?: string | null } | undefined
          return { etiqueta: item.etiqueta, detalle: r?.detalle ?? '' }
        }),
    }))
    .filter((m) => m.items.length > 0)

  return {
    modulos,
    observaciones: String(activo.respuestas?.observaciones ?? '').trim(),
  }
}