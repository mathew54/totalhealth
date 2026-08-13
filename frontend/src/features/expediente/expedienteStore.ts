import { create } from 'zustand'
import type { PacienteExpediente } from './types'

interface EstadoExpediente {
  /** Paciente activo (o tutor). El expediente mostrado es `expedienteId`. */
  paciente: PacienteExpediente | null
  /** ID del expediente en pantalla (puede ser un menor vinculado al tutor). */
  expedienteId: string | null
  setPaciente: (p: PacienteExpediente) => void
  setExpedienteId: (id: string | null) => void
  limpiar: () => void
}

export const useExpedienteStore = create<EstadoExpediente>()((set) => ({
  paciente: null,
  expedienteId: null,
  setPaciente: (p) => set({ paciente: p, expedienteId: p.id }),
  setExpedienteId: (id) => set({ expedienteId: id }),
  limpiar: () => set({ paciente: null, expedienteId: null }),
}))