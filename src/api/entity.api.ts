import { apiClient } from './client'
import type { EntityListResponse, EntityRecord, EntityMutationResponse, ListParams } from '@/types/entity.types'

/** Schema de uma entidade retornado por GET /entities/{entity} */
export interface EntitySchemaResponse {
  entity: string
  config: {
    primary: string          // campo PK da entidade
    entityName?: string
    table?: string
    isView?: boolean
    columns?: Array<{
      name: string
      type: string
      autoIncrement?: boolean
      required?: boolean
    }>
    [key: string]: unknown
  }
}

export const entityApi = {
  /** Lista registros: GET /default/{entity}?pageNumber=1&pageSize=10&... */
  getList<T = EntityRecord>(
    entity: string,
    params: ListParams = {},
  ): Promise<EntityListResponse<T>> {
    return apiClient
      .get<EntityListResponse<T>>(`/default/${entity}`, { params })
      .then((r) => r.data)
  },

  /** Busca um registro: GET /default/{entity}/{id} */
  getById<T = EntityRecord>(entity: string, id: string | number): Promise<T> {
    return apiClient
      .get<T | { data: T }>(`/default/${entity}/${id}`)
      .then((r) => {
        const payload = r.data as Record<string, unknown>
        // Normaliza resposta aninhada { data: {...} } → retorna o objeto interno
        if (
          payload &&
          typeof payload === 'object' &&
          !Array.isArray(payload) &&
          'data' in payload &&
          typeof payload.data === 'object' &&
          payload.data !== null &&
          !Array.isArray(payload.data)
        ) {
          return payload.data as T
        }
        return payload as T
      })
  },

  /** Cria: POST /default/{entity} */
  create<T = EntityRecord>(
    entity: string,
    data: Record<string, unknown>,
  ): Promise<EntityMutationResponse<T>> {
    return apiClient
      .post<EntityMutationResponse<T>>(`/default/${entity}`, data)
      .then((r) => r.data)
  },

  /** Atualiza: PATCH /default/{entity}  — a chave primária vai no body, não na URL */
  update<T = EntityRecord>(
    entity: string,
    data: Record<string, unknown>,
  ): Promise<EntityMutationResponse<T>> {
    return apiClient
      .patch<EntityMutationResponse<T>>(`/default/${entity}`, data)
      .then((r) => r.data)
  },

  /** Remove: DELETE /default/{entity}/{id} */
  remove(entity: string, id: string | number): Promise<void> {
    return apiClient
      .delete(`/default/${entity}/${id}`)
      .then(() => undefined)
  },

  /**
   * Schema da entidade: GET /entities/{entity}
   * Retorna config.primary com o nome do campo PK.
   */
  getSchema(entity: string): Promise<EntitySchemaResponse> {
    return apiClient
      .get<EntitySchemaResponse>(`/entities/${entity}`)
      .then((r) => r.data)
  },

  /**
   * Download: GET /default/{entity}/download/{type}?...params...
   * type = "PDF" | "CSV"
   * Dispara download direto no navegador.
   */
  download(entity: string, type: string, params: Record<string, unknown> = {}): Promise<void> {
    return apiClient
      .get(`/default/${entity}/download/${type}`, {
        params,
        responseType: 'blob',
      })
      .then((r) => {
        const url = URL.createObjectURL(new Blob([r.data as BlobPart]))
        const a = document.createElement('a')
        a.href = url
        a.download = `${entity}.${type.toLowerCase()}`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
      })
  },
}
