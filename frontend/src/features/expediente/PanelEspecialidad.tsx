import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { useSessionStore } from '../../stores/sessionStore'
import FormularioDinamico from './FormularioDinamico'
import { obtenerSchemaEspecialidad } from './schemasEspecialidad'
import type { Evolucion } from './types'

const inputCls =
  'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none'

interface Props {
  pacienteId: string
}

/** Selector dinámico de especialidad (23 del catálogo) con formulario JSON-Schema. */
export default function PanelEspecialidad({ pacienteId }: Props) {
  // Inicia con la especialidad activa del médico (perfil) o la primera asignada.
  const profile = useSessionStore((s) => s.profile)
  const inicial =
    profile?.especialidad_activa ??
    profile?.especialidades?.[0] ??
    'medicina_general'
  const [especialidadId, setEspecialidadId] = useState(inicial)

  const { data: catalogo } = useQuery<{ especialidades: { id: string; nombre: string }[] }>({
    queryKey: ['historial', 'especialidades'],
    queryFn: async () => (await api.get('/historial/especialidades')).data,
  })

  const { data: evoluciones = [] } = useQuery<Evolucion[]>({
    queryKey: ['expediente', 'evoluciones', pacienteId],
    queryFn: async () => (await api.get(`/expediente/evoluciones?paciente_id=${pacienteId}`)).data,
  })

  const schema = obtenerSchemaEspecialidad(especialidadId)
  // Últimos datos guardados para esta especialidad (para repoblar el formulario).
  const ultimo = [...evoluciones].reverse().find((e) => e.especialidad_id === especialidadId)

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-slate-700">Especialidad médica</span>
          <select value={especialidadId} onChange={(e) => setEspecialidadId(e.target.value)} className={inputCls}>
            {(catalogo?.especialidades ?? []).map((esp) => (
              <option key={esp.id} value={esp.id}>{esp.nombre}</option>
            ))}
          </select>
        </label>
        <p className="mt-2 text-xs text-slate-500">{schema.descripcion}</p>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <h3 className="mb-3 text-sm font-semibold text-slate-800">{schema.titulo}</h3>
        {schema.campos.length === 0 ? (
          <p className="text-sm text-slate-500">
            Esta especialidad aún no tiene un formulario específico. Usa la pestaña Evolución (SOAP) para
            registrar la consulta.
          </p>
        ) : (
          <FormularioDinamico
            schema={schema}
            pacienteId={pacienteId}
            iniciales={ultimo?.especialidad_data as Record<string, unknown> | undefined}
          />
        )}
      </div>
    </div>
  )
}