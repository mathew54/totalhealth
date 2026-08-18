import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useRef, useState, type ReactNode } from 'react'
import { api, getApiError } from '../../lib/api'

interface BackupListado {
  archivo: string
  creado_at: string
  origen: 'mock' | 'db'
  total: number
  tamano_kb: number
}

interface EstadoBackup {
  modo: 'mock' | 'db'
  backups: BackupListado[]
  conteos: Record<string, number>
}

const inputCls =
  'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100'

function Errtag({ children }: { children: string | null }) {
  return children ? <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{children}</p> : null
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-700">{label}</span>
      {children}
    </label>
  )
}

function BadgeOrigen({ origen }: { origen: 'mock' | 'db' }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${origen === 'mock' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>
      {origen === 'mock' ? 'Mock (dev)' : 'Base de datos'}
    </span>
  )
}

function descargarBackup(archivo: string, setError: (m: string | null) => void) {
  api
    .get(`/admin/backup/archivos/${encodeURIComponent(archivo)}`, { responseType: 'blob' })
    .then((res) => {
      const url = URL.createObjectURL(res.data)
      const a = document.createElement('a')
      a.href = url
      a.download = archivo
      a.click()
      URL.revokeObjectURL(url)
    })
    .catch(() => setError('No se pudo descargar el respaldo.'))
}

export default function BackupsTab() {
  const queryClient = useQueryClient()
  const [error, setError] = useState<string | null>(null)
  const [mensaje, setMensaje] = useState<string | null>(null)

  const [origenCrear, setOrigenCrear] = useState<'mock' | 'db' | ''>('')
  const [archivoSubido, setArchivoSubido] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const { data: estado, isLoading } = useQuery<EstadoBackup>({
    queryKey: ['backups'],
    queryFn: async () => (await api.get('/admin/backup')).data,
  })

  const crear = useMutation({
    mutationFn: (origen: 'mock' | 'db') => api.post('/admin/backup/crear', { origen }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['backups'] })
      setMensaje(`Respaldo creado: ${res.data.archivo} (${res.data.total} registros).`)
      setError(null)
    },
    onError: (e) => setError(getApiError(e)),
  })

  const restaurar = useMutation({
    mutationFn: (payload: { archivo?: string; data?: unknown }) => api.post('/admin/backup/restaurar', payload),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['backups'] })
      setMensaje(`Respaldo restaurado correctamente (${res.data.total} registros). Recarga la app para ver los datos.`)
      setError(null)
    },
    onError: (e) => setError(getApiError(e)),
  })

  const resetInicial = useMutation({
    mutationFn: (origen: 'mock' | 'db') => api.post('/admin/backup/reset-inicial', { origen }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['backups'] })
      setMensaje(`Data inicial cargada (${res.data.total} registros). La app quedó como recién instalada.`)
      setError(null)
    },
    onError: (e) => setError(getApiError(e)),
  })

  function restaurarArchivoServer(archivo: string) {
    if (!window.confirm(`¿Restaurar el respaldo "${archivo}"? Se reemplazará toda la data actual.`)) return
    restaurar.mutate({ archivo })
  }

  async function restaurarArchivoSubido() {
    const file = fileRef.current?.files?.[0]
    if (!file) return
    try {
      const data = JSON.parse(await file.text())
      if (!data?.data?.tables) {
        setError('El archivo no parece un respaldo válido de TotalHealth.')
        return
      }
      if (!window.confirm(`¿Restaurar "${file.name}"? Se reemplazará toda la data actual.`)) return
      restaurar.mutate({ data })
      setArchivoSubido(null)
      if (fileRef.current) fileRef.current.value = ''
    } catch {
      setError('No se pudo leer el archivo seleccionado.')
    }
  }

  const modo = estado?.modo
  const totales = estado?.conteos ? Object.values(estado.conteos).reduce((a, b) => a + b, 0) : 0
  const ocupado = crear.isPending || restaurar.isPending || resetInicial.isPending

  return (
    <div className="space-y-5">
      {/* Estado actual */}
      <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5">
        <div>
          <p className="text-sm text-slate-500">Origen de datos</p>
          <p className="text-xl font-bold text-slate-800">{modo === 'mock' ? 'Mock (en memoria)' : 'Base de datos (Supabase)'}</p>
        </div>
        <div>
          <p className="text-sm text-slate-500">Registros en uso</p>
          <p className="text-xl font-bold text-slate-800">{totales}</p>
        </div>
        <div>
          <p className="text-sm text-slate-500">Respaldo disponible</p>
          <p className="text-xl font-bold text-slate-800">{estado?.backups.length ?? 0}</p>
        </div>
        <p className="max-w-md text-xs text-slate-400">
          Crea un respaldo de la app (data mock o de la base de datos), restáuralo cuando lo necesites o carga la data
          inicial mínima para dejar la base como recién instalada (reset).
        </p>
      </div>

      <Errtag>{error}</Errtag>
      {mensaje && <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">{mensaje}</p>}

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Crear backup */}
        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="text-base font-bold text-slate-800">Crear respaldo</h2>
          <p className="text-sm text-slate-500">Genera un archivo JSON con el estado completo de la app.</p>

          <div className="mt-4 space-y-2">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="radio"
                checked={origenCrear === ''}
                onChange={() => setOrigenCrear('')}
                className="accent-brand-600"
              />
              Origen actual ({modo === 'mock' ? 'Mock' : 'Base de datos'})
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="radio"
                checked={origenCrear === 'mock'}
                onChange={() => setOrigenCrear('mock')}
                className="accent-brand-600"
              />
              Data mock (entorno de desarrollo)
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="radio"
                checked={origenCrear === 'db'}
                onChange={() => setOrigenCrear('db')}
                className="accent-brand-600"
              />
              Data de la base de datos
            </label>
          </div>

          <button
            onClick={() => crear.mutate(origenCrear || (modo ?? 'db'))}
            disabled={crear.isPending || !modo}
            className="mt-4 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {crear.isPending ? 'Creando…' : 'Crear respaldo'}
          </button>
          {crear.data && (
            <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-sm">
              <p className="text-slate-600">Guardado: <strong>{crear.data.data.archivo}</strong></p>
              <button
                onClick={() => descargarBackup(crear.data.data.archivo, setError)}
                className="mt-1 text-xs font-medium text-brand-600 hover:text-brand-700"
              >
                Descargar archivo
              </button>
            </div>
          )}
        </section>

        {/* Cargar data inicial (reset) */}
        <section className="rounded-2xl border border-red-200 bg-red-50/50 p-5">
          <h2 className="text-base font-bold text-red-700">Cargar data inicial (reset)</h2>
          <p className="text-sm text-slate-600">
            Elimina <strong>toda</strong> la data actual y carga la data mínima y primordial para que la app funcione
            desde cero: catálogos de especialidades y países, clínica demo, usuarios demo, exámenes de laboratorio y
            datos transaccionales base.
          </p>
          <p className="mt-2 text-xs text-red-600">
            En modo base de datos además recrea los usuarios demo en Supabase Auth si no existen. No se puede deshacer.
          </p>
          <button
            onClick={() => {
              if (!modo) return
              if (!window.confirm('¿Eliminar TODA la data actual y cargar la data inicial mínima?\n\nEsta acción no se puede deshacer.')) return
              if (!window.confirm('Última confirmación: ¿seguro que quieres reiniciar la base a su estado inicial?')) return
              resetInicial.mutate(modo)
            }}
            disabled={resetInicial.isPending || !modo}
            className="mt-4 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
          >
            {resetInicial.isPending ? 'Cargando data inicial…' : 'Cargar data inicial (reset)'}
          </button>
        </section>
      </div>

      {/* Respaldos guardados en el servidor */}
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-700">
          Respaldos guardados en el servidor
        </div>
        {isLoading ? (
          <p className="p-4 text-sm text-slate-500">Cargando…</p>
        ) : (estado?.backups.length ?? 0) === 0 ? (
          <p className="p-4 text-sm text-slate-500">Sin respaldos guardados. Crea el primero arriba.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">Archivo</th>
                  <th className="px-4 py-3">Origen</th>
                  <th className="px-4 py-3">Registros</th>
                  <th className="px-4 py-3">Tamaño</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {estado?.backups.map((b) => (
                  <tr key={b.archivo} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-800">{b.archivo}</p>
                      <p className="text-xs text-slate-400">{new Date(b.creado_at).toLocaleString()}</p>
                    </td>
                    <td className="px-4 py-3"><BadgeOrigen origen={b.origen} /></td>
                    <td className="px-4 py-3 text-slate-600">{b.total}</td>
                    <td className="px-4 py-3 text-slate-600">{b.tamano_kb} KB</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => descargarBackup(b.archivo, setError)}
                          className="text-xs font-medium text-slate-600 hover:text-slate-800"
                        >
                          Descargar
                        </button>
                        <button
                          onClick={() => restaurarArchivoServer(b.archivo)}
                          disabled={ocupado}
                          className="text-xs font-medium text-brand-600 hover:text-brand-700 disabled:opacity-50"
                        >
                          Restaurar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Restaurar desde archivo local */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="text-base font-bold text-slate-800">Restaurar desde un archivo local</h2>
        <p className="text-sm text-slate-500">
          Sube el JSON de un respaldo descargado (p. ej. para migrarlo a otro servidor).
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Field label="Archivo de respaldo (.json)">
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              className={inputCls}
              onChange={(e) => setArchivoSubido(e.target.files?.[0]?.name ?? null)}
            />
          </Field>
          <div className="flex items-end">
            <button
              onClick={restaurarArchivoSubido}
              disabled={!archivoSubido || restaurar.isPending}
              className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
            >
              {restaurar.isPending ? 'Restaurando…' : 'Restaurar'}
            </button>
          </div>
        </div>
      </section>
    </div>
  )
}