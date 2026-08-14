import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { api, getApiError } from '../../lib/api'
import CuestionarioWizard, {
  type ModuloCuestionario,
  type Respuestas,
  OBSERVACIONES_KEY,
} from './CuestionarioWizard'
import type { Paciente } from '../../lib/types'

export interface Adenda {
  id: string
  medico_nombre: string | null
  firma: string
  respuestas: Respuestas
  created_at: string | null
}

export interface Cuestionario {
  id: string
  paciente_id: string
  consulta_id: string | null
  origen: 'medico' | 'paciente'
  estado: 'borrador' | 'consolidado' | 'eliminado'
  respuestas: Respuestas
  paciente_nombre: string | null
  creado_por_medico_nombre: string | null
  consolidado_at: string | null
  created_at: string
  updated_at: string
  paciente?: Paciente | null
  adendas?: Adenda[]
}

export interface Definicion {
  modulos: ModuloCuestionario[]
  cierre: ModuloCuestionario
}

/**
 * Modal del cuestionario (wizard). Cubre tres flujos:
 * - `esNuevo`: primero selecciona paciente y llama a `onCrear(paciente_id)`.
 * - Borrador: carga el detalle y permite editar/consolidar.
 * - Consolidado: lectura + registro de adenda con marca de agua.
 */
export function CuestionarioModal({ def, id, esNuevo, onCrear, onClose }: {
  def: Definicion
  id: string | null
  esNuevo: boolean
  onCrear?: (paciente_id: string) => void
  onClose: () => void
}) {
  const [q, setQ] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [adendaActiva, setAdendaActiva] = useState(false)

  const { data: pacientes = [] } = useQuery<Paciente[]>({
    queryKey: ['pacientes', 'cuestionario-nuevo', q],
    queryFn: async () => (await api.get('/pacientes', { params: { q } })).data,
    enabled: esNuevo,
  })

  const { data: det, isLoading } = useQuery<Cuestionario>({
    queryKey: ['cuestionarios', id],
    queryFn: async () => (await api.get(`/historial/cuestionarios/${id}`)).data,
    enabled: !esNuevo && Boolean(id),
  })

  const queryClient = useQueryClient()
  const consolidado = det?.estado === 'consolidado'

  async function guardar(respuestas: Respuestas, finalizado: boolean) {
    setError(null)
    try {
      if (!id) return
      if (consolidado) {
        await api.post(`/historial/cuestionarios/${id}/adendas`, { respuestas })
      } else {
        await api.patch(`/historial/cuestionarios/${id}/respuestas`, { respuestas })
        if (finalizado) await api.post(`/historial/cuestionarios/${id}/consolidar`)
      }
      queryClient.invalidateQueries({ queryKey: ['cuestionarios'] })
      onClose()
    } catch (e) {
      setError(getApiError(e))
    }
  }

  // Paso 1 (crear): seleccionar paciente.
  if (esNuevo) {
    return (
      <Modal onClose={onClose} title="Nuevo cuestionario">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-700">Buscar paciente</span>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cédula o nombre…" className={inputCls} />
        </label>
        {q && pacientes.length > 0 && (
          <ul className="mt-2 max-h-56 divide-y divide-slate-100 overflow-auto rounded-lg border border-slate-200">
            {pacientes.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => onCrear?.(p.id)}
                  className="w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                >
                  <span className="font-medium">{p.nombre_completo}</span> <span className="text-xs text-slate-400">{p.cedula}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Modal>
    )
  }

  if (isLoading) return <Modal onClose={onClose} title="Cargando…"><p className="py-6 text-center text-sm text-slate-500">Cargando cuestionario…</p></Modal>

  return (
    <Modal onClose={onClose} title={consolidado ? 'Cuestionario (consolidado)' : 'Cuestionario'}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-slate-500">
          Paciente: <span className="font-medium text-slate-700">{det?.paciente?.nombre_completo ?? det?.paciente_nombre ?? ''}</span>
        </p>
        {consolidado && (
          <button
            onClick={() => setAdendaActiva((v) => !v)}
            className="rounded-lg border border-brand-600 px-3 py-1.5 text-xs font-semibold text-brand-700 hover:bg-brand-50"
          >
            {adendaActiva ? 'Ver registro' : 'Registrar adenda'}
          </button>
        )}
      </div>

      {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div className="mt-4">
        <CuestionarioWizard
          modulos={def.modulos}
          cierre={def.cierre}
          inicial={det?.respuestas}
          modo={consolidado && !adendaActiva ? 'leer' : 'editar'}
          esConsolidado={consolidado}
          onGuardar={guardar}
        />
      </div>

      {(det?.adendas?.length ?? 0) > 0 && (
        <div className="mt-4">
          <h4 className="mb-2 text-sm font-semibold text-slate-700">Adendas registradas</h4>
          <ul className="space-y-2">
            {(det?.adendas ?? []).map((a) => (
              <li key={a.id} className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm">
                <p className="text-xs text-slate-500">
                  {fmt(a.created_at)} · {a.medico_nombre ?? 'Médico'} {a.firma ? `· firma ${a.firma.slice(0, 8)}…` : ''}
                </p>
                <p className="mt-1 text-slate-700">{String(a.respuestas?.[OBSERVACIONES_KEY] ?? '')}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Modal>
  )
}

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4">
      <div className="mt-8 w-full max-w-2xl rounded-2xl bg-white p-5 shadow-xl">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-800">{title}</h3>
          <button onClick={onClose} className="rounded-lg px-2 py-1 text-slate-400 hover:bg-slate-100" aria-label="Cerrar">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function EstadoBadge({ estado }: { estado: Cuestionario['estado'] }) {
  const map: Record<string, string> = {
    borrador: 'bg-amber-100 text-amber-700',
    consolidado: 'bg-brand-100 text-brand-700',
    eliminado: 'bg-red-100 text-red-700',
  }
  return <span className={`rounded-full px-2 py-0.5 text-xs font-semibold capitalize ${map[estado] ?? 'bg-slate-100 text-slate-600'}`}>{estado}</span>
}

export function fmt(iso?: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString()
}

export const inputCls = 'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100'
