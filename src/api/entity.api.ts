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

/** Formato de resposta do servidor para POST/PATCH */
interface ServerMutationPayload<T> {
  /** Registros afetados — o criado/atualizado está em data[0] */
  data: T[]
  /** Schema da entidade incluído no retorno (contém config.primary) */
  entities?: Array<{ entity: string; config: { primary: string; [k: string]: unknown } }>
  message?: string
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
      .post<ServerMutationPayload<T> | EntityMutationResponse<T>>(`/default/${entity}`, data)
      .then((r) => normalizeMutationResponse<T>(r.data))
  },

  /** Atualiza: PATCH /default/{entity}  — a chave primária vai no body, não na URL */
  update<T = EntityRecord>(
    entity: string,
    data: Record<string, unknown>,
  ): Promise<EntityMutationResponse<T>> {
    return apiClient
      .patch<ServerMutationPayload<T> | EntityMutationResponse<T>>(`/default/${entity}`, data)
      .then((r) => normalizeMutationResponse<T>(r.data))
  },

  /** Remove: DELETE /default/{entity}/{id} */
  remove(entity: string, id: string | number): Promise<void> {
    return apiClient
      .delete(`/default/${entity}/${id}`)
      .then(() => undefined)
  },

  /**
   * Schema da entidade: GET /entities/{entity}
   *
   * O servidor pode retornar dois formatos:
   *   Formato A (legado): { entities: [{ entity, config }], data: [...] }
   *   Formato B (atual):  { entity, config }  — objeto direto, sem wrapper
   *
   * Normaliza ambos e retorna sempre { entity, config }.
   */
  getSchema(entity: string): Promise<EntitySchemaResponse> {
    return apiClient
      .get<{ entities?: EntitySchemaResponse[]; entity?: string; config?: unknown; data?: unknown[] }>(`/entities/${entity}`)
      .then((r) => {
        // Formato A: { entities: [{ entity, config }] }
        const fromEntities = r.data.entities?.[0]
        if (fromEntities) return fromEntities

        // Formato B: { entity, config } — schema direto na raiz
        if (r.data.entity && r.data.config) {
          return r.data as unknown as EntitySchemaResponse
        }

        throw new Error(`Schema não encontrado para a entidade "${entity}".`)
      })
  },

  /**
   * Operações em lote numa única transação: POST /default/many
   *
   * payload: { [entity]: { [tempId]: { [field]: string } } }
   * Usa "_action": "update" para updates; sem _action = insert.
   * Use "#ref.entity.tempId" para referenciar a PK de um registro criado anteriormente.
   *
   * Retorna a mesma estrutura com os registros persistidos (incluindo PKs geradas).
   */
  many(
    payload: Record<string, Record<string, Record<string, string | null | undefined>>>,
  ): Promise<Record<string, Record<string, Record<string, unknown>>>> {
    // Remove campos null/undefined — o Java espera Map<String,String>
    const cleaned: Record<string, Record<string, Record<string, string>>> = {}
    for (const [entity, tempIds] of Object.entries(payload)) {
      cleaned[entity] = {}
      for (const [tempId, fields] of Object.entries(tempIds)) {
        cleaned[entity][tempId] = {}
        for (const [field, value] of Object.entries(fields)) {
          if (value !== null && value !== undefined && value !== '') {
            cleaned[entity][tempId][field] = String(value)
          }
        }
      }
    }
    return apiClient
      .post<Record<string, Record<string, Record<string, unknown>>>>('/default/many', cleaned)
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

// ─── Normalização de resposta POST/PATCH ──────────────────────────────────────
// O servidor pode retornar dois formatos:
//   Novo:    { entities: [{config:{primary}}], data: [T] }   → data[0] é o registro
//   Legado:  { data: T, message?: string }                   → data é o registro direto
function normalizeMutationResponse<T>(
  payload: ServerMutationPayload<T> | EntityMutationResponse<T>,
): EntityMutationResponse<T> {
  const p = payload as unknown as Record<string, unknown>

  if (Array.isArray(p.data)) {
    // Formato novo: extrai data[0] e primary do schema
    const entities = p.entities as ServerMutationPayload<T>['entities']
    const primary = entities?.[0]?.config?.primary
    const record = (p.data as T[])[0]
    return { data: record, primary, message: p.message as string | undefined }
  }

  // Formato legado: devolve como está
  return payload as EntityMutationResponse<T>
}
