import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { api } from '../../lib/api'

interface Verificacion {
  valida: boolean
  motivo?: string
  auto?: string
  id?: string
  emitida?: string
  expiracion?: string | null
  vencida?: boolean
  estado?: string
  paciente?: string | null
  medicamentos?: { medicamento: string; presentacion?: string | null; dosis?: string | null; frecuencia?: string | null; indicaciones?: string | null; duracion?: string | null }[]
}

/** Verificación pública de autenticidad de una receta digital (Punto 7).
 *  Accesible vía QR sin autenticación; solo expone medicamentos y la fecha. */
export default function RecetaVerificada() {
  const { id } = useParams<{ id: string }>()
  const [params] = useSearchParams()
  const hash = params.get('hash') ?? ''
  const [data, setData] = useState<Verificacion | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    if (!id) return
    let activo = true
    setCargando(true)
    api
      .get(`/portal/recipes/${id}/verificar`, { params: { hash } })
      .then((r) => { if (activo) { setData(r.data as Verificacion); setError(null) } })
      .catch((e) => { if (activo) setError((e as Error).message) })
      .finally(() => activo && setCargando(false))
    return () => { activo = false }
  }, [id, hash])

  return (
    <div className="min-h-screen bg-slate-100 px-4 py-10">
      <div className="mx-auto max-w-xl">
        <div className="mb-4 text-center">
          <h1 className="text-lg font-bold text-slate-800">Verificación de receta</h1>
          <p className="text-xs text-slate-500">TotalHealth · Documento digital firmado</p>
        </div>

        {cargando && <p className="py-12 text-center text-sm text-slate-500">Verificando firma…</p>}

        {!cargando && error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center">
            <p className="font-semibold text-red-700">No se pudo verificar la receta</p>
            <p className="mt-1 text-sm text-red-600">{error}</p>
          </div>
        )}

        {!cargando && !error && data && !data.valida && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center">
            <span className="text-4xl">✕</span>
            <p className="mt-2 font-semibold text-red-700">Receta no auténtica</p>
            <p className="mt-1 text-sm text-red-600">{data.motivo ?? 'La firma digital no coincide.'}</p>
            <p className="mt-4 text-xs text-slate-500">
              Emitida {data.emitida ? new Date(data.emitida).toLocaleDateString() : '—'} · Estado: {data.estado}
            </p>
          </div>
        )}

        {!cargando && !error && data && data.valida && (
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center gap-3 border-b border-slate-100 bg-emerald-50 px-5 py-4">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-600 text-white">✓</span>
              <div>
                <p className="font-bold text-emerald-800">Receta auténtica</p>
                <p className="text-xs text-emerald-700">La firma digital coincide con el documento original.</p>
              </div>
            </div>

            <div className="space-y-1 px-5 py-4 text-sm text-slate-700">
              <p><span className="text-slate-400">Paciente:</span> {data.paciente ?? '—'}</p>
              <p><span className="text-slate-400">Emitida:</span> {data.emitida ? new Date(data.emitida).toLocaleString() : '—'}</p>
              {data.expiracion && (
                <p><span className="text-slate-400">Vence:</span> {new Date(data.expiracion).toLocaleDateString()}</p>
              )}
              <p>
                <span className="text-slate-400">Estado:</span>{' '}
                <span className="capitalize">{data.estado}</span>
                {data.vencida && <span className="ml-2 text-amber-600">(vencida)</span>}
              </p>
            </div>

            <div className="border-t border-slate-100 px-5 py-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Medicamentos recetados</p>
              <ul className="space-y-2">
                {(data.medicamentos ?? []).map((m, i) => (
                  <li key={i} className="rounded-lg border border-slate-200 p-3 text-sm">
                    <p className="font-medium text-slate-800">{m.medicamento}</p>
                    <p className="text-xs text-slate-500">{[m.dosis, m.frecuencia, m.duracion].filter(Boolean).join(' · ')}</p>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
