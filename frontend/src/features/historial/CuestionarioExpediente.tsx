import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { api, getApiError } from '../../lib/api'
import { useSessionStore } from '../../stores/sessionStore'
import {
  CuestionarioModal,
  Modal,
  EstadoBadge,
  fmt,
  inputCls,
  type Cuestionario,
  type Definicion,
} from '../cuestionario/CuestionarioModal'

/**
 * Pestaña "Cuestionario" dentro del expediente del paciente (Historial Médico).
 * Permite al médico ver todos los cuestionarios de anamnesis del paciente,
 * abrir/leer uno (incluidas adendas), continuar un borrador o crear uno nuevo,
 * sin salir de la ventana del historial.
 */
export default function CuestionarioExpediente({ pacienteId }: { pacienteId: string }) {
  const queryClient = useQueryClient()
  const profile = useSessionStore((s) => s.profile)
  const esAdmin = profile?.role === 'admin' || profile?.role === 'super_root'

  const [error, setError] = useState<string | null>(null)
  const [abierto, setAbierto] = useState<{ id: string | null } | null>(null)
  const [aBorrar, setABorrar] = useState<Cuestionario | null>(null)

  const { data: def } = useQuery<Definicion>({
    queryKey: ['cuestionarios', 'definicion'],
    queryFn: async () => (await api.get('/historial/cuestionarios/definicion')).data,
    staleTime: Infinity,
  })

  const { data: lista = [], isLoading, refetch } = useQuery<Cuestionario[]>({
    queryKey: ['cuestionarios', 'expediente', pacienteId],
    queryFn: async () => (await api.get(`/historial/pacientes/${pacienteId}/cuestionarios`)).data,
  })

  async function crearCuestionario() {
    setError(null)
    try {
      const { data } = await api.post<{ id: string }>(`/historial/pacientes/${pacienteId}/cuestionarios`)
      queryClient.invalidateQueries({ queryKey: ['cuestionarios', 'expediente', pacienteId] })
      setAbierto({ id: data.id })
    } catch (e) {
      setError(getApiError(e))
    }
  }

  function cerrar() {
    setAbierto(null)
    refetch()
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4">
        <div>
          <h3 className="font-semibold text-slate-800">Cuestionario de historial médico</h3>
          <p className="mt-1 text-sm text-slate-500">
            Anamnesis del paciente (checklist dinámico). Abre un cuestionario para leerlo, continuar un
            borrador o registrar una adenda sobre un historial consolidado.
          </p>
        </div>
        <button
          onClick={crearCuestionario}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
        >
          + Nuevo cuestionario
        </button>
      </div>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {isLoading ? (
        <p className="py-6 text-center text-sm text-slate-500">Cargando cuestionarios…</p>
      ) : lista.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-400">
          El paciente aún no tiene un cuestionario de historial médico.
        </p>
      ) : (
        <div className="space-y-2">
          {lista.map((c) => (
            <div key={c.id} className="rounded-2xl border border-slate-200 bg-white p-4 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <EstadoBadge estado={c.estado} />
                  <span className="font-medium text-slate-800">
                    Origen: <span className="capitalize">{c.origen}</span>
                  </span>
                  <span className="text-xs text-slate-400">
                    Creado {fmt(c.created_at)} · Actualizado {fmt(c.updated_at)}
                    {c.creado_por_medico_nombre ? ` · ${c.creado_por_medico_nombre}` : ''}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => setAbierto({ id: c.id })}
                    className="rounded-lg border border-brand-600 px-3 py-1.5 text-xs font-semibold text-brand-700 hover:bg-brand-50"
                  >
                    {c.estado === 'consolidado' ? 'Ver / Adenda' : 'Abrir / Editar'}
                  </button>
                  {esAdmin && (
                    <button
                      onClick={() => setABorrar(c)}
                      className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50"
                    >
                      Eliminar
                    </button>
                  )}
                </div>
              </div>
              <p className="mt-1 truncate text-xs text-slate-500">
                {String(c.respuestas?.observaciones ?? 'Sin observaciones registradas.')}
              </p>
            </div>
          ))}
        </div>
      )}

      {abierto && def && (
        <CuestionarioModal
          def={def}
          id={abierto.id}
          esNuevo={false}
          onClose={cerrar}
        />
      )}

      {aBorrar && (
        <EliminarModal
          cuestionario={aBorrar}
          onClose={() => setABorrar(null)}
          onListo={() => {
            setABorrar(null)
            refetch()
          }}
        />
      )}
    </div>
  )
}

function EliminarModal({ cuestionario, onClose, onListo }: {
  cuestionario: Cuestionario
  onClose: () => void
  onListo: () => void
}) {
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const queryClient = useQueryClient()

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const fd = new FormData(e.currentTarget)
    const justificacion = String(fd.get('justificacion') ?? '')
    const password = String(fd.get('password') ?? '')
    setEnviando(true)
    try {
      await api.delete(`/historial/cuestionarios/${cuestionario.id}`, { data: { justificacion, password } })
      queryClient.invalidateQueries({ queryKey: ['cuestionarios', 'expediente', cuestionario.paciente_id] })
      onListo()
    } catch (err) {
      setError(getApiError(err))
    } finally {
      setEnviando(false)
    }
  }

  return (
    <Modal onClose={onClose} title="Eliminar cuestionario">
      <p className="mt-1 text-sm text-slate-500">
        Acción reservada al administrador. Se registrará un borrado lógico y su auditoría.
      </p>
      {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <form onSubmit={handleSubmit} className="mt-4 space-y-3">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-700">Justificación</span>
          <textarea name="justificacion" rows={3} required className={inputCls} placeholder="¿Motivo de la eliminación? (mín. 10 caracteres)" />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-700">Contraseña de administrador</span>
          <input name="password" type="password" required className={inputCls} />
        </label>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">
            Cancelar
          </button>
          <button type="submit" disabled={enviando} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50">
            Eliminar definitivamente
          </button>
        </div>
      </form>
    </Modal>
  )
}
