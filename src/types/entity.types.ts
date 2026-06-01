// Resposta genérica de listagem de entidade
export interface EntityListResponse<T = EntityRecord> {
  data: T[]
  // Paginação — campos reais da API
  totalElements?: number  // total de registros
  totalPages?: number     // total de páginas
  pageNumber?: number     // página atual (1-based)
  pageSize?: number       // tamanho da página
  first?: boolean         // é a primeira página?
  last?: boolean          // é a última página?
  // Aliases legacy (outros backends)
  total?: number
  totalRecords?: number
  count?: number
  page?: number
}

// Registro genérico de entidade (chave-valor)
export type EntityRecord = Record<string, unknown>

// Resposta de criação/atualização
export interface EntityMutationResponse<T = EntityRecord> {
  data: T
  message?: string
  /** PK da entidade extraída do schema retornado pelo servidor (entities[0].config.primary) */
  primary?: string
}

// Resposta de execução de script
export interface ScriptResult {
  message?: string
  messageError?: string
  reload?: boolean
  entity?: string
  /** Atualiza campos do form: { fieldName: value } */
  formUpdates?: Record<string, unknown>
  /** Atualiza campos específicos (formato autocomplete): [{ field, value, label? }] */
  fieldUpdates?: Array<{ field: string; value: unknown; label?: string }>
  /** Invalida queries dessas entidades após execução */
  affectedEntities?: string[]
  /** JS callback a ser executado no client (legacy) */
  callback?: string
  data?: Record<string, unknown>
  /** Redireciona após execução: url absoluta ou action:'back' */
  redirect?: { url?: string; action?: string; delay?: number }
  /** Abre um objeto (modal/inline) após execução */
  openModal?: { objectId: string; action?: string; searchParams?: Record<string, unknown> }
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
