import { lazy, Suspense, useCallback, useEffect, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { descargarResultadoPdf, resumenDeResultado } from '../../lib/pdf'
import { headerTextColor, useConfigStore } from '../../lib/configStore'
import PrintHeader from '../../components/ui/PrintHeader'
import TasaHeader from '../../components/TasaHeader'
import PrecioDual from '../../components/PrecioDual'
import { useTasaUsd } from '../../lib/moneda'
import { portalFetch } from './portalApi'

const Evolucion = lazy(() => import('./Evolucion'))
const CompartirModal = lazy(() => import('./CompartirModal'))
const Reservas = lazy(() => import('./Reservas'))
const MiCuestionario = lazy(() => import('./MiCuestionario'))

interface Resultado {
  resultado_id: string
  examen: string | null
  valores: Record<string, unknown> | null
  observaciones: string | null
  procesado_at: string
  pdf_path: string | null
  estado_solicitud: string | null
  alertas: { parametro: string; valor: string | null; nivel: 'alerta' | 'critico'; motivo: string }[]
}

interface Recipe {
  id: string
  fecha_emision: string
  fecha_expiracion: string
  estado: string
  detalle: { medicamento: string; dosis: string; frecuencia: string; indicaciones: string; duracion: string }[]
}

interface Consulta {
  id: string
  fecha_hora: string
  motivo: string | null
  diagnostico: string | null
}

interface Pago {
  id: string
  tipo: string
  monto: number
  monto_usd: number
  moneda: string
  metodo: string
  fecha: string
  estado: string
}

interface Pendiente {
  id: string
  fecha: string
  monto: number
}

interface CatalogoItem {
  id: string
  nombre: string
  categoria: string | null
  precio: number
  precio_bs: number | null
  tasa_usd: number | null
  interno: boolean
  duracion_min: number | null
  condiciones_previas: string | null
  tiempo_entrega: string | null
}

interface Dependiente {
  id: string
  parentesco: string
  dependientes: { id: string; cedula: string; nombre_completo: string; fecha_nacimiento: string | null } | null
}

interface PortalSession {
  token: string
  paciente: { id: string; cedula: string; nombre_completo: string }
}

const STORE_KEY = 'totalhealth-portal'

export default function PortalPage() {
  const navigate = useNavigate()
  const { razon_social, logo_url, header_color, theme, toggleTheme } = useConfigStore()
  const [session, setSession] = useState<PortalSession | null>(() => {
    try {
      return JSON.parse(sessionStorage.getItem(STORE_KEY) ?? 'null')
    } catch {
      return null
    }
  })

  const logout = useCallback(() => {
    sessionStorage.removeItem(STORE_KEY)
    setSession(null)
  }, [])

  useEffect(() => {
    if (session) sessionStorage.setItem(STORE_KEY, JSON.stringify(session))
  }, [session])

  const headerStyle = { backgroundColor: header_color, color: headerTextColor(header_color) }

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="border-b border-slate-200" style={headerStyle}>
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <button onClick={() => navigate('/')} className="flex items-center gap-2 text-lg font-bold">
            {logo_url && <img src={logo_url} alt="" className="h-7 w-7 object-contain" />}
            {razon_social}
          </button>
          <div className="flex items-center gap-3">
            <TasaHeader />
            <button
              onClick={() => navigate('/portal/turnos')}
              className="rounded-full border border-current px-3 py-1 text-sm opacity-80 hover:opacity-100"
            >
              Sala de espera
            </button>
            {session && (
              <>
                <span className="text-sm opacity-80">{session.paciente.nombre_completo}</span>
                <button onClick={logout} className="text-sm opacity-70 hover:opacity-100">Salir</button>
              </>
            )}
            <button onClick={toggleTheme} className="rounded-full border border-current px-2 py-1 text-sm" title={theme === 'dark' ? 'Modo claro' : 'Modo oscuro'}>
              {theme === 'dark' ? '☀️' : '🌙'}
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-6">
        {session ? <PortalPanel token={session.token} paciente={session.paciente} /> : <Identificacion onSuccess={setSession} />}
      </main>
    </div>
  )
}

function Identificacion({ onSuccess }: { onSuccess: (s: PortalSession) => void }) {
  const [cedula, setCedula] = useState('')
  const [codigo, setCodigo] = useState('')
  const [enviado, setEnviado] = useState(false)
  const [devCodigo, setDevCodigo] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function enviarCodigo() {
    setLoading(true)
    setError(null)
    try {
      const r = await portalFetch('/generar-codigo', undefined, { cedula })
      setEnviado(true)
      setDevCodigo(r.dev_codigo ?? null)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  async function verificar() {
    setLoading(true)
    setError(null)
    try {
      const r = await portalFetch('/verificar', undefined, { cedula, codigo })
      onSuccess({ token: r.token, paciente: r.paciente })
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="rounded-2xl bg-white p-6 shadow-sm sm:p-8">
      <h1 className="text-xl font-bold text-slate-800">Consulta tus resultados</h1>
      <p className="mt-1 text-sm text-slate-500">
        Ingresa tu documento de identidad (V, E, P, J o C). Te enviaremos un código de verificación a tu teléfono registrado.
      </p>

      <div className="mt-6 space-y-4">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-700">Documento de identidad</span>
          <input
            value={cedula}
            onChange={(e) => setCedula(e.target.value)}
            placeholder="V-00000000"
            disabled={enviado}
            className={inputCls}
          />
        </label>

        {!enviado ? (
          <button onClick={enviarCodigo} disabled={loading || !cedula.trim()} className={btnCls}>
            {loading ? 'Enviando…' : 'Enviar código de verificación'}
          </button>
        ) : (
          <>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">Código de verificación</span>
              <input
                value={codigo}
                onChange={(e) => setCodigo(e.target.value)}
                inputMode="numeric"
                maxLength={6}
                placeholder="000000"
                className={inputCls}
              />
            </label>
            {devCodigo && (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
                Modo demo: tu código es <strong>{devCodigo}</strong> (en producción llega por SMS).
              </p>
            )}
            <button onClick={verificar} disabled={loading || codigo.length !== 6} className={btnCls}>
              {loading ? 'Verificando…' : 'Verificar e ingresar'}
            </button>
            <button onClick={() => setEnviado(false)} className="text-sm text-slate-400 hover:text-slate-600">
              ← Cambiar cédula
            </button>
          </>
        )}

        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      </div>
    </div>
  )
}

function PortalPanel({ token, paciente }: { token: string; paciente: PortalSession['paciente'] }) {
  const [tab, setTab] = useState<'resultados' | 'evolucion' | 'pagos' | 'catalogo' | 'recipes' | 'consultas' | 'familia' | 'reservas' | 'cuestionario'>('resultados')
  const [resultados, setResultados] = useState<Resultado[] | null>(null)
  const [recipes, setRecipes] = useState<Recipe[] | null>(null)
  const [consultas, setConsultas] = useState<Consulta[] | null>(null)
  const [pagos, setPagos] = useState<{ pagos: Pago[]; pendientes: Pendiente[]; total_pagado: number; total_pendiente: number } | null>(null)
  const [catalogo, setCatalogo] = useState<CatalogoItem[] | null>(null)
  const [dependientes, setDependientes] = useState<Dependiente[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const tasaUsd = useTasaUsd()

  const cargar = useCallback(
    async (t: 'resultados' | 'evolucion' | 'pagos' | 'catalogo' | 'recipes' | 'consultas' | 'familia' | 'reservas' | 'cuestionario') => {
      setError(null)
      try {
        if (t === 'resultados' || t === 'evolucion') setResultados(await portalFetch('/mis-resultados', token))
        if (t === 'recipes') setRecipes(await portalFetch('/mis-recipes', token))
        if (t === 'consultas') setConsultas(await portalFetch('/mis-consultas', token))
        if (t === 'pagos') setPagos(await portalFetch('/mis-pagos', token))
        if (t === 'catalogo') setCatalogo(await portalFetch('/catalogo'))
        if (t === 'familia') setDependientes(await portalFetch('/mis-dependientes', token))
      } catch (e) {
        setError((e as Error).message)
      }
    },
    [token],
  )

  useEffect(() => {
    cargar(tab)
  }, [tab, cargar])

  const { razon_social, rif, direccion, telefono, logo_url } = useConfigStore()
  const branding = { razon_social, rif, direccion, telefono, logo_url }
  const [compartir, setCompartir] = useState<{ nombre: string; url: string } | null>(null)
  const [shareLoading, setShareLoading] = useState(false)

  async function compartirResultado(r: Resultado) {
    setShareLoading(true)
    try {
      const { url } = await portalFetch('/compartir-resultado', token, { resultado_id: r.resultado_id })
      setCompartir({ nombre: r.examen ?? 'Examen', url: `${window.location.origin}${url}` })
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setShareLoading(false)
    }
  }

  return (
    <div>
      <PrintHeader />
      <div className="flex flex-wrap gap-2">
        <Tab active={tab === 'resultados'} onClick={() => setTab('resultados')}>Resultados</Tab>
        <Tab active={tab === 'evolucion'} onClick={() => setTab('evolucion')}>Evolución</Tab>
        <Tab active={tab === 'pagos'} onClick={() => setTab('pagos')}>Pagos</Tab>
        <Tab active={tab === 'catalogo'} onClick={() => setTab('catalogo')}>Exámenes</Tab>
        <Tab active={tab === 'recipes'} onClick={() => setTab('recipes')}>Récipes</Tab>
        <Tab active={tab === 'consultas'} onClick={() => setTab('consultas')}>Consultas</Tab>
        <Tab active={tab === 'familia'} onClick={() => setTab('familia')}>Familia</Tab>
        <Tab active={tab === 'reservas'} onClick={() => setTab('reservas')}>Reservas</Tab>
        <Tab active={tab === 'cuestionario'} onClick={() => setTab('cuestionario')}>Mi historial</Tab>
      </div>

      <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
        <p className="text-sm">
          <span className="font-medium text-slate-800">Cédula</span>{' '}
          <span className="text-slate-600">{paciente.cedula}</span>
        </p>
        <div className="my-2 h-px w-full bg-slate-200" aria-hidden="true" />
        <p className="text-sm">
          <span className="font-medium text-slate-800">Nombre</span>{' '}
          <span className="text-slate-600">{paciente.nombre_completo}</span>
        </p>
      </div>

      {error && <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div className="mt-4 space-y-3">
        {tab === 'resultados' &&
          (resultados === null ? <Cargando /> : resultados.length === 0 ? <Vacio /> : (
            resultados.map((r) => {
              const fecha = r.procesado_at ? new Date(r.procesado_at).toLocaleDateString() : ''
              const resumen = resumenDeResultado({
                paciente: { cedula: paciente.cedula, nombre_completo: paciente.nombre_completo },
                examen: r.examen ?? 'Examen',
                fecha,
                valores: r.valores,
                observaciones: r.observaciones,
                branding,
              })
              return (
                <div key={r.resultado_id} className="rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div className="text-xs font-medium text-slate-400 md:w-24">{fecha}</div>
                    <div className="font-semibold text-slate-800 md:w-52">{r.examen ?? 'Examen'}</div>
                    <p className="flex-1 text-sm leading-snug text-slate-600">{resumen}</p>
                    <div className="flex shrink-0 gap-2">
                      <button
                        onClick={() => compartirResultado(r)}
                        disabled={shareLoading}
                        className="shrink-0 rounded-lg border border-brand-600 px-4 py-2 text-xs font-semibold text-brand-700 transition hover:bg-brand-50 disabled:opacity-50"
                      >
                        Compartir QR
                      </button>
                      <button
                        onClick={() =>
                          descargarResultadoPdf({
                            paciente: { cedula: paciente.cedula, nombre_completo: paciente.nombre_completo },
                            examen: r.examen ?? 'Examen',
                            fecha,
                            valores: r.valores,
                            observaciones: r.observaciones,
                            branding,
                          })
                        }
                        className="shrink-0 rounded-lg bg-brand-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-brand-700"
                      >
                        Descargar PDF
                      </button>
                    </div>
                  </div>
                  {r.alertas?.length > 0 && (
                    <div className={`mt-3 rounded-xl border p-3 ${r.alertas.some((a) => a.nivel === 'critico') ? 'border-red-300 bg-red-50' : 'border-amber-300 bg-amber-50'}`}>
                      <p className="text-sm font-semibold text-slate-800">Valor fuera de rango</p>
                      <ul className="mt-1.5 space-y-1">
                        {r.alertas.map((a, i) => (
                          <li key={i} className="flex items-start gap-2 text-sm">
                            <span className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${a.nivel === 'critico' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                              {a.nivel === 'critico' ? 'CRÍTICO' : 'ALERTA'}
                            </span>
                            <span className="text-slate-700">
                              {a.parametro} {a.valor ?? ''} — {a.motivo}
                            </span>
                          </li>
                        ))}
                      </ul>
                      <p className="mt-2 text-xs text-slate-500">Consulta con tu médico sobre estos valores.</p>
                    </div>
                  )}
                </div>
              )
            })
          ))}

        {tab === 'recipes' &&
          (recipes === null ? <Cargando /> : recipes.length === 0 ? <Vacio /> : (
            recipes.map((r) => (
              <div key={r.id} className="rounded-2xl border border-slate-200 bg-white p-4 print:border-0">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-slate-800">Récipes</h3>
                  <button onClick={() => window.print()} className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700">Imprimir</button>
                </div>
                <p className="mt-1 text-xs text-slate-400">
                  Emitido {new Date(r.fecha_emision).toLocaleDateString()} · Vence {new Date(r.fecha_expiracion).toLocaleDateString()}
                </p>
                <ul className="mt-3 space-y-2">
                  {r.detalle.map((d, i) => (
                    <li key={i} className="rounded-lg border border-slate-200 p-3 text-sm">
                      <p className="font-medium text-slate-800">{d.medicamento}</p>
                      <p className="text-xs text-slate-500">{[d.dosis, d.frecuencia, d.duracion].filter(Boolean).join(' · ')}</p>
                      {d.indicaciones && <p className="mt-1 text-xs text-slate-600">Indicaciones: {d.indicaciones}</p>}
                    </li>
                  ))}
                </ul>
              </div>
            ))
          ))}

        {tab === 'consultas' &&
          (consultas === null ? <Cargando /> : consultas.length === 0 ? <Vacio /> : (
            consultas.map((c) => (
              <div key={c.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                <p className="text-sm text-slate-400">{new Date(c.fecha_hora).toLocaleString()}</p>
                <p className="mt-1 font-medium text-slate-800">{c.motivo ?? 'Consulta médica'}</p>
                {c.diagnostico && <p className="mt-1 text-sm text-slate-600">{c.diagnostico}</p>}
              </div>
            ))
          ))}

        {tab === 'evolucion' &&
          (resultados === null ? <Cargando /> : resultados.length === 0 ? <Vacio /> : <Evolucion resultados={resultados} />)}

        {tab === 'pagos' &&
          (pagos === null ? <Cargando /> : (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                  <p className="text-xs font-medium text-emerald-700">Total pagado</p>
                  <p className="mt-1 text-xl font-bold text-emerald-800">
                    <PrecioDual usd={pagos.total_pagado} tasaUsd={tasaUsd} />
                  </p>
                </div>
                <div className="rounded-2xl border border-red-200 bg-red-50 p-4">
                  <p className="text-xs font-medium text-red-700">Total pendiente</p>
                  <p className="mt-1 text-xl font-bold text-red-800">
                    <PrecioDual usd={pagos.total_pendiente} tasaUsd={tasaUsd} />
                  </p>
                </div>
              </div>

              {pagos.pendientes.length > 0 && (
                <div>
                  <h3 className="mb-2 text-sm font-semibold text-slate-700">Pendientes de pago</h3>
                  {pagos.pendientes.map((p) => (
                    <div key={p.id} className="rounded-xl border border-red-200 bg-white p-3 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-slate-800">{new Date(p.fecha).toLocaleDateString()}</span>
                        <span className="font-semibold text-red-700">
                          <PrecioDual usd={p.monto} tasaUsd={tasaUsd} />
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {pagos.pagos.length > 0 ? (
                <div>
                  <h3 className="mb-2 text-sm font-semibold text-slate-700">Pagos realizados</h3>
                  {pagos.pagos.map((p) => (
                    <div key={p.id} className="rounded-xl border border-slate-200 bg-white p-3 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-600">{new Date(p.fecha).toLocaleString()} · {p.metodo}</span>
                        <span className="font-semibold text-slate-800">
                          <PrecioDual usd={p.monto_usd} tasaUsd={tasaUsd} />
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <Vacio />
              )}
            </div>
          ))}

        {tab === 'catalogo' &&
          (catalogo === null ? <Cargando /> : catalogo.length === 0 ? <Vacio /> : (
            <div className="space-y-3">
              {catalogo.map((e) => (
                <div key={e.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-semibold text-slate-800">{e.nombre}</h3>
                      <p className="text-xs text-slate-500">{e.categoria ?? 'Examen'}</p>
                    </div>
                    <span className="shrink-0 text-sm font-bold text-brand-700">
                      <PrecioDual usd={e.precio} tasaUsd={tasaUsd} bs={e.precio_bs} />
                    </span>
                  </div>
                  {e.duracion_min != null && (
                    <p className="mt-1 text-xs text-slate-500">Duración: {e.duracion_min} min</p>
                  )}
                  {e.tiempo_entrega && (
                    <p className="mt-1 text-xs text-slate-500">Entrega: {e.tiempo_entrega}</p>
                  )}
                  {e.condiciones_previas && (
                    <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                      <span className="font-semibold">Condiciones previas:</span> {e.condiciones_previas}
                    </p>
                  )}
                </div>
              ))}
            </div>
          ))}

        {tab === 'familia' &&
          (dependientes === null ? <Cargando /> : dependientes.length === 0 ? <Vacio /> : (
            <div className="space-y-3">
              <p className="text-sm text-slate-500">
                Personas vinculadas a tu cuenta de cabeza. Cada dependiente puede ser gestionado por un perfil familiar.
              </p>
              {dependientes.map((d) => {
                const dep = d.dependientes
                return (
                  <div key={d.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="font-semibold text-slate-800">{dep?.nombre_completo ?? 'Dependiente'}</h3>
                        <p className="text-xs text-slate-500">{dep?.cedula ?? ''}</p>
                      </div>
                      <span className="shrink-0 rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium capitalize text-brand-700">
                        {d.parentesco}
                      </span>
                    </div>
                    {dep?.fecha_nacimiento && (
                      <p className="mt-1 text-xs text-slate-500">Nacimiento: {new Date(dep.fecha_nacimiento).toLocaleDateString()}</p>
                    )}
                  </div>
                )
              })}
            </div>
          ))}

        {tab === 'reservas' && (
          <Suspense fallback={<Cargando />}>
            <Reservas token={token} />
          </Suspense>
        )}

        {tab === 'cuestionario' && (
          <Suspense fallback={<Cargando />}>
            <MiCuestionario token={token} />
          </Suspense>
        )}
      </div>

      {compartir && <CompartirModal nombre={compartir.nombre} url={compartir.url} onClose={() => setCompartir(null)} />}
    </div>
  )
}

function Tab({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button onClick={onClick} className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${active ? 'bg-brand-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-100'}`}>
      {children}
    </button>
  )
}

function Cargando() {
  return <p className="py-8 text-center text-sm text-slate-500">Cargando…</p>
}

function Vacio() {
  return <p className="py-8 text-center text-sm text-slate-500">Sin información para mostrar.</p>
}

const inputCls = 'w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100'
const btnCls = 'w-full rounded-lg bg-brand-600 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-50'