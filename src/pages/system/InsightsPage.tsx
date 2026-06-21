import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { AppShell } from '@/components/layout/AppShell'
import { insightsApi, type InsightColumn, type InsightDataRow, type InsightDefinition, type InsightResult } from '@/api/insights.api'

interface ChatMessage {
  id: string
  role: 'assistant' | 'user'
  content: string
  result?: InsightResult
}

const defaultSuggestions = [
  'Quais pontos precisam de atencao hoje?',
  'Mostre as principais variacoes do periodo.',
  'O que devo priorizar agora?',
]

const chartColors = ['#2563eb', '#16a34a', '#f59e0b', '#dc2626', '#7c3aed', '#0891b2']

export default function InsightsPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([{
    id: 'welcome',
    role: 'assistant',
    content: 'Ola! Escolha um insight disponivel ou faca uma pergunta sobre os dados do seu negocio.',
  }])
  const [message, setMessage] = useState('')
  const [conversationId, setConversationId] = useState<string | undefined>()
  const chatEndRef = useRef<HTMLDivElement | null>(null)

  const insightsQuery = useQuery({
    queryKey: ['insights'],
    queryFn: insightsApi.getInsights,
    staleTime: 60_000,
  })

  const chatMutation = useMutation({
    mutationFn: ({ content, currentConversationId }: { content: string; currentConversationId?: string }) => insightsApi.chat(content, currentConversationId),
    onSuccess: (response) => {
      setMessages((current) => [...current, {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: response.message,
        result: response.result,
      }])
      setConversationId(response.conversationId ?? conversationId)
    },
    onError: () => {
      setMessages((current) => [...current, {
        id: `error-${Date.now()}`,
        role: 'assistant',
        content: 'Nao consegui concluir essa consulta agora. Tente novamente em alguns instantes.',
      }])
    },
  })

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages, chatMutation.isPending])

  const suggestions = useMemo(() => {
    const fromChat = chatMutation.data?.suggestions ?? []
    if (fromChat.length > 0) return fromChat
    const fromInsights = insightsQuery.data?.map(insightPrompt).filter(Boolean) ?? []
    return fromInsights.length > 0 ? fromInsights : defaultSuggestions
  }, [chatMutation.data?.suggestions, insightsQuery.data])

  function sendMessage(content: string) {
    const trimmed = content.trim()
    if (!trimmed || chatMutation.isPending) return

    setMessages((current) => [...current, { id: `user-${Date.now()}`, role: 'user', content: trimmed }])
    setMessage('')
    chatMutation.mutate({ content: trimmed, currentConversationId: conversationId })
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    sendMessage(message)
  }

  return (
    <AppShell title="Insights" subtitle="Consultas inteligentes baseadas nos dados do seu negocio.">
      <div className="min-h-full bg-[#fafafa] p-3 sm:p-4">
        <section className="mb-3 flex items-center justify-between gap-3 border-b border-blue-100 pb-3">
          <div className="flex min-w-0 items-center gap-2">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-blue-700 text-white"><i className="bi bi-stars" aria-hidden /></span>
            <div className="min-w-0"><h1 className="truncate text-base font-semibold text-slate-900">Visao do negocio</h1><p className="truncate text-xs text-slate-500">Explore os insights disponiveis e consulte seus dados.</p></div>
          </div>
          <button type="button" onClick={() => insightsQuery.refetch()} disabled={insightsQuery.isFetching} className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-blue-200 bg-white px-3 text-xs font-semibold text-blue-700 transition hover:bg-blue-50 disabled:opacity-60"><i className={`bi bi-arrow-clockwise ${insightsQuery.isFetching ? 'animate-spin' : ''}`} aria-hidden />Atualizar</button>
        </section>

        {insightsQuery.isError && <div className="mb-3 flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800"><i className="bi bi-exclamation-triangle" aria-hidden />Nao foi possivel carregar os insights disponiveis. Voce ainda pode fazer uma pergunta.</div>}

        <div className="grid min-w-0 gap-3 xl:grid-cols-[minmax(260px,0.7fr)_minmax(0,1.45fr)]">
          <AvailableInsights loading={insightsQuery.isLoading} insights={insightsQuery.data ?? []} onSelect={sendMessage} disabled={chatMutation.isPending} />

          <section className="flex min-h-[600px] min-w-0 flex-col overflow-hidden rounded-lg border border-blue-100 bg-white shadow-sm shadow-blue-950/5">
            <header className="flex shrink-0 items-center gap-3 border-b border-blue-100 px-4 py-3"><span className="flex h-9 w-9 items-center justify-center rounded-md bg-blue-700 text-white"><i className="bi bi-chat-square-text" aria-hidden /></span><div><h2 className="text-sm font-semibold text-slate-900">Assistente de Insights</h2><p className="text-xs text-slate-500">Resultados, graficos e tabelas da sua consulta.</p></div></header>
            <div className="flex-1 space-y-3 overflow-y-auto bg-slate-50/70 px-3 py-4 sm:px-4">
              {messages.map((item) => <ChatBubble key={item.id} message={item} />)}
              {chatMutation.isPending && <TypingBubble />}
              <div ref={chatEndRef} />
            </div>
            <div className="shrink-0 border-t border-blue-100 bg-white p-3">
              <div className="mb-2 flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">{suggestions.slice(0, 4).map((suggestion) => <button key={suggestion} type="button" onClick={() => sendMessage(suggestion)} disabled={chatMutation.isPending} className="shrink-0 rounded-md border border-blue-100 bg-blue-50 px-2.5 py-1.5 text-left text-xs font-medium text-blue-700 transition hover:border-blue-200 hover:bg-blue-100 disabled:opacity-60">{suggestion}</button>)}</div>
              <form onSubmit={handleSubmit} className="flex items-end gap-2"><textarea value={message} onChange={(event) => setMessage(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); sendMessage(message) } }} placeholder="Escreva sua pergunta..." rows={2} className="min-h-[48px] flex-1 resize-none rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-100" /><button type="submit" disabled={!message.trim() || chatMutation.isPending} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-blue-700 text-white transition hover:bg-blue-800 disabled:opacity-50" aria-label="Enviar pergunta"><i className={chatMutation.isPending ? 'bi bi-arrow-clockwise animate-spin' : 'bi bi-send'} aria-hidden /></button></form>
            </div>
          </section>
        </div>
      </div>
    </AppShell>
  )
}

function AvailableInsights({ loading, insights, onSelect, disabled }: { loading: boolean; insights: InsightDefinition[]; onSelect: (prompt: string) => void; disabled: boolean }) {
  return <section className="h-fit overflow-hidden rounded-lg border border-blue-100 bg-white shadow-sm shadow-blue-950/5"><header className="flex items-center gap-2 border-b border-blue-100 px-4 py-3"><i className="bi bi-lightbulb text-blue-700" aria-hidden /><h2 className="text-sm font-semibold text-slate-900">Insights disponiveis</h2></header>{loading ? <div className="space-y-3 p-4">{Array.from({ length: 4 }, (_, index) => <div key={index} className="h-16 animate-pulse rounded-md bg-slate-100" />)}</div> : insights.length ? <div className="divide-y divide-slate-100">{insights.map((insight, index) => <button key={insight.id ?? insight.name ?? index} type="button" disabled={disabled || !insight.name} onClick={() => onSelect(insight.name)} className="block w-full px-4 py-3 text-left transition hover:bg-blue-50 disabled:opacity-60"><p className="text-sm font-semibold text-slate-800">{insight.name}</p>{insight.description && <p className="mt-1 text-xs leading-5 text-slate-500">{insight.description}</p>}<span className="mt-2 inline-block text-xs font-semibold text-blue-700">Executar insight <i className="bi bi-arrow-right" aria-hidden /></span></button>)}</div> : <div className="px-4 py-10 text-center text-sm text-slate-500">Nenhum insight disponivel no momento.</div>}</section>
}

function ChatBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user'
  return <div className={`flex gap-2 ${isUser ? 'justify-end' : 'justify-start'}`}>{!isUser && <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-blue-700 text-xs text-white"><i className="bi bi-stars" aria-hidden /></span>}<div className={`max-w-[96%] min-w-0 rounded-lg px-3 py-2 text-sm leading-6 ${isUser ? 'max-w-[85%] bg-blue-700 text-white' : 'border border-blue-100 bg-white text-slate-700'}`}><div className="whitespace-pre-wrap">{message.content}</div>{message.result && <InsightResultView result={message.result} />}</div></div>
}

function InsightResultView({ result }: { result: InsightResult }) {
  const columns = result.columns ?? []
  const chart = chartProps(columns, result.data ?? [])
  return <div className="mt-3 space-y-3 border-t border-slate-100 pt-3"><SummaryCards summary={result.summary} />{result.data?.length > 0 && chart && <Chart data={result.data} chart={chart} visualization={result.visualization} />}{result.data?.length > 0 && <ResultTable columns={columns} data={result.data} />}</div>
}

function SummaryCards({ summary }: { summary?: InsightResult['summary'] }) {
  if (!summary || Object.keys(summary).length === 0) return null
  return <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{Object.entries(summary).map(([label, value]) => <div key={label} className="rounded-md border border-blue-100 bg-blue-50/60 px-2.5 py-2"><p className="truncate text-[11px] font-medium text-slate-500">{humanize(label)}</p><p className="truncate text-sm font-semibold text-slate-900">{String(value ?? '-')}</p></div>)}</div>
}

function Chart({ data, chart, visualization }: { data: InsightDataRow[]; chart: { labelKey: string; valueKeys: string[] }; visualization?: InsightResult['visualization'] }) {
  const kind = typeof visualization === 'string' ? visualization.toLowerCase() : visualization?.type?.toLowerCase()
  const common = <><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey={chart.labelKey} tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} /><Tooltip /><Legend /></>
  return <div className="h-64 rounded-md border border-slate-100 bg-white p-2"><ResponsiveContainer width="100%" height="100%">{kind?.includes('pie') || kind?.includes('donut') ? <PieChart><Tooltip /><Legend /><Pie data={data} dataKey={chart.valueKeys[0]} nameKey={chart.labelKey} outerRadius="75%" label>{data.map((_, index) => <Cell key={index} fill={chartColors[index % chartColors.length]} />)}</Pie></PieChart> : kind?.includes('line') ? <LineChart data={data}>{common}{chart.valueKeys.map((key, index) => <Line key={key} type="monotone" dataKey={key} name={humanize(key)} stroke={chartColors[index % chartColors.length]} strokeWidth={2} />)}</LineChart> : <BarChart data={data}>{common}{chart.valueKeys.map((key, index) => <Bar key={key} dataKey={key} name={humanize(key)} fill={chartColors[index % chartColors.length]} radius={[3, 3, 0, 0]} />)}</BarChart>}</ResponsiveContainer></div>
}

function ResultTable({ columns, data }: { columns: Array<string | InsightColumn>; data: InsightDataRow[] }) {
  const normalized = columns.map(columnInfo)
  return <div className="overflow-x-auto rounded-md border border-slate-200"><table className="min-w-full text-left text-xs"><thead className="bg-slate-50 text-slate-600"><tr>{normalized.map((column) => <th key={column.key} className="whitespace-nowrap px-3 py-2 font-semibold">{column.label}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{data.map((row, rowIndex) => <tr key={rowIndex} className="text-slate-700">{normalized.map((column) => <td key={column.key} className="whitespace-nowrap px-3 py-2">{formatValue(row[column.key])}</td>)}</tr>)}</tbody></table></div>
}

function TypingBubble() { return <div className="flex items-center gap-2"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-blue-700 text-xs text-white"><i className="bi bi-stars" aria-hidden /></span><div className="flex gap-1 rounded-lg border border-blue-100 bg-white px-3 py-3"><span className="h-1.5 w-1.5 animate-bounce rounded-full bg-blue-400 [animation-delay:-0.2s]" /><span className="h-1.5 w-1.5 animate-bounce rounded-full bg-blue-400 [animation-delay:-0.1s]" /><span className="h-1.5 w-1.5 animate-bounce rounded-full bg-blue-400" /></div></div> }

function insightPrompt(insight: InsightDefinition) { return insight.name }
function columnInfo(column: string | InsightColumn) { return typeof column === 'string' ? { key: column, label: humanize(column) } : { key: column.key, label: column.label || humanize(column.key) } }
function chartProps(columns: Array<string | InsightColumn>, data: InsightDataRow[]) { const keys = columns.map(columnInfo).map((column) => column.key); const sample = data[0]; if (!sample) return null; const valueKeys = keys.filter((key) => typeof sample[key] === 'number'); const labelKey = keys.find((key) => !valueKeys.includes(key)) ?? keys[0]; return labelKey && valueKeys.length ? { labelKey, valueKeys } : null }
function formatValue(value: unknown) { return value === null || value === undefined ? '-' : String(value) }
function humanize(value: string) { return value.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').replace(/^./, (char) => char.toUpperCase()) }
