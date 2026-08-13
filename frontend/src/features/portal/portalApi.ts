// VITE_API_URL apunta al backend en despliegues (Netlify + backend alojado).
// En desarrollo (o sin la env) se usa el proxy relativo /api de Vite.
const API_URL = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '')

/** Base URL de los endpoints del módulo portal. */
export const PORTAL_API_URL = `${API_URL}/portal`

/** fetch del módulo portal: usa la misma base que el resto de la app. */
export async function portalFetch(
  path: string,
  token?: string,
  body?: unknown,
  method: 'GET' | 'POST' | 'PATCH' = body ? 'POST' : 'GET',
) {
  const res = await fetch(`${PORTAL_API_URL}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json().catch(() => null)
  if (!res.ok) throw new Error(data?.error?.message ?? data?.message ?? 'Error')
  return data
}
