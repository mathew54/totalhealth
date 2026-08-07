import { useCallback, useEffect, useState } from 'react'
import CuestionarioWizard, { type ModuloCuestionario, type Respuestas } from '../cuestionario/CuestionarioWizard'

interface Definicion {
  modulos: ModuloCuestionario[]
  cierre: ModuloCuestionario
}

interface Cuest {
  id: string
  paciente_id: string
  origen: 'medico' | 'paciente'
  estado: 'borrador' | 'consolidado'
  respuestas: Respuestas
  consolidado_at: string | null
  created_at: string
}

interface Datos {
  paciente: { id: string; cedula: string; nombre_completo: string } | null
  cuestionarios: Cuest[]
}

async function fetchJSON(path: string, token: string, body?: unknown) {
  const res = await fetch(`/api/portal${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json().catch(() => null)
  if (!res.ok) throw new Error(data?.message ?? 'Error')
  return data
}

export default function MiCuestionario({ token }: { token: string }) {
  const [def, setDef] = useState<Definicion | null>(null)
  const [datos, setDatos] = useState<Datos | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [verId, setVerId] = useState<string | 'nuevo' | null>(null)

  const recargar = useCallback(async () => {
    try {
      setDatos(await fetchJSON('/mi-cuestionario', token))
    } catch (e) {
      setError((e as Error).message)
    }
  }, [token])

  useEffect(() => {
    fetchJSON('/cuestionario-definicion', token)
      .then((d) => setDef({ modulos: d.modulos, cierre: d.cierre }))
      .catch((e) => setError((e as Error).message))
    recargar()
  }, [token, recargar])

  async function guardar(respuestas: Respuestas) {
    setError(null)
    setMsg(null)
    try {
      await fetchJSON('/mi-cuestionario', token, { respuestas })
      setMsg('Cuestionario guardado. El personal médico lo revisará en tu próxima consulta.')
      setVerId(null)
      recargar()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  if (!def || !datos) return <p className="py-8 text-center text-sm text-slate-500">Cargando…</p>

  const activo = typeof verId === 'string' && verId !== 'nuevo' ? datos.cuestionarios.find((c) => c.id === verId) : undefined
  const esNuevo = verId === 'nuevo'
  const consolidado = activo?.estado === 'consolidado'

  if (verId && (esNuevo || activo)) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-800">
            {esNuevo ? 'Cuestionario de historial médico' : consolidado ? 'Mi historial (consolidado)' : 'Editar cuestionario'}
          </h3>
          <button onClick={() => setVerId(null)} className="text-sm font-medium text-brand-700 hover:underline">
            ← Volver
          </button>
        </div>
        <p className="text-sm text-slate-500">
          Responde con honestidad y escoge <span className="font-medium">Sí</span> solo cuando aplique. Las
          observaciones finales son obligatorias para cerrar tu historial.
        </p>
        {msg && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{msg}</p>}
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <div
          key={activo?.id ?? 'nuevo'}
          className="rounded-2xl border border-slate-200 bg-white p-5"
        >
          <CuestionarioWizard
            modulos={def.modulos}
            cierre={def.cierre}
            inicial={activo?.respuestas}
            modo={consolidado ? 'leer' : 'editar'}
            esConsolidado={consolidado}
            onGuardar={esNuevo || !consolidado ? guardar : undefined}
          />
        </div>
      </div>
    )
  }

  const borrador = datos.cuestionarios.find((c) => c.estado === 'borrador')

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-semibold text-slate-800">Mi historial médico</h3>
            <p className="mt-1 text-sm text-slate-500">
              Completa tu anamnesis. Si ya existe un borrador puedes editarlo; lo consolidará tu médico en la consulta.
            </p>
          </div>
          <button
            onClick={() => setVerId('nuevo')}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
          >
            {borrador ? 'Editar borrador' : 'Responder cuestionario'}
          </button>
        </div>
      </div>

      {msg && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{msg}</p>}
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {datos.cuestionarios.length === 0 ? (
        <p className="py-8 text-center text-sm text-slate-500">
          Aún no has llenado tu cuestionario de historial médico.
        </p>
      ) : (
        <div className="space-y-3">
          {datos.cuestionarios.map((c) => (
            <div key={c.id} className="rounded-2xl border border-slate-200 bg-white p-4 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-medium text-slate-800">
                    {new Date(c.created_at).toLocaleDateString()} · <span className="capitalize">{c.origen}</span>
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {c.estado === 'consolidado' ? 'Consolidado por tu médico' : 'Borrador pendiente de revisión'}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <EstadoPill estado={c.estado} />
                  <button onClick={() => setVerId(c.id)} className="rounded-lg border border-brand-600 px-3 py-1.5 text-xs font-semibold text-brand-700 hover:bg-brand-50">
                    {c.estado === 'consolidado' ? 'Ver' : 'Editar'}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function EstadoPill({ estado }: { estado: Cuest['estado'] }) {
  const map: Record<string, string> = {
    borrador: 'bg-amber-100 text-amber-700',
    consolidado: 'bg-brand-100 text-brand-700',
  }
  return <span className={`rounded-full px-2 py-0.5 text-xs font-semibold capitalize ${map[estado] ?? 'bg-slate-100 text-slate-600'}`}>{estado}</span>
}