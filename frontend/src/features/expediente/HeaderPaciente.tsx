import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import type { Evolucion, PacienteExpediente, RespuestaItem, Respuestas } from './types'

const SIGNOS_ETIQUETA: Record<string, { etiqueta: string; unidad: string }> = {
  peso_kg: { etiqueta: 'Peso', unidad: 'kg' },
  talla_cm: { etiqueta: 'Talla', unidad: 'cm' },
  presion_sistolica: { etiqueta: 'PA sist.', unidad: 'mmHg' },
  presion_diastolica: { etiqueta: 'PA diast.', unidad: 'mmHg' },
  frecuencia_cardiaca: { etiqueta: 'FC', unidad: 'lpm' },
  frecuencia_respiratoria: { etiqueta: 'FR', unidad: 'rpm' },
  temperatura: { etiqueta: 'T°', unidad: '°C' },
  saturacion_oxigeno: { etiqueta: 'SpO₂', unidad: '%' },
  glicemia: { etiqueta: 'Glicemia', unidad: 'mg/dL' },
}

interface Cuestionario {
  id: string
  estado: string
  respuestas: Respuestas
}

/** Calcula edad desde la fecha de nacimiento (años, o años y meses en menores). */
function edadDesde(fecha: string | null | undefined): string {
  if (!fecha) return '—'
  const nac = new Date(fecha)
  const ahora = new Date()
  let anos = ahora.getFullYear() - nac.getFullYear()
  const m = ahora.getMonth() - nac.getMonth()
  if (m < 0 || (m === 0 && ahora.getDate() < nac.getDate())) anos--
  if (anos < 2) {
    const meses = Math.max(0, (ahora.getFullYear() - nac.getFullYear()) * 12 + (ahora.getMonth() - nac.getMonth()))
    return `${meses} mes(es)`
  }
  return `${anos} años`
}

interface Props {
  paciente: PacienteExpediente
}

/**
 * Header persistente del paciente (patrón Epic Patient Header + Storyboard):
 * identidad siempre visible + alerta de alergias + últimos signos vitales,
 * sin depender de la pestaña activa.
 */
export default function HeaderPaciente({ paciente }: Props) {
  const { data: lista = [] } = useQuery<Cuestionario[]>({
    queryKey: ['expediente', 'anamnesis', paciente.id],
    queryFn: async () => (await api.get(`/historial/pacientes/${paciente.id}/cuestionarios`)).data,
  })

  const { data: evoluciones = [] } = useQuery<Evolucion[]>({
    queryKey: ['expediente', 'evoluciones', paciente.id],
    queryFn: async () => (await api.get(`/expediente/evoluciones?paciente_id=${paciente.id}`)).data,
  })

  const actual = lista.find((c) => c.estado !== 'eliminado')
  const alergia = (actual?.respuestas?.alergias as RespuestaItem | undefined)?.marcado === true

  const ultimaEvo = evoluciones[0]
  const vitales = ultimaEvo
    ? Object.entries(ultimaEvo.signos_vitales ?? {})
        .filter(([, v]) => typeof v === 'number')
        .slice(0, 5)
    : []

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-bold text-slate-800">{paciente.nombre_completo}</h2>
            {paciente.es_menor && (
              <span className="rounded-full bg-brand-100 px-2 py-0.5 text-[11px] font-semibold text-brand-700">
                Menor · {paciente.parentesco_representante ?? 'representado'}
              </span>
            )}
            {alergia && (
              <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-bold text-red-700 ring-1 ring-red-300">
                ⚠ Alergias registradas
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-slate-500">
            {[paciente.cedula, edadDesde(paciente.fecha_nacimiento), paciente.sexo ?? 'Sexo no indicado']
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>

        {vitales.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Últimos signos vitales</span>
            {vitales.map(([clave, valor]) => {
              const meta = SIGNOS_ETIQUETA[clave] ?? { etiqueta: clave, unidad: '' }
              return (
                <span key={clave} className="rounded-lg bg-slate-100 px-2 py-1 text-[11px] font-medium text-slate-700">
                  {meta.etiqueta}: {valor} {meta.unidad}
                </span>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}