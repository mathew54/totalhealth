import type { Row } from './store.js'
import { fechaHoyCaracas } from '../services/bcv.js'
import { CATEGORIAS_MEDICAS, CHECKPOINTS_PREANALITICA, ESPECIALIDADES_MEDICAS } from '../data/catalogos.js'
import { PAISES } from '../data/paises.js'

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

// Hoy a las h:30 en hora de Caracas (UTC-4), como ISO datetime completo.
const hoyA = (h: number) => {
  const [y, m, d] = todayISO().split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d, h + 4, 30, 0, 0)).toISOString()
}

export const SEED: Record<string, Row[]> = {
  app_config: [
    {
      id: true,
      razon_social: 'Clínica Demo TotalHealth',
      rif: 'J-00000000-0',
      direccion: 'Av. Principal, Caracas, Venezuela',
      telefono: '+58 412-1234567',
      logo_url: '/favicon.svg',
      header_color: '#8b5cf6',
      preanalitica: { habilitado: true, obligatorio: true },
      iva: 0.16,
      updated_at: dayAgo(30),
    },
  ],

  paises: PAISES.map((p) => ({ id: p.iso2, nombre: p.nombre, codigo: p.codigo })),

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
    // Paciente jurídico (RIF, tipo J).
    { id: '20000000-0000-0000-0000-000000000007', cedula: 'J-30512456-7', tipo_documento: 'J', nombre_completo: 'Comercializadora Andina C.A.', fecha_nacimiento: '2005-01-15', telefono: '+584150000005', email: 'facturacion@andina.com', direccion: 'Valencia', sexo: null, es_menor: false, representante_id: null, parentesco_representante: null, clinica_id: CLINICA_ID, fecha_consentimiento: dayAgo(4), created_at: dayAgo(4), updated_at: dayAgo(4), deleted_at: null },
    // Paciente extranjero con cédula tipo E.
    { id: '20000000-0000-0000-0000-000000000008', cedula: 'E-55214478', tipo_documento: 'E', nombre_completo: 'Rodrigo Mendoza Rojas', fecha_nacimiento: '1983-09-05', telefono: '+584150000006', email: 'rodrigo.mendoza@gmail.com', direccion: 'Barquisimeto', sexo: 'M', es_menor: false, representante_id: null, parentesco_representante: null, clinica_id: CLINICA_ID, fecha_consentimiento: dayAgo(6), created_at: dayAgo(6), updated_at: dayAgo(6), deleted_at: null },
    // Paciente tipo C (cédula de extranjero residente).
    { id: '20000000-0000-0000-0000-000000000009', cedula: 'C-98765432', tipo_documento: 'C', nombre_completo: 'Marta Silva Prado', fecha_nacimiento: '1995-12-01', telefono: '+584150000007', email: null, direccion: 'Maracaibo', sexo: 'F', es_menor: false, representante_id: null, parentesco_representante: null, clinica_id: CLINICA_ID, fecha_consentimiento: dayAgo(8), created_at: dayAgo(8), updated_at: dayAgo(8), deleted_at: null },
    // Menor vinculado a María García (hija).
    { id: '20000000-0000-0000-0000-000000000010', cedula: null, tipo_documento: null, nombre_completo: 'Valentina García', fecha_nacimiento: '2018-02-11', telefono: null, email: null, direccion: 'Caracas', sexo: 'F', es_menor: true, representante_id: '20000000-0000-0000-0000-000000000002', parentesco_representante: 'hija', clinica_id: CLINICA_ID, fecha_consentimiento: dayAgo(9), created_at: dayAgo(9), updated_at: dayAgo(9), deleted_at: null },
    // Menor representado por Laura Torres (sobrino).
    { id: '20000000-0000-0000-0000-000000000011', cedula: null, tipo_documento: null, nombre_completo: 'Matías Torres', fecha_nacimiento: '2020-07-30', telefono: '+584150000008', email: null, direccion: 'Caracas', sexo: 'M', es_menor: true, representante_id: '20000000-0000-0000-0000-000000000004', parentesco_representante: 'sobrino', clinica_id: CLINICA_ID, fecha_consentimiento: dayAgo(5), created_at: dayAgo(5), updated_at: dayAgo(5), deleted_at: null },
    // Adulto mayor para geriatría / crónicos.
    { id: '20000000-0000-0000-0000-000000000012', cedula: 'V-9876543', tipo_documento: 'V', nombre_completo: 'Carmen Rodríguez de Blanco', fecha_nacimiento: '1950-05-20', telefono: '+584150000009', email: 'carmen.blanco@hotmail.com', direccion: 'Los Teques', sexo: 'F', es_menor: false, representante_id: null, parentesco_representante: null, clinica_id: CLINICA_ID, fecha_consentimiento: dayAgo(12), created_at: dayAgo(12), updated_at: dayAgo(12), deleted_at: null },
    // Paciente con datos incompletos (permite probar edición).
    { id: '20000000-0000-0000-0000-000000000013', cedula: 'V-11555987', tipo_documento: 'V', nombre_completo: 'Pedro Luis Fajardo', fecha_nacimiento: '1990-01-01', telefono: null, email: null, direccion: null, sexo: null, es_menor: false, representante_id: null, parentesco_representante: null, clinica_id: CLINICA_ID, fecha_consentimiento: dayAgo(15), created_at: dayAgo(15), updated_at: dayAgo(15), deleted_at: null },
    // Paciente con borrado lógico (debe NO aparecer en búsquedas).
    { id: '20000000-0000-0000-0000-000000000014', cedula: 'V-10001234', tipo_documento: 'V', nombre_completo: 'Eliminado Prueba', fecha_nacimiento: '1980-08-08', telefono: null, email: null, direccion: 'Caracas', sexo: 'M', es_menor: false, representante_id: null, parentesco_representante: null, clinica_id: CLINICA_ID, fecha_consentimiento: dayAgo(20), created_at: dayAgo(20), updated_at: dayAgo(20), deleted_at: dayAgo(2) },
    // Paciente demo V-19021231 con consulta y exámenes de laboratorio para
    // probar el flujo de subida de resultados y la notificación automática.
    { id: '20000000-0000-0000-0000-000000000015', cedula: 'V-19021231', tipo_documento: 'V', nombre_completo: 'Andrés Salazar Quintana', fecha_nacimiento: '1987-09-14', telefono: '+584244458116', email: 'andres.salazar@example.com', direccion: 'Caracas', sexo: 'M', es_menor: false, representante_id: null, parentesco_representante: null, clinica_id: CLINICA_ID, fecha_consentimiento: dayAgo(3), created_at: dayAgo(3), updated_at: dayAgo(3), deleted_at: null },
  ],

  consultas: [
    { id: '30000000-0000-0000-0000-000000000001', paciente_id: '20000000-0000-0000-0000-000000000001', medico_id: AUTH_USERS[2].id, clinica_id: CLINICA_ID, fecha_hora: dayAgo(7, 9), motivo: 'Chequeo general', diagnostico: 'Paciente sano', notas: null, estado: 'completada', origen: 'staff', created_at: dayAgo(7), updated_at: dayAgo(7) },
    { id: '30000000-0000-0000-0000-000000000002', paciente_id: '20000000-0000-0000-0000-000000000002', medico_id: AUTH_USERS[2].id, clinica_id: CLINICA_ID, fecha_hora: dayAgo(4, 11), motivo: 'Dolor abdominal', diagnostico: 'Gastritis leve', notas: 'Indicar dieta blanda', estado: 'completada', origen: 'staff', created_at: dayAgo(4), updated_at: dayAgo(4) },
    { id: '30000000-0000-0000-0000-000000000003', paciente_id: '20000000-0000-0000-0000-000000000003', medico_id: AUTH_USERS[2].id, clinica_id: CLINICA_ID, fecha_hora: dayAgo(2, 15), motivo: 'Control de glicemia', diagnostico: 'Pendiente de resultados', notas: null, estado: 'completada', origen: 'staff', created_at: dayAgo(2), updated_at: dayAgo(2) },
    { id: '30000000-0000-0000-0000-000000000004', paciente_id: '20000000-0000-0000-0000-000000000004', medico_id: AUTH_USERS[2].id, clinica_id: CLINICA_ID, fecha_hora: future(1, 9), motivo: 'Primera consulta', diagnostico: null, notas: null, estado: 'programada', origen: 'online', created_at: dayAgo(0), updated_at: dayAgo(0) },
    { id: '30000000-0000-0000-0000-000000000005', paciente_id: '20000000-0000-0000-0000-000000000001', medico_id: AUTH_USERS[2].id, clinica_id: CLINICA_ID, fecha_hora: future(3, 11), motivo: 'Control anual', diagnostico: null, notas: null, estado: 'programada', origen: 'online', created_at: dayAgo(0), updated_at: dayAgo(0) },
    // Consulta en curso con la Dra. Suárez (cardiología).
    { id: '30000000-0000-0000-0000-000000000006', paciente_id: '20000000-0000-0000-0000-000000000001', medico_id: AUTH_USERS[5].id, clinica_id: CLINICA_ID, fecha_hora: hoyA(9), motivo: 'Evaluación cardiovascular', diagnostico: null, notas: 'Revisar palpitaciones', estado: 'en_curso', origen: 'staff', created_at: dayAgo(0), updated_at: dayAgo(0) },
    // Consulta cancelada.
    { id: '30000000-0000-0000-0000-000000000007', paciente_id: '20000000-0000-0000-0000-000000000003', medico_id: AUTH_USERS[2].id, clinica_id: CLINICA_ID, fecha_hora: dayAgo(1, 14), motivo: 'Revisión de exámenes', diagnostico: null, notas: 'Paciente canceló por traslado', estado: 'cancelada', origen: 'staff', created_at: dayAgo(3), updated_at: dayAgo(1) },
    // Consulta programada de paciente crónico (turno asociado en sala de espera).
    { id: '30000000-0000-0000-0000-000000000008', paciente_id: '20000000-0000-0000-0000-000000000012', medico_id: AUTH_USERS[2].id, clinica_id: CLINICA_ID, fecha_hora: hoyA(10), motivo: 'Control de presión arterial', diagnostico: null, notas: null, estado: 'programada', origen: 'staff', created_at: dayAgo(0), updated_at: dayAgo(0) },
    // Consulta con el Dr. Ramírez (traumatología) completada.
    { id: '30000000-0000-0000-0000-000000000009', paciente_id: '20000000-0000-0000-0000-000000000008', medico_id: AUTH_USERS[6].id, clinica_id: CLINICA_ID, fecha_hora: dayAgo(6, 10), motivo: 'Dolor de rodilla', diagnostico: 'Gonalgia por desgaste meniscal', notas: 'Reposo relativo y fisioterapia', estado: 'completada', origen: 'staff', created_at: dayAgo(6), updated_at: dayAgo(5) },
    // Consulta programada con la Dra. Suárez para paciente crónico.
    { id: '30000000-0000-0000-0000-000000000010', paciente_id: '20000000-0000-0000-0000-000000000012', medico_id: AUTH_USERS[5].id, clinica_id: CLINICA_ID, fecha_hora: future(2, 16), motivo: 'Cardiopatía hipertensiva — control', diagnostico: null, notas: null, estado: 'programada', origen: 'online', created_at: dayAgo(1), updated_at: dayAgo(1) },
    // Consulta completada del paciente demo V-19021231 (Andrés Salazar).
    { id: '30000000-0000-0000-0000-000000000011', paciente_id: '20000000-0000-0000-0000-000000000015', medico_id: AUTH_USERS[2].id, clinica_id: CLINICA_ID, fecha_hora: dayAgo(3, 10), motivo: 'Chequeo de rutina — perfil metabólico', diagnostico: 'En observación, pendiente de exámenes', notas: 'Solicitar glicemia y perfil lipídico', estado: 'completada', origen: 'staff', created_at: dayAgo(3), updated_at: dayAgo(3) },
  ],

  vinculos_familiares: [
    { id: '31000000-0000-0000-0000-000000000001', paciente_id: '20000000-0000-0000-0000-000000000001', dependiente_id: '20000000-0000-0000-0000-000000000002', parentesco: 'hermana', created_at: dayAgo(10) },
    { id: '31000000-0000-0000-0000-000000000002', paciente_id: '20000000-0000-0000-0000-000000000001', dependiente_id: '20000000-0000-0000-0000-000000000004', parentesco: 'hija', created_at: dayAgo(8) },
    { id: '31000000-0000-0000-0000-0000-000000000003', paciente_id: '20000000-0000-0000-0000-000000000002', dependiente_id: '20000000-0000-0000-0000-000000000001', parentesco: 'hermano', created_at: dayAgo(10) },
    { id: '31000000-0000-0000-0000-000000000004', paciente_id: '20000000-0000-0000-0000-000000000001', dependiente_id: '20000000-0000-0000-0000-000000000005', parentesco: 'hijo', created_at: dayAgo(1) },
    // Vínculos de los nuevos menores.
    { id: '31000000-0000-0000-0000-000000000005', paciente_id: '20000000-0000-0000-0000-000000000002', dependiente_id: '20000000-0000-0000-0000-000000000010', parentesco: 'hija', created_at: dayAgo(9) },
    { id: '31000000-0000-0000-0000-000000000006', paciente_id: '20000000-0000-0000-0000-000000000004', dependiente_id: '20000000-0000-0000-0000-000000000011', parentesco: 'sobrino', created_at: dayAgo(5) },
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
    // Solicitud en proceso con la Dra. Suárez (para probar flujo de laboratorio con otros médicos).
    { id: '50000000-0000-0000-0000-000000000010', consulta_id: '30000000-0000-0000-0000-000000000006', paciente_id: '20000000-0000-0000-0000-000000000001', medico_id: AUTH_USERS[5].id, clinica_id: CLINICA_ID, fecha: todayISO(), estado: 'en_proceso', cobrado: true, descuento: 5, nota: 'Perfil lipídico completo', created_at: todayISO(), updated_at: todayISO() },
    // Solicitud lista para entregar (estado listo).
    { id: '50000000-0000-0000-0000-000000000011', consulta_id: null, paciente_id: '20000000-0000-0000-0000-000000000012', medico_id: AUTH_USERS[2].id, clinica_id: CLINICA_ID, fecha: dayAgo(3), estado: 'listo', cobrado: true, descuento: 0, nota: null, created_at: dayAgo(3), updated_at: dayAgo(1) },
    // Solicitudes del paciente demo V-19021231 listas para que el laboratorio
    // procese y suba el resultado (dispara la notificación automática al portal).
    { id: '50000000-0000-0000-0000-000000000012', consulta_id: '30000000-0000-0000-0000-000000000011', paciente_id: '20000000-0000-0000-0000-000000000015', medico_id: AUTH_USERS[2].id, clinica_id: CLINICA_ID, fecha: dayAgo(2), estado: 'en_proceso', cobrado: true, descuento: 0, nota: 'Perfil metabólico: glicemia + colesterol', created_at: dayAgo(2), updated_at: dayAgo(1) },
    { id: '50000000-0000-0000-0000-000000000013', consulta_id: '30000000-0000-0000-0000-000000000011', paciente_id: '20000000-0000-0000-0000-000000000015', medico_id: AUTH_USERS[2].id, clinica_id: CLINICA_ID, fecha: dayAgo(1), estado: 'pendiente', cobrado: true, descuento: 0, nota: 'Hematología completa', created_at: dayAgo(1), updated_at: dayAgo(1) },
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
    // Detalles de solicitud 10 (Dra. Suárez): perfil lipídico + hematología.
    { id: '60000000-0000-0000-0000-000000000013', solicitud_id: '50000000-0000-0000-0000-000000000010', examen_id: '40000000-0000-0000-0000-000000000003', resultado_id: null, precio: 12 },
    { id: '60000000-0000-0000-0000-000000000014', solicitud_id: '50000000-0000-0000-0000-000000000010', examen_id: '40000000-0000-0000-0000-000000000001', resultado_id: null, precio: 15 },
    // Detalle de solicitud 11 (listo): glicemia ya procesada.
    { id: '60000000-0000-0000-0000-000000000015', solicitud_id: '50000000-0000-0000-0000-000000000011', examen_id: '40000000-0000-0000-0000-000000000002', resultado_id: '70000000-0000-0000-0000-000000000008', precio: 10 },
    // Detalles de las solicitudes del paciente demo V-19021231 (sin resultado,
    // para que el laboratorio los procese).
    { id: '60000000-0000-0000-0000-000000000016', solicitud_id: '50000000-0000-0000-0000-000000000012', examen_id: '40000000-0000-0000-0000-000000000002', resultado_id: null, precio: 10 },
    { id: '60000000-0000-0000-0000-000000000017', solicitud_id: '50000000-0000-0000-0000-000000000012', examen_id: '40000000-0000-0000-0000-000000000003', resultado_id: null, precio: 12 },
    { id: '60000000-0000-0000-0000-000000000018', solicitud_id: '50000000-0000-0000-0000-000000000013', examen_id: '40000000-0000-0000-0000-000000000001', resultado_id: null, precio: 15 },
  ],

  resultados: [
    { id: '70000000-0000-0000-0000-000000000001', solicitud_detalle_id: '60000000-0000-0000-0000-000000000001', bioanalista_id: AUTH_USERS[3].id, valores: { globulos_rojos: '4.8 M/uL', hemoglobina: '14.5 g/dL', glicemia: null }, pdf_path: 'resultados/demo/hemato-juan.pdf', observaciones: 'Dentro de rangos', procesado_at: dayAgo(6), created_at: dayAgo(6) },
    { id: '70000000-0000-0000-0000-000000000002', solicitud_detalle_id: '60000000-0000-0000-0000-000000000002', bioanalista_id: AUTH_USERS[3].id, valores: { glicemia: '88 mg/dL' }, pdf_path: 'resultados/demo/glicemia-juan.pdf', observaciones: 'Normal', procesado_at: dayAgo(6), created_at: dayAgo(6) },
    { id: '70000000-0000-0000-0000-000000000003', solicitud_detalle_id: '60000000-0000-0000-0000-000000000003', bioanalista_id: AUTH_USERS[3].id, valores: { aspecto: 'Ligeramente turbio', ph: '5.5' }, pdf_path: 'resultados/demo/uroanalisis-maria.pdf', observaciones: null, procesado_at: dayAgo(1), created_at: dayAgo(1) },
    { id: '70000000-0000-0000-0000-000000000004', solicitud_detalle_id: '60000000-0000-0000-0000-000000000007', bioanalista_id: AUTH_USERS[3].id, valores: { glicemia: '97 mg/dL' }, pdf_path: null, observaciones: 'Control', procesado_at: dayAgo(34), created_at: dayAgo(34) },
    { id: '70000000-0000-0000-0000-000000000005', solicitud_detalle_id: '60000000-0000-0000-0000-000000000008', bioanalista_id: AUTH_USERS[3].id, valores: { colesterol_total: '212 mg/dL', trigliceridos: '150 mg/dL' }, pdf_path: null, observaciones: null, procesado_at: dayAgo(27), created_at: dayAgo(27) },
    { id: '70000000-0000-0000-0000-000000000006', solicitud_detalle_id: '60000000-0000-0000-0000-000000000009', bioanalista_id: AUTH_USERS[3].id, valores: { glicemia: '102 mg/dL' }, pdf_path: null, observaciones: null, procesado_at: dayAgo(20), created_at: dayAgo(20) },
    { id: '70000000-0000-0000-0000-000000000007', solicitud_detalle_id: '60000000-0000-0000-0000-000000000010', bioanalista_id: AUTH_USERS[3].id, valores: { colesterol_total: '198 mg/dL', trigliceridos: '138 mg/dL' }, pdf_path: null, observaciones: null, procesado_at: dayAgo(13), created_at: dayAgo(13) },
    // Resultado con glicemia en rango crítico (dispara alerta clínica).
    { id: '70000000-0000-0000-0000-000000000008', solicitud_detalle_id: '60000000-0000-0000-0000-000000000015', bioanalista_id: AUTH_USERS[3].id, valores: { glicemia: '265 mg/dL' }, pdf_path: null, observaciones: 'Hiperglicemia marcada; referir a endocrinología', procesado_at: dayAgo(1), created_at: dayAgo(1) },
  ],

  recipes: [
    { id: '80000000-0000-0000-0000-000000000001', consulta_id: '30000000-0000-0000-0000-000000000002', paciente_id: '20000000-0000-0000-0000-000000000002', medico_id: AUTH_USERS[2].id, clinica_id: CLINICA_ID, fecha_emision: dayAgo(4), fecha_expiracion: future(26), estado: 'activo', created_at: dayAgo(4) },
    { id: '80000000-0000-0000-0000-000000000002', consulta_id: '30000000-0000-0000-0000-000000000001', paciente_id: '20000000-0000-0000-0000-000000000001', medico_id: AUTH_USERS[2].id, clinica_id: CLINICA_ID, fecha_emision: dayAgo(7), fecha_expiracion: future(23), estado: 'activo', created_at: dayAgo(7) },
    // Receta expirada (más de 30 días de emisión).
    { id: '80000000-0000-0000-0000-000000000003', consulta_id: '30000000-0000-0000-0000-000000000009', paciente_id: '20000000-0000-0000-0000-000000000008', medico_id: AUTH_USERS[6].id, clinica_id: CLINICA_ID, fecha_emision: dayAgo(45), fecha_expiracion: dayAgo(15), estado: 'expirado', created_at: dayAgo(45) },
    // Receta cancelada por el médico.
    { id: '80000000-0000-0000-0000-000000000004', consulta_id: '30000000-0000-0000-0000-000000000006', paciente_id: '20000000-0000-0000-0000-000000000001', medico_id: AUTH_USERS[5].id, clinica_id: CLINICA_ID, fecha_emision: dayAgo(1), fecha_expiracion: future(29), estado: 'cancelada', created_at: dayAgo(1) },
  ],

  recipes_detalle: [
    { id: '81000000-0000-0000-0000-000000000001', recipe_id: '80000000-0000-0000-0000-000000000001', medicamento: 'Omeprazol 20 mg', presentacion: 'Caja 14 cápsulas', dosis: '1 cápsula', frecuencia: 'Cada 24 h en ayunas', indicaciones: 'Antes del desayuno', duracion: '14 días' },
    { id: '81000000-0000-0000-0000-000000000002', recipe_id: '80000000-0000-0000-0000-000000000002', medicamento: 'Paracetamol 500 mg', presentacion: 'Blíster 20 tabletas', dosis: '1 tableta', frecuencia: 'Cada 8 h si hay dolor', indicaciones: null, duracion: '5 días' },
    { id: '81000000-0000-0000-0000-000000000003', recipe_id: '80000000-0000-0000-0000-000000000003', medicamento: 'Ibuprofeno 400 mg', presentacion: 'Caja 20 tabletas', dosis: '1 tableta', frecuencia: 'Cada 12 h con alimentos', indicaciones: 'Evitar en ayunas', duracion: '7 días' },
    { id: '81000000-0000-0000-0000-000000000004', recipe_id: '80000000-0000-0000-0000-000000000004', medicamento: 'Atenolol 50 mg', presentacion: 'Caja 30 tabletas', dosis: '1 tableta', frecuencia: 'Cada 24 h en la mañana', indicaciones: 'Control de frecuencia cardíaca', duracion: '30 días' },
  ],

  pagos: [
    { id: '90000000-0000-0000-0000-000000000001', tipo: 'laboratorio', solicitud_id: '50000000-0000-0000-0000-000000000001', consulta_id: null, paciente_id: '20000000-0000-0000-0000-000000000001', clinica_id: CLINICA_ID, monto: 25, moneda: 'USD', tasa_usd: 755.9, descuento: 0, iva: 4, metodo: 'efectivo', secretaria_id: AUTH_USERS[4].id, fecha: dayAgo(7), estado: 'pagado', provider: 'mock', provider_ref: 'MOCK-101' },
    { id: '90000000-0000-0000-0000-000000000002', tipo: 'laboratorio', solicitud_id: '50000000-0000-0000-0000-000000000002', consulta_id: null, paciente_id: '20000000-0000-0000-0000-000000000002', clinica_id: CLINICA_ID, monto: 8, moneda: 'USD', tasa_usd: 755.9, descuento: 0, iva: 1.28, metodo: 'punto', secretaria_id: AUTH_USERS[4].id, fecha: dayAgo(4), estado: 'pagado', provider: 'mock', provider_ref: 'MOCK-102' },
    { id: '90000000-0000-0000-0000-000000000003', tipo: 'laboratorio', solicitud_id: '50000000-0000-0000-0000-000000000003', consulta_id: null, paciente_id: '20000000-0000-0000-0000-000000000003', clinica_id: CLINICA_ID, monto: 22, moneda: 'USD', tasa_usd: 755.9, descuento: 0, iva: 3.52, metodo: 'efectivo', secretaria_id: AUTH_USERS[4].id, fecha: dayAgo(2), estado: 'pagado', provider: 'mock', provider_ref: 'MOCK-103' },
    // Pago de consulta (tipo consulta) por transferencia.
    { id: '90000000-0000-0000-0000-000000000004', tipo: 'consulta', solicitud_id: null, consulta_id: '30000000-0000-0000-0000-000000000001', paciente_id: '20000000-0000-0000-0000-000000000001', clinica_id: CLINICA_ID, monto: 40, moneda: 'USD', tasa_usd: 755.9, descuento: 0, iva: 0, metodo: 'transferencia', secretaria_id: AUTH_USERS[4].id, fecha: dayAgo(7), estado: 'pagado', provider: 'mock', provider_ref: 'MOCK-104' },
    // Pago por Zelle.
    { id: '90000000-0000-0000-0000-000000000005', tipo: 'laboratorio', solicitud_id: '50000000-0000-0000-0000-000000000001', consulta_id: null, paciente_id: '20000000-0000-0000-0000-000000000001', clinica_id: CLINICA_ID, monto: 25, moneda: 'USD', tasa_usd: 760.1, descuento: 0, iva: 4, metodo: 'zelle', secretaria_id: AUTH_USERS[4].id, fecha: dayAgo(6), estado: 'pagado', provider: 'mock', provider_ref: 'MOCK-105' },
    // Pago reembolsado (para probar el flujo de devolución).
    { id: '90000000-0000-0000-0000-000000000006', tipo: 'consulta', solicitud_id: null, consulta_id: '30000000-0000-0000-0000-000000000007', paciente_id: '20000000-0000-0000-0000-000000000003', clinica_id: CLINICA_ID, monto: 40, moneda: 'USD', tasa_usd: 755.9, descuento: 0, iva: 0, metodo: 'punto', secretaria_id: AUTH_USERS[4].id, fecha: dayAgo(3), estado: 'reembolsado', provider: 'mock', provider_ref: 'MOCK-106' },
    // Pago pendiente (no confirmado).
    { id: '90000000-0000-0000-0000-000000000007', tipo: 'consulta', solicitud_id: null, consulta_id: '30000000-0000-0000-0000-000000000006', paciente_id: '20000000-0000-0000-0000-000000000001', clinica_id: CLINICA_ID, monto: 40, moneda: 'USD', tasa_usd: 755.9, descuento: 0, iva: 0, metodo: 'efectivo', secretaria_id: AUTH_USERS[4].id, fecha: todayISO(), estado: 'pendiente', provider: 'mock', provider_ref: 'MOCK-107' },
  ],

  reactivos: [
    { id: '91000000-0000-0000-0000-000000000001', clinica_id: CLINICA_ID, nombre: 'Tiras reactivas glucosa', lote: 'GLU-2026-01', fecha_vencimiento: '2026-12-01', cantidad: 120, alerta_minima: 30, proveedor: 'MediLab', created_at: dayAgo(30) },
    { id: '91000000-0000-0000-0000-000000000002', clinica_id: CLINICA_ID, nombre: 'HemoCue Hb 301', lote: 'HEM-2026-02', fecha_vencimiento: '2026-09-01', cantidad: 15, alerta_minima: 10, proveedor: 'BioTech', created_at: dayAgo(30) },
    // Reactivo vencido (para probar alertas de vencimiento).
    { id: '91000000-0000-0000-0000-000000000003', clinica_id: CLINICA_ID, nombre: 'Tiras de orina 10 parámetros', lote: 'ORI-2025-11', fecha_vencimiento: '2025-11-15', cantidad: 40, alerta_minima: 20, proveedor: 'MediLab', created_at: dayAgo(120) },
    // Reactivo bajo stock (cantidad < alerta_minima).
    { id: '91000000-0000-0000-0000-000000000004', clinica_id: CLINICA_ID, nombre: 'Kit TSH ultrasensible', lote: 'TSH-2026-03', fecha_vencimiento: '2026-10-01', cantidad: 4, alerta_minima: 8, proveedor: 'Diagnóstica CR', created_at: dayAgo(45) },
    // Reactivo activo normal.
    { id: '91000000-0000-0000-0000-000000000005', clinica_id: CLINICA_ID, nombre: 'Reactivo Colesterol enzimático', lote: 'COL-2026-05', fecha_vencimiento: '2027-03-01', cantidad: 60, alerta_minima: 15, proveedor: 'BioTech', created_at: dayAgo(60) },
  ],

  portal_codigos: [],

  notificaciones: [
    { id: '93000000-0000-0000-0000-000000000001', paciente_id: '20000000-0000-0000-0000-000000000001', canal: 'push', tipo: 'resultado', mensaje: 'Juan Pérez, el resultado de Glicemia en ayunas ya está disponible. Consúltalo desde tu portal.', estado: 'enviada', enviada_at: dayAgo(6), created_at: dayAgo(6) },
    { id: '93000000-0000-0000-0000-000000000002', paciente_id: '20000000-0000-0000-0000-000000000001', canal: 'push', tipo: 'cita', mensaje: 'Juan Pérez, te recordamos tu cita con Dra. María Fernández el próximo día a las 11:30.', estado: 'pendiente', programada_para: future(1, 9), metadata: { fecha_cita: future(3, 11) }, created_at: dayAgo(0) },
    // Notificación por email (resultado crítico).
    { id: '93000000-0000-0000-0000-000000000003', paciente_id: '20000000-0000-0000-0000-000000000012', canal: 'email', tipo: 'resultado', mensaje: 'Carmen Rodríguez, su resultado de Glicemia en ayunas requiere atención. Comuníquese con la clínica.', estado: 'enviada', enviada_at: dayAgo(1), created_at: dayAgo(1) },
    // Notificación SMS (recordatorio de cita).
    { id: '93000000-0000-0000-0000-000000000004', paciente_id: '20000000-0000-0000-0000-000000000002', canal: 'sms', tipo: 'cita', mensaje: 'María García, le esperamos en su cita de control. Confirme su asistencia.', estado: 'pendiente', programada_para: future(2, 16), metadata: { fecha_cita: future(2, 16) }, created_at: dayAgo(0) },
    // Notificación tipo cobro/pago pendiente.
    { id: '93000000-0000-0000-0000-000000000005', paciente_id: '20000000-0000-0000-0000-000000000002', canal: 'email', tipo: 'pago', mensaje: 'María García, tiene un monto pendiente por sus exámenes de laboratorio.', estado: 'enviada', enviada_at: dayAgo(1), created_at: dayAgo(1) },
  ],

  muestras_domicilio: [
    { id: '94000000-0000-0000-0000-000000000001', clinica_id: CLINICA_ID, solicitud_id: '50000000-0000-0000-0000-000000000004', paciente_id: '20000000-0000-0000-0000-000000000004', direccion: 'Av. Principal, Caracas', telefono: '+584150000003', fecha_visita: future(1, 8), estado: 'programada', ubicacion: null, notas: 'Primera toma', creado_por: AUTH_USERS[4].id, created_at: dayAgo(0), updated_at: dayAgo(0) },
    { id: '94000000-0000-0000-0000-000000000002', clinica_id: CLINICA_ID, solicitud_id: null, paciente_id: '20000000-0000-0000-0000-000000000003', direccion: 'Maracay', telefono: '+584150000002', fecha_visita: null, estado: 'solicitada', ubicacion: null, notas: null, creado_por: AUTH_USERS[4].id, created_at: dayAgo(0), updated_at: dayAgo(0) },
    // Toma de muestra en ruta (con ubicación).
    { id: '94000000-0000-0000-0000-000000000003', clinica_id: CLINICA_ID, solicitud_id: '50000000-0000-0000-0000-000000000010', paciente_id: '20000000-0000-0000-0000-000000000001', direccion: 'Av. Principal, Caracas', telefono: '+584141234567', fecha_visita: todayISO(), estado: 'en_ruta', ubicacion: { lat: 10.4806, lng: -66.9036 }, notas: 'Técnico en camino — toma de sangre', creado_por: AUTH_USERS[4].id, created_at: todayISO(), updated_at: todayISO() },
    // Toma completada.
    { id: '94000000-0000-0000-0000-000000000004', clinica_id: CLINICA_ID, solicitud_id: '50000000-0000-0000-0000-000000000011', paciente_id: '20000000-0000-0000-0000-000000000012', direccion: 'Los Teques', telefono: '+584150000009', fecha_visita: dayAgo(3, 9), estado: 'completada', ubicacion: null, notas: 'Muestra recibida en laboratorio', creado_por: AUTH_USERS[4].id, created_at: dayAgo(3), updated_at: dayAgo(2) },
  ],

  turnos: [
    { id: '95000000-0000-0000-0000-000000000001', clinica_id: CLINICA_ID, consulta_id: '30000000-0000-0000-0000-000000000004', paciente_id: '20000000-0000-0000-0000-000000000004', numero: 1, fecha: todayISO(), estado: 'llamado', prioridad: 'normal', creado_por: AUTH_USERS[4].id, hora_creado: dayAgo(0), hora_llamado: dayAgo(0), hora_atendido: null },
    { id: '95000000-0000-0000-0000-000000000002', clinica_id: CLINICA_ID, consulta_id: '30000000-0000-0000-0000-000000000005', paciente_id: '20000000-0000-0000-0000-000000000001', numero: 2, fecha: todayISO(), estado: 'esperando', prioridad: 'prioridad', creado_por: AUTH_USERS[4].id, hora_creado: dayAgo(0), hora_llamado: null, hora_atendido: null },
    { id: '95000000-0000-0000-0000-000000000003', clinica_id: CLINICA_ID, consulta_id: null, paciente_id: '20000000-0000-0000-0000-000000000002', numero: 3, fecha: todayISO(), estado: 'esperando', prioridad: 'normal', creado_por: AUTH_USERS[4].id, hora_creado: dayAgo(0), hora_llamado: null, hora_atendido: null },
    // Turno atendido (completado).
    { id: '95000000-0000-0000-0000-000000000004', clinica_id: CLINICA_ID, consulta_id: '30000000-0000-0000-0000-000000000006', paciente_id: '20000000-0000-0000-0000-000000000001', numero: 4, fecha: todayISO(), estado: 'atendido', prioridad: 'normal', creado_por: AUTH_USERS[4].id, hora_creado: dayAgo(0, 7), hora_llamado: dayAgo(0, 8), hora_atendido: dayAgo(0, 9) },
    // Turno cancelado.
    { id: '95000000-0000-0000-0000-000000000005', clinica_id: CLINICA_ID, consulta_id: null, paciente_id: '20000000-0000-0000-0000-000000000008', numero: 5, fecha: todayISO(), estado: 'cancelado', prioridad: 'normal', creado_por: AUTH_USERS[4].id, hora_creado: dayAgo(0), hora_llamado: null, hora_atendido: null },
    // Turno en espera con prioridad urgente.
    { id: '95000000-0000-0000-0000-000000000006', clinica_id: CLINICA_ID, consulta_id: null, paciente_id: '20000000-0000-0000-0000-000000000012', numero: 6, fecha: todayISO(), estado: 'esperando', prioridad: 'urgente', creado_por: AUTH_USERS[4].id, hora_creado: dayAgo(0), hora_llamado: null, hora_atendido: null },
    // Turno vinculado a la consulta programada de hoy (retroalimentación agenda).
    { id: '95000000-0000-0000-0000-000000000007', clinica_id: CLINICA_ID, consulta_id: '30000000-0000-0000-0000-000000000008', paciente_id: '20000000-0000-0000-0000-000000000012', numero: 7, fecha: todayISO(), estado: 'esperando', prioridad: 'normal', creado_por: AUTH_USERS[4].id, hora_creado: dayAgo(0), hora_llamado: null, hora_atendido: null },
  ],

  disponibilidad_medico: [
    { id: '96000000-0000-0000-0000-000000000001', medico_id: AUTH_USERS[2].id, clinica_id: CLINICA_ID, dia: 1, hora_inicio: '08:00:00', hora_fin: '16:00:00', duracion_min: 30, activo: true, created_at: dayAgo(20), updated_at: dayAgo(20) },
    { id: '96000000-0000-0000-0000-000000000002', medico_id: AUTH_USERS[2].id, clinica_id: CLINICA_ID, dia: 2, hora_inicio: '08:00:00', hora_fin: '16:00:00', duracion_min: 30, activo: true, created_at: dayAgo(20), updated_at: dayAgo(20) },
    { id: '96000000-0000-0000-0000-000000000003', medico_id: AUTH_USERS[2].id, clinica_id: CLINICA_ID, dia: 3, hora_inicio: '08:00:00', hora_fin: '16:00:00', duracion_min: 30, activo: true, created_at: dayAgo(20), updated_at: dayAgo(20) },
    { id: '96000000-0000-0000-0000-000000000004', medico_id: AUTH_USERS[2].id, clinica_id: CLINICA_ID, dia: 4, hora_inicio: '08:00:00', hora_fin: '16:00:00', duracion_min: 30, activo: true, created_at: dayAgo(20), updated_at: dayAgo(20) },
    { id: '96000000-0000-0000-0000-000000000005', medico_id: AUTH_USERS[2].id, clinica_id: CLINICA_ID, dia: 5, hora_inicio: '08:00:00', hora_fin: '16:00:00', duracion_min: 30, activo: true, created_at: dayAgo(20), updated_at: dayAgo(20) },
    // Dra. Suárez (cardiología): lunes, miércoles y viernes por la mañana.
    { id: '96000000-0000-0000-0000-000000000006', medico_id: AUTH_USERS[5].id, clinica_id: CLINICA_ID, dia: 1, hora_inicio: '07:00:00', hora_fin: '12:00:00', duracion_min: 45, activo: true, created_at: dayAgo(18), updated_at: dayAgo(18) },
    { id: '96000000-0000-0000-0000-000000000007', medico_id: AUTH_USERS[5].id, clinica_id: CLINICA_ID, dia: 3, hora_inicio: '07:00:00', hora_fin: '12:00:00', duracion_min: 45, activo: true, created_at: dayAgo(18), updated_at: dayAgo(18) },
    { id: '96000000-0000-0000-0000-000000000008', medico_id: AUTH_USERS[5].id, clinica_id: CLINICA_ID, dia: 5, hora_inicio: '07:00:00', hora_fin: '12:00:00', duracion_min: 45, activo: true, created_at: dayAgo(18), updated_at: dayAgo(18) },
    // Dr. Ramírez (traumatología): martes y jueves por la tarde.
    { id: '96000000-0000-0000-0000-000000000009', medico_id: AUTH_USERS[6].id, clinica_id: CLINICA_ID, dia: 2, hora_inicio: '13:00:00', hora_fin: '18:00:00', duracion_min: 30, activo: true, created_at: dayAgo(16), updated_at: dayAgo(16) },
    { id: '96000000-0000-0000-0000-000000000010', medico_id: AUTH_USERS[6].id, clinica_id: CLINICA_ID, dia: 4, hora_inicio: '13:00:00', hora_fin: '18:00:00', duracion_min: 30, activo: true, created_at: dayAgo(16), updated_at: dayAgo(16) },
  ],

  checkpoints_preanalitica: CHECKPOINTS_PREANALITICA.map((nombre, i) => ({
    id: `97000000-0000-0000-0000-${String(i + 1).padStart(12, '0')}`,
    clinica_id: CLINICA_ID,
    nombre,
    activo: true,
    created_at: dayAgo(20),
  })),

  solicitudes_preanalitica: [
    { id: '98000000-0000-0000-0000-000000000001', solicitud_id: '50000000-0000-0000-0000-000000000001', checkpoint_id: '97000000-0000-0000-0000-000000000001', cumplido: true, validado_por: AUTH_USERS[4].id, created_at: dayAgo(6) },
    { id: '98000000-0000-0000-0000-0000-000000000002', solicitud_id: '50000000-0000-0000-0000-000000000001', checkpoint_id: '97000000-0000-0000-0000-000000000002', cumplido: true, validado_por: AUTH_USERS[4].id, created_at: dayAgo(6) },
    { id: '98000000-0000-0000-0000-0000-000000000003', solicitud_id: '50000000-0000-0000-0000-000000000001', checkpoint_id: '97000000-0000-0000-0000-000000000003', cumplido: true, validado_por: AUTH_USERS[4].id, created_at: dayAgo(6) },
    { id: '98000000-0000-0000-0000-0000-000000000004', solicitud_id: '50000000-0000-0000-0000-000000000001', checkpoint_id: '97000000-0000-0000-0000-000000000004', cumplido: true, validado_por: AUTH_USERS[4].id, created_at: dayAgo(6) },
    { id: '98000000-0000-0000-0000-000000000005', solicitud_id: '50000000-0000-0000-0000-000000000001', checkpoint_id: '97000000-0000-0000-0000-000000000005', cumplido: true, validado_por: AUTH_USERS[4].id, created_at: dayAgo(6) },
  ],

  audit_logs: [
    { id: '92000000-0000-0000-0000-000000000001', usuario_id: AUTH_USERS[4].id, accion: 'INSERT', tabla: 'pacientes', registro_id: '20000000-0000-0000-0000-000000000001', detalles: { old: null, new: { cedula: 'V-12345678' } }, ip: null, fecha: dayAgo(14) },
    // Registro de edición de paciente (permite probar el historial de auditoría).
    { id: '92000000-0000-0000-0000-000000000002', usuario_id: AUTH_USERS[4].id, accion: 'UPDATE', tabla: 'pacientes', registro_id: '20000000-0000-0000-0000-000000000001', detalles: { old: { telefono: '+584141234560' }, new: { telefono: '+584141234567' } }, ip: '192.168.1.10', fecha: dayAgo(13) },
    // Registro de eliminación lógica.
    { id: '92000000-0000-0000-0000-000000000003', usuario_id: AUTH_USERS[1].id, accion: 'DELETE', tabla: 'pacientes', registro_id: '20000000-0000-0000-0000-000000000014', detalles: { old: null, new: { deleted_at: true } }, ip: '192.168.1.20', fecha: dayAgo(2) },
    // Registro de cambio de configuración de la clínica.
    { id: '92000000-0000-0000-0000-000000000004', usuario_id: AUTH_USERS[1].id, accion: 'UPDATE', tabla: 'app_config', registro_id: '1', detalles: { old: { telefono: null }, new: { telefono: '+58 412-1234567' } }, ip: null, fecha: dayAgo(5) },
  ],

  parametros_referencia: [
    { id: '9A000000-0000-0000-0000-000000000001', clinica_id: CLINICA_ID, examen_id: '40000000-0000-0000-0000-000000000002', parametro: 'glicemia', nombre: 'Glicemia', unidad: 'mg/dL', normal_min: 70, normal_max: 99, critico_min: 50, critico_max: 250, activo: true, created_at: dayAgo(25), updated_at: dayAgo(25) },
    { id: '9A000000-0000-0000-0000-000000000002', clinica_id: CLINICA_ID, examen_id: '40000000-0000-0000-0000-000000000003', parametro: 'colesterol_total', nombre: 'Colesterol total', unidad: 'mg/dL', normal_min: null, normal_max: 199, critico_min: null, critico_max: 240, activo: true, created_at: dayAgo(25), updated_at: dayAgo(25) },
    { id: '9A000000-0000-0000-0000-000000000003', clinica_id: CLINICA_ID, examen_id: '40000000-0000-0000-0000-000000000003', parametro: 'trigliceridos', nombre: 'Triglicéridos', unidad: 'mg/dL', normal_min: null, normal_max: 149, critico_min: null, critico_max: 200, activo: true, created_at: dayAgo(25), updated_at: dayAgo(25) },
    { id: '9A000000-0000-0000-0000-000000000004', clinica_id: CLINICA_ID, examen_id: '40000000-0000-0000-0000-000000000001', parametro: 'hemoglobina', nombre: 'Hemoglobina', unidad: 'g/dL', normal_min: 12, normal_max: 17, critico_min: 7, critico_max: 20, activo: true, created_at: dayAgo(25), updated_at: dayAgo(25) },
    // Parámetros para la hematología completa (conteo y hematocrito).
    { id: '9A000000-0000-0000-0000-000000000005', clinica_id: CLINICA_ID, examen_id: '40000000-0000-0000-0000-000000000001', parametro: 'globulos_rojos', nombre: 'Glóbulos rojos', unidad: 'M/uL', normal_min: 4.2, normal_max: 6.1, critico_min: 3, critico_max: 8, activo: true, created_at: dayAgo(25), updated_at: dayAgo(25) },
    { id: '9A000000-0000-0000-0000-000000000006', clinica_id: CLINICA_ID, examen_id: '40000000-0000-0000-0000-000000000001', parametro: 'hematocrito', nombre: 'Hematocrito', unidad: '%', normal_min: 38, normal_max: 50, critico_min: 25, critico_max: 60, activo: true, created_at: dayAgo(25), updated_at: dayAgo(25) },
    { id: '9A000000-0000-0000-0000-000000000007', clinica_id: CLINICA_ID, examen_id: '40000000-0000-0000-0000-000000000004', parametro: 'ph', nombre: 'pH urinario', unidad: '', normal_min: 4.5, normal_max: 8, critico_min: null, critico_max: null, activo: true, created_at: dayAgo(25), updated_at: dayAgo(25) },
  ],

  alertas_clinicas: [
    { id: '9B000000-0000-0000-0000-000000000001', clinica_id: CLINICA_ID, paciente_id: '20000000-0000-0000-0000-000000000002', examen_id: '40000000-0000-0000-0000-000000000003', solicitud_detalle_id: '60000000-0000-0000-0000-000000000008', resultado_id: '70000000-0000-0000-0000-000000000005', parametro: 'colesterol_total', valor: '212 mg/dL', unidad: 'mg/dL', nivel: 'alerta', motivo: 'Colesterol total fuera de rango de referencia (< 199 mg/dL)', leida: false, created_at: dayAgo(13) },
    { id: '9B000000-0000-0000-0000-000000000002', clinica_id: CLINICA_ID, paciente_id: '20000000-0000-0000-0000-000000000001', examen_id: '40000000-0000-0000-0000-000000000002', solicitud_detalle_id: '60000000-0000-0000-0000-000000000009', resultado_id: '70000000-0000-0000-0000-000000000006', parametro: 'glicemia', valor: '102 mg/dL', unidad: 'mg/dL', nivel: 'alerta', motivo: 'Glicemia fuera de rango de referencia (70–99 mg/dL)', leida: false, created_at: dayAgo(20) },
  ],

  imagenes_clinicas: [
    { id: '9C000000-0000-0000-0000-000000000001', clinica_id: CLINICA_ID, estudio_id: '9D000000-0000-0000-0000-000000000001', paciente_id: '20000000-0000-0000-0000-000000000001', consulta_id: '30000000-0000-0000-0000-000000000001', url: 'data:image/svg+xml;base64,' + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400"><rect width="600" height="400" fill="#0f172a"/><text x="300" y="200" font-size="26" fill="#e2e8f0" text-anchor="middle" font-family="monospace">RX TORAX - JUAN PEREZ</text><line x1="100" y1="280" x2="500" y2="280" stroke="#475569" stroke-width="12"/><line x1="300" y1="120" x2="300" y2="280" stroke="#e2e8f0" stroke-width="8"/><line x1="120" y1="150" x2="300" y2="220" stroke="#94a3b8" stroke-width="14"/><line x1="480" y1="150" x2="300" y2="220" stroke="#94a3b8" stroke-width="14"/></svg>').toString('base64'), tipo: 'rx', region: 'Tórax', descripcion: 'Placa de tórax AP: campos pulmonares sin lesiones', orden: 1, creado_por: AUTH_USERS[2].id, created_at: dayAgo(6) },
    { id: '9C000000-0000-0000-0000-000000000002', clinica_id: CLINICA_ID, estudio_id: '9D000000-0000-0000-0000-000000000002', paciente_id: '20000000-0000-0000-0000-000000000001', consulta_id: null, url: 'data:image/svg+xml;base64,' + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400"><rect width="600" height="400" fill="#052e16"/><text x="300" y="200" font-size="26" fill="#dcfce7" text-anchor="middle" font-family="monospace">ECOGRAFIA ABDOMINAL</text><ellipse cx="300" cy="220" rx="140" ry="90" fill="none" stroke="#dcfce7" stroke-width="6"/><line x1="170" y1="180" x2="250" y2="240" stroke="#86efac" stroke-width="8"/></svg>').toString('base64'), tipo: 'ecografia', region: 'Abdomen', descripcion: 'Hígado y vesícula sin alteraciones', orden: 1, creado_por: AUTH_USERS[2].id, created_at: dayAgo(4) },
    // Resonancia magnética (paciente con gonalgia).
    { id: '9C000000-0000-0000-0000-000000000003', clinica_id: CLINICA_ID, estudio_id: '9D000000-0000-0000-0000-000000000003', paciente_id: '20000000-0000-0000-0000-000000000008', consulta_id: '30000000-0000-0000-0000-000000000009', url: 'data:image/svg+xml;base64,' + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400"><rect width="600" height="400" fill="#1e1b4b"/><text x="300" y="200" font-size="26" fill="#c7d2fe" text-anchor="middle" font-family="monospace">RMN RODILLA DERECHA</text><circle cx="300" cy="240" r="80" fill="none" stroke="#c7d2fe" stroke-width="6"/><line x1="300" y1="240" x2="300" y2="120" stroke="#a5b4fc" stroke-width="6"/></svg>').toString('base64'), tipo: 'resonancia', region: 'Rodilla derecha', descripcion: 'RMN de rodilla: desgaste meniscal medial', orden: 1, creado_por: AUTH_USERS[6].id, created_at: dayAgo(5) },
    // Tomografía (control del paciente crónico) — serie de 2 cortes.
    { id: '9C000000-0000-0000-0000-000000000004', clinica_id: CLINICA_ID, estudio_id: '9D000000-0000-0000-0000-000000000004', paciente_id: '20000000-0000-0000-0000-000000000012', consulta_id: null, url: 'data:image/svg+xml;base64,' + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400"><rect width="600" height="400" fill="#292524"/><text x="300" y="200" font-size="26" fill="#fde68a" text-anchor="middle" font-family="monospace">TC ABDOMEN</text><rect x="220" y="160" width="160" height="120" fill="none" stroke="#fde68a" stroke-width="6"/><circle cx="300" cy="220" r="30" fill="none" stroke="#fcd34d" stroke-width="6"/></svg>').toString('base64'), tipo: 'tomografia', region: 'Abdomen', descripcion: 'TC abdominal de control — corte 1', orden: 1, creado_por: AUTH_USERS[2].id, created_at: dayAgo(9) },
    { id: '9C000000-0000-0000-0000-000000000005', clinica_id: CLINICA_ID, estudio_id: '9D000000-0000-0000-0000-000000000004', paciente_id: '20000000-0000-0000-0000-000000000012', consulta_id: null, url: 'data:image/svg+xml;base64,' + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400"><rect width="600" height="400" fill="#292524"/><text x="300" y="200" font-size="26" fill="#fde68a" text-anchor="middle" font-family="monospace">TC ABDOMEN</text><rect x="220" y="160" width="160" height="120" fill="none" stroke="#fde68a" stroke-width="6"/><circle cx="300" cy="220" r="30" fill="none" stroke="#fcd34d" stroke-width="6"/><line x1="300" y1="120" x2="300" y2="320" stroke="#fcd34d" stroke-width="2" stroke-dasharray="6 6"/></svg>').toString('base64'), tipo: 'tomografia', region: 'Abdomen', descripcion: 'TC abdominal de control — corte 2', orden: 2, creado_por: AUTH_USERS[2].id, created_at: dayAgo(9) },
  ],

  estudios_imagen: [
    { id: '9D000000-0000-0000-0000-000000000001', clinica_id: CLINICA_ID, paciente_id: '20000000-0000-0000-0000-000000000001', consulta_id: '30000000-0000-0000-0000-000000000001', tipo: 'rx', region: 'Tórax', titulo: 'Placa de tórax AP', hallazgos: 'Campos pulmonares sin lesiones.', impresion: 'Sin hallazgos patológicos.', estado: 'leido', medico_id: AUTH_USERS[2].id, creado_por: AUTH_USERS[2].id, fecha_estudio: dayAgo(6), retencion_hasta: null, token: null, token_expira: null, created_at: dayAgo(6), updated_at: dayAgo(5) },
    { id: '9D000000-0000-0000-0000-000000000002', clinica_id: CLINICA_ID, paciente_id: '20000000-0000-0000-0000-000000000001', consulta_id: null, tipo: 'ecografia', region: 'Abdomen', titulo: 'Ecografía abdominal', hallazgos: 'Hígado y vesícula sin alteraciones.', impresion: 'Estudio normal.', estado: 'pendiente', medico_id: null, creado_por: AUTH_USERS[2].id, fecha_estudio: dayAgo(4), retencion_hasta: null, token: null, token_expira: null, created_at: dayAgo(4), updated_at: dayAgo(4) },
    { id: '9D000000-0000-0000-0000-000000000003', clinica_id: CLINICA_ID, paciente_id: '20000000-0000-0000-0000-000000000008', consulta_id: '30000000-0000-0000-0000-000000000009', tipo: 'resonancia', region: 'Rodilla derecha', titulo: 'RMN de rodilla', hallazgos: 'Desgaste meniscal medial.', impresion: 'Cambios degenerativos meniscales.', estado: 'pendiente', medico_id: AUTH_USERS[6].id, creado_por: AUTH_USERS[6].id, fecha_estudio: dayAgo(5), retencion_hasta: null, token: null, token_expira: null, created_at: dayAgo(5), updated_at: dayAgo(5) },
    { id: '9D000000-0000-0000-0000-000000000004', clinica_id: CLINICA_ID, paciente_id: '20000000-0000-0000-0000-000000000012', consulta_id: null, tipo: 'tomografia', region: 'Abdomen', titulo: 'TC abdominal de control', hallazgos: null, impresion: null, estado: 'pendiente', medico_id: null, creado_por: AUTH_USERS[2].id, fecha_estudio: dayAgo(9), retencion_hasta: null, token: null, token_expira: null, created_at: dayAgo(9), updated_at: dayAgo(9) },
  ],

  categorias_medicas: CATEGORIAS_MEDICAS.map((c) => ({ ...c })),

  especialidades_medicas: ESPECIALIDADES_MEDICAS.map((e) => ({ ...e })),

  historial_clinico: [
    { id: '9D100000-0000-0000-0000-000000000001', clinica_id: CLINICA_ID, paciente_id: '20000000-0000-0000-0000-000000000001', consulta_id: '30000000-0000-0000-0000-000000000001', medico_id: AUTH_USERS[2].id, tipo: 'evolucion', categoria_origen: 'atencion_primaria', titulo: 'Chequeo general — evolución', contenido: { subjetivo: 'Paciente asintomático, refiere buen estado general.', objetivo: 'TA 120/80, FC 72 lpm, IMC 24.1.', plan: 'Continuar actividad física. Controles anuales.' }, firma_hash: 'demo', created_at: dayAgo(7) },
    { id: '9D100000-0000-0000-0000-000000000002', clinica_id: CLINICA_ID, paciente_id: '20000000-0000-0000-0000-000000000001', consulta_id: null, medico_id: AUTH_USERS[2].id, tipo: 'resultado', categoria_origen: 'atencion_primaria', titulo: 'Resultado de laboratorio: Glicemia en ayunas', contenido: { examen: 'Glicemia en ayunas', valor: '88 mg/dL', observacion: 'Dentro de rango' }, firma_hash: 'demo', created_at: dayAgo(6) },
    { id: '9D100000-0000-0000-0000-000000000003', clinica_id: CLINICA_ID, paciente_id: '20000000-0000-0000-0000-000000000002', consulta_id: '30000000-0000-0000-0000-000000000002', medico_id: AUTH_USERS[2].id, tipo: 'evolucion', categoria_origen: 'atencion_primaria', titulo: 'Dolor abdominal — evolución', contenido: { subjetivo: 'Epigastralgia postprandial.', objetivo: 'Dolor leve a la palpación epigástrica.', diagnostico: 'Gastritis leve', plan: 'Omeprazol 20 mg c/24 h. Dieta blanda. Control en 2 semanas.' }, firma_hash: 'demo', created_at: dayAgo(4) },
    // Registro de ingreso hospitalario (paciente crónico).
    { id: '9D100000-0000-0000-0000-000000000004', clinica_id: CLINICA_ID, paciente_id: '20000000-0000-0000-0000-000000000012', consulta_id: null, medico_id: AUTH_USERS[2].id, tipo: 'otro', categoria_origen: 'atencion_primaria', titulo: 'Ingreso por descompensación hipertensiva', contenido: { motivo: 'Crisis hipertensiva con cifras 190/110.', evaluacion: 'Requiere ajuste de antihipertensivos y monitoreo.', plan: 'Hospitalización por 48 h, control TA cada 6 h.' }, firma_hash: 'demo', created_at: dayAgo(11) },
    // Registro de procedimiento (traumatología).
    { id: '9D100000-0000-0000-0000-000000000005', clinica_id: CLINICA_ID, paciente_id: '20000000-0000-0000-0000-000000000008', consulta_id: '30000000-0000-0000-0000-000000000009', medico_id: AUTH_USERS[6].id, tipo: 'procedimiento', categoria_origen: 'especialidades_quirurgicas', titulo: 'Infiltración de rodilla derecha', contenido: { procedimiento: 'Infiltración intraarticular con corticoide.', hallazgos: 'Derrame leve, sin signos de infección.', recomendaciones: 'Reposo 48 h, crioterapia local.' }, firma_hash: 'demo', created_at: dayAgo(5) },
    // Registro de resultado (nuevo resultado crítico de glicemia).
    { id: '9D100000-0000-0000-0000-000000000006', clinica_id: CLINICA_ID, paciente_id: '20000000-0000-0000-0000-000000000012', consulta_id: null, medico_id: AUTH_USERS[2].id, tipo: 'resultado', categoria_origen: 'atencion_primaria', titulo: 'Resultado de laboratorio: Glicemia (crítico)', contenido: { examen: 'Glicemia en ayunas', valor: '265 mg/dL', observacion: 'Fuera de rango; requiere manejo inmediato.' }, firma_hash: 'demo', created_at: dayAgo(1) },
  ],

  historial_correcciones: [
    { id: '9D200000-0000-0000-0000-000000000001', historial_id: '9D100000-0000-0000-0000-000000000001', tipo: 'fe_errata', contenido: { texto: 'Fe de erratas: el diagnóstico de la consulta fue "Paciente sano, en control de hipotiroidismo subclínico".' }, medico_id: AUTH_USERS[2].id, firma_hash: 'demo', created_at: dayAgo(6, 11) },
    { id: '9D200000-0000-0000-0000-000000000002', historial_id: '9D100000-0000-0000-0000-000000000001', tipo: 'adenda', contenido: { texto: 'Adenda: se solicita perfil tiroideo (TSH) en próximo control.' }, medico_id: AUTH_USERS[2].id, firma_hash: 'demo', created_at: dayAgo(5, 9) },
  ],

  notas_privadas: [
    { id: '9D300000-0000-0000-0000-000000000001', paciente_id: '20000000-0000-0000-0000-000000000001', consulta_id: '30000000-0000-0000-0000-000000000001', medico_id: AUTH_USERS[2].id, contenido: 'Paciente refiere estrés laboral; valorar seguimiento con psicología. No compartir aún.', created_at: dayAgo(7), updated_at: dayAgo(7) },
    // Nota privada de la Dra. Suárez (otro autor, para probar permisos por autor).
    { id: '9D300000-0000-0000-0000-000000000002', paciente_id: '20000000-0000-0000-0000-000000000001', consulta_id: '30000000-0000-0000-0000-000000000006', medico_id: AUTH_USERS[5].id, contenido: 'Pendiente de confirmar resultado de Holter en la próxima cita.', created_at: dayAgo(2), updated_at: dayAgo(2) },
  ],

  // Evoluciones SOAP (panel Evolución) — alimentan el histórico y el gráfico
  // temporal de signos vitales en el expediente.
  evoluciones: [
    // Juan Pérez (20000000-...-0001): chequeo general + control cardiovascular.
    {
      id: '9D600000-0000-0000-0000-000000000001',
      paciente_id: '20000000-0000-0000-0000-000000000001',
      medico_id: AUTH_USERS[2].id,
      especialidad_id: 'medicina_general',
      subjetivo: 'Paciente asintomático, refiere buen estado general. Estrés laboral leve.',
      objetivo: 'TA 120/80 mmHg, FC 72 lpm, temperatura 36.6 °C.',
      evaluacion: 'Paciente sano, en control de hipotiroidismo subclínico.',
      plan: 'Continuar actividad física. Control anual.',
      signos_vitales: { peso_kg: 76, talla_cm: 178, presion_sistolica: 120, presion_diastolica: 80, frecuencia_cardiaca: 72, temperatura: 36.6, saturacion_oxigeno: 98, glicemia: 88, frecuencia_respiratoria: 16 },
      especialidad_data: {},
      created_at: dayAgo(7, 9),
    },
    // Juan Pérez: evolución cardiológica (Dra. Ana Suárez).
    {
      id: '9D600000-0000-0000-0000-000000000002',
      paciente_id: '20000000-0000-0000-0000-000000000001',
      medico_id: AUTH_USERS[5].id,
      especialidad_id: 'cardiologia',
      subjetivo: 'Palpitaciones ocasionales y fatiga con esfuerzos moderados.',
      objetivo: 'TA 118/78 mmHg, FC 88 lpm en reposo. Ritmo regular, sin soplos.',
      evaluacion: 'Taquicardia sinusal leve. Se solicita Holter para descartar arritmia.',
      plan: 'Holter 24 h. Reducir cafeína. Retorno en 2 semanas.',
      signos_vitales: { peso_kg: 76, presion_sistolica: 118, presion_diastolica: 78, frecuencia_cardiaca: 88, saturacion_oxigeno: 97 },
      especialidad_data: {},
      created_at: dayAgo(2, 11),
    },
    // María García (20000000-...-0002): dolor abdominal.
    {
      id: '9D600000-0000-0000-0000-000000000003',
      paciente_id: '20000000-0000-0000-0000-000000000002',
      medico_id: AUTH_USERS[2].id,
      especialidad_id: 'medicina_general',
      subjetivo: 'Epigastralgia postprandial de 3 semanas, acidez ocasional.',
      objetivo: 'Dolor leve a la palpación epigástrica. TA 115/75, FC 80.',
      evaluacion: 'Gastritis leve.',
      plan: 'Omeprazol 20 mg c/24 h. Dieta blanda. Control en 2 semanas.',
      signos_vitales: { peso_kg: 61, talla_cm: 164, presion_sistolica: 115, presion_diastolica: 75, frecuencia_cardiaca: 80, temperatura: 36.5, saturacion_oxigeno: 98 },
      especialidad_data: {},
      created_at: dayAgo(4, 11),
    },
    // Carlos Martínez (20000000-...-0003): control de glicemia (diabético).
    {
      id: '9D600000-0000-0000-0000-000000000004',
      paciente_id: '20000000-0000-0000-0000-000000000003',
      medico_id: AUTH_USERS[2].id,
      especialidad_id: 'medicina_general',
      subjetivo: 'Paciente con DM2 en tratamiento. Refiere cumplimiento de metformina.',
      objetivo: 'Glicemia capilar 145 mg/dL. TA 130/85, FC 76.',
      evaluacion: 'Diabetes tipo 2 en regular control. Pendiente de resultados de laboratorio.',
      plan: 'Continuar metformina. Cita en 1 mes con perfil metabólico completo.',
      signos_vitales: { peso_kg: 84, talla_cm: 172, presion_sistolica: 130, presion_diastolica: 85, frecuencia_cardiaca: 76, glicemia: 145, saturacion_oxigeno: 96 },
      especialidad_data: {},
      created_at: dayAgo(2, 15),
    },
    // Carmen Rodríguez de Blanco (20000000-...-0012): crónico hipertenso.
    {
      id: '9D600000-0000-0000-0000-000000000005',
      paciente_id: '20000000-0000-0000-0000-000000000012',
      medico_id: AUTH_USERS[2].id,
      especialidad_id: 'medicina_general',
      subjetivo: 'Adulto mayor hipertenso. Episodios de mareo matinal.',
      objetivo: 'TA 150/95 mmHg, FC 82. Edemas maleolares leves.',
      evaluacion: 'Hipertensión arterial en descontrol. Ajuste de tratamiento requerido.',
      plan: 'Ajustar losartán a 50 mg c/12 h. Dieta hiposódica. Control en 1 semana.',
      signos_vitales: { peso_kg: 68, talla_cm: 158, presion_sistolica: 150, presion_diastolica: 95, frecuencia_cardiaca: 82, temperatura: 36.4, saturacion_oxigeno: 95 },
      especialidad_data: {},
      created_at: dayAgo(11, 10),
    },
    // Carmen: descompensación hipertensiva (ingreso).
    {
      id: '9D600000-0000-0000-0000-000000000006',
      paciente_id: '20000000-0000-0000-0000-000000000012',
      medico_id: AUTH_USERS[2].id,
      especialidad_id: 'medicina_general',
      subjetivo: 'Cefalea occipital y cifras elevadas en casa (190/110).',
      objetivo: 'Crisis hipertensiva: TA 185/108 mmHg. Requiere monitoreo.',
      evaluacion: 'Crisis hipertensiva. Riesgo de complicación.',
      plan: 'Hospitalización por 48 h. Control TA cada 6 h. Ajuste de antihipertensivos.',
      signos_vitales: { peso_kg: 68, presion_sistolica: 185, presion_diastolica: 108, frecuencia_cardiaca: 96, glicemia: 265, saturacion_oxigeno: 93 },
      especialidad_data: {},
      created_at: dayAgo(1, 8),
    },
    // Andrés Salazar (20000000-...-0015): chequeo metabólico.
    {
      id: '9D600000-0000-0000-0000-000000000007',
      paciente_id: '20000000-0000-0000-0000-000000000015',
      medico_id: AUTH_USERS[2].id,
      especialidad_id: 'medicina_general',
      subjetivo: 'Chequeo de rutina. Niega síntomas. Sobrepeso referido.',
      objetivo: 'TA 128/82, FC 70. IMC 28.1.',
      evaluacion: 'En observación, pendiente de exámenes de laboratorio.',
      plan: 'Glicemia y perfil lipídico en ayunas. Consulta en 2 semanas.',
      signos_vitales: { peso_kg: 88, talla_cm: 177, presion_sistolica: 128, presion_diastolica: 82, frecuencia_cardiaca: 70, temperatura: 36.7, saturacion_oxigeno: 98 },
      especialidad_data: {},
      created_at: dayAgo(3, 10),
    },
  ],

  alertas_criticas: [
    { id: '9D400000-0000-0000-0000-000000000001', clinica_id: CLINICA_ID, paciente_id: '20000000-0000-0000-0000-000000000001', tipo: 'alergia', descripcion: 'Alergia confirmada a penicilina (reacción anafiláctica previa)', severidad: 'alta', activa: true, creado_por: AUTH_USERS[2].id, created_at: dayAgo(20) },
    { id: '9D400000-0000-0000-0000-000000000002', clinica_id: CLINICA_ID, paciente_id: '20000000-0000-0000-0000-000000000001', tipo: 'enfermedad_cronica', descripcion: 'Asma bronquial en control con salbutamol PRN', severidad: 'media', activa: true, creado_por: AUTH_USERS[2].id, created_at: dayAgo(20) },
    { id: '9D400000-0000-0000-0000-000000000003', clinica_id: CLINICA_ID, paciente_id: '20000000-0000-0000-0000-000000000002', tipo: 'alergia', descripcion: 'Alergia a ibuprofeno (urticaria)', severidad: 'media', activa: true, creado_por: AUTH_USERS[2].id, created_at: dayAgo(15) },
    // Medicamento crítico (para el paciente crónico).
    { id: '9D400000-0000-0000-0000-000000000004', clinica_id: CLINICA_ID, paciente_id: '20000000-0000-0000-0000-000000000012', tipo: 'medicamento_critico', descripcion: 'Warfarina 5 mg — requiere monitoreo de INR', severidad: 'alta', activa: true, creado_por: AUTH_USERS[2].id, created_at: dayAgo(10) },
    // Alerta de enfermedad crónica inactiva (para probar reactivación).
    { id: '9D400000-0000-0000-0000-000000000005', clinica_id: CLINICA_ID, paciente_id: '20000000-0000-0000-0000-000000000003', tipo: 'enfermedad_cronica', descripcion: 'Diabetes mellitus tipo 2 (controlada)', severidad: 'media', activa: false, creado_por: AUTH_USERS[2].id, created_at: dayAgo(30) },
    // Alergia severa en otro paciente.
    { id: '9D400000-0000-0000-0000-000000000006', clinica_id: CLINICA_ID, paciente_id: '20000000-0000-0000-0000-000000000008', tipo: 'alergia', descripcion: 'Alergia a látex (urticaria moderada)', severidad: 'media', activa: true, creado_por: AUTH_USERS[6].id, created_at: dayAgo(9) },
  ],

  interconsultas: [
    { id: '9D500000-0000-0000-0000-000000000001', clinica_id: CLINICA_ID, paciente_id: '20000000-0000-0000-0000-000000000001', consulta_origen_id: '30000000-0000-0000-0000-000000000001', medico_origen_id: AUTH_USERS[2].id, categoria_destino: 'especialidades_clinicas', especialidad_destino: 'cardiologia', medico_destino_id: AUTH_USERS[5].id, motivo: 'Palpitaciones recurrentes y fatiga', hipotesis: 'Descartar arritmia supraventricular', estado: 'enviada', respuesta: null, medico_responde_id: null, created_at: dayAgo(3), updated_at: dayAgo(3) },
    { id: '9D500000-0000-0000-0000-000000000002', clinica_id: CLINICA_ID, paciente_id: '20000000-0000-0000-0000-000000000002', consulta_origen_id: '30000000-0000-0000-0000-000000000002', medico_origen_id: AUTH_USERS[2].id, categoria_destino: 'especialidades_quirurgicas', especialidad_destino: 'traumatologia', medico_destino_id: AUTH_USERS[6].id, motivo: 'Dolor lumbar de 3 semanas de evolución', hipotesis: 'Lumbalgia mecánica / descartar compresión radicular', estado: 'completada', respuesta: 'Evaluado: lumbalgia mecánica leve, esguince. Se indica fisioterapia y AINE.', medico_responde_id: AUTH_USERS[6].id, created_at: dayAgo(4), updated_at: dayAgo(2) },
    // Interconsulta aceptada (pendiente de completar por el cardiólogo).
    { id: '9D500000-0000-0000-0000-000000000003', clinica_id: CLINICA_ID, paciente_id: '20000000-0000-0000-0000-000000000012', consulta_origen_id: '30000000-0000-0000-0000-000000000010', medico_origen_id: AUTH_USERS[2].id, categoria_destino: 'especialidades_clinicas', especialidad_destino: 'cardiologia', medico_destino_id: AUTH_USERS[5].id, motivo: 'Cardiopatía hipertensiva: ajustar tratamiento', hipotesis: 'Requiere ecocardiograma y Holter', estado: 'aceptada', respuesta: null, medico_responde_id: AUTH_USERS[5].id, created_at: dayAgo(2), updated_at: dayAgo(1) },
    // Interconsulta cancelada.
    { id: '9D500000-0000-0000-0000-000000000004', clinica_id: CLINICA_ID, paciente_id: '20000000-0000-0000-0000-000000000003', consulta_origen_id: null, medico_origen_id: AUTH_USERS[2].id, categoria_destino: 'especialidades_clinicas', especialidad_destino: 'gastroenterologia', medico_destino_id: null, motivo: 'Disfagia intermitente', hipotesis: 'Descartar patología esofágica', estado: 'cancelada', respuesta: 'Paciente se atendió en otra institución.', medico_responde_id: AUTH_USERS[2].id, created_at: dayAgo(8), updated_at: dayAgo(7) },
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
    {
      id: '9E100000-0000-0000-0000-000000000003',
      clinica_id: CLINICA_ID,
      paciente_id: '20000000-0000-0000-0000-000000000012',
      consulta_id: null,
      origen: 'medico',
      creado_por_medico: AUTH_USERS[2].id,
      titulo: 'Cuestionario de historial médico',
      estado: 'consolidado',
      respuestas: {
        alimentacion: { marcado: false, detalle: null },
        actividad_fisica: { marcado: false, detalle: null },
        trastornos_sueno: { marcado: false, detalle: null },
        consumo_sustancias: { marcado: false, detalle: null },
        estres_salud_mental: { marcado: false, detalle: null },
        enfermedades_cronicas: { marcado: true, detalle: 'Hipertensión arterial desde 2018' },
        medicamentos_continuos: { marcado: true, detalle: 'Losartán 50 mg, Warfarina 5 mg' },
        alergias: { marcado: false, detalle: null },
        cirugias_hospitalizaciones: { marcado: true, detalle: 'Colecistectomía 2010' },
        vacunacion_incompleta: { marcado: false, detalle: null },
        historial_familiar_cancer: { marcado: false, detalle: null },
        historial_cardiovascular: { marcado: true, detalle: 'Hijo: hipertensión juvenil' },
        historial_diabetes_renal: { marcado: true, detalle: 'Madre: diabetes tipo 2' },
        sintomas_cardiovasculares: { marcado: true, detalle: 'Palpitaciones y cefalea matutina' },
        sintomas_gastrointestinales: { marcado: false, detalle: null },
        sintomas_neurologicos: { marcado: false, detalle: null },
        sintomas_urologicos_ginecologicos: { marcado: false, detalle: null },
        observaciones: 'Paciente crónica en seguimiento mensual.',
      },
      consolidado_at: dayAgo(10),
      deleted_at: null,
      created_at: dayAgo(12),
      updated_at: dayAgo(10),
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
