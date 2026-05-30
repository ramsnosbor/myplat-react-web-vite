import { apiClient } from './client'
import type { EntityListResponse, EntityRecord, EntityMutationResponse, ListParams } from '@/types/entity.types'

// ─── CRUD genérico para qualquer entidade ─────────────────────────────────────

export const entityApi = {
  /**
   * Lista registros de uma entidade com suporte a filtros e paginação.
   */
  getList<T = EntityRecord>(
    entity: string,
    params: ListParams = {},
  ): Promise<EntityListResponse<T>> {
    return apiClient
      .get<EntityListResponse<T>>(`/entity/${entity}`, { params })
      .then((r) => r.data)
  },

  /**
   * Busca um único registro pelo ID.
   */
  getById<T = EntityRecord>(entity: string, id: string | number): Promise<T> {
    return apiClient
      .get<T>(`/entity/${entity}/${id}`)
      .then((r) => r.data)
  },

  /**
   * Cria um novo registro.
   */
  create<T = EntityRecord>(
    entity: string,
    data: Record<string, unknown>,
  ): Promise<EntityMutationResponse<T>> {
    return apiClient
      .post<EntityMutationResponse<T>>(`/entity/${entity}`, data)
      .then((r) => r.data)
  },

  /**
   * Atualiza um registro existente (PATCH parcial).
   */
  update<T = EntityRecord>(
    entity: string,
    id: string | number,
    data: Record<string, unknown>,
  ): Promise<EntityMutationResponse<T>> {
    return apiClient
      .patch<EntityMutationResponse<T>>(`/entity/${entity}/${id}`, data)
      .then((r) => r.data)
  },

  /**
   * Remove um registro.
   */
  remove(entity: string, id: string | number): Promise<void> {
    return apiClient.delete(`/entity/${entity}/${id}`).then(() => undefined)
  },
}
