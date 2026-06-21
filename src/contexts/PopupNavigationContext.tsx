import { createContext, useContext, useState, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import { ViewRenderer } from '@/components/renderer/ViewRenderer'

// ─── Types ────────────────────────────────────────────────────────────────────

interface PopupState {
  screen: string
  initialParams?: Record<string, unknown>
}

interface PopupNavigationContextValue {
  openPopup(screen: string, initialParams?: Record<string, unknown>): void
}

// ─── Context ──────────────────────────────────────────────────────────────────

const PopupNavigationContext = createContext<PopupNavigationContextValue | null>(null)

export function usePopupNavigation(): PopupNavigationContextValue | null {
  return useContext(PopupNavigationContext)
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function PopupNavigationProvider({ children }: { children: React.ReactNode }) {
  const [stack, setStack] = useState<PopupState[]>([])

  const openPopup = useCallback((screen: string, initialParams?: Record<string, unknown>) => {
    setStack((prev) => [...prev, { screen, initialParams }])
  }, [])

  const closeTop = useCallback(() => {
    setStack((prev) => prev.slice(0, -1))
  }, [])

  return (
    <PopupNavigationContext.Provider value={{ openPopup }}>
      {children}
      {stack.map((popup, i) => (
        <PopupModal
          key={`${popup.screen}-${i}`}
          popup={popup}
          onClose={closeTop}
          isTop={i === stack.length - 1}
        />
      ))}
    </PopupNavigationContext.Provider>
  )
}

// ─── PopupModal ───────────────────────────────────────────────────────────────

function PopupModal({
  popup,
  onClose,
  isTop,
}: {
  popup: PopupState
  onClose: () => void
  isTop: boolean
}) {
  const backdropRef = useRef<HTMLDivElement>(null)

  function handleBackdropClick(e: React.MouseEvent) {
    if (e.target === backdropRef.current) onClose()
  }

  return createPortal(
    <div
      ref={backdropRef}
      className={[
        'fixed inset-0 z-[9000] flex items-stretch justify-center bg-black/60 backdrop-blur-sm transition-opacity',
        isTop ? 'opacity-100' : 'opacity-60 pointer-events-none',
      ].join(' ')}
      onClick={handleBackdropClick}
    >
      <div
        className="relative flex flex-col bg-background shadow-2xl w-full max-w-[95vw] max-h-screen overflow-hidden rounded-none md:my-4 md:rounded-xl md:max-h-[calc(100vh-2rem)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-border bg-muted/50 px-4 py-3">
          <span className="text-sm font-semibold text-foreground">{popup.screen}</span>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Fechar"
          >
            <i className="bi bi-x-lg text-sm" aria-hidden />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto">
          <ViewRenderer
            key={`popup-${popup.screen}-${JSON.stringify(popup.initialParams ?? {})}`}
            screenName={popup.screen}
            initialParams={popup.initialParams}
          />
        </div>
      </div>
    </div>,
    document.body,
  )
}
