import { apiClient } from './client'
import type { ScriptResult } from '@/types/entity.types'

// ─── Script API ───────────────────────────────────────────────────────────────

export const scriptApi = {
  /**
   * Executa um script server-side pelo seu ID.
   * Retorna ScriptResult com message, reload, formUpdates, etc.
   */
  execute(
    scriptId: string,
    inputs: Record<string, unknown> = {},
  ): Promise<ScriptResult> {
    return apiClient
      .post<ScriptResult>(`/script/${scriptId}`, { inputs })
      .then((r) => r.data)
  },
}
