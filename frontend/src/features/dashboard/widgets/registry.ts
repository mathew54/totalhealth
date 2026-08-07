import type { ComponentType } from 'react'
import {
  CalculoDosisPediatrica,
  CalculoFiltradoGlomerular,
  CalculoIMC,
  ChecklistOMS,
  EscalaGlasgow,
  Gestograma,
} from './CalculadoresMedicos'
import {
  CalculadoraInfusiones,
  CarnetVacunacion,
  ControlPrenatal,
  DetectorPolifarmacia,
  DiarioMiccional,
  EscalaSOFA,
  PSADensidad,
  RiesgoCardiovascular,
  ValoracionGeriatrica,
} from './CalculadoresAvanzados'
import {
  CadenaCustodia,
  CertificadosSalud,
  DictadoVoz,
  EsquemasTerapeuticos,
  HojaAnestesica,
  LienzoAnatomico,
  PHQ9,
  PlanRehabilitacion,
  PlantillaBIRADS,
  ReporteOperatorio,
} from './FormulariosMedicos'
import { CurvasCrecimiento } from './CurvasCrecimiento'
import { TendenciasParametros } from './TendenciasParametros'
import { NotasPrivadas } from './NotasPrivadas'
import { Genograma } from './Genograma'
import { VisorImagenes } from './VisorImagenes'

export interface WidgetDef {
  id: string
  titulo: string
  descripcion: string
  /** null = aún en desarrollo (tarjeta "Próximamente"). */
  componente: ComponentType | null
}

/**
 * Registro estático de widgets por categoría de especialidad.
 * Las 7 categorías coinciden con `categorias_medicas` del catálogo.
 * Los widgets reales se montan dinámicamente según la especialidad activa
 * (o todas, en vista consolidada); los `null` muestran un placeholder.
 */
export const WIDGETS_POR_CATEGORIA: Record<string, WidgetDef[]> = {
  atencion_primaria: [
    { id: 'imc', titulo: 'Cálculo de IMC', descripcion: 'Clasificación OMS', componente: CalculoIMC },
    { id: 'dosis-pediatrica', titulo: 'Dosis pediátrica', descripcion: 'mg/kg/día ÷ tomas', componente: CalculoDosisPediatrica },
    { id: 'filtrado-glomerular', titulo: 'Filtrado glomerular', descripcion: 'Cockcroft-Gault', componente: CalculoFiltradoGlomerular },
    { id: 'riesgo-cardiovascular', titulo: 'Riesgo cardiovascular', descripcion: 'Conteo de factores de riesgo', componente: RiesgoCardiovascular },
    { id: 'esquema-vacunacion', titulo: 'Carnet de vacunación', descripcion: 'Esquema básico de Venezuela', componente: CarnetVacunacion },
    { id: 'vgi', titulo: 'Valoración geriátrica', descripcion: 'Índice de Barthel', componente: ValoracionGeriatrica },
    { id: 'polifarmacia', titulo: 'Detector de polifarmacia', descripcion: 'Clases farmacológicas activas', componente: DetectorPolifarmacia },
    { id: 'curvas-crecimiento', titulo: 'Curvas de crecimiento OMS/CDC', descripcion: 'Percentiles por edad (0–60 meses)', componente: CurvasCrecimiento },
  ],
  especialidades_clinicas: [
    { id: 'phq9', titulo: 'Escala PHQ-9', descripcion: 'Cribado de depresión', componente: PHQ9 },
    { id: 'tendencias', titulo: 'Tendencias de parámetros', descripcion: 'Evolución de laboratorios por paciente', componente: TendenciasParametros },
    { id: 'notas-clinicas', titulo: 'Notas de evolución privadas', descripcion: 'Solo visibles para el autor (persistidas)', componente: NotasPrivadas },
    { id: 'escalas-psicometricas', titulo: 'Otras escalas psicométricas', descripcion: 'GAD-7, MoCA, etc.', componente: null },
  ],
  especialidades_quirurgicas: [
    { id: 'checklist-oms', titulo: 'Checklist OMS', descripcion: 'Verificación quirúrgica segura', componente: ChecklistOMS },
    { id: 'reporte-operatorio', titulo: 'Reporte operatorio', descripcion: 'Plantilla estructurada de quirófano', componente: ReporteOperatorio },
    { id: 'lienzo-anatomico', titulo: 'Lienzo anatómico', descripcion: 'Anotaciones sobre esquema corporal', componente: LienzoAnatomico },
    { id: 'dicom', titulo: 'Visor de imágenes', descripcion: 'Rx, eco, TC y RM del paciente (zoom/pan)', componente: VisorImagenes },
  ],
  medico_quirurgicas: [
    { id: 'gestograma', titulo: 'Gestograma', descripcion: 'Regla de Naegele', componente: Gestograma },
    { id: 'control-prenatal', titulo: 'Control prenatal', descripcion: 'Altura uterina vs. semanas de gestación', componente: ControlPrenatal },
    { id: 'psa', titulo: 'Interpretación de PSA', descripcion: 'Densidad y PSA libre/total', componente: PSADensidad },
    { id: 'diario-miccional', titulo: 'Diario miccional', descripcion: 'Frecuencia, volumen y nocturia', componente: DiarioMiccional },
    { id: 'esquemas-terapeuticos', titulo: 'Esquemas terapéuticos', descripcion: 'Referencia rápida de protocolos', componente: EsquemasTerapeuticos },
  ],
  diagnostico_apoyo: [
    { id: 'dictado', titulo: 'Dictado por voz', descripcion: 'Transcripción por Web Speech API', componente: DictadoVoz },
    { id: 'plantillas', titulo: 'Plantilla BI-RADS', descripcion: 'Informe estructurado de mamografía', componente: PlantillaBIRADS },
    { id: 'genograma', titulo: 'Genograma familiar', descripcion: 'Árbol de 3 generaciones anotable', componente: Genograma },
  ],
  critica_urgencias: [
    { id: 'glasgow', titulo: 'Escala de Glasgow', descripcion: 'Nivel de conciencia', componente: EscalaGlasgow },
    { id: 'sofa', titulo: 'Escala SOFA', descripcion: 'Falla orgánica en críticos', componente: EscalaSOFA },
    { id: 'infusiones', titulo: 'Calculadora de infusiones', descripcion: 'mcg/kg/min y goteo IV', componente: CalculadoraInfusiones },
    { id: 'hoja-anestesica', titulo: 'Hoja anestésica', descripcion: 'Registro transanestésico', componente: HojaAnestesica },
  ],
  salud_publica: [
    { id: 'rehabilitacion', titulo: 'Plan de rehabilitación', descripcion: 'Rutinas por patología', componente: PlanRehabilitacion },
    { id: 'certificados', titulo: 'Certificados de salud', descripcion: 'Reposo, aptitud y constancias', componente: CertificadosSalud },
    { id: 'cadena-custodia', titulo: 'Cadena de custodia', descripcion: 'Registro con hash SHA-256', componente: CadenaCustodia },
  ],
}
