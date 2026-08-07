import { useEffect, useState } from 'react'
import { useConfigStore } from '../../lib/configStore'

interface TurnoPublico {
  numero: number
  estado: string
  prioridad: string
  hora_llamado: string | null
  inicial: string
}

const PRIORIDAD_LABEL: Record<string, string> = { normal: 'Normal', prioridad: 'Prioridad', urgente: 'Urgente' }

export default function PantallaTurnos() {
  const [turnos, setTurnos] = useState<TurnoPublico[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function cargar() {
    try {
      const res = await fetch('/api/portal/turnos-hoy')
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.message ?? 'Error')
      setTurnos(data ?? [])
      setError(null)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  useEffect(() => {
    cargar()
    const t = setInterval(cargar, 5000)
    return () => clearInterval(t)
  }, [])

  const { razon_social, logo_url, header_color } = useConfigStore()

  const llamando = (turnos ?? []).find((t) => t.estado === 'llamado')
  const esperando = (turnos ?? []).filter((t) => t.estado === 'esperando')

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <header className="flex items-center justify-between border-b border-slate-800 bg-slate-900 px-6 py-4">
        <div className="flex items-center gap-3">
          {logo_url && <img src={logo_url} alt="" className="h-8 w-8 object-contain" />}
          <h1 className="text-lg font-bold">{razon_social}</h1>
        </div>
        <span className="text-sm text-slate-300" style={{ color: header_color }}>Sala de espera</span>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-8">
        {error && <p className="rounded-lg bg-red-900/50 px-4 py-3 text-sm text-red-300">{error}</p>}

        <div className="mb-8 text-center">
          <p className="text-sm uppercase tracking-widest text-slate-400">Turno en consulta</p>
          {llamando && (
            <p className="mt-2 text-7xl font-black" style={{ color: header_color }}>
              {llamando.numero}
            </p>
          )}
          {!llamando && <p className="mt-2 text-3xl text-slate-500">Esperando próximos turnos…</p>}
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-widest text-slate-400">
            En sala de espera ({esperando.length})
          </h2>

          {turnos === null ? (
            <p className="text-sm text-slate-500">Cargando…</p>
          ) : esperando.length === 0 ? (
            <p className="text-sm text-slate-500">Sin pacientes en espera.</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {esperando.map((t) => (
                <div key={t.numero} className="flex items-center gap-4 rounded-xl bg-slate-800 p-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-700 text-xl font-bold">
                    {t.inicial}
                  </div>
                  <div className="text-center">
                    <p className="text-3xl font-black text-white">{t.numero}</p>
                  </div>
                  <div className="ml-auto text-right">
                    <span className="rounded-full bg-slate-700 px-2 py-0.5 text-xs capitalize">{PRIORIDAD_LABEL[t.prioridad] ?? t.prioridad}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}