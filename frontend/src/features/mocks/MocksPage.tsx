import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { api, getApiError } from '../../lib/api'

interface DemoCred {
  cedula: string
  roles: string[]
  email: string
}

interface Resumen {
  demoCedulas: DemoCred[]
  password: string
  tablas: { tabla: string; filas: number }[]
  total: number
}

type Fila = Record<string, unknown>

/**
 * Explorador de datos mock. Visible en desarrollo (npm run dev) o si se activa
 * VITE_SHOW_MOCKS=true en el build: muestra credenciales demo y toda la data
 * del seed para facilitar las pruebas.
 */
export default function MocksPage() {
  const esDev = import.meta.env.DEV || import.meta.env.VITE_SHOW_MOCKS === 'true'

  const [tablaSel, setTablaSel] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const queryClient = useQueryClient()

  const {
    data: resumen,
    isLoading,
    isError,
    error: errResumen,
    refetch,
  } = useQuery<Resumen>({
    queryKey: ['mocks', 'resumen'],
    queryFn: async () => (await api.get('/mocks')).data,
    enabled: esDev,
    retry: 1,
  })

  const { data: tabla = { filas: [] as Fila[] }, isFetching } = useQuery<{ tabla: string; filas: Fila[] }>({
    queryKey: ['mocks', 'tabla', tablaSel],
    queryFn: async () => (await api.get(`/mocks/tables/${tablaSel}`)).data,
    enabled: esDev && Boolean(tablaSel),
  })

  const reset = useMutation({
    mutationFn: () => api.post('/mocks/reset'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mocks'] })
      setError(null)
    },
    onError: (err) => setError(getApiError(err)),
  })

  const copiar = useCallback(async (texto: string) => {
    try {
      await navigator.clipboard.writeText(texto)
    } catch {
      // Sin permiso de portapapeles: no bloquea la prueba.
    }
  }, [])

  if (!esDev) return <Navigate to="/" replace />

  if (isLoading) {
    return <p className="py-10 text-center text-sm text-slate-500">Cargando datos mock…</p>
  }

  if (isError || !resumen) {
    return (
      <div className="mx-auto max-w-md py-10 text-center">
        <h1 className="text-lg font-bold text-slate-800">No se pudieron cargar los datos mock</h1>
        <p className="mt-2 text-sm text-slate-500">{getApiError(errResumen)}</p>
        <p className="mt-1 text-xs text-slate-400">
          Verifica que el backend esté activo (<code className="rounded bg-slate-100 px-1">npm run dev -w backend</code>) y que use el modo mock.
        </p>
        <button
          onClick={() => refetch()}
          className="mt-4 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
        >
          Reintentar
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-800">Mocks · Datos de prueba</h1>
        <p className="text-sm text-slate-500">
          Solo disponible en desarrollo (<code className="rounded bg-slate-100 px-1">npm run dev</code>),
          accesible sin login. Muestra las credenciales demo y toda la data sembrada en el mock.
        </p>
      </div>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div className="grid gap-5 lg:grid-cols-3">
        <section className="rounded-2xl border border-slate-200 bg-white p-4 lg:col-span-2">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-semibold text-slate-800">Credenciales demo</h2>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 font-mono text-xs text-slate-500">{resumen.password}</span>
          </div>
          <p className="mt-1 text-xs text-slate-500">Contraseña única para todos los usuarios demo. Haz clic para copiar.</p>
          <div className="mt-3 space-y-2">
            {resumen.demoCedulas.map((c) => (
              <button
                key={c.cedula}
                onClick={() => copiar(c.cedula)}
                className="flex w-full items-center justify-between gap-3 rounded-xl border border-slate-100 px-3 py-2 text-left text-sm hover:bg-slate-50"
                title="Copiar cédula"
              >
                <span className="font-mono font-medium text-slate-800">{c.cedula}</span>
                <span className="flex items-center gap-2 text-xs text-slate-500">
                  <span className="capitalize">{c.roles.join(', ')}</span>
                  <span className="text-slate-300">{c.email}</span>
                </span>
              </button>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4">
          <h2 className="font-semibold text-slate-800">Acciones</h2>
          <p className="mt-1 text-xs text-slate-500">{resumen.total} registros en total.</p>
          <button
            onClick={() => reset.mutate()}
            disabled={reset.isPending}
            className="mt-3 w-full rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
            title="Restablecer base mock al seed inicial"
          >
            {reset.isPending ? 'Restableciendo…' : 'Restablecer seed'}
          </button>
        </section>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <h2 className="font-semibold text-slate-800">Tablas</h2>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {resumen.tablas.map((t) => (
            <button
              key={t.tabla}
              onClick={() => setTablaSel(t.tabla)}
              className={`rounded-xl border px-3 py-2 text-left text-sm transition ${tablaSel === t.tabla ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-slate-100 hover:bg-slate-50'}`}
            >
              <p className="truncate font-mono text-xs font-medium text-slate-700">{t.tabla}</p>
              <p className="text-[11px] text-slate-400">{t.filas} filas</p>
            </button>
          ))}
        </div>
      </section>

      {tablaSel && (
        <section className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-mono text-sm font-semibold text-slate-800">{tablaSel}</h2>
            <span className="text-xs text-slate-400">{tabla.filas.length} filas</span>
          </div>

          {isFetching ? (
            <p className="py-6 text-center text-sm text-slate-500">Cargando…</p>
          ) : tabla.filas.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-400">Tabla vacía.</p>
          ) : (
            <TablaDatos filas={tabla.filas} />
          )}
        </section>
      )}
    </div>
  )
}

function TablaDatos({ filas }: { filas: Fila[] }) {
  const [verJson, setVerJson] = useState(false)
  const columnas = [...new Set(filas.flatMap((f) => Object.keys(f)))]

  return (
    <div className="mt-3">
      <div className="mb-2 flex justify-end">
        <button
          onClick={() => setVerJson((v) => !v)}
          className="rounded-lg border border-slate-200 px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
        >
          {verJson ? 'Ver tabla' : 'Ver JSON'}
        </button>
      </div>

      {verJson ? (
        <pre className="max-h-96 overflow-auto rounded-xl bg-slate-900 p-4 text-xs text-slate-100">
          {JSON.stringify(filas, null, 2)}
        </pre>
      ) : (
        <div className="max-h-96 overflow-auto rounded-xl border border-slate-200">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-slate-50 text-left uppercase text-slate-500">
              <tr>
                {columnas.map((c) => (
                  <th key={c} className="px-3 py-2 font-semibold">{c}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filas.map((f, i) => (
                <tr key={i} className="hover:bg-slate-50">
                  {columnas.map((c) => (
                    <td key={c} className="max-w-[220px] truncate px-3 py-2 text-slate-700" title={celda(f[c])}>
                      {celda(f[c])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function celda(v: unknown): string {
  if (v == null) return '—'
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}
