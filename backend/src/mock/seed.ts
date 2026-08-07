import type { Row } from './store.js'
import { fechaHoyCaracas } from '../services/bcv.js'

export const CLINICA_ID = '00000000-0000-0000-0000-000000000001'

// Usuarios autenticados (login demo). Password común: demo1234
export const DEMO_PASSWORD = 'demo1234'

export const AUTH_USERS: { id: string; email: string; password: string }[] = [
  { id: '10000000-0000-0000-0000-000000000001', email: 'super@totalhealth.local', password: DEMO_PASSWORD },
  { id: '10000000-0000-0000-0000-000000000002', email: 'admin@totalhealth.local', password: DEMO_PASSWORD },
  { id: '10000000-0000-0000-0000-000000000003', email: 'dra@totalhealth.local', password: DEMO_PASSWORD },
  { id: '10000000-0000-0000-0000-000000000004', email: 'lab@totalhealth.local', password: DEMO_PASSWORD },
  { id: '10000000-0000-0000-0000-000000000005', email: 'sec@totalhealth.local', password: DEMO_PASSWORD },
  { id: '10000000-0000-0000-0000-000000000006', email: 'dra.suarez@totalhealth.local', password: DEMO_PASSWORD },
  { id: '10000000-0000-0000-0000-000000000007', email: 'dr.ramirez@totalhealth.local', password: DEMO_PASSWORD },
]

const dayAgo = (d: number, h = 10) => {
  const t = new Date()
  t.setDate(t.getDate() - d)
  t.setHours(h, 30, 0, 0)
  return t.toISOString()
}

const future = (d: number, h = 10) => {
  const t = new Date()
  t.setDate(t.getDate() + d)
  t.setHours(h, 30, 0, 0)
  return t.toISOString()
}

const todayISO = () => fechaHoyCaracas()

export const SEED: Record<string, Row[]> = {
  app_config: [
    {
      id: true,
      razon_social: 'Clínica Demo TotalHealth',
      rif: 'J-00000000-0',
      logo_url: '/favicon.svg',
      header_color: '#8b5cf6',
      preanalitica: { habilitado: true, obligatorio: true },
      updated_at: dayAgo(30),
    },
  ],

  clinicas: [
    {
      id: CLINICA_ID,
      nombre: 'Clínica Demo TotalHealth',
      rif: 'J-00000000-0',
      direccion: 'Av. Principal, Caracas',
      telefono: '+584121234567',
      config: { pago_consulta: 40 },
      created_at: dayAgo(30),
      updated_at: dayAgo(30),
    },
  ],

  profiles: [
    { id: AUTH_USERS[0].id, role: 'super_root', roles: ['super_root'], email: AUTH_USERS[0].email, clinica_id: null, nombre_completo: 'Super Root', cedula: 'V-11111111', telefono: null, activo: true, created_at: dayAgo(30), updated_at: dayAgo(30) },
    { id: AUTH_USERS[1].id, role: 'admin', roles: ['admin'], email: AUTH_USERS[1].email, clinica_id: CLINICA_ID, nombre_completo: 'Dr. Luis Contreras', cedula: 'V-11222333', telefono: '+584121111111', especialidad: 'Medicina General', especialidades: ['medicina_general'], especialidad_activa: 'medicina_general', categoria_medica: 'atencion_primaria', colegiatura: 'V-11222333', firma_digital: 'sha256:demo-firma-admin', dashboard_config: { vista: 'consolidada' }, activo: true, created_at: dayAgo(25), updated_at: dayAgo(25) },
    // Médico multiespecialidad: demuestra el selector de especialidad activa y
    // el dashboard consolidado (Atención Primaria + Pediatría).
    { id: AUTH_USERS[2].id, role: 'medico', roles: ['medico', 'secretaria'], email: AUTH_USERS[2].email, clinica_id: CLINICA_ID, nombre_completo: 'Dra. María Fernández', cedula: 'V-99888777', telefono: '+584122222222', especialidad: 'Medicina General', especialidades: ['medicina_general', 'pediatria'], especialidad_activa: 'medicina_general', categoria_medica: 'atencion_primaria', colegiatura: 'V-99888777', firma_digital: 'sha256:demo-firma-maria', dashboard_config: { vista: 'consolidada' }, activo: true, created_at: dayAgo(20), updated_at: dayAgo(20) },
    { id: AUTH_USERS[3].id, role: 'laboratorio', roles: ['laboratorio'], email: AUTH_USERS[3].email, clinica_id: CLINICA_ID, nombre_completo: 'Lic. Pedro Rodríguez', cedula: 'V-44556677', telefono: '+584123333333', activo: true, created_at: dayAgo(20), updated_at: dayAgo(20) },
    { id: AUTH_USERS[4].id, role: 'secretaria', roles: ['secretaria'], email: AUTH_USERS[4].email, clinica_id: CLINICA_ID, nombre_completo: 'Ana Gómez', cedula: 'V-33445566', telefono: '+584124444444', activo: true, created_at: dayAgo(15), updated_at: dayAgo(15) },
    { id: AUTH_USERS[5].id, role: 'medico', roles: ['medico'], email: AUTH_USERS[5].email, clinica_id: CLINICA_ID, nombre_completo: 'Dra. Ana Suárez', cedula: 'V-88776655', telefono: '+584125555555', especialidad: 'Cardiología', especialidades: ['cardiologia'], especialidad_activa: 'cardiologia', categoria_medica: 'especialidades_clinicas', colegiatura: 'V-88776655', firma_digital: 'sha256:demo-firma-ana', dashboard_config: { vista: 'consolidada' }, activo: true, created_at: dayAgo(18), updated_at: dayAgo(18) },
    { id: AUTH_USERS[6].id, role: 'medico', roles: ['medico'], email: AUTH_USERS[6].email, clinica_id: CLINICA_ID, nombre_completo: 'Dr. José Ramírez', cedula: 'V-77665544', telefono: '+584126666666', especialidad: 'Traumatología', especialidades: ['traumatologia'], especialidad_activa: 'traumatologia', categoria_medica: 'especialidades_quirurgicas', colegiatura: 'V-77665544', firma_digital: 'sha256:demo-firma-jose', dashboard_config: { vista: 'consolidada' }, activo: true, created_at: dayAgo(16), updated_at: dayAgo(16) },
  ],

  pacientes: [
    { id: '20000000-0000-0000-0000-000000000001', cedula: 'V-12345678', nombre_completo: 'Juan Pérez', fecha_nacimiento: '1985-03-12', telefono: '+584141234567', email: 'juan.perez@example.com', direccion: 'Caracas', sexo: 'M', clinica_id: CLINICA_ID, fecha_consentimiento: dayAgo(14), created_at: dayAgo(14), updated_at: dayAgo(14), deleted_at: null },
    { id: '20000000-0000-0000-0000-000000000002', cedula: 'V-23456789', nombre_completo: 'María García', fecha_nacimiento: '1992-07-25', telefono: '+584150000001', email: 'maria.garcia@example.com', direccion: 'Caracas', sexo: 'F', clinica_id: CLINICA_ID, fecha_consentimiento: dayAgo(10), created_at: dayAgo(10), updated_at: dayAgo(10), deleted_at: null },
    { id: '20000000-0000-0000-0000-000000000003', cedula: 'V-34567890', nombre_completo: 'Carlos Martínez', fecha_nacimiento: '1978-11-02', telefono: '+584150000002', email: null, direccion: 'Maracay', sexo: 'M', clinica_id: CLINICA_ID, fecha_consentimiento: dayAgo(5), created_at: dayAgo(5), updated_at: dayAgo(5), deleted_at: null },
    { id: '20000000-0000-0000-0000-000000000004', cedula: 'E-98765432', nombre_completo: 'Laura Torres', fecha_nacimiento: '2000-01-30', telefono: '+584150000003', email: 'laura.torres@example.com', direccion: 'Caracas', sexo: 'F', clinica_id: CLINICA_ID, fecha_consentimiento: dayAgo(3), created_at: dayAgo(3), updated_at: dayAgo(3), deleted_at: null },
    // Menor sin cédula propia: se identifica por su representante (Juan Pérez).
    { id: '20000000-0000-0000-0000-000000000005', cedula: null, tipo_documento: null, nombre_completo: 'Samuel Pérez', fecha_nacimiento: '2016-06-20', telefono: null, email: null, direccion: 'Caracas', sexo: 'M', es_menor: true, representante_id: '20000000-0000-0000-0000-000000000001', parentesco_representante: 'hijo', clinica_id: CLINICA_ID, fecha_consentimiento: dayAgo(1), created_at: dayAgo(1), updated_at: dayAgo(1), deleted_at: null },
    // Ejemplo de paciente con pasaporte (tipo P).
    { id: '20000000-0000-0000-0000-000000000006', cedula: 'P-1234567', tipo_documento: 'P', nombre_completo: 'Nikolai Petrov', fecha_nacimiento: '1988-04-12', telefono: '+584150000004', email: null, direccion: 'Caracas', sexo: 'M', es_menor: false, representante_id: null, parentesco_representante: null, clinica_id: CLINICA_ID, fecha_consentimiento: dayAgo(2), created_at: dayAgo(2), updated_at: dayAgo(2), deleted_at: null },
  ],

  consultas: [
    { id: '30000000-0000-0000-0000-000000000001', paciente_id: '20000000-0000-0000-0000-000000000001', medico_id: AUTH_USERS[2].id, clinica_id: CLINICA_ID, fecha_hora: dayAgo(7, 9), motivo: 'Chequeo general', diagnostico: 'Paciente sano', notas: null, estado: 'completada', origen: 'staff', created_at: dayAgo(7), updated_at: dayAgo(7) },
    { id: '30000000-0000-0000-0000-000000000002', paciente_id: '20000000-0000-0000-0000-000000000002', medico_id: AUTH_USERS[2].id, clinica_id: CLINICA_ID, fecha_hora: dayAgo(4, 11), motivo: 'Dolor abdominal', diagnostico: 'Gastritis leve', notas: 'Indicar dieta blanda', estado: 'completada', origen: 'staff', created_at: dayAgo(4), updated_at: dayAgo(4) },
    { id: '30000000-0000-0000-0000-000000000003', paciente_id: '20000000-0000-0000-0000-000000000003', medico_id: AUTH_USERS[2].id, clinica_id: CLINICA_ID, fecha_hora: dayAgo(2, 15), motivo: 'Control de glicemia', diagnostico: 'Pendiente de resultados', notas: null, estado: 'completada', origen: 'staff', created_at: dayAgo(2), updated_at: dayAgo(2) },
    { id: '30000000-0000-0000-0000-000000000004', paciente_id: '20000000-0000-0000-0000-000000000004', medico_id: AUTH_USERS[2].id, clinica_id: CLINICA_ID, fecha_hora: future(1, 9), motivo: 'Primera consulta', diagnostico: null, notas: null, estado: 'programada', origen: 'online', created_at: dayAgo(0), updated_at: dayAgo(0) },
    { id: '30000000-0000-0000-0000-000000000005', paciente_id: '20000000-0000-0000-0000-000000000001', medico_id: AUTH_USERS[2].id, clinica_id: CLINICA_ID, fecha_hora: future(3, 11), motivo: 'Control anual', diagnostico: null, notas: null, estado: 'programada', origen: 'online', created_at: dayAgo(0), updated_at: dayAgo(0) },
  ],

  vinculos_familiares: [
    { id: '31000000-0000-0000-0000-000000000001', paciente_id: '20000000-0000-0000-0000-000000000001', dependiente_id: '20000000-0000-0000-0000-000000000002', parentesco: 'hermana', created_at: dayAgo(10) },
    { id: '31000000-0000-0000-0000-000000000002', paciente_id: '20000000-0000-0000-0000-000000000001', dependiente_id: '20000000-0000-0000-0000-000000000004', parentesco: 'hija', created_at: dayAgo(8) },
    { id: '31000000-0000-0000-0000-0000-000000000003', paciente_id: '20000000-0000-0000-0000-000000000002', dependiente_id: '20000000-0000-0000-0000-000000000001', parentesco: 'hermano', created_at: dayAgo(10) },
    { id: '31000000-0000-0000-0000-000000000004', paciente_id: '20000000-0000-0000-0000-000000000001', dependiente_id: '20000000-0000-0000-0000-000000000005', parentesco: 'hijo', created_at: dayAgo(1) },
  ],

  tasas_cambio: [
    // Tasa activa del día (manual) + alternativa del scraping BCV (inactiva).
    { id: '9D000000-0000-0000-0000-000000000001', fecha: todayISO(), moneda: 'USD', valor: 755.9, origen: 'manual', activa: true, actualizado_por: AUTH_USERS[1].id, created_at: dayAgo(0) },
    { id: '9D000000-0000-0000-0000-000000000002', fecha: todayISO(), moneda: 'EUR', valor: 872.84, origen: 'manual', activa: true, actualizado_por: AUTH_USERS[1].id, created_at: dayAgo(0) },
    { id: '9D000000-0000-0000-0000-000000000003', fecha: todayISO(), moneda: 'USD', valor: 755.16, origen: 'bcv', activa: false, actualizado_por: null, created_at: dayAgo(0) },
    { id: '9D000000-0000-0000-0000-000000000004', fecha: todayISO(), moneda: 'EUR', valor: 870.04, origen: 'bcv', activa: false, actualizado_por: null, created_at: dayAgo(0) },
  ],

  examenes_laboratorio: [
    { id: '40000000-0000-0000-0000-000000000001', clinica_id: CLINICA_ID, nombre: 'Hematología completa', categoria: 'Hematología', precio: 15, interno: true, duracion_min: 45, condiciones_previas: null, tiempo_entrega: 'Mismo día', codigo_loinc: '58410-2', codigo_externo: 'HEMO-01', fecha_mapeo: dayAgo(30), activo: true, created_at: dayAgo(30) },
    { id: '40000000-0000-0000-0000-000000000002', clinica_id: CLINICA_ID, nombre: 'Glicemia en ayunas', categoria: 'Química', precio: 10, interno: true, duracion_min: 20, condiciones_previas: 'Ayuno de 8 a 12 horas', tiempo_entrega: '24 horas', codigo_loinc: '2345-7', codigo_externo: 'GLI-01', fecha_mapeo: dayAgo(30), activo: true, created_at: dayAgo(30) },
    { id: '40000000-0000-0000-0000-000000000003', clinica_id: CLINICA_ID, nombre: 'Colesterol total', categoria: 'Química', precio: 12, interno: true, duracion_min: 25, condiciones_previas: 'Ayuno de 12 horas', tiempo_entrega: '24 horas', codigo_loinc: '2093-3', codigo_externo: 'COL-01', fecha_mapeo: dayAgo(30), activo: true, created_at: dayAgo(30) },
    { id: '40000000-0000-0000-0000-000000000004', clinica_id: CLINICA_ID, nombre: 'Uroanálisis', categoria: 'Orina', precio: 8, interno: true, duracion_min: 30, condiciones_previas: 'Primera orina de la mañana', tiempo_entrega: 'Mismo día', codigo_loinc: '24356-8', codigo_externo: 'URO-01', fecha_mapeo: dayAgo(30), activo: true, created_at: dayAgo(30) },
    { id: '40000000-0000-0000-0000-000000000005', clinica_id: CLINICA_ID, nombre: 'TSH ultrasensible', categoria: 'Hormonas', precio: 22, interno: false, duracion_min: 0, condiciones_previas: null, tiempo_entrega: '48 horas (referido)', codigo_loinc: '3016-3', codigo_externo: 'TSH-01', fecha_mapeo: dayAgo(30), activo: true, created_at: dayAgo(30) },
  ],

  solicitudes: [
    { id: '50000000-0000-0000-0000-000000000001', consulta_id: '30000000-0000-0000-0000-000000000001', paciente_id: '20000000-0000-0000-0000-000000000001', medico_id: AUTH_USERS[2].id, clinica_id: CLINICA_ID, fecha: dayAgo(7), estado: 'entregado', cobrado: true, nota: null, created_at: dayAgo(7), updated_at: dayAgo(6) },
    { id: '50000000-0000-0000-0000-000000000002', consulta_id: '30000000-0000-0000-0000-000000000002', paciente_id: '20000000-0000-0000-0000-000000000002', medico_id: AUTH_USERS[2].id, clinica_id: CLINICA_ID, fecha: dayAgo(4), estado: 'listo', cobrado: true, nota: null, created_at: dayAgo(4), updated_at: dayAgo(1) },
    { id: '50000000-0000-0000-0000-000000000003', consulta_id: '30000000-0000-0000-0000-000000000003', paciente_id: '20000000-0000-0000-0000-000000000003', medico_id: AUTH_USERS[2].id, clinica_id: CLINICA_ID, fecha: dayAgo(2), estado: 'en_proceso', cobrado: true, nota: null, created_at: dayAgo(2), updated_at: dayAgo(0) },
    { id: '50000000-0000-0000-0000-000000000004', consulta_id: null, paciente_id: '20000000-0000-0000-0000-000000000004', medico_id: AUTH_USERS[2].id, clinica_id: CLINICA_ID, fecha: dayAgo(0), estado: 'pendiente', cobrado: false, nota: null, created_at: dayAgo(0), updated_at: dayAgo(0) },
    { id: '50000000-0000-0000-0000-000000000005', consulta_id: null, paciente_id: '20000000-0000-0000-0000-000000000001', medico_id: AUTH_USERS[2].id, clinica_id: CLINICA_ID, fecha: dayAgo(35), estado: 'entregado', cobrado: true, nota: null, created_at: dayAgo(35), updated_at: dayAgo(34) },
    { id: '50000000-0000-0000-0000-000000000006', consulta_id: null, paciente_id: '20000000-0000-0000-0000-000000000001', medico_id: AUTH_USERS[2].id, clinica_id: CLINICA_ID, fecha: dayAgo(28), estado: 'entregado', cobrado: true, nota: null, created_at: dayAgo(28), updated_at: dayAgo(27) },
    { id: '50000000-0000-0000-0000-000000000007', consulta_id: null, paciente_id: '20000000-0000-0000-0000-000000000001', medico_id: AUTH_USERS[2].id, clinica_id: CLINICA_ID, fecha: dayAgo(21), estado: 'entregado', cobrado: true, nota: null, created_at: dayAgo(21), updated_at: dayAgo(20) },
    { id: '50000000-0000-0000-0000-000000000008', consulta_id: null, paciente_id: '20000000-0000-0000-0000-000000000001', medico_id: AUTH_USERS[2].id, clinica_id: CLINICA_ID, fecha: dayAgo(14), estado: 'entregado', cobrado: true, nota: null, created_at: dayAgo(14), updated_at: dayAgo(13) },
    { id: '50000000-0000-0000-0000-000000000009', consulta_id: null, paciente_id: '20000000-0000-0000-0000-000000000002', medico_id: AUTH_USERS[2].id, clinica_id: CLINICA_ID, fecha: dayAgo(1), estado: 'pendiente', cobrado: false, descuento: 0, nota: null, created_at: dayAgo(1), updated_at: dayAgo(1) },
  ],

  solicitudes_detalle: [
    { id: '60000000-0000-0000-0000-000000000001', solicitud_id: '50000000-0000-0000-0000-000000000001', examen_id: '40000000-0000-0000-0000-000000000001', resultado_id: '70000000-0000-0000-0000-000000000001', precio: 15 },
    { id: '60000000-0000-0000-0000-000000000002', solicitud_id: '50000000-0000-0000-0000-000000000001', examen_id: '40000000-0000-0000-0000-000000000002', resultado_id: '70000000-0000-0000-0000-000000000002', precio: 10 },
    { id: '60000000-0000-0000-0000-000000000003', solicitud_id: '50000000-0000-0000-0000-000000000002', examen_id: '40000000-0000-0000-0000-000000000004', resultado_id: '70000000-0000-0000-0000-000000000003', precio: 8 },
    { id: '60000000-0000-0000-0000-000000000004', solicitud_id: '50000000-0000-0000-0000-000000000003', examen_id: '40000000-0000-0000-0000-000000000002', resultado_id: null, precio: 10 },
    { id: '60000000-0000-0000-0000-000000000005', solicitud_id: '50000000-0000-0000-0000-000000000003', examen_id: '40000000-0000-0000-0000-000000000003', resultado_id: null, precio: 12 },
    { id: '60000000-0000-0000-0000-000000000006', solicitud_id: '50000000-0000-0000-0000-000000000004', examen_id: '40000000-0000-0000-0000-000000000005', resultado_id: null, precio: 22 },
    { id: '60000000-0000-0000-0000-000000000007', solicitud_id: '50000000-0000-0000-0000-000000000005', examen_id: '40000000-0000-0000-0000-000000000002', resultado_id: '70000000-0000-0000-0000-000000000004', precio: 10 },
    { id: '60000000-0000-0000-0000-000000000008', solicitud_id: '50000000-0000-0000-0000-000000000006', examen_id: '40000000-0000-0000-0000-000000000003', resultado_id: '70000000-0000-0000-0000-000000000005', precio: 12 },
    { id: '60000000-0000-0000-0000-000000000009', solicitud_id: '50000000-0000-0000-0000-000000000007', examen_id: '40000000-0000-0000-0000-000000000002', resultado_id: '70000000-0000-0000-0000-000000000006', precio: 10 },
    { id: '60000000-0000-0000-0000-000000000010', solicitud_id: '50000000-0000-0000-0000-000000000008', examen_id: '40000000-0000-0000-0000-000000000003', resultado_id: '70000000-0000-0000-0000-000000000007', precio: 12 },
    { id: '60000000-0000-0000-0000-000000000011', solicitud_id: '50000000-0000-0000-0000-000000000009', examen_id: '40000000-0000-0000-0000-000000000001', resultado_id: null, precio: 15 },
    { id: '60000000-0000-0000-0000-000000000012', solicitud_id: '50000000-0000-0000-0000-000000000009', examen_id: '40000000-0000-0000-0000-000000000002', resultado_id: null, precio: 10 },
  ],

  resultados: [
    { id: '70000000-0000-0000-0000-000000000001', solicitud_detalle_id: '60000000-0000-0000-0000-000000000001', bioanalista_id: AUTH_USERS[3].id, valores: { globulos_rojos: '4.8 M/uL', hemoglobina: '14.5 g/dL', glicemia: null }, pdf_path: 'resultados/demo/hemato-juan.pdf', observaciones: 'Dentro de rangos', procesado_at: dayAgo(6), created_at: dayAgo(6) },
    { id: '70000000-0000-0000-0000-000000000002', solicitud_detalle_id: '60000000-0000-0000-0000-000000000002', bioanalista_id: AUTH_USERS[3].id, valores: { glicemia: '88 mg/dL' }, pdf_path: 'resultados/demo/glicemia-juan.pdf', observaciones: 'Normal', procesado_at: dayAgo(6), created_at: dayAgo(6) },
    { id: '70000000-0000-0000-0000-000000000003', solicitud_detalle_id: '60000000-0000-0000-0000-000000000003', bioanalista_id: AUTH_USERS[3].id, valores: { aspecto: 'Ligeramente turbio', ph: '5.5' }, pdf_path: 'resultados/demo/uroanalisis-maria.pdf', observaciones: null, procesado_at: dayAgo(1), created_at: dayAgo(1) },
    { id: '70000000-0000-0000-0000-000000000004', solicitud_detalle_id: '60000000-0000-0000-0000-000000000007', bioanalista_id: AUTH_USERS[3].id, valores: { glicemia: '97 mg/dL' }, pdf_path: null, observaciones: 'Control', procesado_at: dayAgo(34), created_at: dayAgo(34) },
    { id: '70000000-0000-0000-0000-000000000005', solicitud_detalle_id: '60000000-0000-0000-0000-000000000008', bioanalista_id: AUTH_USERS[3].id, valores: { colesterol_total: '212 mg/dL', trigliceridos: '150 mg/dL' }, pdf_path: null, observaciones: null, procesado_at: dayAgo(27), created_at: dayAgo(27) },
    { id: '70000000-0000-0000-0000-000000000006', solicitud_detalle_id: '60000000-0000-0000-0000-000000000009', bioanalista_id: AUTH_USERS[3].id, valores: { glicemia: '102 mg/dL' }, pdf_path: null, observaciones: null, procesado_at: dayAgo(20), created_at: dayAgo(20) },
    { id: '70000000-0000-0000-0000-000000000007', solicitud_detalle_id: '60000000-0000-0000-0000-000000000010', bioanalista_id: AUTH_USERS[3].id, valores: { colesterol_total: '198 mg/dL', trigliceridos: '138 mg/dL' }, pdf_path: null, observaciones: null, procesado_at: dayAgo(13), created_at: dayAgo(13) },
  ],

  recipes: [
    { id: '80000000-0000-0000-0000-000000000001', consulta_id: '30000000-0000-0000-0000-000000000002', paciente_id: '20000000-0000-0000-0000-000000000002', medico_id: AUTH_USERS[2].id, clinica_id: CLINICA_ID, fecha_emision: dayAgo(4), fecha_expiracion: future(26), estado: 'activo', created_at: dayAgo(4) },
    { id: '80000000-0000-0000-0000-000000000002', consulta_id: '30000000-0000-0000-0000-000000000001', paciente_id: '20000000-0000-0000-0000-000000000001', medico_id: AUTH_USERS[2].id, clinica_id: CLINICA_ID, fecha_emision: dayAgo(7), fecha_expiracion: future(23), estado: 'activo', created_at: dayAgo(7) },
  ],

  recipes_detalle: [
    { id: '81000000-0000-0000-0000-000000000001', recipe_id: '80000000-0000-0000-0000-000000000001', medicamento: 'Omeprazol 20 mg', presentacion: 'Caja 14 cápsulas', dosis: '1 cápsula', frecuencia: 'Cada 24 h en ayunas', indicaciones: 'Antes del desayuno', duracion: '14 días' },
    { id: '81000000-0000-0000-0000-000000000002', recipe_id: '80000000-0000-0000-0000-000000000002', medicamento: 'Paracetamol 500 mg', presentacion: 'Blíster 20 tabletas', dosis: '1 tableta', frecuencia: 'Cada 8 h si hay dolor', indicaciones: null, duracion: '5 días' },
  ],

  pagos: [
    { id: '90000000-0000-0000-0000-000000000001', tipo: 'laboratorio', solicitud_id: '50000000-0000-0000-0000-000000000001', consulta_id: null, paciente_id: '20000000-0000-0000-0000-000000000001', clinica_id: CLINICA_ID, monto: 25, moneda: 'USD', tasa_usd: 755.9, descuento: 0, iva: 4, metodo: 'efectivo', secretaria_id: AUTH_USERS[4].id, fecha: dayAgo(7), estado: 'pagado', provider: 'mock', provider_ref: 'MOCK-101' },
    { id: '90000000-0000-0000-0000-000000000002', tipo: 'laboratorio', solicitud_id: '50000000-0000-0000-0000-000000000002', consulta_id: null, paciente_id: '20000000-0000-0000-0000-000000000002', clinica_id: CLINICA_ID, monto: 8, moneda: 'USD', tasa_usd: 755.9, descuento: 0, iva: 1.28, metodo: 'punto', secretaria_id: AUTH_USERS[4].id, fecha: dayAgo(4), estado: 'pagado', provider: 'mock', provider_ref: 'MOCK-102' },
    { id: '90000000-0000-0000-0000-000000000003', tipo: 'laboratorio', solicitud_id: '50000000-0000-0000-0000-000000000003', consulta_id: null, paciente_id: '20000000-0000-0000-0000-000000000003', clinica_id: CLINICA_ID, monto: 22, moneda: 'USD', tasa_usd: 755.9, descuento: 0, iva: 3.52, metodo: 'efectivo', secretaria_id: AUTH_USERS[4].id, fecha: dayAgo(2), estado: 'pagado', provider: 'mock', provider_ref: 'MOCK-103' },
  ],

  reactivos: [
    { id: '91000000-0000-0000-0000-000000000001', clinica_id: CLINICA_ID, nombre: 'Tiras reactivas glucosa', lote: 'GLU-2026-01', fecha_vencimiento: '2026-12-01', cantidad: 120, alerta_minima: 30, proveedor: 'MediLab', created_at: dayAgo(30) },
    { id: '91000000-0000-0000-0000-000000000002', clinica_id: CLINICA_ID, nombre: 'HemoCue Hb 301', lote: 'HEM-2026-02', fecha_vencimiento: '2026-09-01', cantidad: 15, alerta_minima: 10, proveedor: 'BioTech', created_at: dayAgo(30) },
  ],

  portal_codigos: [],

  notificaciones: [
    { id: '93000000-0000-0000-0000-000000000001', paciente_id: '20000000-0000-0000-0000-000000000001', canal: 'push', tipo: 'resultado', mensaje: 'Juan Pérez, el resultado de Glicemia en ayunas ya está disponible. Consúltalo desde tu portal.', estado: 'enviada', enviada_at: dayAgo(6), created_at: dayAgo(6) },
    { id: '93000000-0000-0000-0000-000000000002', paciente_id: '20000000-0000-0000-0000-000000000001', canal: 'push', tipo: 'cita', mensaje: 'Juan Pérez, te recordamos tu cita con Dra. María Fernández el próximo día a las 11:30.', estado: 'pendiente', programada_para: future(1, 9), metadata: { fecha_cita: future(3, 11) }, created_at: dayAgo(0) },
  ],

  muestras_domicilio: [
    { id: '94000000-0000-0000-0000-000000000001', clinica_id: CLINICA_ID, solicitud_id: '50000000-0000-0000-0000-000000000004', paciente_id: '20000000-0000-0000-0000-000000000004', direccion: 'Av. Principal, Caracas', telefono: '+584150000003', fecha_visita: future(1, 8), estado: 'programada', ubicacion: null, notas: 'Primera toma', creado_por: AUTH_USERS[4].id, created_at: dayAgo(0), updated_at: dayAgo(0) },
    { id: '94000000-0000-0000-0000-000000000002', clinica_id: CLINICA_ID, solicitud_id: null, paciente_id: '20000000-0000-0000-0000-000000000003', direccion: 'Maracay', telefono: '+584150000002', fecha_visita: null, estado: 'solicitada', ubicacion: null, notas: null, creado_por: AUTH_USERS[4].id, created_at: dayAgo(0), updated_at: dayAgo(0) },
  ],

  turnos: [
    { id: '95000000-0000-0000-0000-000000000001', clinica_id: CLINICA_ID, consulta_id: '30000000-0000-0000-0000-000000000004', paciente_id: '20000000-0000-0000-0000-000000000004', numero: 1, fecha: todayISO(), estado: 'llamado', prioridad: 'normal', creado_por: AUTH_USERS[4].id, hora_creado: dayAgo(0), hora_llamado: dayAgo(0), hora_atendido: null },
    { id: '95000000-0000-0000-0000-000000000002', clinica_id: CLINICA_ID, consulta_id: '30000000-0000-0000-0000-000000000005', paciente_id: '20000000-0000-0000-0000-000000000001', numero: 2, fecha: todayISO(), estado: 'esperando', prioridad: 'prioridad', creado_por: AUTH_USERS[4].id, hora_creado: dayAgo(0), hora_llamado: null, hora_atendido: null },
    { id: '95000000-0000-0000-0000-000000000003', clinica_id: CLINICA_ID, consulta_id: null, paciente_id: '20000000-0000-0000-0000-000000000002', numero: 3, fecha: todayISO(), estado: 'esperando', prioridad: 'normal', creado_por: AUTH_USERS[4].id, hora_creado: dayAgo(0), hora_llamado: null, hora_atendido: null },
  ],

  disponibilidad_medico: [
    { id: '96000000-0000-0000-0000-000000000001', medico_id: AUTH_USERS[2].id, clinica_id: CLINICA_ID, dia: 1, hora_inicio: '08:00:00', hora_fin: '16:00:00', duracion_min: 30, activo: true, created_at: dayAgo(20), updated_at: dayAgo(20) },
    { id: '96000000-0000-0000-0000-000000000002', medico_id: AUTH_USERS[2].id, clinica_id: CLINICA_ID, dia: 2, hora_inicio: '08:00:00', hora_fin: '16:00:00', duracion_min: 30, activo: true, created_at: dayAgo(20), updated_at: dayAgo(20) },
    { id: '96000000-0000-0000-0000-000000000003', medico_id: AUTH_USERS[2].id, clinica_id: CLINICA_ID, dia: 3, hora_inicio: '08:00:00', hora_fin: '16:00:00', duracion_min: 30, activo: true, created_at: dayAgo(20), updated_at: dayAgo(20) },
    { id: '96000000-0000-0000-0000-000000000004', medico_id: AUTH_USERS[2].id, clinica_id: CLINICA_ID, dia: 4, hora_inicio: '08:00:00', hora_fin: '16:00:00', duracion_min: 30, activo: true, created_at: dayAgo(20), updated_at: dayAgo(20) },
    { id: '96000000-0000-0000-0000-000000000005', medico_id: AUTH_USERS[2].id, clinica_id: CLINICA_ID, dia: 5, hora_inicio: '08:00:00', hora_fin: '16:00:00', duracion_min: 30, activo: true, created_at: dayAgo(20), updated_at: dayAgo(20) },
  ],

  checkpoints_preanalitica: [
    { id: '97000000-0000-0000-0000-000000000001', clinica_id: CLINICA_ID, nombre: 'Identidad del paciente confirmada', activo: true, created_at: dayAgo(20) },
    { id: '97000000-0000-0000-0000-000000000002', clinica_id: CLINICA_ID, nombre: 'Ayuno / condiciones previas cumplidas', activo: true, created_at: dayAgo(20) },
    { id: '97000000-0000-0000-0000-000000000003', clinica_id: CLINICA_ID, nombre: 'Tubo o recipiente correcto y etiquetado', activo: true, created_at: dayAgo(20) },
    { id: '97000000-0000-0000-0000-000000000004', clinica_id: CLINICA_ID, nombre: 'Registrada la hora de la toma', activo: true, created_at: dayAgo(20) },
    { id: '97000000-0000-0000-0000-000000000005', clinica_id: CLINICA_ID, nombre: 'Muestra en buen estado y sin hemólisis', activo: true, created_at: dayAgo(20) },
  ],

  solicitudes_preanalitica: [
    { id: '98000000-0000-0000-0000-000000000001', solicitud_id: '50000000-0000-0000-0000-000000000001', checkpoint_id: '97000000-0000-0000-0000-000000000001', cumplido: true, validado_por: AUTH_USERS[4].id, created_at: dayAgo(6) },
    { id: '98000000-0000-0000-0000-0000-000000000002', solicitud_id: '50000000-0000-0000-0000-000000000001', checkpoint_id: '97000000-0000-0000-0000-000000000002', cumplido: true, validado_por: AUTH_USERS[4].id, created_at: dayAgo(6) },
    { id: '98000000-0000-0000-0000-0000-000000000003', solicitud_id: '50000000-0000-0000-0000-000000000001', checkpoint_id: '97000000-0000-0000-0000-000000000003', cumplido: true, validado_por: AUTH_USERS[4].id, created_at: dayAgo(6) },
    { id: '98000000-0000-0000-0000-0000-000000000004', solicitud_id: '50000000-0000-0000-0000-000000000001', checkpoint_id: '97000000-0000-0000-0000-000000000004', cumplido: true, validado_por: AUTH_USERS[4].id, created_at: dayAgo(6) },
    { id: '98000000-0000-0000-0000-000000000005', solicitud_id: '50000000-0000-0000-0000-000000000001', checkpoint_id: '97000000-0000-0000-0000-000000000005', cumplido: true, validado_por: AUTH_USERS[4].id, created_at: dayAgo(6) },
  ],

  audit_logs: [
    { id: '92000000-0000-0000-0000-000000000001', usuario_id: AUTH_USERS[4].id, accion: 'INSERT', tabla: 'pacientes', registro_id: '20000000-0000-0000-0000-000000000001', detalles: { old: null, new: { cedula: 'V-12345678' } }, ip: null, fecha: dayAgo(14) },
  ],

  parametros_referencia: [
    { id: '9A000000-0000-0000-0000-000000000001', clinica_id: CLINICA_ID, examen_id: '40000000-0000-0000-0000-000000000002', parametro: 'glicemia', nombre: 'Glicemia', unidad: 'mg/dL', normal_min: 70, normal_max: 99, critico_min: 50, critico_max: 250, activo: true, created_at: dayAgo(25), updated_at: dayAgo(25) },
    { id: '9A000000-0000-0000-0000-000000000002', clinica_id: CLINICA_ID, examen_id: '40000000-0000-0000-0000-000000000003', parametro: 'colesterol_total', nombre: 'Colesterol total', unidad: 'mg/dL', normal_min: null, normal_max: 199, critico_min: null, critico_max: 240, activo: true, created_at: dayAgo(25), updated_at: dayAgo(25) },
    { id: '9A000000-0000-0000-0000-000000000003', clinica_id: CLINICA_ID, examen_id: '40000000-0000-0000-0000-000000000003', parametro: 'trigliceridos', nombre: 'Triglicéridos', unidad: 'mg/dL', normal_min: null, normal_max: 149, critico_min: null, critico_max: 200, activo: true, created_at: dayAgo(25), updated_at: dayAgo(25) },
    { id: '9A000000-0000-0000-0000-000000000004', clinica_id: CLINICA_ID, examen_id: '40000000-0000-0000-0000-000000000001', parametro: 'hemoglobina', nombre: 'Hemoglobina', unidad: 'g/dL', normal_min: 12, normal_max: 17, critico_min: 7, critico_max: 20, activo: true, created_at: dayAgo(25), updated_at: dayAgo(25) },
  ],

  alertas_clinicas: [
    { id: '9B000000-0000-0000-0000-000000000001', clinica_id: CLINICA_ID, paciente_id: '20000000-0000-0000-0000-000000000002', examen_id: '40000000-0000-0000-0000-000000000003', solicitud_detalle_id: '60000000-0000-0000-0000-000000000008', resultado_id: '70000000-0000-0000-0000-000000000005', parametro: 'colesterol_total', valor: '212 mg/dL', unidad: 'mg/dL', nivel: 'alerta', motivo: 'Colesterol total fuera de rango de referencia (< 199 mg/dL)', leida: false, created_at: dayAgo(13) },
    { id: '9B000000-0000-0000-0000-000000000002', clinica_id: CLINICA_ID, paciente_id: '20000000-0000-0000-0000-000000000001', examen_id: '40000000-0000-0000-0000-000000000002', solicitud_detalle_id: '60000000-0000-0000-0000-000000000009', resultado_id: '70000000-0000-0000-0000-000000000006', parametro: 'glicemia', valor: '102 mg/dL', unidad: 'mg/dL', nivel: 'alerta', motivo: 'Glicemia fuera de rango de referencia (70–99 mg/dL)', leida: false, created_at: dayAgo(20) },
  ],

  imagenes_clinicas: [
    { id: '9C000000-0000-0000-0000-000000000001', clinica_id: CLINICA_ID, paciente_id: '20000000-0000-0000-0000-000000000001', consulta_id: '30000000-0000-0000-0000-000000000001', url: 'data:image/svg+xml;base64,' + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400"><rect width="600" height="400" fill="#0f172a"/><text x="300" y="200" font-size="26" fill="#e2e8f0" text-anchor="middle" font-family="monospace">RX TORAX - JUAN PEREZ</text><line x1="100" y1="280" x2="500" y2="280" stroke="#475569" stroke-width="12"/><line x1="300" y1="120" x2="300" y2="280" stroke="#e2e8f0" stroke-width="8"/><line x1="120" y1="150" x2="300" y2="220" stroke="#94a3b8" stroke-width="14"/><line x1="480" y1="150" x2="300" y2="220" stroke="#94a3b8" stroke-width="14"/></svg>').toString('base64'), tipo: 'rx', region: 'Tórax', descripcion: 'Placa de tórax AP: campos pulmonares sin lesiones', creado_por: AUTH_USERS[2].id, created_at: dayAgo(6) },
    { id: '9C000000-0000-0000-0000-000000000002', clinica_id: CLINICA_ID, paciente_id: '20000000-0000-0000-0000-000000000001', consulta_id: null, url: 'data:image/svg+xml;base64,' + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400"><rect width="600" height="400" fill="#052e16"/><text x="300" y="200" font-size="26" fill="#dcfce7" text-anchor="middle" font-family="monospace">ECOGRAFIA ABDOMINAL</text><ellipse cx="300" cy="220" rx="140" ry="90" fill="none" stroke="#dcfce7" stroke-width="6"/><line x1="170" y1="180" x2="250" y2="240" stroke="#86efac" stroke-width="8"/></svg>').toString('base64'), tipo: 'ecografia', region: 'Abdomen', descripcion: 'Hígado y vesícula sin alteraciones', creado_por: AUTH_USERS[2].id, created_at: dayAgo(4) },
  ],

  categorias_medicas: [
    { id: 'atencion_primaria', nombre: 'Atención Primaria y Medicina General', descripcion: 'Medicina General, Pediatría, Geriatría', orden: 1 },
    { id: 'especialidades_clinicas', nombre: 'Especialidades Clínicas', descripcion: 'Cardiología, Neurología, Gastroenterología, Endocrinología', orden: 2 },
    { id: 'especialidades_quirurgicas', nombre: 'Especialidades Quirúrgicas', descripcion: 'Cirugía General, Traumatología, Neurocirugía', orden: 3 },
    { id: 'medico_quirurgicas', nombre: 'Médico-Quirúrgicas', descripcion: 'Gineco/Obstetricia, Urología, Oftalmología, ORL', orden: 4 },
    { id: 'diagnostico_apoyo', nombre: 'Diagnóstico y Apoyo Clínico', descripcion: 'Patología, Radiología, Imagenología', orden: 5 },
    { id: 'critica_urgencias', nombre: 'Medicina Crítica y Urgencias', descripcion: 'Intensivistas, Anestesiólogos, Emergentólogos', orden: 6 },
    { id: 'salud_publica', nombre: 'Salud Pública y Otras', descripcion: 'Fisiatría, Medicina Ocupacional, del Deporte', orden: 7 },
  ],

  especialidades_medicas: [
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
  ],

  historial_clinico: [
    { id: '9D100000-0000-0000-0000-000000000001', clinica_id: CLINICA_ID, paciente_id: '20000000-0000-0000-0000-000000000001', consulta_id: '30000000-0000-0000-0000-000000000001', medico_id: AUTH_USERS[2].id, tipo: 'evolucion', categoria_origen: 'atencion_primaria', titulo: 'Chequeo general — evolución', contenido: { subjetivo: 'Paciente asintomático, refiere buen estado general.', objetivo: 'TA 120/80, FC 72 lpm, IMC 24.1.', plan: 'Continuar actividad física. Controles anuales.' }, firma_hash: 'demo', created_at: dayAgo(7) },
    { id: '9D100000-0000-0000-0000-000000000002', clinica_id: CLINICA_ID, paciente_id: '20000000-0000-0000-0000-000000000001', consulta_id: null, medico_id: AUTH_USERS[2].id, tipo: 'resultado', categoria_origen: 'atencion_primaria', titulo: 'Resultado de laboratorio: Glicemia en ayunas', contenido: { examen: 'Glicemia en ayunas', valor: '88 mg/dL', observacion: 'Dentro de rango' }, firma_hash: 'demo', created_at: dayAgo(6) },
    { id: '9D100000-0000-0000-0000-000000000003', clinica_id: CLINICA_ID, paciente_id: '20000000-0000-0000-0000-000000000002', consulta_id: '30000000-0000-0000-0000-000000000002', medico_id: AUTH_USERS[2].id, tipo: 'evolucion', categoria_origen: 'atencion_primaria', titulo: 'Dolor abdominal — evolución', contenido: { subjetivo: 'Epigastralgia postprandial.', objetivo: 'Dolor leve a la palpación epigástrica.', diagnostico: 'Gastritis leve', plan: 'Omeprazol 20 mg c/24 h. Dieta blanda. Control en 2 semanas.' }, firma_hash: 'demo', created_at: dayAgo(4) },
  ],

  historial_correcciones: [
    { id: '9D200000-0000-0000-0000-000000000001', historial_id: '9D100000-0000-0000-0000-000000000001', tipo: 'fe_errata', contenido: { texto: 'Fe de erratas: el diagnóstico de la consulta fue "Paciente sano, en control de hipotiroidismo subclínico".' }, medico_id: AUTH_USERS[2].id, firma_hash: 'demo', created_at: dayAgo(6, 11) },
    { id: '9D200000-0000-0000-0000-000000000002', historial_id: '9D100000-0000-0000-0000-000000000001', tipo: 'adenda', contenido: { texto: 'Adenda: se solicita perfil tiroideo (TSH) en próximo control.' }, medico_id: AUTH_USERS[2].id, firma_hash: 'demo', created_at: dayAgo(5, 9) },
  ],

  notas_privadas: [
    { id: '9D300000-0000-0000-0000-000000000001', paciente_id: '20000000-0000-0000-0000-000000000001', consulta_id: '30000000-0000-0000-0000-000000000001', medico_id: AUTH_USERS[2].id, contenido: 'Paciente refiere estrés laboral; valorar seguimiento con psicología. No compartir aún.', created_at: dayAgo(7), updated_at: dayAgo(7) },
  ],

  alertas_criticas: [
    { id: '9D400000-0000-0000-0000-000000000001', clinica_id: CLINICA_ID, paciente_id: '20000000-0000-0000-0000-000000000001', tipo: 'alergia', descripcion: 'Alergia confirmada a penicilina (reacción anafiláctica previa)', severidad: 'alta', activa: true, creado_por: AUTH_USERS[2].id, created_at: dayAgo(20) },
    { id: '9D400000-0000-0000-0000-000000000002', clinica_id: CLINICA_ID, paciente_id: '20000000-0000-0000-0000-000000000001', tipo: 'enfermedad_cronica', descripcion: 'Asma bronquial en control con salbutamol PRN', severidad: 'media', activa: true, creado_por: AUTH_USERS[2].id, created_at: dayAgo(20) },
    { id: '9D400000-0000-0000-0000-000000000003', clinica_id: CLINICA_ID, paciente_id: '20000000-0000-0000-0000-000000000002', tipo: 'alergia', descripcion: 'Alergia a ibuprofeno (urticaria)', severidad: 'media', activa: true, creado_por: AUTH_USERS[2].id, created_at: dayAgo(15) },
  ],

  interconsultas: [
    { id: '9D500000-0000-0000-0000-000000000001', clinica_id: CLINICA_ID, paciente_id: '20000000-0000-0000-0000-000000000001', consulta_origen_id: '30000000-0000-0000-0000-000000000001', medico_origen_id: AUTH_USERS[2].id, categoria_destino: 'especialidades_clinicas', especialidad_destino: 'cardiologia', medico_destino_id: AUTH_USERS[5].id, motivo: 'Palpitaciones recurrentes y fatiga', hipotesis: 'Descartar arritmia supraventricular', estado: 'enviada', respuesta: null, medico_responde_id: null, created_at: dayAgo(3), updated_at: dayAgo(3) },
    { id: '9D500000-0000-0000-0000-000000000002', clinica_id: CLINICA_ID, paciente_id: '20000000-0000-0000-0000-000000000002', consulta_origen_id: '30000000-0000-0000-0000-000000000002', medico_origen_id: AUTH_USERS[2].id, categoria_destino: 'especialidades_quirurgicas', especialidad_destino: 'traumatologia', medico_destino_id: AUTH_USERS[6].id, motivo: 'Dolor lumbar de 3 semanas de evolución', hipotesis: 'Lumbalgia mecánica / descartar compresión radicular', estado: 'completada', respuesta: 'Evaluado: lumbalgia mecánica leve, esguince. Se indica fisioterapia y AINE.', medico_responde_id: AUTH_USERS[6].id, created_at: dayAgo(4), updated_at: dayAgo(2) },
  ],

  // Cuestionario de historial médico (anamnesis) — demo.
  cuestionarios_historial: [
    {
      id: '9E100000-0000-0000-0000-000000000001',
      clinica_id: CLINICA_ID,
      paciente_id: '20000000-0000-0000-0000-000000000001',
      consulta_id: '30000000-0000-0000-0000-000000000001',
      origen: 'medico',
      creado_por_medico: AUTH_USERS[2].id,
      titulo: 'Cuestionario de historial médico',
      estado: 'consolidado',
      respuestas: {
        alimentacion: { marcado: false, detalle: null },
        actividad_fisica: { marcado: true, detalle: 'Caminata 30 min, 3 veces por semana' },
        trastornos_sueno: { marcado: false, detalle: null },
        consumo_sustancias: { marcado: false, detalle: null },
        estres_salud_mental: { marcado: true, detalle: 'Estrés laboral, sin terapia formal' },
        enfermedades_cronicas: { marcado: true, detalle: 'Asma bronquial, 12 años de diagnóstico' },
        medicamentos_continuos: { marcado: true, detalle: 'Salbutamol 100 mcg PRN' },
        alergias: { marcado: true, detalle: 'Penicilina: reacción anafiláctica previa' },
        cirugias_hospitalizaciones: { marcado: false, detalle: null },
        vacunacion_incompleta: { marcado: true, detalle: 'Refuerzo antigripal pendiente' },
        historial_familiar_cancer: { marcado: false, detalle: null },
        historial_cardiovascular: { marcado: true, detalle: 'Padre: infarto a los 60 años' },
        historial_diabetes_renal: { marcado: false, detalle: null },
        sintomas_cardiovasculares: { marcado: true, detalle: 'Palpitaciones ocasionales en reposo' },
        sintomas_gastrointestinales: { marcado: false, detalle: null },
        sintomas_neurologicos: { marcado: false, detalle: null },
        sintomas_urologicos_ginecologicos: { marcado: false, detalle: null },
        observaciones: 'Paciente en control por asma; derivado a cardiología por palpitaciones.',
      },
      consolidado_at: dayAgo(6),
      deleted_at: null,
      created_at: dayAgo(8),
      updated_at: dayAgo(6),
    },
    {
      id: '9E100000-0000-0000-0000-000000000002',
      clinica_id: CLINICA_ID,
      paciente_id: '20000000-0000-0000-0000-000000000002',
      consulta_id: '30000000-0000-0000-0000-000000000002',
      origen: 'paciente',
      creado_por_paciente: '20000000-0000-0000-0000-000000000002',
      titulo: 'Cuestionario de historial médico',
      estado: 'borrador',
      respuestas: {
        alimentacion: { marcado: true, detalle: 'Dieta blanda por gastritis' },
        actividad_fisica: { marcado: false, detalle: null },
        trastornos_sueno: { marcado: false, detalle: null },
        consumo_sustancias: { marcado: false, detalle: null },
        estres_salud_mental: { marcado: false, detalle: null },
        enfermedades_cronicas: { marcado: false, detalle: null },
        medicamentos_continuos: { marcado: true, detalle: 'Omeprazol 20 mg c/24 h' },
        alergias: { marcado: true, detalle: 'Ibuprofeno: urticaria' },
        cirugias_hospitalizaciones: { marcado: false, detalle: null },
        vacunacion_incompleta: { marcado: false, detalle: null },
        historial_familiar_cancer: { marcado: false, detalle: null },
        historial_cardiovascular: { marcado: false, detalle: null },
        historial_diabetes_renal: { marcado: false, detalle: null },
        sintomas_cardiovasculares: { marcado: false, detalle: null },
        sintomas_gastrointestinales: { marcado: true, detalle: 'Acidez y dolor abdominal postprandial' },
        sintomas_neurologicos: { marcado: false, detalle: null },
        sintomas_urologicos_ginecologicos: { marcado: false, detalle: null },
        observaciones: 'Pendiente de completar antes de la cita de control.',
      },
      consolidado_at: null,
      deleted_at: null,
      created_at: dayAgo(3),
      updated_at: dayAgo(1),
    },
  ],

  cuestionario_adendas: [
    {
      id: '9E200000-0000-0000-0000-000000000001',
      cuestionario_id: '9E100000-0000-0000-0000-000000000001',
      medico_id: AUTH_USERS[2].id,
      respuestas: {
        alimentacion: { marcado: false, detalle: null },
        actividad_fisica: { marcado: true, detalle: 'Caminata 30 min, 3 veces por semana' },
        trastornos_sueno: { marcado: true, detalle: 'Insomnio leve: 5-6 h promedio' },
        consumo_sustancias: { marcado: false, detalle: null },
        estres_salud_mental: { marcado: true, detalle: 'Estrés laboral, sin terapia formal' },
        enfermedades_cronicas: { marcado: true, detalle: 'Asma bronquial, 12 años de diagnóstico' },
        medicamentos_continuos: { marcado: true, detalle: 'Salbutamol 100 mcg PRN' },
        alergias: { marcado: true, detalle: 'Penicilina: reacción anafiláctica previa' },
        cirugias_hospitalizaciones: { marcado: false, detalle: null },
        vacunacion_incompleta: { marcado: true, detalle: 'Refuerzo antigripal pendiente' },
        historial_familiar_cancer: { marcado: false, detalle: null },
        historial_cardiovascular: { marcado: true, detalle: 'Padre: infarto a los 60 años' },
        historial_diabetes_renal: { marcado: false, detalle: null },
        sintomas_cardiovasculares: { marcado: true, detalle: 'Palpitaciones ocasionales en reposo' },
        sintomas_gastrointestinales: { marcado: false, detalle: null },
        sintomas_neurologicos: { marcado: false, detalle: null },
        sintomas_urologicos_ginecologicos: { marcado: false, detalle: null },
        observaciones: 'Adenda: se agrega insomnio leve referido en el control de la semana.',
      },
      firma_hash: 'demo-adenda',
      created_at: dayAgo(5, 9),
    },
  ],
}
