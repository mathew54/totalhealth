import { useQuery } from '@tanstack/react-query'
import { api } from './api'

export interface EspecialidadCatalogo {
  id: string
  categoria: string | null
  nombre: string
}

export interface CategoriaCatalogo {
  id: string
  nombre: string
  descripcion: string | null
  orden: number
}

export interface CatalogoEspecialidades {
  categorias: CategoriaCatalogo[]
  especialidades: EspecialidadCatalogo[]
}

/** Catálogo de las 7 categorías y sus especialidades (mismo endpoint que Admin/Historial). */
export function useCatalogoEspecialidades() {
  return useQuery<CatalogoEspecialidades>({
    queryKey: ['historial', 'especialidades'],
    queryFn: async () => (await api.get<CatalogoEspecialidades>('/historial/especialidades')).data,
  })
}

/** Resuelve un ID de especialidad a su nombre y categoría (con respaldo al ID). */
export function resolverEspecialidad(
  id: string | null | undefined,
  catalogo: CatalogoEspecialidades | undefined,
): { nombre: string; categoria: string | null } {
  if (!id) return { nombre: 'General', categoria: null }
  const esp = catalogo?.especialidades.find((e) => e.id === id)
  return { nombre: esp?.nombre ?? id, categoria: esp?.categoria ?? null }
}

/** Categorías de las especialidades del perfil (deduplicadas). */
export function categoriasDeEspecialidades(
  ids: string[] | undefined,
  catalogo: CatalogoEspecialidades | undefined,
): string[] {
  if (!ids?.length) return []
  const set = new Set<string>()
  for (const id of ids) {
    const { categoria } = resolverEspecialidad(id, catalogo)
    if (categoria) set.add(categoria)
  }
  return [...set]
}
