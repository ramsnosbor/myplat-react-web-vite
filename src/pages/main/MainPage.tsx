import { useRef } from 'react'
import { useParams, useLocation } from 'react-router-dom'
import { createPortal } from 'react-dom'
import { ViewRenderer } from '@/components/renderer/ViewRenderer'
import { AppShell } from '@/components/layout/AppShell'
import { PopupNavigationProvider, usePopupNavigation, type PopupState } from '@/contexts/PopupNavigationContext'

export default function MainPage() {
  const { screen } = useParams<{ screen?: string }>()
  const location = useLocation()
  const screenName = screen ?? 'home'

  const state = location.state as {
    initialParams?: Record<string, unknown>
    searchParams?: Record<string, unknown>
    mode?: string
  } | null

  const stateInitialParams = state?.initialParams ?? {}
  const stateSearchParams = state?.searchParams ?? {}
  const urlParams = Object.fromEntries(new URLSearchParams(location.search).entries())
  const modeParam = state?.mode ? { _mode: state.mode } : {}
  const hideMenu = String(urlParams.hideMenu ?? '').toLowerCase() === 'true'

  const merged = { ...urlParams, ...stateSearchParams, ...stateInitialParams, ...modeParam }
  const initialParams = Object.keys(merged).length > 0 ? merged : undefined

  const viewKey = `${screenName}-${JSON.stringify(initialParams ?? {})}`

  if (hideMenu) {
    return (
      <PopupNavigationProvider>
        <main className="min-h-screen bg-background">
          <ViewRenderer key={viewKey} screenName={screenName} initialParams={initialParams} />
        </main>
        <PopupStack />
      </PopupNavigationProvider>
    )
  }

  return (
    <PopupNavigationProvider>
      <AppShell title={screenName !== 'home' ? screenName : 'Inicio'}>
        <ViewRenderer key={viewKey} screenName={screenName} initialParams={initialParams} />
      </AppShell>
      <PopupStack />
    </PopupNavigationProvider>
  )
}

// ─── PopupStack ───────────────────────────────────────────────────────────────
// Renderiza a pilha de popups; fica dentro do Provider mas fora do AppShell.

function PopupStack() {
  const ctx = usePopupNavigation()
  if (!ctx || ctx.stack.length === 0) return null

  return (
    <>
      {ctx.stack.map((popup, i) => (
        <PopupModal
          key={`${popup.screen}-${i}`}
          popup={popup}
          onClose={ctx.closeTop}
          isTop={i === ctx.stack.length - 1}
        />
      ))}
    </>
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
        'fixed inset-0 z-[9000] flex items-stretch justify-center bg-black/60 backdrop-blur-sm',
        isTop ? 'opacity-100' : 'opacity-60 pointer-events-none',
      ].join(' ')}
      onClick={handleBackdropClick}
    >
      <div
        className="relative flex flex-col bg-background shadow-2xl w-full max-w-[95vw] max-h-screen overflow-hidden rounded-none md:my-4 md:rounded-xl md:max-h-[calc(100vh-2rem)]"
        onClick={(e) => e.stopPropagation()}
      >
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
