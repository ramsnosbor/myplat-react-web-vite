import { createContext, useContext, useState, useCallback, useId, useEffect } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PopupState {
  screen: string
  initialParams?: Record<string, unknown>
}

interface PopupNavigationContextValue {
  stack: PopupState[]
  openPopup(screen: string, initialParams?: Record<string, unknown>): void
  closeTop(): void
  isPopupModeActive: boolean
  registerPopupMode(id: string): void
  unregisterPopupMode(id: string): void
}

// ─── Context ──────────────────────────────────────────────────────────────────

const PopupNavigationContext = createContext<PopupNavigationContextValue | null>(null)

export function usePopupNavigation(): PopupNavigationContextValue | null {
  return useContext(PopupNavigationContext)
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function PopupNavigationProvider({ children }: { children: React.ReactNode }) {
  const [stack, setStack] = useState<PopupState[]>([])
  const [activeIds, setActiveIds] = useState<Set<string>>(new Set())

  const openPopup = useCallback((screen: string, initialParams?: Record<string, unknown>) => {
    setStack((prev) => [...prev, { screen, initialParams }])
  }, [])

  const closeTop = useCallback(() => {
    setStack((prev) => prev.slice(0, -1))
  }, [])

  const registerPopupMode = useCallback((id: string) => {
    setActiveIds((prev) => new Set(prev).add(id))
  }, [])

  const unregisterPopupMode = useCallback((id: string) => {
    setActiveIds((prev) => {
      const next = new Set(prev)
      next.delete(id)
      return next
    })
  }, [])

  return (
    <PopupNavigationContext.Provider
      value={{
        stack,
        openPopup,
        closeTop,
        isPopupModeActive: activeIds.size > 0,
        registerPopupMode,
        unregisterPopupMode,
      }}
    >
      {children}
    </PopupNavigationContext.Provider>
  )
}

// ─── useRegisterPopupMode ─────────────────────────────────────────────────────
// Chamado por ViewRenderer — registra quando a view tem newFormShowPopup:true

export function useRegisterPopupMode(active: boolean) {
  const ctx = usePopupNavigation()
  const id = useId()

  useEffect(() => {
    if (!ctx || !active) return
    ctx.registerPopupMode(id)
    return () => ctx.unregisterPopupMode(id)
  }, [ctx, active, id])
}
