import { msDesde } from './dashboardUtils'

export interface SolicitudMini {
  id: string
  estado: string
  fecha: string
  paciente: { id: string; cedula: string; nombre_completo: string } | null
  cobrado?: boolean
  total?: number
}

/** Edad (ms) de una solicitud pendiente/en proceso desde su fecha. */
export function edadSolicitud(s: SolicitudMini): number {
  return msDesde(s.fecha)
}

/** Buckets de backlog por antigüedad (solo solicitudes activas en cola). */
export function backlogPorEdad(
  solicitudes: SolicitudMini[],
): { hasta2h: number; de2a8h: number; masDe8h: number } {
  let hasta2h = 0
  let de2a8h = 0
  let masDe8h = 0
  for (const s of solicitudes) {
    const edad = edadSolicitud(s)
    if (edad <= 2 * 3_600_000) hasta2h++
    else if (edad <= 8 * 3_600_000) de2a8h++
    else masDe8h++
  }
  return { hasta2h, de2a8h, masDe8h }
}

/** Tiempo medio de espera (ms) de la cola activa (pendiente + en proceso). */
export function esperaPromedioCola(solicitudes: SolicitudMini[]): number {
  if (solicitudes.length === 0) return 0
  const total = solicitudes.reduce((acc, s) => acc + edadSolicitud(s), 0)
  return total / solicitudes.length
}

/**
 * Estimación simple de TAT: espera media actual + desfase de proceso.
 * Con N solicitudes activas y un tiempo de proceso medio por solicitud
 * (si no hay historial, se usa un default de 30 min), proyecta cuándo se
 * libera la cola. Es una proyección, no un dato real.
 */
export function estimarTat(solicitudes: SolicitudMini[], procesoMedioMin = 30): number {
  const activas = solicitudes.filter((s) => s.estado === 'pendiente' || s.estado === 'en_proceso')
  if (activas.length === 0) return 0
  const espera = esperaPromedioCola(activas)
  const procesoMs = procesoMedioMin * 60_000
  return espera + activas.length * procesoMs
}

/** Volumen de solicitudes por día (últimos `dias`, fechas locales). */
export function solicitudesPorDia(solicitudes: SolicitudMini[], dias = 7): { dia: string; total: number }[] {
  const hoy = new Date()
  hoy.setHours(0, 0, 0, 0)
  const mapa = new Map<string, number>()
  for (let i = dias - 1; i >= 0; i--) {
    const d = new Date(hoy)
    d.setDate(hoy.getDate() - i)
    mapa.set(d.toISOString().slice(0, 10), 0)
  }
  for (const s of solicitudes) {
    const dia = s.fecha.slice(0, 10)
    if (mapa.has(dia)) mapa.set(dia, (mapa.get(dia) ?? 0) + 1)
  }
  return [...mapa.entries()].map(([dia, total]) => ({
    dia: new Date(`${dia}T12:00:00`).toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit' }),
    total,
  }))
}

/** Distribución de solicitudes por estado (para gráfica de supervisión). */
export function solicitudesPorEstado(
  solicitudes: SolicitudMini[],
): { estado: string; total: number }[] {
  const mapa = new Map<string, number>()
  for (const s of solicitudes) mapa.set(s.estado, (mapa.get(s.estado) ?? 0) + 1)
  return [...mapa.entries()].map(([estado, total]) => ({ estado: estado.replace('_', ' '), total }))
}

/** Nº de solicitudes "retrasadas" (edad > 4 h sin listar). */
export function solicitudesRetrasadas(solicitudes: SolicitudMini[]): number {
  return solicitudes.filter((s) => edadSolicitud(s) > 4 * 3_600_000).length
}
