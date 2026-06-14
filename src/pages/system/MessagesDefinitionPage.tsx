import { useMemo, useState } from 'react'
import dayjs from 'dayjs'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { AppShell } from '@/components/layout/AppShell'
import { templateMessagesApi } from '@/api/template-messages.api'
import { compact, EmptyRow, Field, IconButton, inputClass, LoadingRow, primaryButtonClass, tdClass, thClass } from './TemplatePage'

const pageSizes = [25, 50, 100, 500]

export default function MessagesDefinitionPage() {
  const navigate = useNavigate()
  const [filters, setFilters] = useState({ description: '', active: '' })
  const [appliedFilters, setAppliedFilters] = useState(filters)
  const [pageNumber, setPageNumber] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const params = useMemo(() => ({
    ...compact(appliedFilters),
    pageNumber,
    pageSize,
    orderBy: 'dsTemplateNotification,asc',
  }), [appliedFilters, pageNumber, pageSize])

  const messagesQuery = useQuery({
    queryKey: ['automated-messages', params],
    queryFn: () => templateMessagesApi.getAutomatedMessages(params),
    staleTime: 10_000,
  })

  const data = messagesQuery.data?.table ?? []
  const totalElements = messagesQuery.data?.totalElements ?? data.length
  const totalPages = messagesQuery.data?.totalPages ?? 1

  function applyFilters() {
    setPageNumber(1)
    setAppliedFilters(filters)
  }

  return (
    <AppShell title="Mensagens Automatizadas" subtitle="Definicoes de disparo e variaveis de mensagens.">
      <div className="min-h-full w-full bg-background p-3 sm:p-4">
        <div className="w-full space-y-4">
          <section className="rounded-lg border border-blue-100 bg-white p-4 shadow-sm shadow-blue-950/5">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-md bg-blue-700 text-white"><i className="bi bi-bell" aria-hidden /></div>
                <div><h1 className="text-lg font-semibold text-slate-900">Definicao de Campanhas</h1><p className="text-sm text-slate-500">Configure disparos automatizados por template.</p></div>
              </div>
              <button type="button" onClick={() => navigate('/messagesDefinition/form')} className={primaryButtonClass}><i className="bi bi-plus-lg" aria-hidden />Criar</button>
            </div>
            <div className="grid gap-3 md:grid-cols-12">
              <Field className="md:col-span-6" label="Descricao">
                <input value={filters.description} onChange={(e) => setFilters((f) => ({ ...f, description: e.target.value }))} className={inputClass} />
              </Field>
              <Field className="md:col-span-5" label="Status">
                <select value={filters.active} onChange={(e) => setFilters((f) => ({ ...f, active: e.target.value }))} className={inputClass}>
                  <option value="">Todos</option>
                  <option value="true">Ativo</option>
                  <option value="false">Inativo</option>
                </select>
              </Field>
              <div className="flex items-end md:col-span-1">
                <button type="button" onClick={applyFilters} className="inline-flex h-10 w-full items-center justify-center rounded-md bg-blue-700 text-white transition hover:bg-blue-800"><i className="bi bi-search" aria-hidden /></button>
              </div>
            </div>
          </section>

          <section className="rounded-lg border border-blue-100 bg-white shadow-sm shadow-blue-950/5">
            <div className="max-h-[calc(100vh-310px)] overflow-auto rounded-lg">
              <table className="w-full min-w-[1120px] table-fixed border-separate border-spacing-0 text-sm">
                <colgroup><col className="w-28" /><col className="w-56" /><col className="w-56" /><col className="w-36" /><col className="w-28" /><col className="w-28" /><col className="w-28" /><col className="w-28" /><col className="w-24" /></colgroup>
                <thead className="sticky top-0 z-10 bg-slate-50"><tr>{['Criacao', 'Descricao', 'Mensagem', 'Periodicidade', 'Inicio', 'Fim', 'Hora Inicio', 'Status', 'Acoes'].map((h) => <th key={h} className={thClass}>{h}</th>)}</tr></thead>
                <tbody>
                  {messagesQuery.isLoading ? <LoadingRow colSpan={9} /> : data.length > 0 ? data.map((message) => (
                    <tr key={message.id} className="hover:bg-slate-50">
                      <td className={tdClass}>{formatDate(message.creationDate)}</td>
                      <td className={`${tdClass} truncate font-medium text-slate-900`}>{message.description}</td>
                      <td className={`${tdClass} truncate`}>{message.notificationTemplate?.subject ?? '-'}</td>
                      <td className={tdClass}>{message.executionInterval}</td>
                      <td className={tdClass}>{formatDate(message.beginDate)}</td>
                      <td className={tdClass}>{formatDate(message.endDate)}</td>
                      <td className={tdClass}>{message.beginHour}</td>
                      <td className={tdClass}><StatusBadge active={message.active !== false} /></td>
                      <td className={tdClass}><IconButton title="Editar" icon="bi bi-pencil" onClick={() => navigate('/messagesDefinition/form', { state: { messageDefinition: message } })} /></td>
                    </tr>
                  )) : <EmptyRow colSpan={9} title="Nenhuma campanha encontrada" />}
                </tbody>
              </table>
            </div>
            <div className="flex flex-col gap-3 border-t border-slate-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-slate-500">Registros: <span className="font-semibold text-slate-700">{totalElements}</span><span className="mx-2">|</span>Paginas: <span className="font-semibold text-slate-700">{totalPages}</span></p>
              <div className="flex items-center gap-2">
                <button className={pagerButtonClass} onClick={() => setPageNumber(Math.max(1, pageNumber - 1))} disabled={pageNumber <= 1}>Anterior</button>
                <span className="rounded-md border border-slate-200 px-3 py-1.5 text-sm text-slate-700">{pageNumber}</span>
                <button className={pagerButtonClass} onClick={() => setPageNumber(Math.min(totalPages, pageNumber + 1))} disabled={pageNumber >= totalPages}>Proxima</button>
                <select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPageNumber(1) }} className="h-9 rounded-md border border-slate-200 bg-white px-2 text-sm">{pageSizes.map((s) => <option key={s} value={s}>{s}</option>)}</select>
              </div>
            </div>
          </section>
        </div>
      </div>
    </AppShell>
  )
}

function formatDate(value?: string) {
  return value ? dayjs(value).format('DD/MM/YYYY') : '-'
}

function StatusBadge({ active }: { active: boolean }) {
  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${active ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-slate-50 text-slate-600'}`}>{active ? 'Ativo' : 'Inativo'}</span>
}

const pagerButtonClass = 'rounded-md border border-slate-200 px-3 py-1.5 text-sm text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50'
