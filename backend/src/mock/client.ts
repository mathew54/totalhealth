import crypto from 'node:crypto'
import { signStaffToken } from '../utils/jwt.js'
import { MockStore } from './store.js'
import { QueryBuilder } from './queryBuilder.js'
import { AUTH_USERS, DEMO_PASSWORD, SEED } from './seed.js'
import type { Row } from './store.js'
import type { Rol } from '../modules/auth/types.js'

function buildSession(user: { id: string; email: string }) {
  const profile = MOCK.rows('profiles').find((p) => p.id === user.id)
  const roles = Array.isArray(profile?.roles)
    ? (profile!.roles as Rol[])
    : [((profile?.role as Rol) ?? 'medico')]
  const role = (profile?.role as Rol) ?? roles[0] ?? 'medico'
  const token = signStaffToken({
    id: user.id,
    role,
    roles,
    clinicaId: (profile?.clinica_id as string | null) ?? null,
    nombre: (profile?.nombre_completo as string) ?? '',
  })
  return {
    access_token: token,
    refresh_token: crypto.randomUUID(),
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user,
  }
}

// El MockStore muta las tablas en su lugar. Se guardan copias pristinas del
// seed para poder restablecer la base mock (reset) sin arrastrar mutaciones.
const SEED_BASE: Record<string, Row[]> = structuredClone(SEED)
const AUTH_BASE = structuredClone(AUTH_USERS)

let MOCK = new MockStore(structuredClone(SEED_BASE), structuredClone(AUTH_BASE))

export function getMockClient() {
  return {
    auth: {
      async signInWithPassword({ email, password }: { email: string; password: string }) {
        const user = MOCK.authUsers.find((u) => u.email === email)
        if (!user || user.password !== password) {
          return { data: { session: null }, error: { message: 'Invalid login credentials' } }
        }
        return { data: { session: buildSession(user) }, error: null }
      },

      async refreshSession({ refresh_token }: { refresh_token: string }) {
        if (!refresh_token) return { data: { session: null }, error: { message: 'Invalid refresh token' } }
        const user = MOCK.authUsers[0]
        return { data: { session: buildSession(user) }, error: null }
      },

      async signOut() {
        return { error: null }
      },

      admin: {
        async getUserById(userId: string) {
          const user = MOCK.authUsers.find((u) => u.id === userId)
          if (!user) return { data: { user: null }, error: { message: 'User not found' } }
          return {
            data: {
              user: { id: user.id, email: user.email, aud: 'authenticated', role: 'authenticated' },
            },
            error: null,
          }
        },
        async createUser({ email, password, email_confirm }: { email: string; password: string; email_confirm?: boolean }) {
          if (MOCK.authUsers.some((u) => u.email === email)) {
            return { data: { user: null }, error: { message: 'User already registered' } }
          }
          const id = crypto.randomUUID()
          MOCK.authUsers.push({ id, email, password })
          return {
            data: {
              user: { id, email, aud: 'authenticated', role: 'authenticated', email_confirmed_at: email_confirm ? new Date().toISOString() : null },
            },
            error: null,
          }
        },
      },
    },

    from(table: string) {
      return new QueryBuilder(MOCK, table)
    },

    rpc() {
      return { data: null, error: { message: 'RPC no disponible en modo mock' } }
    },

    storage: {
      from() {
        return {
          createSignedUrl: async () => ({ data: { signedUrl: '' }, error: null }),
        }
      },
    },
  }
}

export { DEMO_PASSWORD }

export function mockInfo() {
  return {
    demoCedulas: MOCK.rows('profiles')
      .map((p) => ({ cedula: p.cedula, roles: p.roles, email: p.email }))
      .filter((p) => p.cedula),
    password: DEMO_PASSWORD,
    tables: Object.keys(MOCK.tables),
  } satisfies Record<string, unknown>
}

/** Copia profunda de todas las tablas del mock (para el explorador de datos). */
export function mockTables(): Record<string, Row[]> {
  const copia: Record<string, Row[]> = {}
  for (const [tabla, filas] of Object.entries(MOCK.tables)) {
    copia[tabla] = structuredClone(filas)
  }
  return copia
}

/** Restablece la base mock al seed inicial (útil al probar flujos). */
export function resetMock(): void {
  MOCK = new MockStore(structuredClone(SEED_BASE), structuredClone(AUTH_BASE))
}

/** Copia profunda del estado completo del mock (tablas + usuarios auth), para
 * poder generar un respaldo fiel del entorno de desarrollo. */
export function mockDump(): {
  tables: Record<string, Row[]>
  authUsers: { id: string; email: string; password: string }[]
} {
  return {
    tables: mockTables(),
    authUsers: structuredClone(MOCK.authUsers),
  }
}

/** Reemplaza el estado del mock con datos externos (restauración de un backup). */
export function setMockData(
  tables: Record<string, Row[]>,
  authUsers?: { id: string; email: string; password: string }[],
): void {
  MOCK = new MockStore(
    structuredClone(tables),
    structuredClone(authUsers ?? AUTH_BASE),
  )
}
