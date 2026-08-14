import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, getApiError } from '../../lib/api'
import BuscadorPacientes from '../../components/ui/BuscadorPacientes'
import { useExpedienteStore } from './expedienteStore'
import type { PacienteExpediente } from './types'
import type { Paciente } from '../../lib/types'

/** Barra superior: búsqueda con autocomplete por nombre, DNI o teléfono. Reutiliza
 *  el BuscadorPacientes compartido; aquí solo se añade el contexto de expediente
 *  (selector de menor, tutor y alta de menor vinculado). */
export default function BuscadorPacientesExpediente() {
  const { paciente, setPaciente } = useExpedienteStore()

  return (
    <div className="w-full">
      <BuscadorPacientes
        value={paciente as Paciente | null}
        onChange={(p) => p && setPaciente(p as PacienteExpediente)}
      />
      {paciente && <SelectorMenor />}
    </div>
  )
}

/** Selector de perfil de menor: alterna al menor vinculado o registra uno nuevo (modal). */
function SelectorMenor() {
  const { paciente, setExpedienteId, limpiar } = useExpedienteStore()
  const queryClient = useQueryClient()
  const [modal, setModal] = useState(false)

  // Un paciente adulto con representante_id null se trata como tutor potencial.
  const esTutor = Boolean(paciente && !paciente.es_menor && !paciente.representante_id)
  const { data: menores = [] } = useQuery({
    queryKey: ['expediente', 'menores', paciente?.id],
    enabled: esTutor && Boolean(paciente?.id),
    queryFn: async () => {
      const { data } = await api.get<PacienteExpediente[]>('/expediente/menores', { params: { tutor_id: paciente!.id } })
      return data
    },
  })

  if (!paciente) return null

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
      <span className="text-[11px] font-medium text-slate-600">
        Expediente:{' '}
        <button type="button" className="font-semibold text-brand-700 hover:underline" onClick={limpiar}>
          {paciente.nombre_completo}
        </button>
      </span>

      {esTutor && (
        <>
          {menores.length > 0 && (
            <select
              className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs"
              defaultValue=""
              onChange={(e) => e.target.value && setExpedienteId(e.target.value)}
            >
              <option value="">Perfil de menor vinculado…</option>
              {menores.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nombre_completo} ({m.parentesco_representante ?? 'menor'})
                </option>
              ))}
            </select>
          )}
          <button
            type="button"
            onClick={() => setModal(true)}
            className="rounded-lg border border-brand-300 bg-white px-2 py-1 text-[11px] font-medium text-brand-700 hover:bg-brand-50"
          >
            + Registrar menor
          </button>
          <span className="text-[11px] text-slate-400">Tutor</span>
        </>
      )}

      {paciente.es_menor && paciente.representante_id && <CargarTutor tutorId={paciente.representante_id} />}

      {modal && (
        <ModalRegistrarMenor
          onClose={() => setModal(false)}
          onOk={() => queryClient.invalidateQueries({ queryKey: ['expediente', 'menores', paciente.id] })}
        />
      )}
    </div>
  )
}

/** Si el expediente activo es un menor, permite saltar al expediente del tutor. */
function CargarTutor({ tutorId }: { tutorId: string }) {
  const { setPaciente } = useExpedienteStore()
  const { data: tutor } = useQuery({
    queryKey: ['expediente', 'tutor', tutorId],
    enabled: Boolean(tutorId),
    queryFn: async () => (await api.get<PacienteExpediente>(`/pacientes/${tutorId}`)).data,
  })
  if (!tutor) return null
  return (
    <button
      type="button"
      onClick={() => setPaciente(tutor)}
      className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-100"
    >
      Ver tutor: {tutor.nombre_completo}
    </button>
  )
}

/** Modal flotante para registrar un nuevo menor vinculado al tutor activo. */
function ModalRegistrarMenor({ onClose, onOk }: { onClose: () => void; onOk: () => void }) {
  const { paciente } = useExpedienteStore()
  const queryClient = useQueryClient()
  const [nombre, setNombre] = useState('')
  const [documento, setDocumento] = useState('')
  const [fecha, setFecha] = useState('')
  const [sexo, setSexo] = useState<'M' | 'F'>('M')
  const [parentesco, setParentesco] = useState('Hijo/a')
  const [error, setError] = useState<string | null>(null)

  const crear = useMutation({
    mutationFn: async () => {
      const partes = nombre.trim().split(/\s+/)
      const apellido = partes.pop() ?? ''
      const nombreRestante = partes.join(' ')
      const { data } = await api.post<PacienteExpediente>('/pacientes', {
        cedula: documento.trim() || undefined,
        tipo_documento: documento.trim() ? 'V' : undefined,
        nombre: nombreRestante,
        apellido,
        fecha_nacimiento: fecha,
        sexo,
        representante_id: paciente!.id,
        parentesco_representante: parentesco,
        es_menor: true,
      })
      return data
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['expediente', 'menores', paciente?.id] })
      useExpedienteStore.getState().setExpedienteId(data.id)
      onOk()
      onClose()
    },
    onError: (err) => setError(getApiError(err)),
  })

  function submit(e: FormEvent) {
    e.preventDefault()
    if (!nombre.trim() || !fecha) {
      setError('Completa nombre y fecha de nacimiento.')
      return
    }
    crear.mutate()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={onClose}>
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md space-y-3 rounded-2xl bg-white p-5 shadow-xl"
      >
        <h3 className="text-sm font-semibold text-slate-800">Registrar menor vinculado</h3>
        <p className="text-[11px] text-slate-500">Tutor: {paciente?.nombre_completo}</p>
        <input
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder="Nombre completo del menor"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
        <input
          value={documento}
          onChange={(e) => setDocumento(e.target.value)}
          placeholder="Cédula (opcional)"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
        <div className="grid grid-cols-2 gap-2">
          <input
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <select
            value={sexo}
            onChange={(e) => setSexo(e.target.value as 'M' | 'F')}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="M">Masculino</option>
            <option value="F">Femenino</option>
          </select>
        </div>
        <select
          value={parentesco}
          onChange={(e) => setParentesco(e.target.value)}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        >
          {['Hijo/a', 'Nieto/a', 'Sobrino/a', 'Ahijado/a', 'Otro'].map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>
        {error && <p className="text-xs text-red-500">{error}</p>}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-600"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={crear.isPending}
            className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60"
          >
            {crear.isPending ? 'Guardando…' : 'Registrar'}
          </button>
        </div>
      </form>
    </div>
  )
}