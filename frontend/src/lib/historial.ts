// Utilidades del historial clínico compartido (labels + render de contenido).
// Única implementación: la usan HistorialPage y PanelHistorial (expediente).

export const TIPO_LABEL: Record<string, string> = {
  evolucion: 'Evolución',
  procedimiento: 'Procedimiento',
  interconsulta: 'Interconsulta',
  resultado: 'Resultado',
  otro: 'Otro',
}

/** Serializa el `contenido` de un registro para mostrarlo como texto plano. */
export function contenidoTexto(contenido: Record<string, unknown>): string {
  if (typeof contenido?.texto === 'string') return contenido.texto
  const keys = Object.keys(contenido ?? {})
  if (keys.length === 0) return ''
  return keys.map((k) => `${k}: ${String(contenido[k] ?? '')}`).join('\n')
}