import { useState, useCallback } from 'react'
import { createPortal } from 'react-dom'

// ─── ConfirmDialog ────────────────────────────────────────────────────────────

interface ConfirmDialogProps {
  message: string
  onConfirm: () => void
  onCancel: () => void
}

function ConfirmDialog({ message, onConfirm, onCancel }: ConfirmDialogProps) {
  return createPortal(
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onCancel() }}
    >
      <div
        className="w-full max-w-sm rounded-xl bg-background shadow-2xl border border-border overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-border bg-destructive/5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-destructive/10">
            <i className="bi bi-exclamation-triangle-fill text-destructive text-base" aria-hidden />
          </div>
          <h3 className="text-sm font-semibold text-foreground">Confirmar exclusão</h3>
        </div>

        {/* Body */}
        <div className="px-5 py-4">
          <p className="text-sm text-muted-foreground leading-relaxed">{message}</p>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-5 py-3 border-t border-border bg-muted/30">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-border px-4 py-1.5 text-sm text-muted-foreground hover:bg-accent transition-colors cursor-pointer"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-md bg-destructive px-4 py-1.5 text-sm font-medium text-destructive-foreground hover:bg-destructive/90 transition-colors cursor-pointer"
          >
            Excluir
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

// ─── useConfirm ───────────────────────────────────────────────────────────────
//
// Hook que fornece uma função `confirm(message)` e um `<dialog />` para renderizar.
//
// Uso:
//   const { confirm, confirmDialog } = useConfirm()
//   ...
//   const ok = await confirm('Deseja excluir?')
//   if (ok) { /* faz a ação */ }
//   ...
//   return <>{confirmDialog}{/* resto do JSX */}</>

interface PendingConfirm {
  message: string
  resolve: (value: boolean) => void
}

export function useConfirm() {
  const [pending, setPending] = useState<PendingConfirm | null>(null)

  const confirm = useCallback((message: string): Promise<boolean> => {
    return new Promise((resolve) => {
      setPending({ message, resolve })
    })
  }, [])

  const handleConfirm = useCallback(() => {
    pending?.resolve(true)
    setPending(null)
  }, [pending])

  const handleCancel = useCallback(() => {
    pending?.resolve(false)
    setPending(null)
  }, [pending])

  const confirmDialog = pending ? (
    <ConfirmDialog
      message={pending.message}
      onConfirm={handleConfirm}
      onCancel={handleCancel}
    />
  ) : null

  return { confirm, confirmDialog }
}
