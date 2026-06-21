import { createContext, useContext } from 'react'
import type { ViewStore } from '@/store/viewStore'
import type { ViewDefinition, Connection } from '@/types/view.types'

// ─── Tipo do contexto ─────────────────────────────────────────────────────────

export interface ViewContextValue {
  viewStore: ViewStore
  connections: Connection[]
  definition: ViewDefinition & { newFormShowPopup?: boolean }
  /** Params vindos do URL do menu — injetados como queryParams iniciais nos filters */
  initialParams?: Record<string, unknown>
  /**
   * Parâmetros SSO buscados via parameters[] do JSON da view.
   * Chave: name do parâmetro (ex: "UTILIZA_PLANO_GERENCIAL"). Valor: vlParameter.
   * Disponíveis em formValues e nos payloads de script (campo screenParams).
   */
  screenParams: Record<string, string>
}

// ─── Contexto e hook ──────────────────────────────────────────────────────────

export const ViewContext = createContext<ViewContextValue | null>(null)

export function useViewContext(): ViewContextValue {
  const ctx = useContext(ViewContext)
  if (!ctx) throw new Error('useViewContext deve ser usado dentro de ViewRenderer')
  return ctx
}
