import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import BuscadorPacientes from './BuscadorPacientes'
import HeaderPaciente from './HeaderPaciente'
import PanelAlertas from './PanelAlertas'
import PanelAnamnesis from './PanelAnamnesis'
import PanelEspecialidad from './PanelEspecialidad'
import PanelEvolucion from './PanelEvolucion'
import PanelHistorial from './PanelHistorial'
import PanelNotas from './PanelNotas'
import PanelCasos from './PanelCasos'
import PanelInterconsultas from './PanelInterconsultas'
import PanelOrdenes from './PanelOrdenes'
import PanelLaboratorio from './PanelLaboratorio'
import PanelImagenes from './PanelImagenes'
import { useExpedienteStore } from './expedienteStore'
import type { PacienteExpediente } from './types'

type TabCentral = 'anamnesis' | 'especialidad' | 'evolucion' | 'historial'
type TabLateral = 'notas' | 'casos' | 'interconsultas' | 'ordenes' | 'laboratorio' | 'imagenes'

const CENTRAL_TABS: { id: TabCentral; label: string }[] = [
  { id: 'anamnesis', label: 'Anamnesis' },
  { id: 'especialidad', label: 'Especialidad' },
  { id: 'evolucion', label: 'Evolución (SOAP)' },
  { id: 'historial', label: 'Historial' },
]

const LATERAL_TABS: { id: TabLateral; label: string }[] = [
  { id: 'notas', label: 'Notas' },
  { id: 'casos', label: 'Casos' },
  { id: 'interconsultas', label: 'Interconsultas' },
  { id: 'ordenes', label: 'Órdenes Lab.' },
  { id: 'laboratorio', label: 'Laboratorio' },
  { id: 'imagenes', label: 'Imágenes' },
]

/**
 * Dashboard Clínico Unificado de Anamnesis y Evolución Médica.
 * SPA de una sola ventana para que el médico trabaje sin cambiar de página:
 * barra de búsqueda, panel central (anamnesis/especialidad/evolución) y panel
 * lateral de pestañas secundarias (notas, casos, interconsultas, CPOE).
 */
export default function ExpedientePage() {
  const { expedienteId } = useExpedienteStore()
  const [tabCentral, setTabCentral] = useState<TabCentral>('anamnesis')
  const [tabLateral, setTabLateral] = useState<TabLateral>('notas')

  const { data: paciente } = useQuery<PacienteExpediente>({
    queryKey: ['expediente', 'paciente', expedienteId],
    enabled: Boolean(expedienteId),
    queryFn: async () => (await api.get(`/pacientes/${expedienteId}`)).data,
  })

  const id = expedienteId ?? ''

  return (
    <div className="mx-auto max-w-7xl space-y-4 p-4 lg:p-6">
      {/* Barra superior: búsqueda + selección de paciente/menor */}
      <header className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-bold text-slate-800">Expediente Clínico Unificado</h1>
            <p className="text-xs text-slate-500">Anamnesis, especialidad y evolución en una sola ventana.</p>
          </div>
        </div>
        <div className="mt-3 max-w-2xl">
          <BuscadorPacientes />
        </div>
      </header>

      {!paciente ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-10 text-center">
          <p className="text-sm font-medium text-slate-600">Selecciona un paciente para comenzar.</p>
          <p className="mt-1 text-xs text-slate-400">
            Usa la búsqueda de arriba (nombre, cédula o teléfono). Si es tutor de un menor, podrás alternar
            a su expediente o registrar uno nuevo.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Header persistente: identidad + alergias + vitales recientes */}
          <HeaderPaciente paciente={paciente} />
          {/* Banner de alertas críticas (endpoint del módulo de historial) */}
          <PanelAlertas pacienteId={id} />

          <div className="grid gap-4 lg:grid-cols-3">
            {/* Panel central */}
            <section className="space-y-4 lg:col-span-2">
            <div className="flex gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-slate-100 p-1">
              {CENTRAL_TABS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTabCentral(t.id)}
                  className={`flex-1 whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium transition ${
                    tabCentral === t.id ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-600 hover:text-slate-800'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              {tabCentral === 'anamnesis' && <PanelAnamnesis pacienteId={id} />}
              {tabCentral === 'especialidad' && <PanelEspecialidad pacienteId={id} />}
              {tabCentral === 'evolucion' && <PanelEvolucion pacienteId={id} />}
              {tabCentral === 'historial' && <PanelHistorial pacienteId={id} />}
            </div>
          </section>

          {/* Panel lateral: pestañas secundarias */}
          <aside className="space-y-4">
            <div className="flex gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-slate-100 p-1">
              {LATERAL_TABS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTabLateral(t.id)}
                  className={`flex-1 whitespace-nowrap rounded-lg px-3 py-2 text-xs font-medium transition ${
                    tabLateral === t.id ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-600 hover:text-slate-800'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              {tabLateral === 'notas' && <PanelNotas pacienteId={id} />}
              {tabLateral === 'casos' && <PanelCasos nombrePaciente={paciente.nombre_completo} />}
              {tabLateral === 'interconsultas' && <PanelInterconsultas pacienteId={id} />}
              {tabLateral === 'ordenes' && (
                <PanelOrdenes
                  pacienteId={id}
                  nombrePaciente={paciente.nombre_completo}
                  cedulaPaciente={paciente.cedula}
                />
              )}
              {tabLateral === 'laboratorio' && <PanelLaboratorio pacienteId={id} />}
              {tabLateral === 'imagenes' && (
                <PanelImagenes pacienteId={id} nombrePaciente={paciente.nombre_completo} />
              )}
            </div>
          </aside>
          </div>
        </div>
      )}
    </div>
  )
}