import { create } from 'zustand'
import { api } from './api'

export interface AppConfig {
  razon_social: string
  rif: string
  direccion: string
  telefono: string
  logo_url: string
  header_color: string
  iva: number
  igtf: number
  retencion_iva_pct: number
  retencion_islr_pct: number
}

export type Theme = 'dark' | 'light'

const THEME_KEY = 'totalhealth-theme'

function initialTheme(): Theme {
  try {
    const saved = localStorage.getItem(THEME_KEY)
    if (saved === 'dark' || saved === 'light') return saved
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches) return 'dark'
  } catch {
    /* noop */
  }
  return 'light'
}

export function applyTheme(t: Theme) {
  if (typeof document !== 'undefined') {
    document.documentElement.classList.toggle('dark', t === 'dark')
  }
}

/** Devuelve un color de texto legible (blanco/negro) según el brillo del fondo. */
export function headerTextColor(hex: string): string {
  const h = hex.replace('#', '')
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  const n = parseInt(full, 16)
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  const luma = 0.299 * r + 0.587 * g + 0.114 * b
  return luma > 150 ? '#0f172a' : '#ffffff'
}

interface ConfigState extends AppConfig {
  loaded: boolean
  theme: Theme
  setTheme: (t: Theme) => void
  toggleTheme: () => void
  refresh: () => Promise<void>
  apply: (c: Partial<AppConfig>) => void
}

export const useConfigStore = create<ConfigState>((set, get) => ({
  razon_social: 'TotalHealth',
  rif: '',
  direccion: '',
  telefono: '',
  logo_url: '',
  header_color: '#8b5cf6',
  iva: 0.16,
  igtf: 0.03,
  retencion_iva_pct: 0.75,
  retencion_islr_pct: 0.03,
  loaded: false,
  theme: initialTheme(),
  setTheme: (t) => {
    try {
      localStorage.setItem(THEME_KEY, t)
    } catch {
      /* noop */
    }
    applyTheme(t)
    set({ theme: t })
  },
  toggleTheme: () => get().setTheme(get().theme === 'dark' ? 'light' : 'dark'),
  refresh: async () => {
    try {
      const { data } = await api.get<AppConfig>('/config')
      set({ ...data, loaded: true })
    } catch {
      set({ loaded: true })
    }
  },
  apply: (c) => set((s) => ({ ...s, ...c })),
}))

applyTheme(useConfigStore.getState().theme)
