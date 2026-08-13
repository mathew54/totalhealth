import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { resumenDeResultado } from '../../lib/pdf'
import PreviewResultado from './PreviewResultado'
import { portalFetch } from './portalApi'

interface Publico {
  resultado_id: string
  paciente: { cedula: string; nombre_completo: string } | null
  examen: string | null
  valores: Record<string, unknown> | null
  observaciones: string | null
  procesado_at: string
}

export default function ResultadoCompartido() {
  const { token } = useParams<{ token: string }>()
  const navigate = useNavigate()
  const [data, setData] = useState<Publico | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!token) return
    let activo = true
    portalFetch(`/compartido/${encodeURIComponent(token)}`)
      .then((d) => activo && setData(d as Publico))
      .catch((e) => activo && setError((e as Error).message))
    return () => {
      activo = false
    }
  }, [token])

  const resumen = data
    ? resumenDeResultado({
        paciente: data.paciente ?? { cedula: '', nombre_completo: '' },
        examen: data.examen ?? 'Examen',
        fecha: data.procesado_at ? new Date(data.procesado_at).toLocaleDateString() : '',
        valores: data.valores,
        observaciones: data.observaciones,
      })
    : ''

  return (
    <div className="min-h-screen bg-slate-100 px-4 py-8">
      <div className="mx-auto max-w-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-lg font-bold text-slate-800">Resultado compartido</h1>
          <button onClick={() => navigate('/portal')} className="text-sm text-slate-500 hover:text-slate-700">
            ← Ir al portal
          </button>
        </div>

        {error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center">
            <p className="font-semibold text-red-700">Enlace no válido o expirado</p>
            <p className="mt-1 text-sm text-red-600">{error}</p>
          </div>
        ) : !data ? (
          <p className="py-12 text-center text-sm text-slate-500">Cargando resultado…</p>
        ) : (
          <div className="rounded-2xl border border-slate-200 bg-white p-6">
            {data.paciente && (
              <div className="mb-4 border-b border-slate-100 pb-4">
                <p className="font-semibold text-slate-800">{data.paciente.nombre_completo}</p>
                <p className="text-sm text-slate-500">Cédula: {data.paciente.cedula}</p>
              </div>
            )}
            <h2 className="font-semibold text-slate-800">{data.examen ?? 'Examen'}</h2>
            {data.procesado_at && (
              <p className="text-xs text-slate-400">Procesado {new Date(data.procesado_at).toLocaleString()}</p>
            )}
            <div className="mt-3">
              <PreviewResultado valores={data.valores} resumen={resumen} />
            </div>
            {data.observaciones && (
              <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
                <span className="font-semibold">Observaciones: </span>{data.observaciones}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}