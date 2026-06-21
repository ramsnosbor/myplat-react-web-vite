import { useQuery } from '@tanstack/react-query'
import { useMonitorStore, type MonitorItem } from '@/store/monitorStore'
import { entityApi } from '@/api/entity.api'

function MonitorCard({ item }: { item: MonitorItem }) {
  const remove = useMonitorStore((s) => s.remove)

  const { data } = useQuery({
    queryKey: ['monitor', item.entity, item.idField, item.id],
    queryFn: async () => {
      const res = await entityApi.getList(item.entity, {
        [item.idField]: item.id,
        pageSize: 1,
      })
      const rows = Array.isArray(res) ? res : (res as { data?: unknown[] }).data ?? []
      return (rows[0] ?? null) as Record<string, unknown> | null
    },
    refetchInterval: (query) => {
      const record = query.state.data as Record<string, unknown> | null | undefined
      if (!record) return 3000
      const status = Number(record[item.statusField])
      const terminal = item.successStatus.includes(status) || item.errorStatus.includes(status)
      return terminal ? false : 3000
    },
    staleTime: 0,
  })

  const record = data as Record<string, unknown> | null | undefined
  const status = record != null ? Number(record[item.statusField]) : null
  const isSuccess = status !== null && item.successStatus.includes(status)
  const isError   = status !== null && item.errorStatus.includes(status)
  const isPending = status === null || (!isSuccess && !isError)

  return (
    <div
      className={[
        'flex items-center gap-3 rounded-lg border px-4 py-3 shadow-lg text-sm font-medium',
        'bg-white min-w-[260px] max-w-[360px]',
        isSuccess ? 'border-green-200'  : '',
        isError   ? 'border-red-200'    : '',
        isPending ? 'border-blue-200'   : '',
      ].join(' ')}
    >
      {/* ícone de estado */}
      <span className="shrink-0 text-base">
        {isPending && (
          <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
        )}
        {isSuccess && <i className="bi bi-check-circle-fill text-green-600" />}
        {isError   && <i className="bi bi-exclamation-circle-fill text-red-500" />}
      </span>

      {/* label + status */}
      <div className="flex-1 min-w-0">
        <p className="truncate text-slate-800">{item.label}</p>
        <p className={[
          'text-xs mt-0.5',
          isSuccess ? 'text-green-600' : '',
          isError   ? 'text-red-500'   : '',
          isPending ? 'text-blue-500'  : '',
        ].join(' ')}>
          {isPending && 'Transmitindo...'}
          {isSuccess && 'Concluído com sucesso'}
          {isError   && 'Requer atenção'}
        </p>
      </div>

      {/* fechar */}
      <button
        type="button"
        onClick={() => remove(item.key)}
        className="shrink-0 rounded p-0.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100"
        title="Fechar"
      >
        <i className="bi bi-x text-base" />
      </button>
    </div>
  )
}

export function ActionMonitor() {
  const items = useMonitorStore((s) => s.items)
  if (items.length === 0) return null

  return (
    <div className="fixed bottom-5 right-5 z-[9000] flex flex-col gap-2 pointer-events-none">
      {items.map((item) => (
        <div key={item.key} className="pointer-events-auto">
          <MonitorCard item={item} />
        </div>
      ))}
    </div>
  )
}
