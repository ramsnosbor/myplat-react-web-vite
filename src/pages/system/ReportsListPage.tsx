import { useCallback, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AppShell } from '@/components/layout/AppShell'
import { useToast } from '@/components/ui/Toast'
import { reportsApi, type ReportDefinition, type ReportFilterDefinition, type ReportGroup } from '@/api/reports.api'

// ─── Tipos internos ───────────────────────────────────────────────────────────

const DOC_TYPES = [
  { value: 'pdf',      label: 'PDF' },
  { value: 'csv',      label: 'CSV' },
  { value: 'txt',      label: 'TXT' },
  { value: 'txtToPDF', label: 'TXT → PDF' },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MIME: Record<string, string> = {
  pdf: 'application/pdf',
  csv: 'text/csv',
  txt: 'text/plain',
  txttopdf: 'application/pdf',
}

function toObjectUrl(data: unknown, docType: string): string {
  const mime = MIME[docType.toLowerCase()] ?? 'application/octet-stream'
  const blob =
    data instanceof Blob
      ? data.type
        ? data
        : new Blob([data], { type: mime })
      : new Blob([data as BlobPart], { type: mime })
  return URL.createObjectURL(blob)
}

function groupLabel(g: ReportGroup, idx: number) {
  return (typeof g.group === 'string' ? g.group : null) ?? g.title ?? g.name ?? g.label ?? `Grupo ${idx + 1}`
}

function reportList(g: ReportGroup): ReportDefinition[] {
  return g.reports ?? g.items ?? []
}

function matchSearch(r: ReportDefinition, term: string) {
  const t = term.toLowerCase()
  return (
    (r.title ?? '').toLowerCase().includes(t) ||
    (r.name ?? '').toLowerCase().includes(t) ||
    (r.description ?? '').toLowerCase().includes(t)
  )
}

function activeFilters(defs: ReportFilterDefinition[]) {
  return [...defs]
    .filter((f) => f.active !== false)
    .sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0))
}

// ─── PDF Viewer inline ────────────────────────────────────────────────────────

interface ViewerState {
  url: string
  fileName: string
  docType: string
}

function PdfViewerModal({ viewer, onClose }: { viewer: ViewerState | null; onClose: () => void }) {
  if (!viewer) return null

  const isPdf = viewer.docType === 'pdf'

  function handleDownload() {
    const a = document.createElement('a')
    a.href = viewer.url
    a.download = viewer.fileName
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-2">
      <div className="flex h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-lg border border-blue-100 bg-white shadow-2xl">
        <header className="flex shrink-0 items-center justify-between border-b border-blue-100 px-4 py-3">
          <span className="truncate text-sm font-semibold text-slate-800">{viewer.fileName}</span>
          <div className="flex gap-2">
            <button type="button" onClick={handleDownload} className={btnPrimary}>
              <i className="bi bi-download" aria-hidden /> Baixar
            </button>
            <button type="button" onClick={onClose} className={btnSecondary}>
              <i className="bi bi-x-lg" aria-hidden /> Fechar
            </button>
          </div>
        </header>
        <div className="flex-1 overflow-hidden">
          {isPdf ? (
            <iframe src={viewer.url} title="Visualizador" className="h-full w-full border-0" />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-sm text-slate-500">
              <i className="bi bi-file-earmark-arrow-down text-3xl text-blue-700" aria-hidden />
              <p className="font-medium text-slate-700">Arquivo pronto para download</p>
              <p>Pré-visualização não disponível para este formato.</p>
              <button type="button" onClick={handleDownload} className={btnPrimary}>
                <i className="bi bi-download" aria-hidden /> Baixar arquivo
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Modal de execução ────────────────────────────────────────────────────────

function RunModal({
  report,
  onClose,
  onGenerated,
}: {
  report: ReportDefinition
  onClose: () => void
  onGenerated: (v: ViewerState) => void
}) {
  const toast = useToast()
  const [docType, setDocType] = useState('pdf')
  const [filterValues, setFilterValues] = useState<Record<string, string>>({})
  const [generating, setGenerating] = useState(false)
  const [genError, setGenError] = useState<string | null>(null)

  const defsQuery = useQuery({
    queryKey: ['report-def', report.name],
    queryFn: () => reportsApi.getReport(report.name),
    staleTime: 60_000,
  })

  const filters = useMemo(() => {
    const raw = defsQuery.data?.filterDefinitions ?? defsQuery.data?.filters ?? []
    return activeFilters(raw)
  }, [defsQuery.data])

  async function handleGenerate() {
    setGenerating(true)
    setGenError(null)

    // Monta payload: filtros range combinam __from e __to em "inicio,fim"
    const rangeFields = new Set(
      filters.filter((f) => f.type === 'DATE_RANGE' || f.type === 'NUMBER_RANGE').map((f) => f.field),
    )
    const filtersPayload: Record<string, string> = {}
    for (const [key, val] of Object.entries(filterValues)) {
      if (val === null || val === undefined || val === '') continue
      if (key.endsWith('__from') || key.endsWith('__to')) continue // tratados abaixo
      filtersPayload[key] = val
    }
    for (const field of rangeFields) {
      const from = filterValues[`${field}__from`] ?? ''
      const to   = filterValues[`${field}__to`]   ?? ''
      if (from || to) filtersPayload[field] = `${from},${to}`
    }

    try {
      const result = await reportsApi.generateReport({
        reportName: report.name,
        docType: docType.toUpperCase(),
        filters: filtersPayload,
      })

      if (typeof result === 'string') {
        const dl = await reportsApi.getGeneratedDownload(result)
        const url = toObjectUrl(dl.blob, docType)
        onGenerated({ url, fileName: dl.fileName ?? result, docType })
      } else {
        const url = toObjectUrl(result.blob, docType)
        onGenerated({ url, fileName: result.fileName ?? `${report.name}.${docType}`, docType })
      }
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        (err as Error)?.message ??
        'Erro ao gerar relatório.'
      setGenError(msg)
      toast.error(msg)
    } finally {
      setGenerating(false)
    }
  }

  function setFilter(field: string, value: string) {
    setFilterValues((prev) => ({ ...prev, [field]: value }))
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md overflow-hidden rounded-lg border border-blue-100 bg-white shadow-2xl">
        <header className="flex items-center justify-between border-b border-blue-100 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-800">{report.title ?? report.name}</h2>
          <button type="button" onClick={onClose} disabled={generating} className="text-slate-400 hover:text-slate-600">
            <i className="bi bi-x-lg" aria-hidden />
          </button>
        </header>

        <div className="max-h-[60vh] overflow-y-auto px-4 py-3">
          {report.description && (
            <p className="mb-3 text-xs text-slate-500">{report.description}</p>
          )}

          {defsQuery.isLoading && (
            <div className="flex items-center gap-2 py-4 text-sm text-slate-500">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-blue-700 border-t-transparent" />
              Carregando filtros…
            </div>
          )}

          {!defsQuery.isLoading && filters.length > 0 && (
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Filtros</p>
              {filters.map((f) => {
                const isDateRange   = f.type === 'DATE_RANGE'
                const isNumberRange = f.type === 'NUMBER_RANGE'
                const isRange = isDateRange || isNumberRange
                const inputType = isDateRange ? 'date' : isNumberRange ? 'number'
                  : f.type === 'DATE' ? 'date' : f.type === 'NUMBER' ? 'number' : 'text'

                const selectValues = Array.isArray(f.options) && f.options.length > 0
                  ? f.options
                  : f.predefinedValues
                const isSelect = Array.isArray(selectValues) && selectValues.length > 0

                return (
                  <div key={f.field}>
                    <label className="mb-1 block text-xs font-medium text-slate-700">{f.label}</label>

                    {isSelect ? (
                      <select
                        className={inputClass}
                        value={filterValues[f.field] ?? ''}
                        onChange={(e) => setFilter(f.field, e.target.value)}
                      >
                        {!selectValues.includes('') && <option value="">— Todos —</option>}
                        {selectValues.map((v) => (
                          <option key={v} value={v}>{v === '' ? '— Todos —' : v}</option>
                        ))}
                      </select>
                    ) : isRange ? (
                      <div className="flex items-center gap-2">
                        <input
                          className={inputClass}
                          type={inputType}
                          placeholder="Início"
                          value={filterValues[`${f.field}__from`] ?? ''}
                          onChange={(e) => setFilter(`${f.field}__from`, e.target.value)}
                        />
                        <span className="shrink-0 text-xs text-slate-400">até</span>
                        <input
                          className={inputClass}
                          type={inputType}
                          placeholder="Fim"
                          value={filterValues[`${f.field}__to`] ?? ''}
                          onChange={(e) => setFilter(`${f.field}__to`, e.target.value)}
                        />
                      </div>
                    ) : (
                      <input
                        className={inputClass}
                        type={inputType}
                        value={filterValues[f.field] ?? ''}
                        placeholder={f.label}
                        onChange={(e) => setFilter(f.field, e.target.value)}
                      />
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {!defsQuery.isLoading && filters.length === 0 && (
            <p className="py-2 text-xs text-slate-400">Nenhum filtro disponível para este relatório.</p>
          )}

          <div className="mt-4">
            <label className="mb-1 block text-xs font-semibold text-slate-700">Tipo de arquivo</label>
            <select
              className={inputClass}
              value={docType}
              onChange={(e) => setDocType(e.target.value)}
            >
              {DOC_TYPES.map((dt) => (
                <option key={dt.value} value={dt.value}>{dt.label}</option>
              ))}
            </select>
          </div>

          {genError && (
            <div className="mt-3 rounded-md border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-700">
              {genError}
            </div>
          )}
        </div>

        <footer className="flex justify-end gap-2 border-t border-blue-100 px-4 py-3">
          <button type="button" onClick={onClose} disabled={generating} className={btnSecondary}>
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleGenerate}
            disabled={generating || defsQuery.isLoading}
            className={btnPrimary}
          >
            {generating ? (
              <>
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                Gerando…
              </>
            ) : (
              'Gerar'
            )}
          </button>
        </footer>
      </div>
    </div>
  )
}

// ─── Página principal ──────────────────────────────────────────────────────────

export default function ReportsListPage() {
  const [search, setSearch] = useState('')
  const [openGroups, setOpenGroups] = useState<Set<number>>(new Set())
  const [runReport, setRunReport] = useState<ReportDefinition | null>(null)
  const [viewer, setViewer] = useState<ViewerState | null>(null)

  const groupsQuery = useQuery({
    queryKey: ['report-groups'],
    queryFn: () => reportsApi.getGroupList(),
    staleTime: 60_000,
  })

  const groups = useMemo(() => {
    const raw = groupsQuery.data ?? []
    if (!search.trim()) return raw
    const term = search.trim()
    return raw
      .map((g) => {
        const matched = reportList(g).filter((r) => matchSearch(r, term))
        return matched.length > 0 ? { ...g, _filtered: matched } : null
      })
      .filter((g): g is ReportGroup & { _filtered: ReportDefinition[] } => g !== null)
  }, [groupsQuery.data, search])

  // Expande todos os grupos que tiverem match ao buscar
  const effectiveOpenGroups = useMemo(() => {
    if (search.trim()) return new Set(groups.map((_, i) => i))
    return openGroups
  }, [search, groups, openGroups])

  function toggleGroup(idx: number) {
    if (search.trim()) return
    setOpenGroups((prev) => {
      const next = new Set(prev)
      next.has(idx) ? next.delete(idx) : next.add(idx)
      return next
    })
  }

  const handleGenerated = useCallback((v: ViewerState) => {
    setRunReport(null)
    setViewer(v)
  }, [])

  function closeViewer() {
    if (viewer) URL.revokeObjectURL(viewer.url)
    setViewer(null)
  }

  return (
    <AppShell title="Relatórios" subtitle="Selecione um grupo e execute o relatório desejado.">
      <div className="flex min-h-full flex-col bg-background p-2 sm:p-3">

        {/* Barra de busca */}
        <section className="mb-3 flex shrink-0 items-center gap-3 rounded-lg border border-blue-100 bg-white px-3 py-2 shadow-sm shadow-blue-950/5">
          <i className="bi bi-search text-slate-400" aria-hidden />
          <input
            type="search"
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400"
            placeholder="Pesquisar relatório…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </section>

        {/* Estados */}
        {groupsQuery.isLoading && (
          <div className="flex flex-1 items-center justify-center py-16 text-sm text-slate-500">
            <span className="h-6 w-6 animate-spin rounded-full border-4 border-blue-700 border-t-transparent" />
          </div>
        )}

        {groupsQuery.isError && (
          <div className="rounded-md border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
            Erro ao carregar grupos de relatórios.
          </div>
        )}

        {!groupsQuery.isLoading && !groupsQuery.isError && groups.length === 0 && (
          <div className="flex flex-1 items-center justify-center py-16 text-sm text-slate-400">
            {search.trim() ? `Nenhum relatório encontrado para "${search}".` : 'Nenhum grupo de relatórios encontrado.'}
          </div>
        )}

        {/* Grupos accordion */}
        {!groupsQuery.isLoading && groups.length > 0 && (
          <div className="space-y-2">
            {groups.map((g, idx) => {
              const label = groupLabel(g, idx)
              const reports = (g as ReportGroup & { _filtered?: ReportDefinition[] })._filtered ?? reportList(g)
              const total = reportList(g).length
              const isOpen = effectiveOpenGroups.has(idx)

              return (
                <div key={label + idx} className="overflow-hidden rounded-lg border border-blue-100 bg-white shadow-sm shadow-blue-950/5">
                  <button
                    type="button"
                    onClick={() => toggleGroup(idx)}
                    className="flex w-full items-center justify-between px-4 py-3 text-left transition hover:bg-slate-50"
                  >
                    <span className="text-sm font-semibold text-slate-800">{label}</span>
                    <div className="flex items-center gap-2">
                      <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                        {search.trim() && reports.length < total
                          ? `${reports.length}/${total}`
                          : total}
                      </span>
                      <i
                        className={`bi bi-chevron-${isOpen ? 'up' : 'down'} text-xs text-slate-400 transition-transform`}
                        aria-hidden
                      />
                    </div>
                  </button>

                  {isOpen && (
                    <div className="border-t border-blue-50">
                      {reports.map((r, ri) => (
                        <div
                          key={r.name ?? ri}
                          className="flex items-center justify-between border-b border-slate-50 px-4 py-2.5 last:border-0"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-slate-800">
                              {r.title ?? r.name}
                              {r.default && (
                                <span className="ml-2 rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700">
                                  Padrão
                                </span>
                              )}
                            </p>
                            {r.description && (
                              <p className="truncate text-xs text-slate-500">{r.description}</p>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => setRunReport(r)}
                            title="Executar relatório"
                            className="ml-3 flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-blue-200 bg-white text-blue-700 transition hover:bg-blue-50"
                          >
                            <i className="bi bi-play-fill text-xs" aria-hidden />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {runReport && (
        <RunModal
          report={runReport}
          onClose={() => setRunReport(null)}
          onGenerated={handleGenerated}
        />
      )}

      {viewer && <PdfViewerModal viewer={viewer} onClose={closeViewer} />}
    </AppShell>
  )
}

// ─── Classes utilitárias ──────────────────────────────────────────────────────

const btnPrimary =
  'inline-flex h-8 items-center gap-1.5 rounded-md bg-blue-700 px-3 text-xs font-semibold text-white transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60'
const btnSecondary =
  'inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60'
const inputClass =
  'h-9 w-full rounded-md border border-blue-100 bg-white px-3 text-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100'
