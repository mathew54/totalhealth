// CuestionarioWizard.tsx
// TotalHealth: wizard paso a paso del cuestionario de historial médico.
// - Layout por módulos (pasos) con barra de progreso.
// - Cada ítem del checklist es un toggle; al marcar "SÍ" se despliega un campo
//   de detalle condicional; al desmarcar se oculta/deshabilita.
// - Cierre obligatorio: "Otros / Observaciones Adicionales".
// - Estados de edición/lectura. En lectura se muestran los detalles sin editar.
import { useState } from 'react'

export interface ItemCuestionario {
  clave: string
  etiqueta: string
  placeholder: string
}

export interface ModuloCuestionario {
  id: string
  nombre: string
  descripcion?: string
  items: ItemCuestionario[]
}

export type RespuestaItem = { marcado: boolean; detalle: string | null }
export type Respuestas = Record<string, unknown>

export const OBSERVACIONES_KEY = 'observaciones'

export function respuestasVacias(modulos: ModuloCuestionario[]): Respuestas {
  const resp: Record<string, unknown> = {}
  for (const clave of modulos.flatMap((m) => m.items).map((i) => i.clave)) {
    resp[clave] = { marcado: false, detalle: null } satisfies RespuestaItem
  }
  resp[OBSERVACIONES_KEY] = ''
  return resp
}

export function itemDe(r: Respuestas, clave: string): RespuestaItem {
  const v = r[clave]
  if (v && typeof v === 'object') return v as RespuestaItem
  return { marcado: typeof v === 'boolean' ? v : false, detalle: null }
}

export function normalizarRespuestas(src?: Respuestas, modulos?: ModuloCuestionario[]): Respuestas {
  const mods = modulos ?? []
  const base = respuestasVacias(mods)
  if (!src) return base
  for (const m of mods) {
    for (const item of m.items) {
      const v = src[item.clave]
      if (v && typeof v === 'object') {
        const x = v as RespuestaItem
        base[item.clave] = { marcado: x.marcado === true, detalle: typeof x.detalle === 'string' ? x.detalle : null }
      } else if (typeof v === 'boolean') {
        base[item.clave] = { marcado: v, detalle: null }
      }
    }
  }
  base[OBSERVACIONES_KEY] = typeof src[OBSERVACIONES_KEY] === 'string' ? src[OBSERVACIONES_KEY] : ''
  return base
}

export function conteoMarcados(r: Respuestas, modulos: ModuloCuestionario[]): number {
  return modulos.flatMap((m) => m.items).filter((i) => itemDe(r, i.clave).marcado).length
}

interface WizardProps {
  modulos: ModuloCuestionario[]
  cierre: ModuloCuestionario
  inicial?: Respuestas
  modo: 'editar' | 'leer'
  esConsolidado?: boolean
  guardando?: boolean
  onGuardar?: (respuestas: Respuestas, finalizado: boolean) => void
}

export default function CuestionarioWizard({
  modulos,
  cierre,
  inicial,
  modo = 'editar',
  esConsolidado = false,
  guardando = false,
  onGuardar,
}: WizardProps) {
  const [respuestas, setRespuestas] = useState<Respuestas>(() => normalizarRespuestas(inicial, modulos))
  const [paso, setPaso] = useState(0)
  const pasos = [...modulos, cierre]
  const total = pasos.length
  const editable = modo === 'editar' && !esConsolidado
  const actual = pasos[paso]
  const esCierre = paso === total - 1

  function toggle(clave: string, marcado: boolean) {
    const prev = itemDe(respuestas, clave)
    setRespuestas((r) => ({ ...r, [clave]: { marcado, detalle: marcado ? (prev.detalle ?? '') : null } }))
  }

  function setDetalle(clave: string, detalle: string) {
    setRespuestas((r) => ({ ...r, [clave]: { ...itemDe(r, clave), detalle } }))
  }

  function setObservaciones(v: string) {
    setRespuestas((r) => ({ ...r, [OBSERVACIONES_KEY]: v }))
  }

  return (
    <div className="space-y-4">
      <Progreso pasos={pasos} paso={paso} />

      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="mb-4">
          <h3 className="text-base font-semibold text-slate-800">{actual.nombre}</h3>
          {actual.descripcion && <p className="mt-1 text-sm text-slate-500">{actual.descripcion}</p>}
        </div>

        {esCierre ? (
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">
              Otros / Observaciones Adicionales <span className="text-red-500">*</span>
            </span>
            <textarea
              rows={5}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 disabled:bg-slate-50"
              value={String(respuestas[OBSERVACIONES_KEY] ?? '')}
              disabled={!editable}
              onChange={(e) => setObservaciones(e.target.value)}
              placeholder="Describa cualquier dato de salud relevante que no haya sido mencionado arriba…"
            />
          </label>
        ) : (
          <ul className="space-y-3">
            {actual.items.map((item) => {
              const r = itemDe(respuestas, item.clave)
              return (
                <li key={item.clave} className="rounded-xl border border-slate-100 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-slate-800">{item.etiqueta}</p>
                      {editable && (
                        <p className="mt-0.5 text-xs text-slate-400">
                          {r.marcado ? 'Marcado: complete el detalle.' : 'Marque solo si aplica.'}
                        </p>
                      )}
                    </div>
                    {editable ? (
                      <label className="inline-flex cursor-pointer items-center gap-2">
                        <span className="text-sm font-medium text-slate-600">No/Sí</span>
                        <input
                          type="checkbox"
                          className="h-5 w-5 accent-brand-600"
                          checked={r.marcado}
                          onChange={(e) => toggle(item.clave, e.target.checked)}
                        />
                      </label>
                    ) : (
                      <EstadoCheck marcado={r.marcado} />
                    )}
                  </div>
                  {r.marcado && (
                    <div className="mt-3">
                      <input
                        type="text"
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 disabled:bg-slate-50"
                        value={r.detalle ?? ''}
                        disabled={!editable}
                        onChange={(e) => setDetalle(item.clave, e.target.value)}
                        placeholder={editable ? item.placeholder : 'Sin detalle registrado'}
                      />
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <div className="flex items-center justify-between gap-2">
        <button
          onClick={() => setPaso((p) => Math.max(p - 1, 0))}
          disabled={paso === 0}
          className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40"
        >
          ← Anterior
        </button>
        <span className="text-sm text-slate-400">
          Paso {paso + 1} de {total} · {conteoMarcados(respuestas, modulos)} {conteoMarcados(respuestas, modulos) === 1 ? 'marcado' : 'marcados'}
        </span>
        {paso < total - 1 ? (
          <button
            onClick={() => setPaso((p) => Math.min(p + 1, total - 1))}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
          >
            Siguiente →
          </button>
        ) : (
          <div className="flex items-center gap-2">
            {editable && onGuardar && (
              <>
                <button
                  onClick={() => onGuardar(respuestas, false)}
                  disabled={guardando}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                >
                  Guardar borrador
                </button>
                <button
                  onClick={() => onGuardar(respuestas, true)}
                  disabled={guardando}
                  className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
                >
                  {esConsolidado ? 'Guardar adenda' : 'Finalizar cuestionario'}
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function Progreso({ pasos, paso }: { pasos: ModuloCuestionario[]; paso: number }) {
  return (
    <div className="flex items-center gap-2">
      {pasos.map((p, i) => (
        <div key={p.id} className="flex flex-1 flex-col gap-1">
          <div
            className={`h-1.5 rounded-full transition ${
              i <= paso ? 'bg-brand-600' : 'bg-slate-200'
            }`}
          />
          <span className={`text-[11px] font-medium ${i === paso ? 'text-brand-700' : 'text-slate-400'}`}>
            {p.nombre}
          </span>
        </div>
      ))}
    </div>
  )
}

function EstadoCheck({ marcado }: { marcado: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${
        marcado ? 'bg-brand-100 text-brand-700' : 'bg-slate-100 text-slate-500'
      }`}
    >
      {marcado ? 'SÍ' : 'NO'}
    </span>
  )
}