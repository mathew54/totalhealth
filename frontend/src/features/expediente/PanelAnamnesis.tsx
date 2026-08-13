import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, getApiError } from '../../lib/api'
import type { DefCuestionario, RespuestaItem, Respuestas } from './types'

const MODULOS_FIJOS = {
  modulo_1: 'Estilo de Vida y Hábitos',
  modulo_2: 'Antecedentes Médicos Personales',
  modulo_3: 'Antecedentes Heredofamiliares',
  modulo_4: 'Revisión por Sistemas',
}

interface Cuestionario {
  id: string
  estado: string
  respuestas: Respuestas
  consulta_id: string | null
  origen: 'medico' | 'paciente'
  created_at: string
  updated_at: string
}

interface Props {
  pacienteId: string
}

const inputCls =
  'mt-1 w-full rounded-md border border-slate-200 px-2 py-1 text-xs focus:border-brand-400 focus:outline-none'

/** Panel central de anamnesis baseline: checklist inline con guardado automático. */
export default function PanelAnamnesis({ pacienteId }: Props) {
  const queryClient = useQueryClient()
  const [error, setError] = useState<string | null>(null)

  const { data: def } = useQuery<DefCuestionario>({
    queryKey: ['cuestionarios', 'definicion'],
    queryFn: async () => (await api.get('/historial/cuestionarios/definicion')).data,
    staleTime: Infinity,
  })

  const { data: lista = [] } = useQuery<Cuestionario[]>({
    queryKey: ['expediente', 'anamnesis', pacienteId],
    queryFn: async () => (await api.get(`/historial/pacientes/${pacienteId}/cuestionarios`)).data,
  })

  // Usa el último cuestionario existente; si no hay, lo crea al abrir el panel.
  const actual = lista.find((c) => c.estado !== 'eliminado') ?? null

  const { data: detalle } = useQuery<Cuestionario>({
    queryKey: ['expediente', 'cuestionario', actual?.id],
    enabled: Boolean(actual?.id),
    queryFn: async () => (await api.get(`/historial/cuestionarios/${actual!.id}`)).data,
  })

  const [draft, setDraft] = useState<Respuestas | null>(null)
  const [cuestionarioId, setCuestionarioId] = useState<string | null>(null)

  // Si el paciente ya tiene cuestionario, cargar sus respuestas. Si no, el
  // checklist arranca vacío (desbloqueado) y se crea al primer toggle.
  useEffect(() => {
    if (detalle?.respuestas) {
      setDraft(detalle.respuestas)
      setCuestionarioId(detalle.id)
    } else if (def) {
      setDraft((d) => d ?? respuestasVacias(def))
    }
  }, [detalle?.id, detalle?.respuestas, def])

  const crearYGuardar = useMutation({
    mutationFn: async (respuestas: Respuestas) => {
      let cid = cuestionarioId ?? actual?.id
      if (!cid) {
        const { data: nuevo } = await api.post<{ id: string }>(`/historial/pacientes/${pacienteId}/cuestionarios`)
        cid = nuevo.id
        setCuestionarioId(cid)
      }
      await api.patch(`/historial/cuestionarios/${cid}/respuestas`, { respuestas })
      return cid
    },
    onSuccess: () => {
      setError(null)
      queryClient.invalidateQueries({ queryKey: ['expediente', 'anamnesis', pacienteId] })
      queryClient.invalidateQueries({ queryKey: ['cuestionarios', 'expediente', pacienteId] })
    },
    onError: (e) => setError(getApiError(e)),
  })

  function toggle(clave: string, marcado: boolean, detalleTexto?: string) {
    if (!draft) return
    const nuevo: Respuestas = {
      ...draft,
      [clave]: { marcado, detalle: marcado ? (detalleTexto ?? '') : null } as RespuestaItem,
    }
    setDraft(nuevo)
    crearYGuardar.mutate(nuevo)
  }

  function setDetalle(clave: string, detalleTexto: string) {
    if (!draft) return
    const prev = draft[clave] as RespuestaItem | undefined
    const nuevo: Respuestas = { ...draft, [clave]: { marcado: prev?.marcado ?? true, detalle: detalleTexto } as RespuestaItem }
    setDraft(nuevo)
    crearYGuardar.mutate(nuevo)
  }

  if (!def) return <p className="py-6 text-center text-sm text-slate-500">Cargando cuestionario…</p>

  const alergiaMarcada = Boolean(
    draft &&
      (draft.alergias as RespuestaItem | undefined)?.marcado &&
      modulosConKey('alergias', def),
  )

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-800">Anamnesis Baseline</h3>
          <p className="text-xs text-slate-500">Edición inline con guardado automático.</p>
        </div>
        {crearYGuardar.isPending && <span className="text-[11px] text-slate-400">Guardando…</span>}
        {error && <span className="text-[11px] text-red-500">{error}</span>}
      </div>

      {alergiaMarcada && (
        <div className="rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 ring-1 ring-red-200">
          ⚠ Alerta: alergias registradas en la anamnesis
        </div>
      )}

      {def.modulos
        .filter((m) => m.id in MODULOS_FIJOS)
        .map((modulo) => (
          <div key={modulo.id} className="rounded-2xl border border-slate-200 bg-white p-3">
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
              {modulo.nombre}
            </h4>
            <div className="space-y-1.5">
              {modulo.items.map((item) => {
                const r = draft?.[item.clave] as RespuestaItem | undefined
                const marcado = r?.marcado === true
                return (
                  <div key={item.clave} className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      checked={marcado}
                      onChange={(e) => toggle(item.clave, e.target.checked)}
                      className="mt-0.5 h-4 w-4 accent-brand-600"
                    />
                    <div className="flex-1">
                      <label
                        className={`cursor-pointer text-sm ${marcado ? 'font-medium text-slate-800' : 'text-slate-600'}`}
                        onClick={() => toggle(item.clave, !marcado)}
                      >
                        {item.etiqueta}
                        {item.clave === 'alergias' && marcado && (
                          <span className="ml-2 rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-700">
                            ALERTA
                          </span>
                        )}
                      </label>
                      {marcado && (
                        <input
                          value={r?.detalle ?? ''}
                          placeholder={item.placeholder}
                          onChange={(e) => setDetalle(item.clave, e.target.value)}
                          className={inputCls}
                        />
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
    </div>
  )
}

function modulosConKey(clave: string, def: DefCuestionario): boolean {
  return def.modulos.some((m) => m.items.some((i) => i.clave === clave))
}

/** Checklist vacío a partir de la definición: todo desmarcado + observaciones. */
function respuestasVacias(def: DefCuestionario): Respuestas {
  const resp: Respuestas = {}
  for (const modulo of def.modulos) {
    for (const item of modulo.items) resp[item.clave] = { marcado: false, detalle: null } as RespuestaItem
  }
  return resp
}