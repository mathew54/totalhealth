import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useRef, useState, type FormEvent, type ReactNode } from 'react'
import { api, getApiError } from '../../lib/api'
import { headerTextColor, useConfigStore } from '../../lib/configStore'
import { LOGO_ESTANDAR, procesarLogo } from '../../lib/logo'
import { WhatsAppConfig } from './WhatsAppConfig'
import type { Profile } from '../../lib/rbac'
import PrecioDual from '../../components/PrecioDual'
import PhoneInput from '../../components/ui/PhoneInput'
import { PasswordInput } from '../../components/ui/PasswordInput'
import { formatearTelefono } from '../../lib/phone'
import { useTasaUsd, usdABs, formatearBs } from '../../lib/moneda'

type Tab = 'personal' | 'examenes' | 'reporteria' | 'auditoria' | 'config' | 'umbrales' | 'integracion' | 'tasas'

const TABS: { id: Tab; label: string }[] = [
  { id: 'personal', label: 'Personal' },
  { id: 'examenes', label: 'Exámenes' },
  { id: 'umbrales', label: 'Umbrales' },
  { id: 'integracion', label: 'Integración' },
  { id: 'tasas', label: 'Tasas de cambio' },
  { id: 'reporteria', label: 'Reportería' },
  { id: 'auditoria', label: 'Auditoría' },
  { id: 'config', label: 'Configuración' },
]

export default function AdminPage() {
  const [tab, setTab] = useState<Tab>('personal')

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-800">Administración</h1>
        <p className="text-sm text-slate-500">Personal, catálogo, finanzas y auditoría</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${tab === t.id ? 'bg-slate-800 text-white' : 'bg-white text-slate-600 hover:bg-slate-100'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'personal' && <PersonalTab />}
      {tab === 'examenes' && <ExamenesTab />}
      {tab === 'umbrales' && <UmbralesTab />}
      {tab === 'integracion' && <IntegracionTab />}
      {tab === 'tasas' && <TasasTab />}
      {tab === 'reporteria' && <ReporteriaTab />}
      {tab === 'auditoria' && <AuditoriaTab />}
      {tab === 'config' && <ConfigTab />}
    </div>
  )
}

const inputCls = 'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100'

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block"><span className="mb-1 block text-sm font-medium text-slate-700">{label}</span>{children}</label>
  )
}

function Errtag({ children }: { children: string | null }) {
  return children ? <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{children}</p> : null
}

// ---------- Personal ----------
const ROL_LABELS: Record<string, string> = {
  super_root: 'Super root',
  admin: 'Administrador',
  medico: 'Médico',
  laboratorio: 'Laboratorio',
  secretaria: 'Secretaría',
}

function PersonalTab() {
  const queryClient = useQueryClient()
  const [error, setError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [rolesSel, setRolesSel] = useState<string[]>([])
  const [especSel, setEspecSel] = useState<string[]>([])

  const { data: staff = [], isLoading } = useQuery<Profile[]>({
    queryKey: ['staff'],
    queryFn: async () => (await api.get('/admin/staff')).data,
  })

  const { data: catalogo } = useQuery<{ categorias: { id: string; nombre: string }[]; especialidades: { id: string; nombre: string; categoria: string | null }[] }>({
    queryKey: ['historial', 'especialidades'],
    queryFn: async () => (await api.get<{ categorias: { id: string; nombre: string }[]; especialidades: { id: string; nombre: string; categoria: string | null }[] }>('/historial/especialidades')).data,
  })

  const createStaff = useMutation({
    mutationFn: (p: unknown) => api.post('/admin/staff', p),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staff'] })
      setShowForm(false)
      setRolesSel([])
      setEspecSel([])
      setError(null)
    },
    onError: (e) => setError(getApiError(e)),
  })

  const toggleActivo = useMutation({
    mutationFn: ({ id, activo }: { id: string; activo: boolean }) => api.patch(`/admin/staff/${id}`, { activo }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['staff'] }),
  })

  function handleCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    if (rolesSel.length === 0) {
      setError('Selecciona al menos un rol')
      return
    }
    createStaff.mutate({
      email: fd.get('email'),
      password: fd.get('password'),
      roles: rolesSel,
      nombre_completo: fd.get('nombre_completo'),
      cedula: fd.get('cedula'),
      telefono: fd.get('telefono') || undefined,
      country_code: fd.get('telefono_country_code') || undefined,
      local_number: fd.get('telefono_local_number') || undefined,
      especialidades: especSel,
      colegiatura: fd.get('colegiatura') || undefined,
      firma_digital: fd.get('firma_digital') || undefined,
    })
  }

  function toggleRol(r: string) {
    setRolesSel((prev) => (prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r]))
  }
  function toggleEspec(id: string) {
    setEspecSel((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  const esMedico = rolesSel.includes('medico')

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button onClick={() => setShowForm((v) => !v)} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700">
          {showForm ? 'Cancelar' : '+ Nuevo personal'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-5 sm:grid-cols-2">
          <Field label="Nombre completo *"><input name="nombre_completo" required minLength={3} className={inputCls} /></Field>
          <Field label="Roles (uno o varios) *">
            <div className="flex flex-wrap gap-2">
              {['medico', 'laboratorio', 'secretaria'].map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => toggleRol(r)}
                  className={`rounded-lg border px-2.5 py-1.5 text-sm ${
                    rolesSel.includes(r)
                      ? 'border-brand-500 bg-brand-50 font-medium text-brand-700'
                      : 'border-slate-200 text-slate-700 hover:border-brand-400'
                  }`}
                >
                  {ROL_LABELS[r]}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Correo"><input name="email" type="email" required className={inputCls} /></Field>
          <Field label="Contraseña (mín. 8)"><PasswordInput name="password" required minLength={8} className="w-full rounded-lg border border-slate-300 py-2 pl-3 pr-10 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100" /></Field>
          <Field label="Documento de identidad (V/E/J/P/C)"><input name="cedula" className={inputCls} placeholder="V-12345678, P-…, J-…" /></Field>
          <Field label="Teléfono"><PhoneInput name="telefono" /></Field>
          {esMedico && (
            <>
              <div className="sm:col-span-2">
                <Field label={`Especialidades del catálogo (${especSel.length} seleccionadas) — la primera será la activa`}>
                  <div className="grid max-h-48 gap-1.5 overflow-y-auto rounded-lg border border-slate-200 p-3 sm:grid-cols-2">
                    {(catalogo?.especialidades ?? []).map((esp) => (
                      <label key={esp.id} className="flex items-center gap-1.5 text-sm text-slate-700">
                        <input
                          type="checkbox"
                          checked={especSel.includes(esp.id)}
                          onChange={() => toggleEspec(esp.id)}
                          className="accent-brand-600"
                        />
                        {esp.nombre}
                        <span className="text-[10px] uppercase text-slate-400">{esp.categoria ?? ''}</span>
                      </label>
                    ))}
                  </div>
                </Field>
              </div>
              <Field label="Colegiatura / Licencia"><input name="colegiatura" className={inputCls} placeholder="Ej. MPPS 12345" /></Field>
              <Field label="Firma / sello digital (hash o imagen)"><input name="firma_digital" className={inputCls} placeholder="sha256:… o URL de sello" /></Field>
            </>
          )}
          <div className="sm:col-span-2">
            <Errtag>{error}</Errtag>
            <button type="submit" disabled={createStaff.isPending} className="mt-3 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50">
              {createStaff.isPending ? 'Creando…' : 'Crear'}
            </button>
          </div>
        </form>
      )}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        {isLoading ? <p className="p-6 text-sm text-slate-500">Cargando…</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr><th className="px-4 py-3">Nombre</th><th className="px-4 py-3">Rol</th><th className="px-4 py-3">Categoría</th><th className="px-4 py-3">Cédula</th><th className="px-4 py-3">Estado</th><th className="px-4 py-3">Acción</th></tr>
              </thead>
<tbody className="divide-y divide-slate-100">
                {staff.filter((p) => p.role !== 'super_root').map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-800">{p.nombre_completo}</td>
                    <td className="px-4 py-3 text-slate-500">
                      <div className="flex flex-wrap gap-1">
                        {(p.roles?.length ? p.roles : [p.role]).map((r) => (
                          <span key={r} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{ROL_LABELS[r] ?? r}</span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      {catalogo?.categorias.find((c) => c.id === p.categoria_medica)?.nombre ?? '—'}
                      {(p.especialidades ?? []).length > 0 ? (
                        <div className="mt-0.5 flex flex-wrap gap-1">
                          {(p.especialidades ?? []).map((id) => (
                            <span key={id} className="rounded-full bg-brand-50 px-2 py-0.5 text-[10px] text-brand-700">
                              {catalogo?.especialidades.find((e) => e.id === id)?.nombre ?? id}
                              {id === p.especialidad_activa ? ' · activa' : ''}
                            </span>
                          ))}
                        </div>
                      ) : p.especialidad ? (
                        <span className="block text-slate-400">{p.especialidad}</span>
                      ) : null}
                      {p.colegiatura ? <span className="mt-1 block text-[10px] text-slate-400">Colegiatura: {p.colegiatura}</span> : null}
                    </td>
                    <td className="px-4 py-3 text-slate-500">{p.cedula ?? '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${p.activo ? 'bg-green-100 text-green-700' : 'bg-slate-200 text-slate-600'}`}>
                        {p.activo ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <button onClick={() => toggleActivo.mutate({ id: p.id, activo: !p.activo })} className="text-xs font-medium text-brand-600 hover:text-brand-700">
                        {p.activo ? 'Desactivar' : 'Activar'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

// ---------- Exámenes ----------
interface Examen { id: string; nombre: string; categoria: string | null; precio: number; activo: boolean }

function ExamenesTab() {
  const queryClient = useQueryClient()
  const [error, setError] = useState<string | null>(null)
  const tasaUsd = useTasaUsd()

  const { data: examenes = [], isLoading } = useQuery<Examen[]>({
    queryKey: ['examenes', 'admin'],
    queryFn: async () => (await api.get('/admin/examenes')).data, // incluye inactivos
  })

  const add = useMutation({
    mutationFn: (p: unknown) => api.post('/admin/examenes', p),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['examenes'] }),
    onError: (e) => setError(getApiError(e)),
  })
  const update = useMutation({
    mutationFn: ({ id, p }: { id: string; p: unknown }) => api.put(`/admin/examenes/${id}`, p),
    onError: (e) => setError(getApiError(e)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['examenes'] })
      queryClient.invalidateQueries({ queryKey: ['solicitudes'] })
    },
  })

  function handleAdd(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    add.mutate({ nombre: fd.get('nombre'), categoria: fd.get('categoria'), precio: Number(fd.get('precio') || 0) })
    e.currentTarget.reset()
  }

  return (
    <div className="space-y-4">
      <form onSubmit={handleAdd} className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-5 sm:grid-cols-4">
        <Field label="Nombre *"><input name="nombre" required className={inputCls} /></Field>
        <Field label="Categoría"><input name="categoria" className={inputCls} /></Field>
        <Field label="Precio (USD) *"><input name="precio" type="number" min={0} step="0.01" defaultValue={0} className={inputCls} /></Field>
        <div className="flex items-end">
          <button type="submit" disabled={add.isPending} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50">Agregar</button>
        </div>
      </form>

      <Errtag>{error}</Errtag>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        {isLoading ? <p className="p-6 text-sm text-slate-500">Cargando…</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr><th className="px-4 py-3">Examen</th><th className="px-4 py-3">Categoría</th><th className="px-4 py-3">Precio</th><th className="px-4 py-3">Estado</th><th className="px-4 py-3"></th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(examenes || []).map((ex) => (
                  <tr key={ex.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-800">{ex.nombre}</td>
                    <td className="px-4 py-3 text-slate-500">{ex.categoria ?? '—'}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-0.5">
                        <input type="number" defaultValue={ex.precio} onBlur={(e) => update.mutate({ id: ex.id, p: { precio: Number(e.target.value) } })} className="w-24 rounded border border-slate-300 px-2 py-1" />
                        <span className="text-xs text-slate-400">{formatearBs(usdABs(ex.precio, tasaUsd))}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${ex.activo ? 'bg-green-100 text-green-700' : 'bg-slate-200 text-slate-600'}`}>{ex.activo ? 'Activo' : 'Inactivo'}</span>
                    </td>
                    <td className="px-4 py-3">
                      <button onClick={() => update.mutate({ id: ex.id, p: { activo: !ex.activo } })} className="text-xs font-medium text-brand-600 hover:text-brand-700">
                        {ex.activo ? 'Desactivar' : 'Activar'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

// ---------- Umbrales clínicos ----------
interface Umbral {
  id: string
  examen_id: string
  parametro: string
  nombre: string
  unidad: string | null
  normal_min: number | null
  normal_max: number | null
  critico_min: number | null
  critico_max: number | null
  activo: boolean
}

function UmbralesTab() {
  const queryClient = useQueryClient()
  const [error, setError] = useState<string | null>(null)
  const [examenId, setExamenId] = useState('')

  const { data: examenes = [] } = useQuery<Examen[]>({
    queryKey: ['examenes', 'activos'],
    queryFn: async () => (await api.get('/examenes')).data,
  })

  const { data: umbrales = [], isLoading } = useQuery<Umbral[]>({
    queryKey: ['umbrales', examenId],
    queryFn: async () => (await api.get(`/alertas/parametros${examenId ? `?examen_id=${examenId}` : ''}`)).data,
  })

  const add = useMutation({
    mutationFn: (p: unknown) => api.post('/alertas/parametros', p),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['umbrales'] }),
    onError: (e) => setError(getApiError(e)),
  })
  const update = useMutation({
    mutationFn: ({ id, p }: { id: string; p: unknown }) => api.patch(`/alertas/parametros/${id}`, p),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['umbrales'] }),
    onError: (e) => setError(getApiError(e)),
  })
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/alertas/parametros/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['umbrales'] }),
    onError: (e) => setError(getApiError(e)),
  })

  function handleAdd(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!examenId) return
    const fd = new FormData(e.currentTarget)
    add.mutate({
      examen_id: examenId,
      parametro: fd.get('parametro'),
      nombre: fd.get('nombre'),
      unidad: fd.get('unidad') || null,
      normal_min: numero(fd.get('normal_min')),
      normal_max: numero(fd.get('normal_max')),
      critico_min: numero(fd.get('critico_min')),
      critico_max: numero(fd.get('critico_max')),
    })
    e.currentTarget.reset()
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <Field label="Examen">
          <select value={examenId} onChange={(e) => setExamenId(e.target.value)} className={inputCls}>
            <option value="">Selecciona un examen…</option>
            {examenes.map((ex) => (
              <option key={ex.id} value={ex.id}>{ex.nombre}</option>
            ))}
          </select>
        </Field>
        <p className="mt-2 text-xs text-slate-500">
          Define rango de referencia y niveles críticos por parámetro. Al cargar un resultado, los valores fuera de rango generan una alerta clínica.
        </p>
      </div>

      {examenId && (
        <form onSubmit={handleAdd} className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-5 md:grid-cols-6">
          <Field label="Clave (json) *"><input name="parametro" required placeholder="glicemia" className={inputCls} /></Field>
          <Field label="Nombre *"><input name="nombre" required placeholder="Glicemia" className={inputCls} /></Field>
          <Field label="Unidad"><input name="unidad" placeholder="mg/dL" className={inputCls} /></Field>
          <Field label="Normal mín"><input name="normal_min" type="number" step="any" className={inputCls} /></Field>
          <Field label="Normal máx"><input name="normal_max" type="number" step="any" className={inputCls} /></Field>
          <Field label="Crítico mín / máx"><div className="flex gap-1"><input name="critico_min" type="number" step="any" className={inputCls} /><input name="critico_max" type="number" step="any" className={inputCls} /></div></Field>
          <div className="md:col-span-6">
            <button type="submit" disabled={add.isPending} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50">Agregar parámetro</button>
          </div>
        </form>
      )}

      <Errtag>{error}</Errtag>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        {isLoading ? <p className="p-6 text-sm text-slate-500">Cargando…</p> : !examenId ? (
          <p className="p-6 text-sm text-slate-500">Selecciona un examen para gestionar sus umbrales.</p>
        ) : umbrales.length === 0 ? (
          <p className="p-6 text-sm text-slate-500">Sin umbrales para este examen.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr><th className="px-4 py-3">Parámetro</th><th className="px-4 py-3">Unidad</th><th className="px-4 py-3">Rango normal</th><th className="px-4 py-3">Crítico</th><th className="px-4 py-3">Estado</th><th className="px-4 py-3"></th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {umbrales.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-800">{u.nombre}</p>
                      <p className="text-xs text-slate-400">clave: {u.parametro}</p>
                    </td>
                    <td className="px-4 py-3 text-slate-500">{u.unidad ?? '—'}</td>
                    <td className="px-4 py-3 text-slate-600">{rango(u.normal_min, u.normal_max)}</td>
                    <td className="px-4 py-3 text-slate-600">{rango(u.critico_min, u.critico_max)}</td>
                    <td className="px-4 py-3">
                      <button onClick={() => update.mutate({ id: u.id, p: { activo: !u.activo } })} className={`rounded-full px-2 py-0.5 text-xs font-medium ${u.activo ? 'bg-green-100 text-green-700' : 'bg-slate-200 text-slate-600'}`}>
                        {u.activo ? 'Activo' : 'Inactivo'}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <button onClick={() => remove.mutate(u.id)} className="text-xs font-medium text-red-600 hover:text-red-700">Eliminar</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

function numero(v: FormDataEntryValue | null): number | null {
  if (!v) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function rango(min: number | null, max: number | null): string {
  if (min != null && max != null) return `${min} – ${max}`
  if (min != null) return `> ${min}`
  if (max != null) return `< ${max}`
  return '—'
}

// ---------- Integración LIS/HIS y LOINC ----------
interface IntegracionItem {
  id: string
  nombre: string
  categoria: string | null
  codigo_loinc: string | null
  codigo_externo: string | null
  fecha_mapeo: string | null
  mapeado: boolean
  sugerencia_loinc: string | null
}

function IntegracionTab() {
  const queryClient = useQueryClient()
  const [error, setError] = useState<string | null>(null)

  const { data, isLoading } = useQuery<{ total: number; mapeados: number; pendientes: number; examenes: IntegracionItem[] }>({
    queryKey: ['integracion', 'loinc'],
    queryFn: async () => (await api.get('/admin/integracion/loinc')).data,
  })

  const adoptar = useMutation({
    mutationFn: ({ id, loinc, ext }: { id: string; loinc: string | null; ext: string | null }) =>
      api.post('/admin/integracion/loinc/adoptar', { examen_id: id, codigo_loinc: loinc, codigo_externo: ext }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['integracion'] })
      setError(null)
    },
    onError: (e) => setError(getApiError(e)),
  })

  const pendientes = data?.examenes.filter((e) => !e.mapeado) ?? []

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5">
        <div>
          <p className="text-sm text-slate-500">Catálogo de exámenes</p>
          <p className="text-2xl font-bold text-slate-800">{data?.total ?? 0}</p>
        </div>
        <div>
          <p className="text-sm text-slate-500">Mapeados LOINC</p>
          <p className="text-2xl font-bold text-green-700">{data?.mapeados ?? 0}</p>
        </div>
        <div>
          <p className="text-sm text-slate-500">Pendientes de mapeo</p>
          <p className="text-2xl font-bold text-amber-600">{data?.pendientes ?? 0}</p>
        </div>
        <p className="max-w-md text-xs text-slate-400">
          Integración LIS/HIS/EMR: cada examen se mapea a un código LOINC estándar y a un código externo del sistema de origen (HL7/FHIR).
        </p>
      </div>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-700">Mapeados</div>
          {isLoading ? <p className="p-4 text-sm text-slate-500">Cargando…</p> : (data?.examenes.filter((e) => e.mapeado) ?? []).length === 0 ? (
            <p className="p-4 text-sm text-slate-500">Sin exámenes mapeados.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {(data?.examenes.filter((e) => e.mapeado) ?? []).map((e) => (
                <li key={e.id} className="px-4 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-slate-800">{e.nombre}</span>
                    <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-medium text-green-700">LOINC {e.codigo_loinc}</span>
                  </div>
                  <p className="mt-0.5 text-xs text-slate-400">externo: {e.codigo_externo ?? '—'}</p>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-700">Pendientes de mapeo</div>
          {pendientes.length === 0 ? (
            <p className="p-4 text-sm text-slate-500">Todo el catálogo está mapeado.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {pendientes.map((e) => (
                <li key={e.id} className="px-4 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-slate-800">{e.nombre}</span>
                    <button
                      onClick={() => {
                        const [loinc] = (e.sugerencia_loinc ?? '').split(':')
                        adoptar.mutate({ id: e.id, loinc: loinc || null, ext: e.codigo_externo })
                      }}
                      disabled={adoptar.isPending}
                      className="rounded-lg bg-brand-600 px-3 py-1 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
                    >
                      Adoptar sugerencia
                    </button>
                  </div>
                  {e.sugerencia_loinc && <p className="mt-1 text-xs text-slate-400">Sugerida: {e.sugerencia_loinc}</p>}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}

// ---------- Reportería ----------
function ReporteriaTab() {
  const [desde, setDesde] = useState(new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10))
  const [hasta, setHasta] = useState(new Date().toISOString().slice(0, 10))

  const { data } = useQuery<{ total: number; total_bs: number | null; tasa_usd: number | null; count: number; por_tipo: Record<string, { total: number; count: number }> }>({
    queryKey: ['reporteria', desde, hasta],
    queryFn: async () => (await api.get('/admin/reporteria', { params: { desde, hasta } })).data,
  })

  const tipos = Object.entries(data?.por_tipo ?? {})

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Desde"><input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className={inputCls} /></Field>
        <Field label="Hasta"><input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className={inputCls} /></Field>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <p className="text-sm text-slate-500">Ingresos totales del período</p>
        <p className="text-3xl font-bold text-slate-800"><PrecioDual usd={data?.total} tasaUsd={data?.tasa_usd} bs={data?.total_bs} /></p>
        <p className="text-sm text-slate-400">{data?.count ?? 0} transacciones</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {tipos.length === 0 && <p className="text-sm text-slate-500">Sin ingresos en el rango.</p>}
        {tipos.map(([tipo, v]) => (
          <div key={tipo} className="rounded-2xl border border-slate-200 bg-white p-4">
            <p className="text-sm capitalize text-slate-500">{tipo}</p>
            <p className="text-xl font-bold text-slate-800"><PrecioDual usd={v.total} tasaUsd={data?.tasa_usd} /></p>
            <p className="text-xs text-slate-400">{v.count} pagos</p>
          </div>
        ))}
      </div>
    </div>
  )
}

// ------------------------- Auditoría -------------------------
interface Log { id: string; accion: string; tabla: string; fecha: string; usuario_id: string | null; detalles: Record<string, unknown> | null }

function AuditoriaTab() {
  const [fecha, setFecha] = useState('')
  const { data: logs = [], isLoading } = useQuery<Log[]>({
    queryKey: ['auditoria', fecha],
    queryFn: async () => {
      const params = fecha ? { desde: `${fecha}T00:00:00.000Z`, hasta: `${fecha}T23:59:59.999Z` } : {}
      return (await api.get('/admin/auditoria', { params })).data
    },
  })

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Filtrar por fecha">
          <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className={inputCls} />
        </Field>
        {fecha && <button onClick={() => setFecha('')} className="rounded-lg bg-slate-200 px-3 py-2 text-sm text-slate-600">Limpiar</button>}
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        {isLoading ? <p className="p-6 text-sm text-slate-500">Cargando…</p> : logs.length === 0 ? (
          <p className="p-6 text-sm text-slate-500">Sin eventos de auditoría.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr><th className="px-4 py-3">Fecha</th><th className="px-4 py-3">Acción</th><th className="px-4 py-3">Tabla</th><th className="px-4 py-3">Detalle</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {logs.map((l) => (
                  <tr key={l.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 text-slate-500">{new Date(l.fecha).toLocaleString()}</td>
                    <td className="px-4 py-3"><Badge op={l.accion} /></td>
                    <td className="px-4 py-3 text-slate-600">{l.tabla}</td>
                    <td className="px-4 py-3 text-xs text-slate-400">{JSON.stringify(l.detalles ?? {})}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

function Badge({ op }: { op: string }) {
  const map: Record<string, string> = { INSERT: 'bg-green-100 text-green-700', UPDATE: 'bg-amber-100 text-amber-700', DELETE: 'bg-red-100 text-red-700' }
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${map[op] ?? 'bg-slate-200 text-slate-600'}`}>{op}</span>
}

// ------------------------- Tasas de cambio -------------------------
interface TasaRow {
  id: string
  fecha: string
  moneda: 'USD' | 'EUR'
  valor: number
  origen: 'bcv' | 'manual'
  activa: boolean
  actualizado_por: string | null
  created_at: string
}

interface TasaActiva {
  moneda: 'USD' | 'EUR'
  valor: number | null
  origen: 'bcv' | 'manual' | null
  fecha: string
}

function TasasTab() {
  const queryClient = useQueryClient()
  const [error, setError] = useState<string | null>(null)
  const [mensaje, setMensaje] = useState<string | null>(null)

  const { data: activas } = useQuery<{ fecha: string; monedas: TasaActiva[] }>({
    queryKey: ['tasas', 'activas'],
    queryFn: async () => (await api.get('/tasas')).data,
  })

  const { data: historial = [], isLoading } = useQuery<TasaRow[]>({
    queryKey: ['tasas', 'admin'],
    queryFn: async () => (await api.get('/admin/tasas')).data,
  })

  const crear = useMutation({
    mutationFn: (p: unknown) => api.post('/admin/tasas', p),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasas'] })
      setMensaje('Tasa manual creada y activada.')
      setError(null)
    },
    onError: (e) => setError(getApiError(e)),
  })

  const scraping = useMutation({
    mutationFn: () => api.post('/admin/tasas/scraping'),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['tasas'] })
      setMensaje(`Tasas actualizadas desde el BCV (${res.data.fecha}).`)
      setError(null)
    },
    onError: (e) => setError(getApiError(e)),
  })

  const seleccionar = useMutation({
    mutationFn: (id: string) => api.post('/admin/tasas/seleccionar', { id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasas'] })
      setMensaje('Tasa activa actualizada.')
      setError(null)
    },
    onError: (e) => setError(getApiError(e)),
  })

  function handleCrear(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    crear.mutate({
      fecha: fd.get('fecha'),
      moneda: fd.get('moneda'),
      valor: Number(fd.get('valor')),
    })
    e.currentTarget.reset()
  }

  const hoy = new Date().toISOString().slice(0, 10)

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="text-base font-bold text-slate-800">Tasa del día</h2>
        <p className="text-sm text-slate-500">
          La tasa seleccionada (BCV automática o manual) se muestra en el header de la web.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          {activas?.monedas.map((m) => (
            <div key={m.moneda} className="rounded-xl border border-slate-200 px-4 py-2">
              <p className="text-xs text-slate-500">{m.moneda}{m.origen === 'bcv' ? ' · BCV' : ' · Manual'}</p>
              <p className="text-xl font-bold text-slate-800">Bs. {(m.valor ?? 0).toFixed(2)}</p>
            </div>
          ))}
          {(!activas || activas.monedas.every((m) => m.valor == null)) && (
            <p className="text-sm text-slate-500">Sin tasa activa registrada. Crea una o ejecuta el scraping del BCV.</p>
          )}
          <button
            onClick={() => scraping.mutate()}
            disabled={scraping.isPending}
            className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
          >
            {scraping.isPending ? 'Consultando BCV…' : 'Actualizar desde el BCV'}
          </button>
        </div>
      </div>

      <form onSubmit={handleCrear} className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-5 sm:grid-cols-4">
        <Field label="Fecha *"><input name="fecha" type="date" defaultValue={hoy} required className={inputCls} /></Field>
        <Field label="Moneda *">
          <select name="moneda" defaultValue="USD" className={inputCls}>
            <option value="USD">USD</option>
            <option value="EUR">EUR</option>
          </select>
        </Field>
        <Field label="Valor (Bs.) *"><input name="valor" type="number" step="any" min={0.0001} required className={inputCls} /></Field>
        <div className="flex items-end">
          <button type="submit" disabled={crear.isPending} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50">
            {crear.isPending ? 'Guardando…' : 'Crear tasa manual'}
          </button>
        </div>
      </form>

      <Errtag>{error}</Errtag>
      {mensaje && <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">{mensaje}</p>}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        {isLoading ? <p className="p-6 text-sm text-slate-500">Cargando…</p> : historial.length === 0 ? (
          <p className="p-6 text-sm text-slate-500">Sin tasas registradas.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr><th className="px-4 py-3">Fecha</th><th className="px-4 py-3">Moneda</th><th className="px-4 py-3">Valor (Bs.)</th><th className="px-4 py-3">Origen</th><th className="px-4 py-3">Estado</th><th className="px-4 py-3"></th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {historial.map((t) => (
                  <tr key={t.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 text-slate-600">{t.fecha}</td>
                    <td className="px-4 py-3 font-medium text-slate-800">{t.moneda}</td>
                    <td className="px-4 py-3 text-slate-700">Bs. {t.valor.toFixed(2)}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${t.origen === 'bcv' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'}`}>
                        {t.origen === 'bcv' ? 'BCV automática' : 'Manual'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {t.activa ? (
                        <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">Activa</span>
                      ) : (
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">Inactiva</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {!t.activa && (
                        <button
                          onClick={() => seleccionar.mutate(t.id)}
                          disabled={seleccionar.isPending}
                          className="text-xs font-medium text-brand-600 hover:text-brand-700 disabled:opacity-50"
                        >
                          Usar esta tasa
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

// ------------------------- Configuración -------------------------
const PRESETS = ['#8b5cf6', '#059669', '#0ea5e9', '#ef4444', '#f59e0b', '#0f172a']

function ConfigTab() {
  const { razon_social, rif, direccion, telefono, logo_url, header_color, apply } = useConfigStore()
  const [mensaje, setMensaje] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [logoData, setLogoData] = useState<string | null>(null)
  const [logoAviso, setLogoAviso] = useState<string | null>(null)
  const logoInputRef = useRef<HTMLInputElement>(null)

  const guardar = useMutation({
    mutationFn: (p: unknown) => api.put('/admin/config', p),
    onSuccess: async (res) => {
      apply(res.data)
      setMensaje('Configuración guardada. Se aplica a los documentos y al header.')
      setError(null)
    },
    onError: (e) => {
      setError(getApiError(e))
    },
  })

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    guardar.mutate({
      razon_social: fd.get('razon_social'),
      rif: fd.get('rif'),
      direccion: fd.get('direccion') || null,
      telefono: fd.get('telefono') || null,
      country_code: fd.get('telefono_country_code') || undefined,
      local_number: fd.get('telefono_local_number') || undefined,
      logo_url: logoData ?? fd.get('logo_url'),
      header_color,
    })
  }

  async function handleLogoFile(file: File) {
    try {
      const logo = await procesarLogo(file)
      setLogoData(logo.dataUrl)
      if (logo.ajustada) {
        setLogoAviso(
          `La imagen (${logo.medidasOriginales}) no cumple la medida estándar y se ajustó a ${logo.medidasFinales}. ` +
            `La medida estándar del logo es ${LOGO_ESTANDAR.ancho}×${LOGO_ESTANDAR.alto} px; si lo deseas, sube una imagen con esas medidas para mayor nitidez.`,
        )
      } else {
        setLogoAviso(`La imagen cumple la medida estándar (${logo.medidasFinales}).`)
      }
    } catch (err) {
      setError((err as Error).message)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl space-y-5">
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="text-base font-bold text-slate-800">Identidad de la razón social</h2>
        <p className="text-sm text-slate-500">Aparece en la cabecera de la app y de todos los documentos impresos o descargables.</p>

        <div className="mt-4 grid gap-4">
          <Field label="Razón social">
            <input name="razon_social" defaultValue={razon_social} className={inputCls} minLength={3} required />
          </Field>
          <Field label="R.I.F.">
            <input name="rif" defaultValue={rif} className={inputCls} placeholder="J-00000000-0" />
          </Field>
          <Field label="Dirección">
            <input name="direccion" defaultValue={direccion} className={inputCls} placeholder="Av. Principal, Caracas" />
          </Field>
          <Field label="Teléfono">
            <PhoneInput name="telefono" defaultValue={telefono} />
          </Field>
          <Field label="Logo">
            <div className="flex items-start gap-3">
              {(logoData ?? logo_url) && (
                <img src={logoData ?? logo_url} alt="Logo" className="h-16 w-16 shrink-0 rounded-lg border border-slate-200 object-contain p-1" />
              )}
              <div className="flex-1 space-y-2">
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => logoInputRef.current?.click()}
                    className="rounded-lg bg-slate-800 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700"
                  >
                    Subir imagen desde el equipo
                  </button>
                  {(logoData || logo_url) && (
                    <button
                      type="button"
                      onClick={() => {
                        setLogoData(null)
                        setLogoAviso(null)
                        if (logoInputRef.current) logoInputRef.current.value = ''
                      }}
                      className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
                    >
                      Quitar
                    </button>
                  )}
                </div>
                <input
                  ref={logoInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) void handleLogoFile(file)
                  }}
                />
                <p className="text-xs text-slate-500">
                  Medida estándar: {LOGO_ESTANDAR.ancho}×{LOGO_ESTANDAR.alto} px. Si la imagen no la cumple, la app la ajusta automáticamente.
                </p>
                {logoAviso && <p className="rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-700">{logoAviso}</p>}
                <input name="logo_url" defaultValue={logo_url} className={inputCls} placeholder="/favicon.svg (o URL)" hidden={Boolean(logoData)} />
              </div>
            </div>
          </Field>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="text-base font-bold text-slate-800">Color del header</h2>
        <p className="text-sm text-slate-500">Personaliza el color de la cabecera de la app.</p>
        <div className="mt-4 grid grid-cols-3 gap-3 sm:grid-cols-6">
          {PRESETS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => apply({ header_color: c })}
              aria-label={`Color ${c}`}
              className={`h-12 rounded-xl transition ${header_color === c ? 'ring-2 ring-slate-900 ring-offset-2' : 'hover:scale-105'}`}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
        <label className="mt-4 flex items-center gap-3">
          <input
            type="color"
            name="header_color"
            value={header_color}
            onChange={(e) => apply({ header_color: e.target.value })}
            className="h-12 w-12 cursor-pointer rounded-lg border border-slate-300"
          />
          <span className="text-sm text-slate-600">Color personalizado: <strong>{header_color}</strong></span>
        </label>

        {/* Vista previa */}
        <div className="mt-4 rounded-lg p-3" style={{ backgroundColor: header_color, color: headerTextColor(header_color) }}>
          <p className="font-semibold">{razon_social || 'Tu razón social'}</p>
          {rif && <p className="text-xs opacity-80">R.I.F. {rif}</p>}
          {direccion && <p className="text-xs opacity-80">Dirección: {direccion}</p>}
          {telefono && <p className="text-xs opacity-80">Tel: {formatearTelefono(telefono)}</p>}
        </div>
      </div>

      <WhatsAppConfig />

      <Errtag>{error}</Errtag>
      {mensaje && <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">{mensaje}</p>}

      <button type="submit" disabled={guardar.isPending} className="rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-50">
        {guardar.isPending ? 'Guardando…' : 'Guardar cambios'}
      </button>

      <PreanaliticaConfig />
    </form>
  )
}

interface PreanaliticaConfigData {
  config: { habilitado: boolean; obligatorio: boolean }
  checkpoints: { id: string; nombre: string; activo: boolean }[]
}

function PreanaliticaConfig() {
  const queryClient = useQueryClient()
  const [mensaje, setMensaje] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const { data: info } = useQuery<PreanaliticaConfigData>({
    queryKey: ['preanalitica', 'config'],
    queryFn: async () => (await api.get('/preanalitica')).data,
  })

  const guardarConfig = useMutation({
    mutationFn: (p: { habilitado: boolean; obligatorio: boolean }) => api.put('/preanalitica/config', p),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['preanalitica'] })
      setMensaje('Configuración de validación pre-analítica guardada.')
      setError(null)
    },
    onError: (e) => setError(getApiError(e)),
  })

  const nuevoCheckpoint = useMutation({
    mutationFn: (nombre: string) => api.post('/preanalitica/checkpoints', { nombre }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['preanalitica'] })
      setError(null)
    },
    onError: (e) => setError(getApiError(e)),
  })

  const toggleCheckpoint = useMutation({
    mutationFn: ({ id, activo }: { id: string; activo: boolean }) => api.patch(`/preanalitica/checkpoints/${id}`, { activo }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['preanalitica'] })
      setError(null)
    },
    onError: (e) => setError(getApiError(e)),
  })

  const [nuevoNombre, setNuevoNombre] = useState('')

  function agregarCheckpoint() {
    if (nuevoNombre.trim().length < 3) return
    nuevoCheckpoint.mutate(nuevoNombre.trim())
    setNuevoNombre('')
  }

  const config = info?.config

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <h2 className="text-base font-bold text-slate-800">Validación pre-analítica</h2>
      <p className="text-sm text-slate-500">
        Control de calidad obligatorio antes de procesar una orden de laboratorio. Puedes activarla/desactivarla y decidir si es obligatoria.
      </p>

      {config && (
        <div className="mt-4 flex flex-wrap items-center gap-6">
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={config.habilitado}
              onChange={(e) => guardarConfig.mutate({ ...config, habilitado: e.target.checked })}
              className="h-4 w-4 rounded"
            />
            Activada
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={config.obligatorio}
              disabled={!config.habilitado}
              onChange={(e) => guardarConfig.mutate({ ...config, obligatorio: e.target.checked })}
              className="h-4 w-4 rounded"
            />
            Obligatoria (bloquear subida de resultados sin validar)
          </label>
        </div>
      )}

      <div className="mt-5">
        <h3 className="text-sm font-semibold text-slate-700">Puntos de verificación</h3>
        <div className="mt-2 space-y-2">
          {info?.checkpoints.map((c) => (
            <div key={c.id} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2">
              <span className={`text-sm ${c.activo ? 'text-slate-800' : 'text-slate-400 line-through'}`}>{c.nombre}</span>
              <button
                type="button"
                onClick={() => toggleCheckpoint.mutate({ id: c.id, activo: !c.activo })}
                className={`rounded-full px-2 py-0.5 text-xs font-medium ${c.activo ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}
              >
                {c.activo ? 'Activo' : 'Inactivo'}
              </button>
            </div>
          ))}
        </div>

        <div className="mt-3 flex gap-2">
          <input
            value={nuevoNombre}
            onChange={(e) => setNuevoNombre(e.target.value)}
            placeholder="Nuevo punto de verificación…"
            className={inputCls}
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), agregarCheckpoint())}
          />
          <button type="button" onClick={agregarCheckpoint} disabled={nuevoCheckpoint.isPending} className="shrink-0 rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50">
            Agregar
          </button>
        </div>
      </div>

      {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {mensaje && <p className="mt-3 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">{mensaje}</p>}
      {guardarConfig.isPending && <p className="mt-3 text-sm text-slate-500">Guardando…</p>}
    </div>
  )
}