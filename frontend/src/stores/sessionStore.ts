import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { api, setUnauthorizedHandler } from '../lib/api'
import { setAuthToken } from '../lib/token'
import type { Profile, Rol, Session } from '../lib/rbac'

interface MfaRequired {
  mfaRequired: true
  mfaToken: string
}

export type LoginResult = Profile | null | MfaRequired

interface SessionState {
  session: Session | null
  profile: Profile | null
  isLoading: boolean
  /** Token MFA pendiente (no se persiste): solo vive en memoria durante el login. */
  mfaToken: string | null
  login: (cedula: string, password: string) => Promise<LoginResult>
  verifyMfa: (code: string) => Promise<Profile | null>
  setActiveRole: (role: Rol) => Promise<void>
  setEspecialidadActiva: (especialidad: string) => Promise<void>
  setDashboardVista: (vista: 'activa' | 'consolidada') => Promise<void>
  logout: () => Promise<void>
  setLoading: (v: boolean) => void
}

async function loadMe() {
  const { data: profile } = await api.get<Profile>('/auth/me')
  return profile
}

export const useSessionStore = create<SessionState>()(
  persist(
    (set, get) => ({
      session: null,
      profile: null,
      isLoading: false,
      mfaToken: null,

      async login(cedula, password) {
        set({ isLoading: true, mfaToken: null })
        try {
          const { data } = await api.post<Session | { mfa_required: true; mfa_token: string }>('/auth/login', { cedula, password })
          if ('mfa_required' in data && data.mfa_required) {
            set({ mfaToken: data.mfa_token })
            return { mfaRequired: true, mfaToken: data.mfa_token }
          }
          const session = data as Session
          setAuthToken(session.access_token)
          const profile = await loadMe()
          set({ session, profile })
          return profile
        } finally {
          set({ isLoading: false })
        }
      },

      /** Completa el segundo factor (TOTP) y entrega la sesión. */
      async verifyMfa(code) {
        const mfaToken = get().mfaToken
        if (!mfaToken) throw new Error('Sin sesión pendiente de verificación')
        set({ isLoading: true })
        try {
          const { data: session } = await api.post<Session>('/auth/mfa/verify-login', { mfa_token: mfaToken, code })
          setAuthToken(session.access_token)
          const profile = await loadMe()
          set({ session, profile, mfaToken: null })
          return profile
        } finally {
          set({ isLoading: false })
        }
      },

      async setActiveRole(role) {
        const profile = get().profile
        if (!profile?.roles.includes(role)) return
        const { data } = await api.post<{ access_token: string }>('/auth/switch-role', { role })
        setAuthToken(data.access_token)
        const fresh = await loadMe()
        set({ profile: fresh })
      },

      /** Cambia el contexto del médico multiespecialidad (persiste en el perfil). */
      async setEspecialidadActiva(especialidad) {
        const profile = get().profile
        if (!profile) return
        const { data } = await api.patch<Profile>('/auth/perfil', { especialidad_activa: especialidad })
        set({ profile: { ...profile, ...data } })
      },

      /** Alterna la vista del dashboard médico: activa o consolidada. */
      async setDashboardVista(vista) {
        const profile = get().profile
        if (!profile) return
        const { data } = await api.patch<Profile>('/auth/perfil', { dashboard_config: { vista } })
        set({ profile: { ...profile, ...data } })
      },

      async logout() {
        // Idempotente: si ya no hay sesión, no volver a llamar al backend
        // (evita el bucle logout -> 401 -> logout cuando el handler de 401 dispara logout).
        if (get().session) {
          try {
            await api.post('/auth/logout')
          } catch {
            // ignorar errores de red al cerrar sesión
          }
        }
        setAuthToken(null)
        set({ session: null, profile: null, mfaToken: null })
      },

      setLoading(v) {
        set({ isLoading: v })
      },
    }),
    {
      name: 'totalhealth-session',
      partialize: (s) => ({ session: s.session, profile: s.profile }),
      onRehydrateStorage: () => (state) => {
        if (state?.session?.access_token) setAuthToken(state.session.access_token)
      },
    },
  ),
)

setUnauthorizedHandler(() => useSessionStore.getState().logout())