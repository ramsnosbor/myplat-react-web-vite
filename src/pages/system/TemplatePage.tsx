import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { AppShell } from '@/components/layout/AppShell'
import { templateMessagesApi } from '@/api/template-messages.api'

const pageSizes = [25, 50, 100, 500]

export default function TemplatePage() {
  const navigate = useNavigate()
  const [filters, setFilters] = useState({ subject: '', dsTemplateNotification: '' })
  const [appliedFilters, setAppliedFilters] = useState(filters)
  const [pageNumber, setPageNumber] = useState(1)
  const [pageSize, setPageSize] = useState(25)

  const params = useMemo(() => ({
    ...compact(appliedFilters),
    pageNumber,
    pageSize,
    orderBy: 'dsTemplateNotification,asc',
  }), [appliedFilters, pageNumber, pageSize])

  const templatesQuery = useQuery({
    queryKey: ['notification-templates', params],
    queryFn: () => templateMessagesApi.getTemplates(params),
    staleTime: 10_000,
  })

  const data = templatesQuery.data?.table ?? []
  const totalElements = templatesQuery.data?.totalElements ?? data.length
  const totalPages = templatesQuery.data?.totalPages ?? 1

  function applyFilters() {
    setPageNumber(1)
    setAppliedFilters(filters)
  }

  return (
    <AppShell title="Templates" subtitle="Modelos usados em comunicacoes e mensagens.">
      <div className="min-h-full bg-background p-4 sm:p-6">
        <div className="mx-auto max-w-7xl space-y-4">
          <section className="rounded-lg border border-blue-100 bg-white p-4 shadow-sm shadow-blue-950/5">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-md bg-blue-700 text-white">
                  <i className="bi bi-chat-square-text" aria-hidden />
                </div>
                <div>
                  <h1 className="text-lg font-semibold text-slate-900">Templates</h1>
                  <p className="text-sm text-slate-500">Cadastre os modelos usados em e-mail e WhatsApp.</p>
                </div>
              </div>
              <button type="button" onClick={() => navigate('/template/form')} className={primaryButtonClass}>
                <i className="bi bi-plus-lg" aria-hidden />
                Criar
              </button>
            </div>
            <div className="grid gap-3 md:grid-cols-12">
              <Field className="md:col-span-5" label="Assunto">
                <input value={filters.subject} onChange={(e) => setFilters((f) => ({ ...f, subject: e.target.value }))} className={inputClass} placeholder="Assunto do template" />
              </Field>
              <Field className="md:col-span-6" label="Descricao">
                <input value={filters.dsTemplateNotification} onChange={(e) => setFilters((f) => ({ ...f, dsTemplateNotification: e.target.value }))} className={inputClass} placeholder="Descricao do template" />
              </Field>
              <div className="flex items-end md:col-span-1">
                <button type="button" onClick={applyFilters} title="Filtrar" className="inline-flex h-10 w-full items-center justify-center rounded-md bg-blue-700 text-white transition hover:bg-blue-800">
                  <i className="bi bi-search" aria-hidden />
                </button>
              </div>
            </div>
          </section>

          <section className="rounded-lg border border-blue-100 bg-white shadow-sm shadow-blue-950/5">
            <div className="overflow-hidden rounded-lg">
              <div className="max-h-[calc(100vh-342px)] overflow-auto">
                <table className="w-full min-w-[980px] table-fixed border-separate border-spacing-0 text-sm">
                  <colgroup>
                    <col className="w-20" />
                    <col className="w-48" />
                    <col className="w-64" />
                    <col />
                    <col className="w-56" />
                    <col className="w-24" />
                  </colgroup>
                  <thead className="sticky top-0 z-10 bg-slate-50">
                    <tr>{['ID', 'Codigo', 'Descricao', 'Template', 'Assunto', 'Acoes'].map((h) => <th key={h} className={thClass}>{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {templatesQuery.isLoading ? (
                      <LoadingRow colSpan={6} />
                    ) : data.length > 0 ? data.map((template) => (
                      <tr key={template.id} className="hover:bg-slate-50">
                        <td className={tdClass}>{template.id ?? '-'}</td>
                        <td className={`${tdClass} truncate font-medium text-slate-900`}>{template.cdTemplateNotification}</td>
                        <td className={`${tdClass} truncate`}>{template.dsTemplateNotification}</td>
                        <td className={`${tdClass} truncate`}>{stripHtml(template.dsTemplate)}</td>
                        <td className={`${tdClass} truncate`}>{template.subject}</td>
                        <td className={tdClass}>
                          <IconButton title="Editar" icon="bi bi-pencil" onClick={() => navigate('/template/form', { state: { template } })} />
                        </td>
                      </tr>
                    )) : (
                      <EmptyRow colSpan={6} title="Nenhum template encontrado" />
                    )}
                  </tbody>
                </table>
              </div>
            </div>
            <PaginationFooter
              totalElements={totalElements}
              totalPages={totalPages}
              pageNumber={pageNumber}
              pageSize={pageSize}
              onPageNumber={setPageNumber}
              onPageSize={setPageSize}
            />
          </section>
        </div>
      </div>
    </AppShell>
  )
}

export function stripHtml(value: string) {
  return value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
}

export function compact(obj: Record<string, string>) {
  return Object.fromEntries(Object.entries(obj).filter(([, value]) => value !== ''))
}

export const inputClass = 'h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500'
export const primaryButtonClass = 'inline-flex h-9 items-center gap-2 rounded-md bg-blue-700 px-3 text-sm font-semibold text-white transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-70'
export const secondaryButtonClass = 'inline-flex h-9 items-center gap-2 rounded-md border border-slate-200 px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50'
export const thClass = 'border-b border-slate-200 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500'
export const tdClass = 'border-b border-slate-100 px-4 py-3 text-slate-600'

export function Field({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return <label className={['block space-y-1', className].filter(Boolean).join(' ')}><span className="text-sm font-medium text-slate-700">{label}</span>{children}</label>
}

export function IconButton({ title, icon, onClick }: { title: string; icon: string; onClick: () => void }) {
  return <button type="button" title={title} onClick={onClick} className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-blue-200 bg-blue-50 text-blue-700 transition hover:bg-blue-100"><i className={icon} aria-hidden /></button>
}

export function LoadingRow({ colSpan }: { colSpan: number }) {
  return <tr><td colSpan={colSpan} className="px-4 py-12 text-center text-sm text-slate-500"><span className="mr-2 inline-block h-4 w-4 animate-spin rounded-full border-2 border-blue-700 border-t-transparent align-[-2px]" />Carregando...</td></tr>
}

export function EmptyRow({ colSpan, title }: { colSpan: number; title: string }) {
  return <tr><td colSpan={colSpan} className="px-4 py-14 text-center"><div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-blue-700 ring-1 ring-blue-100"><i className="bi bi-inbox text-xl" aria-hidden /></div><p className="mt-3 text-sm font-semibold text-slate-800">{title}</p></td></tr>
}

function PaginationFooter({ totalElements, totalPages, pageNumber, pageSize, onPageNumber, onPageSize }: { totalElements: number; totalPages: number; pageNumber: number; pageSize: number; onPageNumber: (n: number) => void; onPageSize: (n: number) => void }) {
  return (
    <div className="flex flex-col gap-3 border-t border-slate-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-slate-500">Registros: <span className="font-semibold text-slate-700">{totalElements}</span><span className="mx-2">|</span>Paginas: <span className="font-semibold text-slate-700">{totalPages}</span></p>
      <div className="flex items-center justify-end gap-2">
        <button className={pagerButtonClass} onClick={() => onPageNumber(1)} disabled={pageNumber <= 1}>Primeira</button>
        <button className={pagerButtonClass} onClick={() => onPageNumber(Math.max(1, pageNumber - 1))} disabled={pageNumber <= 1}>Anterior</button>
        <span className="rounded-md border border-slate-200 px-3 py-1.5 text-sm text-slate-700">{pageNumber}</span>
        <button className={pagerButtonClass} onClick={() => onPageNumber(Math.min(totalPages, pageNumber + 1))} disabled={pageNumber >= totalPages}>Proxima</button>
        <select value={pageSize} onChange={(e) => { onPageSize(Number(e.target.value)); onPageNumber(1) }} className="h-9 rounded-md border border-slate-200 bg-white px-2 text-sm outline-none focus:ring-2 focus:ring-blue-100">
          {pageSizes.map((size) => <option key={size} value={size}>{size}</option>)}
        </select>
      </div>
    </div>
  )
}

const pagerButtonClass = 'rounded-md border border-slate-200 px-3 py-1.5 text-sm text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50'
