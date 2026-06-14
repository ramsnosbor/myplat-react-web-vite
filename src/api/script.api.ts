import { apiClient } from './client'
import type { ScriptResult } from '@/types/entity.types'

// ─── Formato retornado pelo backend (ScriptResponseDTO) ───────────────────────
// O backend envolve o resultado do script neste wrapper:
//   { response: "<JSON string>", error: boolean, messageError: string | null }
// O conteúdo real do script (message, reload, formUpdates, etc.) está em `response`.
interface ScriptResponseDTO {
  response?: string
  error?: boolean
  messageError?: string
}

// ─── Script API ───────────────────────────────────────────────────────────────

export const scriptApi = {
  /**
   * Executa um script server-side pelo seu ID.
   * O backend retorna ScriptResponseDTO onde `response` é o JSON do script como string.
   * Aqui desembrulhamos: se `error=true` → propaga messageError; caso contrário
   * parseia `response` e retorna como ScriptResult.
   */
  execute(
    scriptId: string,
    data: Record<string, unknown> = {},
  ): Promise<ScriptResult> {
    return apiClient
      .post<ScriptResponseDTO>(`/default/script/${scriptId}`, data)
      .then((r) => {
        const dto = r.data

        // Erro sinalizado pelo backend
        if (dto.error) {
          return { messageError: dto.messageError ?? 'Erro ao executar o script.' } as ScriptResult
        }

        // Parseia o JSON interno retornado pelo script
        let inner: ScriptResult = {}
        try {
          inner = dto.response ? JSON.parse(dto.response) : {}
        } catch {
          // response não é JSON (ex: string simples) — trata como mensagem de sucesso
          inner = dto.response ? { message: dto.response } : {}
        }

        // messageError no nível externo tem prioridade
        if (dto.messageError) inner.messageError = dto.messageError

        return inner
      })
  },
}
