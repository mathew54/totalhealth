import axios from 'axios'
import { getAuthToken } from './token'

// VITE_API_URL apunta al backend en despliegues (p.ej. Netlify + backend
// alojado). En desarrollo (o sin la env) se usa el proxy relativo /api de Vite.
const API_URL = import.meta.env.VITE_API_URL || '/api'

export const api = axios.create({
  baseURL: API_URL,
})

let unauthorizedHandler: (() => void) | null = null

export function setUnauthorizedHandler(handler: () => void) {
  unauthorizedHandler = handler
}

api.interceptors.request.use((config) => {
  const token = getAuthToken()
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  (res) => res,
  (err) => {
    // No disparar el handler en login/logout: un 401 ahí es un fallo de
    // credenciales (login) o una sesión ya inexistente (logout), no una sesión
    // caducada. Evita el bucle logout->401->logout.
    const url: string = err?.config?.url ?? ''
    const skip = ['/auth/login', '/auth/logout'].some((p) => url.startsWith(p))
    if (err?.response?.status === 401 && !skip) unauthorizedHandler?.()
    return Promise.reject(err)
  },
)

export interface ApiError {
  message: string
}

export function getApiError(err: unknown): string {
  const e = err as { response?: { data?: { error?: { message?: string } } }; code?: string; message?: string }
  if (e?.response?.data?.error?.message) return e.response.data.error.message
  if (e?.code === 'ERR_NETWORK' || e?.code === 'ECONNABORTED') {
    return 'No se pudo conectar con el servidor. Verifica que el backend esté activo.'
  }
  return e?.message ?? 'Error inesperado'
}
