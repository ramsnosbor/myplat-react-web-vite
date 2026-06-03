import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { entityApi } from '@/api/entity.api'
import type { EntityRecord, ListParams } from '@/types/entity.types'

interface UseEntityQueryOptions {
  entity: string
  params?: ListParams
  enabled?: boolean
}

/**
 * Busca dados de uma entidade via TanStack Query.
 * queryKey inclui entity + params — muda automaticamente quando
 * o pai atualiza os params (connection), disparando novo fetch.
 */
export function useEntityQuery<T = EntityRecord>({
  entity,
  params = {},
  enabled = true,
}: UseEntityQueryOptions) {
  return useQuery({
    queryKey: ['entity', entity, params],
    queryFn: () => entityApi.getList<T>(entity, params),
    enabled: enabled && !!entity,
    placeholderData: keepPreviousData, // mantém dados anteriores enquanto carrega nova página
    staleTime: 30_000,
  })
}
