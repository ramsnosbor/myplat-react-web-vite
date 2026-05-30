// Resposta genérica de listagem de entidade
export interface EntityListResponse<T = EntityRecord> {
  data: T[]
  total?: number
  page?: number
  pageSize?: number
  totalPages?: number
}

// Registro genérico de entidade (chave-valor)
export type EntityRecord = Record<string, unknown>

// Resposta de criação/atualização
export interface EntityMutationResponse<T = EntityRecord> {
  data: T
  message?: string
}

// Resposta de execução de script
export interface ScriptResult {
  message?: string
  messageError?: string
  reload?: boolean
  entity?: string
  formUpdates?: Record<string, unknown>
  affectedEntities?: string[]
  callback?: string
  data?: Record<string, unknown>
}

// Parâmetros de paginação
export interface PaginationParams {
  pageNumber?: number
  pageSize?: number
}

// Parâmetros de listagem
export interface ListParams extends PaginationParams {
  orderBy?: string
  [key: string]: unknown
}
