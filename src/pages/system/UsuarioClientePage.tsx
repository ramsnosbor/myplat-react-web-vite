import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { AppShell } from '@/components/layout/AppShell'
import { useToast } from '@/components/ui/Toast'
import { ssoAccessApi, type ClientUserRecord } from '@/api/sso-access.api'
import { readErrorMessage } from './PerfisAcessoPage'

interface Filters {
  nome: string
  cpf: string
  ativo: string
}

export default function UsuarioClientePage() {
  const navigate = useNavigate()
  const toast = useToast()
  const queryClient = useQueryClient()
  const [filters, setFilters] = useState<Filters>({ nome: '', cpf: '', ativo: '' })

  const clientsQuery = useQuery({
    queryKey: ['client-users'],
    queryFn: ssoAccessApi.getClientUsers,
    staleTime: 10_000,
  })

  const clients = clientsQuery.data ?? []
  const filtered = useMemo(() => clients.filter((client) => {
    const name = client.nome ?? client.name ?? ''
    if (filters.nome && !name.toLowerCase().includes(filters.nome.toLowerCase())) return false
    if (filters.cpf && !(client.cpf ?? '').includes(onlyDigits(filters.cpf))) return false
    if (filters.ativo && (client.ativo ?? 'S') !== filters.ativo) return false
    return true
  }), [clients, filters])

  async function deactivate(client: ClientUserRecord) {
    const id = getClientId(client)
    if (!id) return toast.error('Cliente sem identificador.')
    if (!window.confirm(`Desativar o vinculo do cliente "${client.nome ?? client.name ?? id}"?`)) return

    try {
      await ssoAccessApi.deactivateClientUser(id)
      toast.success('Cliente desativado com sucesso.')
      queryClient.invalidateQueries({ queryKey: ['client-users'] })
    } catch (err: unknown) {
      toast.error(readErrorMessage(err, 'Erro ao desativar cliente.'))
    }
  }

  async function reactivate(client: ClientUserRecord) {
    const id = getClientId(client)
    if (!id) return toast.error('Cliente sem identificador.')
    if (!window.confirm(`Reativar o vinculo do cliente "${client.nome ?? client.name ?? id}"?`)) return

    try {
      await ssoAccessApi.reactivateClientUser(id)
      toast.success('Cliente reativado com sucesso.')
      queryClient.invalidateQueries({ queryKey: ['client-users'] })
    } catch (err: unknown) {
      toast.error(readErrorMessage(err, 'Erro ao reativar cliente.'))
    }
  }

  return (
    <AppShell title="Usuarios Cliente" subtitle="Usuarios externos vinculados ao tenant atual.">
      <div className="min-h-full w-full bg-background p-3 sm:p-4">
        <div className="w-full space-y-4">
          <section className="rounded-lg border border-blue-100 bg-white p-4 shadow-sm shadow-blue-950/5">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-md bg-blue-700 text-white">
                  <i className="bi bi-person-badge" aria-hidden />
                </div>
                <div>
                  <h1 className="text-lg font-semibold text-slate-900">Usuarios Cliente</h1>
                  <p className="text-sm text-slate-500">Cadastre e gerencie clientes com acesso ao tenant.</p>
                </div>
              </div>
              <button type="button" onClick={() => navigate('/usuario-cliente/form')} className={primaryButtonClass}>
                <i className="bi bi-plus-lg" aria-hidden />
                Novo Cliente
              </button>
            </div>

            <div className="grid gap-3 md:grid-cols-12">
              <Field className="md:col-span-5" label="Nome">
                <input value={filters.nome} onChange={(e) => setFilters((f) => ({ ...f, nome: e.target.value }))} className={inputClass} placeholder="Nome do cliente" />
              </Field>
              <Field className="md:col-span-3" label="CPF">
                <input value={filters.cpf} onChange={(e) => setFilters((f) => ({ ...f, cpf: formatCpf(e.target.value) }))} className={inputClass} placeholder="000.000.000-00" maxLength={14} />
              </Field>
              <Field className="md:col-span-3" label="Status">
                <select value={filters.ativo} onChange={(e) => setFilters((f) => ({ ...f, ativo: e.target.value }))} className={inputClass}>
                  <option value="">Todos os status</option>
                  <option value="S">Ativo</option>
                  <option value="N">Inativo</option>
                </select>
              </Field>
              <div className="flex items-end md:col-span-1">
                <button type="button" onClick={() => clientsQuery.refetch()} title="Atualizar" className="inline-flex h-10 w-full items-center justify-center rounded-md border border-blue-200 bg-blue-50 text-blue-700 transition hover:bg-blue-100">
                  <i className={`bi ${clientsQuery.isFetching ? 'bi-arrow-repeat animate-spin' : 'bi-arrow-clockwise'}`} aria-hidden />
                </button>
              </div>
            </div>
          </section>

          <section className="rounded-lg border border-blue-100 bg-white shadow-sm shadow-blue-950/5">
            <div className="overflow-hidden rounded-lg">
              <div className="max-h-[calc(100vh-310px)] overflow-auto">
                <table className="w-full min-w-[980px] table-fixed border-separate border-spacing-0 text-sm">
                  <colgroup>
                    <col className="w-20" />
                    <col className="w-56" />
                    <col className="w-40" />
                    <col className="w-64" />
                    <col className="w-40" />
                    <col className="w-44" />
                    <col className="w-28" />
                    <col className="w-28" />
                  </colgroup>
                  <thead className="sticky top-0 z-10 bg-slate-50">
                    <tr>
                      {['#', 'Nome', 'CPF', 'E-mail', 'Telefone', 'Perfil', 'Status', 'Acoes'].map((header) => (
                        <th key={header} className={thClass}>{header}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {clientsQuery.isLoading ? (
                      <tr>
                        <td colSpan={8} className="px-4 py-12 text-center text-sm text-slate-500">
                          <span className="mr-2 inline-block h-4 w-4 animate-spin rounded-full border-2 border-blue-700 border-t-transparent align-[-2px]" />
                          Carregando...
                        </td>
                      </tr>
                    ) : filtered.length > 0 ? (
                      filtered.map((client) => {
                        const id = getClientId(client)
                        const active = (client.ativo ?? 'S') === 'S'
                        return (
                          <tr key={id ?? client.cpf} className="hover:bg-slate-50">
                            <td className={tdClass}>{id ?? '-'}</td>
                            <td className={`${tdClass} truncate font-medium text-slate-900`}>{client.nome ?? client.name ?? '-'}</td>
                            <td className={tdClass}>{formatCpf(client.cpf ?? '') || '-'}</td>
                            <td className={`${tdClass} truncate`}>{client.email ?? '-'}</td>
                            <td className={tdClass}>{client.telefone ?? client.telephone ?? '-'}</td>
                            <td className={`${tdClass} truncate`}>{client.nomePerfil ?? client.perfilNome ?? '-'}</td>
                            <td className={tdClass}><StatusBadge active={active} /></td>
                            <td className={tdClass}>
                              <div className="flex items-center gap-1">
                                <IconButton title="Editar" icon="bi bi-pencil" tone="primary" onClick={() => navigate('/usuario-cliente/form', { state: { userId: id } })} />
                                {active ? (
                                  <IconButton title="Desativar" icon="bi bi-slash-circle" tone="danger" onClick={() => deactivate(client)} />
                                ) : (
                                  <IconButton title="Reativar" icon="bi bi-arrow-counterclockwise" tone="success" onClick={() => reactivate(client)} />
                                )}
                              </div>
                            </td>
                          </tr>
                        )
                      })
                    ) : (
                      <tr>
                        <td colSpan={8} className="px-4 py-14 text-center">
                          <EmptyState />
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="border-t border-slate-100 px-4 py-3 text-sm text-slate-500">
              Registros: <span className="font-semibold text-slate-700">{filtered.length}</span>
            </div>
          </section>
        </div>
      </div>
    </AppShell>
  )
}

export function getClientId(client: ClientUserRecord): number | string | undefined {
  return client.userId ?? client.id
}

export function onlyDigits(value: string) {
  return value.replace(/\D/g, '')
}

export function formatCpf(value: string) {
  const digits = onlyDigits(value).slice(0, 11)
  return digits
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})$/, '$1-$2')
}

const inputClass = 'h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100'
const primaryButtonClass = 'inline-flex h-9 items-center gap-2 rounded-md bg-blue-700 px-3 text-sm font-semibold text-white transition hover:bg-blue-800'
const thClass = 'border-b border-slate-200 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500'
const tdClass = 'border-b border-slate-100 px-4 py-3 text-slate-600'

function Field({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <label className={['block space-y-1', className].filter(Boolean).join(' ')}>
      <span className="text-sm font-medium text-slate-700">{label}</span>
      {children}
    </label>
  )
}

function StatusBadge({ active }: { active: boolean }) {
  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${active ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-slate-50 text-slate-600'}`}>
      {active ? 'Ativo' : 'Inativo'}
    </span>
  )
}

function IconButton({ title, icon, tone, onClick }: { title: string; icon: string; tone: 'primary' | 'danger' | 'success'; onClick: () => void }) {
  const cls = {
    primary: 'border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100',
    danger: 'border-red-200 bg-red-50 text-red-700 hover:bg-red-100',
    success: 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100',
  }[tone]

  return (
    <button type="button" title={title} onClick={onClick} className={`inline-flex h-8 w-8 items-center justify-center rounded-md border transition ${cls}`}>
      <i className={icon} aria-hidden />
    </button>
  )
}

function EmptyState() {
  return (
    <div>
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-blue-700 ring-1 ring-blue-100">
        <i className="bi bi-person-x text-xl" aria-hidden />
      </div>
      <p className="mt-3 text-sm font-semibold text-slate-800">Nenhum cliente encontrado</p>
      <p className="mt-1 text-xs text-slate-500">Ajuste os filtros ou cadastre um novo cliente.</p>
    </div>
  )
}
