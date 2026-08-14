import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { api, getApiError } from '../../lib/api'
import { TIPO_LABELS, type EstudioImagen } from './types'
import type { Paciente } from '../../lib/types'

const inputCls = 'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500'

export function FormEstudio({
  pacienteIdInicial,
  consultaIdInicial,
  onClose,
  onCreado,
}: {
  pacienteIdInicial?: string
  consultaIdInicial?: string
  onClose: () => void
  onCreado: (id: string) => void
}) {
  const queryClient = useQueryClient()
  const [error, setError] = useState<string | null>(null)
  const [pacienteId, setPacienteId] = useState(pacienteIdInicial ?? '')
  const [tipo, setTipo] = useState('rx')
  const [region, setRegion] = useState('')
  const [titulo, setTitulo] = useState('')
  const [hallazgos, setHallazgos] = useState('')
  const [impresion, setImpresion] = useState('')
  const [retencion, setRetencion] = useState('')
  const [fechaEstudio, setFechaEstudio] = useState(new Date().toISOString().slice(0, 10))
  const [archivos, setArchivos] = useState<{ data_url: string }[]>([])

  const { data: pacientes = [] } = useQuery<Paciente[]>({
    queryKey: ['pacientes', 'imagenes'],
    queryFn: async () => (await api.get('/pacientes')).data,
  })

  const puedeCrear = useMemo(
    () => Boolean(pacienteId) && archivos.length > 0,
    [pacienteId, archivos.length],
  )

  const crear = useMutation<EstudioImagen>({
    mutationFn: async () => {
      const r = await api.post('/imagenes/estudios', {
        paciente_id: pacienteId,
        consulta_id: consultaIdInicial || null,
        tipo,
        region: region || null,
        titulo: titulo || null,
        hallazgos: hallazgos || null,
        impresion: impresion || null,
        fecha_estudio: new Date(`${fechaEstudio}T12:00:00`).toISOString(),
        retencion_hasta: retencion || null,
        imagenes: archivos.map((a) => ({ data_url: a.data_url, descripcion: null })),
      })
      return r.data
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['imagenes'] })
      onCreado(data.id)
    },
    onError: (e) => setError(getApiError(e)),
  })

  function onFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files
    if (!files || files.length === 0) return
    const leidos: { data_url: string }[] = []
    let pendiente = files.length
    Array.from(files).forEach((file) => {
      const reader = new FileReader()
      reader.onload = () => {
        leidos.push({ data_url: String(reader.result) })
        pendiente -= 1
        if (pendiente === 0) setArchivos((prev) => [...prev, ...leidos])
      }
      reader.readAsDataURL(file)
    })
    e.target.value = ''
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div
        className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-t-2xl bg-white p-6 sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between">
          <h3 className="text-lg font-bold text-slate-800">Nuevo estudio de imagen</h3>
          <button onClick={onClose} className="text-xl text-slate-400 hover:text-slate-600">×</button>
        </div>

        {consultaIdInicial && (
          <p className="mt-2 rounded-lg bg-brand-50 px-3 py-2 text-xs text-brand-700">
            Este estudio quedará vinculado a la consulta seleccionada.
          </p>
        )}

        <div className="mt-4 space-y-3">
          <label className="block text-xs">
            <span className="mb-1 block font-medium text-slate-600">Paciente *</span>
            <select value={pacienteId} onChange={(e) => setPacienteId(e.target.value)} className={inputCls}>
              <option value="">Selecciona…</option>
              {pacientes.map((p) => (
                <option key={p.id} value={p.id}>{p.nombre_completo} {p.cedula ? `(${p.cedula})` : ''}</option>
              ))}
            </select>
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block text-xs">
              <span className="mb-1 block font-medium text-slate-600">Tipo *</span>
              <select value={tipo} onChange={(e) => setTipo(e.target.value)} className={inputCls}>
                {Object.entries(TIPO_LABELS).map(([id, label]) => (
                  <option key={id} value={id}>{label}</option>
                ))}
              </select>
            </label>
            <label className="block text-xs">
              <span className="mb-1 block font-medium text-slate-600">Región</span>
              <input value={region} onChange={(e) => setRegion(e.target.value)} placeholder="Tórax" className={inputCls} />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="block text-xs">
              <span className="mb-1 block font-medium text-slate-600">Título</span>
              <input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ej. Placa de tórax AP" className={inputCls} />
            </label>
            <label className="block text-xs">
              <span className="mb-1 block font-medium text-slate-600">Fecha del estudio</span>
              <input type="date" value={fechaEstudio} onChange={(e) => setFechaEstudio(e.target.value)} className={inputCls} />
            </label>
          </div>

          <label className="block text-xs">
            <span className="mb-1 block font-medium text-slate-600">Hallazgos</span>
            <textarea value={hallazgos} onChange={(e) => setHallazgos(e.target.value)} rows={2} className={inputCls} />
          </label>

          <label className="block text-xs">
            <span className="mb-1 block font-medium text-slate-600">Impresión</span>
            <textarea value={impresion} onChange={(e) => setImpresion(e.target.value)} rows={2} className={inputCls} />
          </label>

          <label className="block text-xs">
            <span className="mb-1 block font-medium text-slate-600">Retención mínima (opcional)</span>
            <input type="date" value={retencion} onChange={(e) => setRetencion(e.target.value)} className={inputCls} />
          </label>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Imágenes (serie) *</label>
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={onFiles}
              className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-800 file:px-3 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-slate-700"
            />
            {archivos.length > 0 && (
              <div className="mt-2 grid grid-cols-4 gap-2">
                {archivos.map((a, i) => (
                  <div key={i} className="relative overflow-hidden rounded-lg border border-slate-200">
                    <img src={a.data_url} alt={`Imagen ${i + 1}`} className="h-16 w-full object-cover" />
                    <button
                      onClick={() => setArchivos((prev) => prev.filter((_, j) => j !== i))}
                      className="absolute right-0.5 top-0.5 rounded bg-black/60 px-1 text-[10px] text-white"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

          <button
            onClick={() => crear.mutate()}
            disabled={!puedeCrear || crear.isPending}
            className="w-full rounded-lg bg-brand-600 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {crear.isPending ? 'Creando…' : 'Crear estudio'}
          </button>
        </div>
      </div>
    </div>
  )
}