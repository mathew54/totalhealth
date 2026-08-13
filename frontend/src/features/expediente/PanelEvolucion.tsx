import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { api, getApiError } from '../../lib/api'
import { useSessionStore } from '../../stores/sessionStore'
import type { Evolucion } from './types'

const inputCls =
  'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none'

const SIGNOS: { clave: string; etiqueta: string; unidad: string }[] = [
  { clave: 'peso_kg', etiqueta: 'Peso', unidad: 'kg' },
  { clave: 'talla_cm', etiqueta: 'Talla', unidad: 'cm' },
  { clave: 'presion_sistolica', etiqueta: 'PA Sistólica', unidad: 'mmHg' },
  { clave: 'presion_diastolica', etiqueta: 'PA Diastólica', unidad: 'mmHg' },
  { clave: 'frecuencia_cardiaca', etiqueta: 'FC', unidad: 'lpm' },
  { clave: 'frecuencia_respiratoria', etiqueta: 'FR', unidad: 'rpm' },
  { clave: 'temperatura', etiqueta: 'Temperatura', unidad: '°C' },
  { clave: 'saturacion_oxigeno', etiqueta: 'SpO₂', unidad: '%' },
  { clave: 'glicemia', etiqueta: 'Glicemia', unidad: 'mg/dL' },
]

interface Props {
  pacienteId: string
}

/** Histórico de evolución: notas SOAP + signos vitales + gráfico temporal. */
export default function PanelEvolucion({ pacienteId }: Props) {
  const queryClient = useQueryClient()
  const profile = useSessionStore((s) => s.profile)
  const [subjetivo, setSubjetivo] = useState('')
  const [objetivo, setObjetivo] = useState('')
  const [evaluacion, setEvaluacion] = useState('')
  const [plan, setPlan] = useState('')
  const [especialidadId, setEspecialidadId] = useState(
    () => profile?.especialidad_activa ?? profile?.especialidades?.[0] ?? 'medicina_general',
  )
  const [signos, setSignos] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [seleccionada, setSeleccionada] = useState<Evolucion | null>(null)

  const { data: evoluciones = [], isLoading } = useQuery<Evolucion[]>({
    queryKey: ['expediente', 'evoluciones', pacienteId],
    queryFn: async () => (await api.get(`/expediente/evoluciones?paciente_id=${pacienteId}`)).data,
  })

  const { data: catalogo } = useQuery<{ especialidades: { id: string; nombre: string }[] }>({
    queryKey: ['historial', 'especialidades'],
    queryFn: async () => (await api.get('/historial/especialidades')).data,
  })

  const guardar = useMutation({
    mutationFn: async () => {
      const signosVitales: Record<string, string | null> = {}
      for (const s of SIGNOS) signosVitales[s.clave] = signos[s.clave] || null
      await api.post('/expediente/evoluciones', {
        paciente_id: pacienteId,
        especialidad_id: especialidadId,
        subjetivo,
        objetivo,
        evaluacion,
        plan,
        signos_vitales: signosVitales,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expediente', 'evoluciones', pacienteId] })
      setSubjetivo(''); setObjetivo(''); setEvaluacion(''); setPlan(''); setSignos({})
      setError(null)
    },
    onError: (e) => setError(getApiError(e)),
  })

  // Serie temporal para el gráfico: fecha + métricas numéricas.
  const datosGrafico = [...evoluciones]
    .reverse()
    .map((ev) => {
      const fecha = new Date(ev.created_at).toLocaleDateString('es-VE', { day: '2-digit', month: 'short' })
      const fila: Record<string, string | number> = { fecha }
      for (const s of SIGNOS) {
        const v = ev.signos_vitales?.[s.clave]
        if (typeof v === 'number') fila[s.clave] = v
      }
      return fila
    })

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-slate-800">Nueva evolución (SOAP)</h3>
          <select value={especialidadId} onChange={(e) => setEspecialidadId(e.target.value)} className={inputCls + ' !w-auto'}>
            {(catalogo?.especialidades ?? []).map((esp) => (
              <option key={esp.id} value={esp.id}>{esp.nombre}</option>
            ))}
          </select>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <label className="block text-xs font-medium text-slate-700">
            S — Subjetivo
            <textarea value={subjetivo} onChange={(e) => setSubjetivo(e.target.value)} rows={3} className={`${inputCls} mt-1`} placeholder="Síntomas referidos por el paciente" />
          </label>
          <label className="block text-xs font-medium text-slate-700">
            O — Objetivo
            <textarea value={objetivo} onChange={(e) => setObjetivo(e.target.value)} rows={3} className={`${inputCls} mt-1`} placeholder="Hallazgos del examen físico" />
          </label>
          <label className="block text-xs font-medium text-slate-700">
            A — Evaluación
            <textarea value={evaluacion} onChange={(e) => setEvaluacion(e.target.value)} rows={2} className={`${inputCls} mt-1`} placeholder="Diagnóstico / impresión" />
          </label>
          <label className="block text-xs font-medium text-slate-700">
            P — Plan
            <textarea value={plan} onChange={(e) => setPlan(e.target.value)} rows={2} className={`${inputCls} mt-1`} placeholder="Tratamiento, estudios, seguimiento" />
          </label>
        </div>

        <div className="mt-3">
          <p className="mb-1 text-xs font-semibold text-slate-700">Signos vitales</p>
          <div className="grid grid-cols-3 gap-2 md:grid-cols-5">
            {SIGNOS.map((s) => (
              <label key={s.clave} className="block">
                <span className="text-[10px] text-slate-500">{s.etiqueta} ({s.unidad})</span>
                <input
                  type="number"
                  value={signos[s.clave] ?? ''}
                  onChange={(e) => setSignos((v) => ({ ...v, [s.clave]: e.target.value }))}
                  className={inputCls}
                />
              </label>
            ))}
          </div>
        </div>

        {error && <p className="mt-2 text-xs text-red-500">{error}</p>}
        <button
          type="button"
          onClick={() => guardar.mutate()}
          disabled={guardar.isPending}
          className="mt-3 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
        >
          {guardar.isPending ? 'Guardando…' : 'Guardar evolución'}
        </button>
      </div>

      {evoluciones.filter((e) => e.subjetivo || e.plan || e.evaluacion || e.objetivo).length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <h3 className="mb-3 text-sm font-semibold text-slate-800">Gráfico de evolución temporal</h3>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={datosGrafico} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="fecha" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {['peso_kg', 'presion_sistolica', 'presion_diastolica', 'frecuencia_cardiaca', 'temperatura', 'glicemia', 'saturacion_oxigeno'].map((k) => (
                  <Line key={k} type="monotone" dataKey={k} stroke={`hsl(${Math.random() * 360},70%,50%)`} dot={{ r: 3 }} connectNulls />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-slate-800">Histórico de evoluciones</h3>
        {isLoading && <p className="py-4 text-center text-sm text-slate-500">Cargando…</p>}
        {evoluciones.length === 0 && !isLoading && (
          <p className="rounded-2xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-400">
            Sin evoluciones registradas para este paciente.
          </p>
        )}
        {evoluciones.map((ev) => (
          <button
            key={ev.id}
            type="button"
            onClick={() => setSeleccionada(ev)}
            className="w-full rounded-2xl border border-slate-200 bg-white p-3 text-left text-sm transition hover:border-brand-400 hover:bg-brand-50/40"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-slate-800">
                  {ev.especialidad_nombre ?? catalogo?.especialidades.find((e) => e.id === ev.especialidad_id)?.nombre ?? 'General'}
                </span>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">
                  {ev.medico_nombre ?? 'Médico'}
                </span>
              </div>
              <span className="text-xs text-slate-400">
                {new Date(ev.created_at).toLocaleString('es-VE')} · Ver detalle →
              </span>
            </div>
            {(ev.subjetivo || ev.objetivo || ev.evaluacion || ev.plan) && (
              <dl className="mt-2 grid gap-1 md:grid-cols-2">
                {ev.subjetivo && <dt className="text-[10px] uppercase text-slate-400">S</dt>}
                {ev.subjetivo && <dd className="text-xs text-slate-700">{ev.subjetivo}</dd>}
                {ev.objetivo && <dt className="text-[10px] uppercase text-slate-400">O</dt>}
                {ev.objetivo && <dd className="text-xs text-slate-700">{ev.objetivo}</dd>}
                {ev.evaluacion && <dt className="text-[10px] uppercase text-slate-400">A</dt>}
                {ev.evaluacion && <dd className="text-xs text-slate-700">{ev.evaluacion}</dd>}
                {ev.plan && <dt className="text-[10px] uppercase text-slate-400">P</dt>}
                {ev.plan && <dd className="text-xs text-slate-700">{ev.plan}</dd>}
              </dl>
            )}
            {Object.keys(ev.signos_vitales ?? {}).length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {SIGNOS.filter((s) => typeof ev.signos_vitales?.[s.clave] === 'number').map((s) => (
                  <span key={s.clave} className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">
                    {s.etiqueta}: {ev.signos_vitales?.[s.clave]} {s.unidad}
                  </span>
                ))}
              </div>
            )}
          </button>
        ))}
      </div>

      {seleccionada && <ModalEvolucion evolucion={seleccionada} onClose={() => setSeleccionada(null)} />}
    </div>
  )
}

/** Modal con el detalle completo de una evolución registrada (SOAP + signos + datos de especialidad). */
function ModalEvolucion({ evolucion: ev, onClose }: { evolucion: Evolucion; onClose: () => void }) {
  const signosRegistrados = SIGNOS.filter((s) => typeof ev.signos_vitales?.[s.clave] === 'number')
  const datosEspecialidad = Object.entries(ev.especialidad_data ?? {}).filter(
    ([, v]) => v !== undefined && v !== null && v !== '',
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-slate-800">Detalle de evolución</h3>
            <p className="mt-0.5 text-xs text-slate-500">
              {ev.especialidad_nombre ?? 'General'} · {ev.medico_nombre ?? 'Médico'} ·{' '}
              {new Date(ev.created_at).toLocaleString('es-VE')}
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-xl leading-none text-slate-400 hover:text-slate-600">
            ×
          </button>
        </div>

        <div className="mt-4 space-y-3">
          <div>
            <h4 className="text-[11px] font-bold uppercase tracking-wide text-brand-600">Nota SOAP</h4>
            {!ev.subjetivo && !ev.objetivo && !ev.evaluacion && !ev.plan && (
              <p className="mt-1 text-sm text-slate-400">Sin contenido SOAP registrado.</p>
            )}
            {ev.subjetivo && (
              <div className="mt-1">
                <span className="text-[10px] font-semibold uppercase text-slate-400">S — Subjetivo</span>
                <p className="whitespace-pre-wrap text-sm text-slate-700">{ev.subjetivo}</p>
              </div>
            )}
            {ev.objetivo && (
              <div className="mt-1">
                <span className="text-[10px] font-semibold uppercase text-slate-400">O — Objetivo</span>
                <p className="whitespace-pre-wrap text-sm text-slate-700">{ev.objetivo}</p>
              </div>
            )}
            {ev.evaluacion && (
              <div className="mt-1">
                <span className="text-[10px] font-semibold uppercase text-slate-400">A — Evaluación</span>
                <p className="whitespace-pre-wrap text-sm text-slate-700">{ev.evaluacion}</p>
              </div>
            )}
            {ev.plan && (
              <div className="mt-1">
                <span className="text-[10px] font-semibold uppercase text-slate-400">P — Plan</span>
                <p className="whitespace-pre-wrap text-sm text-slate-700">{ev.plan}</p>
              </div>
            )}
          </div>

          {signosRegistrados.length > 0 && (
            <div>
              <h4 className="text-[11px] font-bold uppercase tracking-wide text-brand-600">Signos vitales</h4>
              <div className="mt-1 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {signosRegistrados.map((s) => (
                  <div key={s.clave} className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5">
                    <span className="text-[10px] uppercase text-slate-400">{s.etiqueta}</span>
                    <p className="text-sm font-semibold text-slate-800">
                      {ev.signos_vitales?.[s.clave]} <span className="font-normal text-slate-500">{s.unidad}</span>
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {datosEspecialidad.length > 0 && (
            <div>
              <h4 className="text-[11px] font-bold uppercase tracking-wide text-brand-600">Datos de especialidad</h4>
              <div className="mt-1 grid gap-1.5 md:grid-cols-2">
                {datosEspecialidad.map(([clave, valor]) => (
                  <div key={clave} className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5">
                    <span className="text-[10px] uppercase text-slate-400">{clave.replace(/_/g, ' ')}</span>
                    <p className="text-sm text-slate-700">{typeof valor === 'object' ? JSON.stringify(valor) : String(valor)}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  )
}