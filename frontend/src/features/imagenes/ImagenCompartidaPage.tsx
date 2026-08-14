import { useQuery } from '@tanstack/react-query'
import { useParams } from 'react-router-dom'
import { api } from '../../lib/api'
import { TIPO_LABELS, type ImagenClinica } from './types'

interface Compartido {
  estudio: {
    id: string
    tipo: string
    region: string | null
    titulo: string | null
    hallazgos: string | null
    impresion: string | null
    fecha_estudio: string
    paciente_nombre: string | null
    creado_por_nombre: string | null
  }
  imagenes: ImagenClinica[]
}

/**
 * Vista PÚBLICA de un estudio compartido (sin autenticación). Accesible desde
 * el enlace generado en el módulo de imágenes. Solo muestra lo autorizado.
 */
export default function ImagenCompartidaPage() {
  const { token } = useParams<{ token: string }>()
  const { data, isLoading, error } = useQuery<Compartido>({
    queryKey: ['imagenes', 'compartido', token],
    queryFn: async () => (await api.get(`/imagenes/compartir/${token}`)).data,
  })

  if (isLoading) {
    return <Centered><p className="text-sm text-slate-500">Cargando estudio compartido…</p></Centered>
  }

  if (error || !data) {
    return (
      <Centered>
        <p className="text-sm font-medium text-red-600">Enlace inválido o expirado.</p>
        <p className="mt-1 text-xs text-slate-400">Solicita un nuevo enlace de compartición en la clínica.</p>
      </Centered>
    )
  }

  const e = data.estudio

  return (
    <div className="mx-auto max-w-4xl p-4 sm:p-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-medium uppercase text-brand-700">
            {TIPO_LABELS[e.tipo] ?? e.tipo}
          </span>
          {e.region && <span className="text-xs text-slate-400">{e.region}</span>}
          <span className="rounded-full bg-green-50 px-2 py-0.5 text-[11px] font-medium text-green-700">Compartido</span>
        </div>
        <h1 className="mt-2 text-lg font-bold text-slate-800">{e.titulo ?? 'Estudio de imagen'}</h1>
        <p className="text-xs text-slate-500">
          {e.paciente_nombre ?? 'Paciente'} · {new Date(e.fecha_estudio).toLocaleString()}
          {e.creado_por_nombre ? ` · Registrado por ${e.creado_por_nombre}` : ''}
        </p>

        {e.hallazgos && (
          <div className="mt-3 rounded-lg bg-slate-50 p-3">
            <p className="text-xs font-semibold text-slate-500">Hallazgos</p>
            <p className="mt-0.5 text-sm text-slate-700">{e.hallazgos}</p>
          </div>
        )}
        {e.impresion && (
          <div className="mt-2 rounded-lg bg-slate-50 p-3">
            <p className="text-xs font-semibold text-slate-500">Impresión</p>
            <p className="mt-0.5 text-sm text-slate-700">{e.impresion}</p>
          </div>
        )}
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {data.imagenes.map((img) => (
          <figure key={img.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <div className="bg-slate-900">
              <img src={img.url} alt={img.descripcion ?? `Corte ${img.orden}`} className="max-h-72 w-full object-contain" />
            </div>
            <figcaption className="px-3 py-2 text-xs text-slate-500">
              Corte {img.orden}
              {img.descripcion ? ` — ${img.descripcion}` : ''}
            </figcaption>
          </figure>
        ))}
      </div>
    </div>
  )
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-screen flex-col items-center justify-center p-4 text-center">{children}</div>
}