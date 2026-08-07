import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { api, getApiError } from '../../lib/api'
import PrintHeader from '../../components/ui/PrintHeader'

const TIPO_LABELS: Record<string, string> = {
  rx: 'Radiografía',
  ecografia: 'Ecografía',
  tomografia: 'Tomografía',
  resonancia: 'Resonancia',
  foto: 'Foto clínica',
  otro: 'Otro',
}

interface Paciente { id: string; nombre_completo: string; cedula: string | null }

interface Imagen {
  id: string
  paciente_id: string
  paciente_nombre: string | null
  url: string
  tipo: string
  region: string | null
  descripcion: string | null
  creado_por_nombre: string | null
  created_at: string
}

export default function ImagenesPage() {
  const queryClient = useQueryClient()
  const [error, setError] = useState<string | null>(null)
  const [pacienteId, setPacienteId] = useState('')
  const [tipo, setTipo] = useState('rx')
  const [region, setRegion] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [archivo, setArchivo] = useState<string | null>(null)
  const [ver, setVer] = useState<Imagen | null>(null)

  const { data: pacientes = [] } = useQuery<Paciente[]>({
    queryKey: ['pacientes', 'imagenes'],
    queryFn: async () => (await api.get('/pacientes')).data,
  })

  const { data: imagenes = [], isLoading } = useQuery<Imagen[]>({
    queryKey: ['imagenes', pacienteId],
    queryFn: async () => (await api.get(`/imagenes${pacienteId ? `?paciente_id=${pacienteId}` : ''}`)).data,
  })

  const upload = useMutation<Imagen>({
    mutationFn: async () => {
      const r = await api.post('/imagenes', {
        paciente_id: pacienteId,
        tipo,
        region: region || null,
        descripcion: descripcion || null,
        data_url: archivo,
      })
      return r.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['imagenes'] })
      setArchivo(null)
      setRegion('')
      setDescripcion('')
      setError(null)
    },
    onError: (e) => setError(getApiError(e)),
  })

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => setArchivo(String(reader.result))
    reader.readAsDataURL(file)
  }

  return (
    <div className="space-y-6">
      <PrintHeader />
      <div>
        <h1 className="text-xl font-bold text-slate-800">Imágenes médicas</h1>
        <p className="text-sm text-slate-500">Visualizador de imágenes clínicas por paciente (MVP)</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 lg:col-span-1">
          <h2 className="text-sm font-semibold text-slate-700">Adjuntar imagen</h2>
          <div className="mt-3 space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Paciente *</label>
              <select value={pacienteId} onChange={(e) => setPacienteId(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500">
                <option value="">Selecciona…</option>
                {pacientes.map((p) => (
                  <option key={p.id} value={p.id}>{p.nombre_completo} {p.cedula ? `(${p.cedula})` : ''}</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <label className="block text-xs">
                <span className="mb-1 block font-medium text-slate-600">Estudio</span>
                <select value={tipo} onChange={(e) => setTipo(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500">
                  {Object.entries(TIPO_LABELS).map(([id, label]) => (
                    <option key={id} value={id}>{label}</option>
                  ))}
                </select>
              </label>
              <label className="block text-xs">
                <span className="mb-1 block font-medium text-slate-600">Región</span>
                <input value={region} onChange={(e) => setRegion(e.target.value)} placeholder="Tórax" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500" />
              </label>
            </div>

            <label className="block text-xs">
              <span className="mb-1 block font-medium text-slate-600">Descripción</span>
              <textarea value={descripcion} onChange={(e) => setDescripcion(e.target.value)} rows={2} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500" />
            </label>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Archivo de imagen *</label>
              <input type="file" accept="image/*" onChange={onFile} className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-800 file:px-3 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-slate-700" />
            </div>

            {archivo && (
              <img src={archivo} alt="Vista previa" className="max-h-40 w-full rounded-lg border border-slate-200 object-contain" />
            )}

            <button
              onClick={() => upload.mutate()}
              disabled={!pacienteId || !archivo || upload.isPending}
              className="w-full rounded-lg bg-brand-600 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {upload.isPending ? 'Subiendo…' : 'Adjuntar imagen'}
            </button>
          </div>
        </div>

        <div className="lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-700">Galería</h2>
            {pacienteId && <span className="text-xs text-slate-400">{imagenes.length} imagen(es)</span>}
          </div>
          {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

          {isLoading ? (
            <p className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500">Cargando…</p>
          ) : imagenes.length === 0 ? (
            <p className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500">Sin imágenes para mostrar.</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {imagenes.map((img) => (
                <button key={img.id} onClick={() => setVer(img)} className="group overflow-hidden rounded-2xl border border-slate-200 bg-white text-left transition hover:border-brand-400">
                  <img src={img.url} alt={img.descripcion ?? img.tipo} className="h-44 w-full bg-slate-900 object-contain" />
                  <div className="space-y-1 p-3">
                    <div className="flex items-center gap-2">
                      <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-medium text-brand-700">{TIPO_LABELS[img.tipo] ?? img.tipo}</span>
                      {img.region && <span className="text-xs text-slate-400">{img.region}</span>}
                    </div>
                    <p className="line-clamp-2 text-xs text-slate-600">{img.descripcion ?? 'Sin descripción'}</p>
                    <p className="text-[10px] text-slate-400">{img.paciente_nombre}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {ver && <Lightbox img={ver} onClose={() => setVer(null)} />}
    </div>
  )
}

function Lightbox({ img, onClose }: { img: Imagen; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/90 p-4" onClick={onClose}>
      <div className="flex items-center justify-between text-white">
        <div>
          <p className="text-sm font-semibold">{img.paciente_nombre} — {TIPO_LABELS[img.tipo] ?? img.tipo}{img.region ? ` · ${img.region}` : ''}</p>
          {img.descripcion && <p className="text-xs text-slate-300">{img.descripcion}</p>}
        </div>
        <button className="rounded-full bg-white/10 px-4 py-1 text-sm hover:bg-white/20">× Cerrar</button>
      </div>
      <div className="flex flex-1 items-center justify-center" onClick={onClose}>
        <img src={img.url} alt={img.descripcion ?? 'Imagen'} className="max-h-full max-w-full rounded-xl object-contain" />
      </div>
      {img.creado_por_nombre && (
        <p className="py-2 text-center text-xs text-slate-400">Registrada por {img.creado_por_nombre}</p>
      )}
    </div>
  )
}