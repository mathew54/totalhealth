import { useCallback, useEffect, useState } from 'react'
import { portalFetch } from './portalApi'

interface Medico {
  id: string
  nombre_completo: string
  especialidad: string | null
  clinica_id: string | null
}

interface Slot {
  hora: string
  ocupado: boolean
}

interface Reserva {
  id: string
  medico_id: string
  fecha_hora: string
  motivo: string | null
  estado: string
  origen: string
  medico: { id: string; nombre_completo: string; especialidad: string | null } | null
}

export default function Reservas({ token }: { token: string }) {
  const [misReservas, setMisReservas] = useState<Reserva[] | null>(null)
  const [medicos, setMedicos] = useState<Medico[]>([])
  const [error, setError] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  const [medicoId, setMedicoId] = useState('')
  const [fecha, setFecha] = useState(() => new Date().toISOString().slice(0, 10))
  const [slots, setSlots] = useState<Slot[] | null>(null)
  const [slotSel, setSlotSel] = useState('')
  const [motivo, setMotivo] = useState('')
  const [loading, setLoading] = useState(false)

  const recargar = useCallback(async () => {
    try {
      setMisReservas(await portalFetch('/mis-reservas', token))
    } catch (e) {
      setError((e as Error).message)
    }
  }, [token])

  useEffect(() => {
    Promise.all([
      portalFetch('/medicos', token).then(setMedicos),
      recargar(),
    ]).catch((e) => setError((e as Error).message))
  }, [token, recargar])

  useEffect(() => {
    if (!medicoId || !fecha) {
      setSlots(null)
      return
    }
    setLoading(true)
    portalFetch(`/disponibilidad?medico_id=${encodeURIComponent(medicoId)}&fecha=${fecha}`, token)
      .then((d) => {
        setSlots(d.slots ?? [])
        setSlotSel('')
      })
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false))
  }, [medicoId, fecha, token])

  async function reservar() {
    if (!medicoId || !slotSel) return
    setError(null); setMsg(null)
    try {
      await portalFetch('/reservar', token, { medico_id: medicoId, fecha_hora: slotSel, motivo: motivo || undefined })
      setMsg('Consulta reservada con éxito. Te enviaremos recordatorios.')
      setSlots(null); setSlotSel(''); setMotivo('')
      await recargar()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <h3 className="font-semibold text-slate-800">Reservar una consulta</h3>
        <p className="mt-1 text-sm text-slate-500">Escoge un médico, una fecha y un horario libre.</p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">Médico</span>
            <select
              value={medicoId}
              onChange={(e) => setMedicoId(e.target.value)}
              className={inputCls}
            >
              <option value="">Selecciona…</option>
              {medicos.map((m) => (
                <option key={m.id} value={m.id}>{m.nombre_completo} · {m.especialidad ?? 'General'}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">Fecha</span>
            <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className={inputCls} />
          </label>
        </div>

        {loading && <p className="mt-3 text-sm text-slate-500">Consultando disponibilidad…</p>}

        {slots && slots.length === 0 && !loading && (
          <p className="mt-3 text-sm text-slate-500">No hay horarios disponibles para esta fecha.</p>
        )}

        {slots && slots.length > 0 && (
          <div className="mt-4">
            <p className="mb-2 text-sm font-medium text-slate-700">Horarios libres</p>
            <div className="flex flex-wrap gap-2">
              {slots.filter((s) => !s.ocupado).map((s) => {
                const label = new Date(s.hora).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                return (
                  <button
                    key={s.hora}
                    onClick={() => setSlotSel(s.hora)}
                    className={`rounded-lg border px-3 py-2 text-sm font-medium transition ${slotSel === s.hora ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-slate-200 text-slate-700 hover:bg-slate-50'}`}
                  >
                    {label}
                  </button>
                )
              })}
            </div>

            <label className="mt-4 block">
              <span className="mb-1 block text-sm font-medium text-slate-700">Motivo (opcional)</span>
              <input value={motivo} onChange={(e) => setMotivo(e.target.value)} className={inputCls} placeholder="Motivo de la consulta" />
            </label>

            <button
              onClick={reservar}
              disabled={!slotSel}
              className={`mt-3 rounded-lg px-4 py-2 text-sm font-semibold text-white transition disabled:opacity-50 ${slotSel ? 'bg-brand-600 hover:bg-brand-700' : 'bg-slate-300'}`}
            >
              Reservar
            </button>
          </div>
        )}

        {msg && <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{msg}</p>}
        {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <h3 className="font-semibold text-slate-800">Mis próximas citas</h3>
        {misReservas === null ? (
          <p className="mt-2 text-sm text-slate-500">Cargando…</p>
        ) : misReservas.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">No tienes citas programadas.</p>
        ) : (
          <div className="mt-3 space-y-2">
            {misReservas.map((r) => (
              <ReservaCard key={r.id} r={r} token={token} onChanged={recargar} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function ReservaCard({ r, token, onChanged }: { r: Reserva; token: string; onChanged: () => Promise<void> }) {
  const [msg, setMsg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [fechaHora, setFechaHora] = useState(() => new Date(r.fecha_hora).toISOString().slice(0, 16))

  async function cancelar() {
    setError(null); setMsg(null)
    try {
      await portalFetch(`/reservas/${r.id}/cancelar`, token, {})
      setMsg('Cita cancelada.')
      onChanged()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  async function reprogramar() {
    setError(null); setMsg(null)
    try {
      await portalFetch(`/reservas/${r.id}/reprogramar`, token, { fecha_hora: new Date(fechaHora).toISOString() }, 'PATCH')
      setMsg('Cita reprogramada.')
      onChanged()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 p-3 text-sm">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-medium text-slate-800">{r.medico?.nombre_completo ?? 'Médico'} · {r.medico?.especialidad ?? 'General'}</p>
          <p className="text-xs text-slate-500">{new Date(r.fecha_hora).toLocaleString()}</p>
          {r.motivo && r.motivo !== 'Reserva online' && <p className="mt-1 text-xs text-slate-600">{r.motivo}</p>}
        </div>
        <button onClick={cancelar} className="shrink-0 rounded-lg bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-100">
          Cancelar
        </button>
      </div>

      <div className="mt-3 flex flex-wrap items-end gap-2">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-500">Reprogramar para</span>
          <input type="datetime-local" value={fechaHora} onChange={(e) => setFechaHora(e.target.value)} className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm outline-none focus:border-brand-500" />
        </label>
        <button onClick={reprogramar} className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-200">
          Reprogramar
        </button>
      </div>

      {msg && <p className="mt-2 rounded-lg bg-emerald-50 px-3 py-1.5 text-xs text-emerald-700">{msg}</p>}
      {error && <p className="mt-2 rounded-lg bg-red-50 px-3 py-1.5 text-xs text-red-700">{error}</p>}
    </div>
  )
}

const inputCls = 'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100'