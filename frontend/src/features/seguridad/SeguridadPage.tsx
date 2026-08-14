import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { generarQrDataUrl } from '../../lib/qr'
import { api, getApiError } from '../../lib/api'
import { useSessionStore } from '../../stores/sessionStore'

interface MfaEstado {
  activo: boolean
  habilitado_para_rol: boolean
}

interface MfaSetup {
  secret: string
  otpauth_url: string
  activo: boolean
}

const inputCls = 'w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100'

export default function SeguridadPage() {
  const profile = useSessionStore((s) => s.profile)

  const { data: estado, isLoading } = useQuery<MfaEstado>({
    queryKey: ['mfa', 'estado'],
    queryFn: async () => (await api.get('/auth/mfa/estado')).data,
  })

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-800">Seguridad</h1>
        <p className="text-sm text-slate-500">Autenticación de dos factores (TOTP) para tu cuenta</p>
      </div>

      {isLoading ? (
        <p className="text-sm text-slate-500">Cargando…</p>
      ) : estado && !estado.habilitado_para_rol ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <p className="text-sm text-slate-600">
            La autenticación de dos factores está disponible solo para los roles{' '}
            <strong>admin</strong> y <strong>super_root</strong>. Tu rol activo actual es{' '}
            <strong>{profile?.role}</strong>.
          </p>
        </div>
      ) : estado?.activo ? (
        <MfaActivo />
      ) : (
        <MfaSetup />
      )}
    </div>
  )
}

function MfaSetup() {
  const queryClient = useQueryClient()
  const [qr, setQr] = useState<string | null>(null)
  const [secret, setSecret] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [mensaje, setMensaje] = useState<string | null>(null)

  const iniciar = useMutation({
    mutationFn: () => api.post<MfaSetup>('/auth/mfa/setup'),
    onSuccess: async (res) => {
      setSecret(res.data.secret)
      setQr(await generarQrDataUrl(res.data.otpauth_url, { width: 220, margin: 1 }))
      setError(null)
      setMensaje(null)
    },
    onError: (e) => setError(getApiError(e)),
  })

  const verificar = useMutation({
    mutationFn: (c: string) => api.post('/auth/mfa/verify', { code: c }),
    onSuccess: () => {
      setCode('')
      setMensaje('Verificación correcta. A partir de ahora el login exigirá el segundo factor.')
      setError(null)
      queryClient.invalidateQueries({ queryKey: ['mfa', 'estado'] })
    },
    onError: (e) => setError(getApiError(e)),
  })

  if (!qr) {
    return (
      <div className="max-w-xl rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="text-base font-bold text-slate-800">Activar segundo factor</h2>
        <p className="mt-1 text-sm text-slate-600">
          Usa una aplicación autenticadora (Google Authenticator, Authy, Microsoft Authenticator, etc.).
          Al activarlo, el inicio de sesión pedirá un código de 6 dígitos además de la contraseña.
        </p>
        <button
          onClick={() => iniciar.mutate()}
          disabled={iniciar.isPending}
          className="mt-4 rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-50"
        >
          {iniciar.isPending ? 'Generando…' : 'Generar código QR'}
        </button>
        {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      </div>
    )
  }

  return (
    <div className="grid max-w-3xl gap-5 md:grid-cols-2">
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="text-base font-bold text-slate-800">Escanea el código</h2>
        <p className="mt-1 text-sm text-slate-600">
          Abre tu aplicación autenticadora y escanea este código, o ingresa la clave manualmente:
        </p>
        <div className="mt-4 flex justify-center rounded-xl border border-slate-100 bg-slate-50 p-4">
          {qr && <img src={qr} alt="Código QR de autenticación" className="h-56 w-56" />}
        </div>
        <p className="mt-3 text-center text-xs text-slate-500">
          Clave: <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono">{secret}</code>
        </p>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="text-base font-bold text-slate-800">Confirma la activación</h2>
        <p className="mt-1 text-sm text-slate-600">
          Ingresa el código de 6 dígitos que muestra la aplicación para confirmar que todo quedó bien configurado.
        </p>
        <form
          onSubmit={(e: FormEvent) => {
            e.preventDefault()
            verificar.mutate(code)
          }}
          className="mt-4 space-y-3"
        >
          <input
            required
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={6}
            placeholder="000000"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            className={`${inputCls} text-center text-lg tracking-[0.5em]`}
          />
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          {mensaje && <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">{mensaje}</p>}
          <button
            type="submit"
            disabled={verificar.isPending || code.length < 6}
            className="w-full rounded-lg bg-brand-600 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-50"
          >
            {verificar.isPending ? 'Verificando…' : 'Activar'}
          </button>
          <button
            type="button"
            onClick={() => {
              setQr(null)
              setSecret(null)
              setCode('')
              setError(null)
            }}
            className="w-full pt-1 text-center text-sm text-slate-500 hover:text-slate-700"
          >
            Volver
          </button>
        </form>
      </div>
    </div>
  )
}

function MfaActivo() {
  const queryClient = useQueryClient()
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [mensaje, setMensaje] = useState<string | null>(null)

  const desactivar = useMutation({
    mutationFn: (c: string) => api.post('/auth/mfa/desactivar', { code: c }),
    onSuccess: () => {
      setCode('')
      setMensaje('Segundo factor desactivado. El login vuelve a ser con contraseña.')
      setError(null)
      queryClient.invalidateQueries({ queryKey: ['mfa', 'estado'] })
    },
    onError: (e) => setError(getApiError(e)),
  })

  return (
    <div className="max-w-xl rounded-2xl border border-slate-200 bg-white p-5">
      <h2 className="text-base font-bold text-slate-800">Segundo factor activado</h2>
      <p className="mt-1 text-sm text-slate-600">
        Tu cuenta exige un código de 6 dígitos al iniciar sesión. Puedes desactivarlo ingresando el código actual de tu aplicación autenticadora.
      </p>
      <form
        onSubmit={(e: FormEvent) => {
          e.preventDefault()
          desactivar.mutate(code)
        }}
        className="mt-4 space-y-3"
      >
        <input
          required
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={6}
          placeholder="Código de 6 dígitos"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
          className={`${inputCls} text-center text-lg tracking-[0.5em]`}
        />
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        {mensaje && <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">{mensaje}</p>}
        <button
          type="submit"
          disabled={desactivar.isPending || code.length < 6}
          className="w-full rounded-lg bg-red-600 py-2.5 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-50"
        >
          {desactivar.isPending ? 'Desactivando…' : 'Desactivar segundo factor'}
        </button>
      </form>
    </div>
  )
}
