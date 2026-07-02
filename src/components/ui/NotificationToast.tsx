import { useEffect } from 'react'
import { useNotificationToastStore, type NotificationToastItem } from '@/store/notificationToastStore'

const AUTO_DISMISS_MS = 8000

function NotificationToastCard({ item }: { item: NotificationToastItem }) {
  const remove = useNotificationToastStore((s) => s.remove)

  useEffect(() => {
    const timer = setTimeout(() => remove(item.key), AUTO_DISMISS_MS)
    return () => clearTimeout(timer)
  }, [item.key, remove])

  return (
    <div
      className={[
        'flex items-start gap-3 rounded-lg border border-blue-100 bg-white px-4 py-3 shadow-lg',
        'min-w-[280px] max-w-[380px] animate-in slide-in-from-right-full fade-in duration-200',
      ].join(' ')}
    >
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-700 ring-1 ring-blue-100">
        <i className="bi bi-bell-fill text-sm" aria-hidden />
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-slate-900">{item.title}</p>
        <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">{item.message}</p>
      </div>

      <button
        type="button"
        onClick={() => remove(item.key)}
        className="shrink-0 rounded p-0.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
        title="Fechar"
      >
        <i className="bi bi-x text-base" aria-hidden />
      </button>
    </div>
  )
}

export function NotificationToast() {
  const items = useNotificationToastStore((s) => s.items)
  if (items.length === 0) return null

  return (
    <div className="fixed right-5 top-5 z-[9500] flex flex-col gap-2 pointer-events-none">
      {items.map((item) => (
        <div key={item.key} className="pointer-events-auto">
          <NotificationToastCard item={item} />
        </div>
      ))}
    </div>
  )
}
