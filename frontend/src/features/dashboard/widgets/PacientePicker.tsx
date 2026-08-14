import BuscadorPacientes from '../../../components/ui/BuscadorPacientes'
import type { Paciente } from '../../../lib/types'

export type PacienteMini = Paciente

/** Búsqueda de pacientes reutilizable (para widgets con contexto de paciente).
 *  Es un envoltorio del BuscadorPacientes compartido (src/components/ui). */
export function PacientePicker({
  value,
  onChange,
}: {
  value: PacienteMini | null
  onChange: (p: PacienteMini | null) => void
}) {
  return <BuscadorPacientes value={value} onChange={onChange} mostrarSeleccionado placeholder="Buscar paciente por cédula o nombre…" limit={8} />
}