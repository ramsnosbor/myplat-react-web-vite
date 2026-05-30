import { apiClient } from './client'
import type { ViewDefinition } from '@/types/view.types'

// ─── Views API ────────────────────────────────────────────────────────────────

export const viewsApi = {
  /**
   * Carrega o JSON de definição de uma tela pelo nome.
   * O resultado é cacheado pelo TanStack Query.
   */
  getView(screenName: string): Promise<ViewDefinition> {
    return apiClient
      .get<ViewDefinition>(`/view/${screenName}`)
      .then((r) => r.data)
  },
}
