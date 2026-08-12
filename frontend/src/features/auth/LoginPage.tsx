import { useState, type FormEvent } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useSessionStore } from '../../stores/sessionStore'
import { ROL_LABELS, type Profile } from '../../lib/rbac'
import { getApiError } from '../../lib/api'
import { PasswordInput } from '../../components/ui/PasswordInput'

export default function LoginPage() {
  const navigate = useNavigate()
  const { login, verifyMfa, setActiveRole, isLoading } = useSessionStore()
  const [cedula, setCedula] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [mfa, setMfa] = useState(false)
  const [pending, setPending] = useState<Profile | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      const result = await login(cedula, password)
      if (result && 'mfaRequired' in result) {
        setMfa(true)
        setCode('')
        return
      }
      if (result && result.roles.length > 1) {
        setPending(result)
      } else {
        navigate('/')
      }
    } catch (err) {
      setError(getApiError(err))
    }
  }

  async function handleMfa(e: FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      const profile = await verifyMfa(code)
      if (profile && profile.roles.length > 1) {
        setPending(profile)
        setMfa(false)
      } else {
        navigate('/')
      }
    } catch (err) {
      setError(getApiError(err))
    }
  }

  function resetLogin() {
    setPending(null)
    setMfa(false)
    setCedula('')
    setPassword('')
    setCode('')
    setError(null)
  }

  async function chooseRole(role: Profile['role']) {
    setError(null)
    try {
      await setActiveRole(role)
      navigate('/')
    } catch (err) {
      setError(getApiError(err))
    }
  }

  if (pending) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
        <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-lg">
          <div className="mb-6 text-center">
            <h1 className="text-2xl font-bold text-slate-800">TotalHealth</h1>
            <p className="text-sm text-slate-500">Elige el perfil de acceso</p>
          </div>

          <div className="space-y-3">
            <p className="text-center text-sm text-slate-600">
              Hola, <strong>{pending.nombre_completo}</strong>. Este usuario tiene varios roles asignados.
            </p>
            {pending.roles.map((r) => (
              <button
                key={r}
                onClick={() => chooseRole(r)}
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-left font-medium text-slate-700 transition hover:border-brand-500 hover:bg-brand-50"
              >
                {ROL_LABELS[r] ?? r}
              </button>
            ))}
            <button
              onClick={resetLogin}
              className="w-full pt-2 text-center text-sm text-slate-500 hover:text-slate-700"
            >
              Cambiar de usuario
            </button>
          </div>

          {error && <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        </div>
      </div>
    )
  }

  if (mfa) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
        <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-lg">
          <div className="mb-6 text-center">
            <h1 className="text-2xl font-bold text-slate-800">TotalHealth</h1>
            <p className="text-sm text-slate-500">Segundo factor de autenticación</p>
          </div>

          <p className="mb-4 text-center text-sm text-slate-600">
            Ingresa el código de 6 dígitos de tu aplicación autenticadora.
          </p>

          <form onSubmit={handleMfa} className="space-y-4">
            <div>
              <label htmlFor="mfa-code" className="mb-1 block text-sm font-medium text-slate-700">
                Código
              </label>
              <input
                id="mfa-code"
                required
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]*"
                maxLength={6}
                placeholder="000000"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-center text-lg tracking-[0.5em] outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
              />
            </div>

            {error && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
            )}

            <button
              type="submit"
              disabled={isLoading || code.length < 6}
              className="w-full rounded-lg bg-brand-600 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-50"
            >
              {isLoading ? 'Verificando…' : 'Verificar'}
            </button>

            <button
              type="button"
              onClick={resetLogin}
              className="w-full pt-1 text-center text-sm text-slate-500 hover:text-slate-700"
            >
              Cambiar de usuario
            </button>
          </form>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-lg">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold text-slate-800">TotalHealth</h1>
          <p className="text-sm text-slate-500">Acceso del personal</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="cedula" className="mb-1 block text-sm font-medium text-slate-700">
              Cédula
            </label>
            <input
              id="cedula"
              required
              autoComplete="username"
              placeholder="V-12345678, E-…, P-…, J-… o C-…"
              value={cedula}
              onChange={(e) => setCedula(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            />
          </div>

          <div>
            <label htmlFor="password" className="mb-1 block text-sm font-medium text-slate-700">
              Contraseña
            </label>
            <PasswordInput
              id="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-slate-300 py-2.5 pl-3 pr-10 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            />
          </div>

          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full rounded-lg bg-brand-600 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-50"
          >
            {isLoading ? 'Ingresando…' : 'Ingresar'}
          </button>

          <p className="pt-2 text-center text-sm text-slate-500">
            ¿Eres paciente?{' '}
            <Link to="/portal" className="font-medium text-brand-600 hover:text-brand-700">
              Consulta tus resultados
            </Link>
          </p>
        </form>
      </div>
    </div>
  )
}