import { apiClient } from './client'
import type { ScriptResult } from '@/types/entity.types'

// ─── Script API ───────────────────────────────────────────────────────────────

export const scriptApi = {
  /**
   * Executa um script server-side pelo seu ID.
   * Retorna ScriptResult com message, reload, formUpdates, etc.
   */
  /**
   * Executa um script passando o payload diretamente no body (sem wrapper).
   * O backend espera os campos no root: inputs, formData, entity, action, etc.
   */
  execute(
    scriptId: string,
    data: Record<string, unknown> = {},
  ): Promise<ScriptResult> {
    return apiClient
      .post<ScriptResult>(`/default/script/${scriptId}`, data)
      .then((r) => r.data)
  },
}
