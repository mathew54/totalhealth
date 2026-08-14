// Catálogos clínicos UNICOS (especialidades + preanalítica).
// Fuente de verdad: alimenta las tablas `categorias_medicas`, `especialidades_medicas`
// y `checkpoints_preanalitica` tanto en el mock (seed) como en la migración SQL
// generada (scripts/generarCatalogosSql.ts).

export interface CategoriaMedica {
  id: string;
  nombre: string;
  descripcion: string;
  orden: number;
}

export interface EspecialidadMedica {
  id: string;
  categoria: string;
  nombre: string;
}

export const CATEGORIAS_MEDICAS: CategoriaMedica[] = [
  { id: 'atencion_primaria', nombre: 'Atención Primaria y Medicina General', descripcion: 'Medicina General, Pediatría, Geriatría', orden: 1 },
  { id: 'especialidades_clinicas', nombre: 'Especialidades Clínicas', descripcion: 'Cardiología, Neurología, Gastroenterología, Endocrinología', orden: 2 },
  { id: 'especialidades_quirurgicas', nombre: 'Especialidades Quirúrgicas', descripcion: 'Cirugía General, Traumatología, Neurocirugía', orden: 3 },
  { id: 'medico_quirurgicas', nombre: 'Médico-Quirúrgicas', descripcion: 'Gineco/Obstetricia, Urología, Oftalmología, ORL', orden: 4 },
  { id: 'diagnostico_apoyo', nombre: 'Diagnóstico y Apoyo Clínico', descripcion: 'Patología, Radiología, Imagenología', orden: 5 },
  { id: 'critica_urgencias', nombre: 'Medicina Crítica y Urgencias', descripcion: 'Intensivistas, Anestesiólogos, Emergentólogos', orden: 6 },
  { id: 'salud_publica', nombre: 'Salud Pública y Otras', descripcion: 'Fisiatría, Medicina Ocupacional, del Deporte', orden: 7 },
];

export const ESPECIALIDADES_MEDICAS: EspecialidadMedica[] = [
  { id: 'medicina_general', categoria: 'atencion_primaria', nombre: 'Medicina General' },
  { id: 'pediatria', categoria: 'atencion_primaria', nombre: 'Pediatría' },
  { id: 'geriatria', categoria: 'atencion_primaria', nombre: 'Geriatría' },
  { id: 'cardiologia', categoria: 'especialidades_clinicas', nombre: 'Cardiología' },
  { id: 'neurologia', categoria: 'especialidades_clinicas', nombre: 'Neurología' },
  { id: 'gastroenterologia', categoria: 'especialidades_clinicas', nombre: 'Gastroenterología' },
  { id: 'endocrinologia', categoria: 'especialidades_clinicas', nombre: 'Endocrinología' },
  { id: 'cirugia_general', categoria: 'especialidades_quirurgicas', nombre: 'Cirugía General' },
  { id: 'traumatologia', categoria: 'especialidades_quirurgicas', nombre: 'Traumatología' },
  { id: 'neurocirugia', categoria: 'especialidades_quirurgicas', nombre: 'Neurocirugía' },
  { id: 'ginecologia', categoria: 'medico_quirurgicas', nombre: 'Ginecología y Obstetricia' },
  { id: 'urologia', categoria: 'medico_quirurgicas', nombre: 'Urología' },
  { id: 'oftalmologia', categoria: 'medico_quirurgicas', nombre: 'Oftalmología' },
  { id: 'orl', categoria: 'medico_quirurgicas', nombre: 'Otorrinolaringología' },
  { id: 'patologia', categoria: 'diagnostico_apoyo', nombre: 'Patología' },
  { id: 'radiologia', categoria: 'diagnostico_apoyo', nombre: 'Radiología' },
  { id: 'imagenologia', categoria: 'diagnostico_apoyo', nombre: 'Imagenología' },
  { id: 'medicina_critica', categoria: 'critica_urgencias', nombre: 'Medicina Crítica' },
  { id: 'anestesiologia', categoria: 'critica_urgencias', nombre: 'Anestesiología' },
  { id: 'emergencias', categoria: 'critica_urgencias', nombre: 'Emergentología' },
  { id: 'fisiatria', categoria: 'salud_publica', nombre: 'Fisiatría' },
  { id: 'medicina_ocupacional', categoria: 'salud_publica', nombre: 'Medicina Ocupacional' },
  { id: 'medicina_deporte', categoria: 'salud_publica', nombre: 'Medicina del Deporte' },
];

export const CHECKPOINTS_PREANALITICA: string[] = [
  'Identidad del paciente confirmada',
  'Ayuno / condiciones previas cumplidas',
  'Tubo o recipiente correcto y etiquetado',
  'Registrada la hora de la toma',
  'Muestra en buen estado y sin hemólisis',
];
