import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api, getApiError } from '../../lib/api'
import { construirZodSchema, type SchemaEspecialidad } from './schemasEspecialidad'

const inputCls =
  'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none'

interface Props {
  schema: SchemaEspecialidad
  pacienteId: string
  /** Datos previos guardados (para edición inline). */
  iniciales?: Record<string, unknown>
  onGuardado?: () => void
}

/** Formulario JSON-Schema dinámico validado con Zod; persiste vía evolución. */
export default function FormularioDinamico({ schema, pacienteId, iniciales, onGuardado }: Props) {
  const [valores, setValores] = useState<Record<string, unknown>>(() => ({ ...(iniciales ?? {}) }))
  const [errores, setErrores] = useState<Record<string, string>>({})
  const queryClient = useQueryClient()

  const zodSchema = useMemo(() => construirZodSchema(schema), [schema])

  // Al cambiar de especialidad, repoblar con los datos previos si existen.
  useEffect(() => {
    setValores({ ...(iniciales ?? {}) })
    setErrores({})
  }, [schema.id, iniciales])

  const guardar = useMutation({
    mutationFn: async () => {
      const parsed = zodSchema.safeParse(valores)
      if (!parsed.success) {
        const e: Record<string, string> = {}
        for (const issue of parsed.error.issues) e[String(issue.path[0])] = issue.message
        setErrores(e)
        throw new Error('Corrige los campos marcados')
      }
      setErrores({})
      await api.post('/expediente/evoluciones', {
        paciente_id: pacienteId,
        especialidad_id: schema.id,
        subjetivo: '',
        objetivo: '',
        evaluacion: '',
        plan: '',
        especialidad_data: parsed.data as Record<string, unknown>,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expediente', 'evoluciones', pacienteId] })
      onGuardado?.()
    },
  })

  function set(clave: string, valor: unknown) {
    setValores((v) => ({ ...v, [clave]: valor }))
  }

  return (
    <div className="space-y-3">
      {schema.campos.map((campo) => {
        const error = errores[campo.clave]
        const base = `${inputCls} ${error ? 'border-red-400' : ''}`
        const valor = valores[campo.clave] ?? ''
        return (
          <label key={campo.clave} className="block text-xs font-medium text-slate-700">
            <span className="flex items-center gap-1">
              {campo.etiqueta}
              {campo.requerido && <span className="text-red-500">*</span>}
              {campo.unidad && <span className="text-[10px] font-normal text-slate-400">({campo.unidad})</span>}
            </span>
            {campo.tipo === 'select' ? (
              <select value={String(valor ?? '')} onChange={(e) => set(campo.clave, e.target.value)} className={`${base} mt-1`}>
                <option value="">Selecciona…</option>
                {(campo.opciones ?? []).map((op) => (
                  <option key={op} value={op}>{op}</option>
                ))}
              </select>
            ) : campo.tipo === 'textarea' ? (
              <textarea
                value={String(valor ?? '')}
                placeholder={campo.lugar}
                onChange={(e) => set(campo.clave, e.target.value)}
                className={`${base} mt-1 min-h-[64px]`}
              />
            ) : campo.tipo === 'numero' ? (
              <input
                type="number"
                value={String(valor ?? '')}
                onChange={(e) => set(campo.clave, e.target.value)}
                className={`${base} mt-1`}
              />
            ) : campo.tipo === 'check' ? (
              <input
                type="checkbox"
                checked={Boolean(valor)}
                onChange={(e) => set(campo.clave, e.target.checked)}
                className="ml-0.5 mt-1 h-4 w-4 rounded border-slate-300 accent-brand-600"
              />
            ) : (
              <input
                type="text"
                value={String(valor ?? '')}
                placeholder={campo.lugar}
                onChange={(e) => set(campo.clave, e.target.value)}
                className={`${base} mt-1`}
              />
            )}
            {error && <span className="mt-1 block text-[10px] text-red-500">{error}</span>}
          </label>
        )
      })}

      {guardar.isError && <p className="text-xs text-red-500">{getApiError(guardar.error)}</p>}
      {guardar.isSuccess && <p className="text-xs text-emerald-600">Datos guardados en la evolución.</p>}
      <button
        type="button"
        onClick={() => guardar.mutate()}
        disabled={guardar.isPending}
        className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
      >
        {guardar.isPending ? 'Guardando…' : 'Guardar evaluación'}
      </button>
    </div>
  )
}