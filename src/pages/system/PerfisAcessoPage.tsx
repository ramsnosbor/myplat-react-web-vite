import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { AppShell } from '@/components/layout/AppShell'
import { useToast } from '@/components/ui/Toast'
import { ssoAccessApi, type AccessProfile, type PerfilTipo } from '@/api/sso-access.api'

interface Filters {
  nome: string
  tipo: string
  ativo: string
}

const pageSizes = [10, 25, 50, 100]
const typeMeta: Record<string, { label: string; className: string }> = {
  leitor: { label: 'Leitor', className: 'border-sky-200 bg-sky-50 text-sky-700' },
  editor: { label: 'Editor', className: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
  admin: { label: 'Admin', className: 'border-amber-200 bg-amber-50 text-amber-700' },
  cliente: { label: 'Cliente', className: 'border-violet-200 bg-violet-50 text-violet-700' },
}

export default function PerfisAcessoPage() {
  const navigate = useNavigate()
  const toast = useToast()
  const queryClient = useQueryClient()
  const [filters, setFilters] = useState<Filters>({ nome: '', tipo: '', ativo: '' })
  const [appliedFilters, setAppliedFilters] = useState<Filters>({ nome: '', tipo: '', ativo: '' })
  const [pageNumber, setPageNumber] = useState(1)
  const [pageSize, setPageSize] = useState(25)

  const queryParams = useMemo(() => ({
    ...compact(appliedFilters),
    pageNumber,
    pageSize,
    orderBy: 'nome,asc',
  }), [appliedFilters, pageNumber, pageSize])

  const profilesQuery = useQuery({
    queryKey: ['access-profiles', queryParams],
    queryFn: () => ssoAccessApi.getProfiles(queryParams),
    staleTime: 10_000,
  })

  const response = profilesQuery.data
  const profiles = Array.isArray(response) ? response : response?.data ?? response?.table ?? []
  const totalElements = Array.isArray(response) ? response.length : response?.totalElements ?? response?.total ?? profiles.length
  const totalPages = Math.max(1, Math.ceil(totalElements / pageSize))

  function applyFilters() {
    setPageNumber(1)
    setAppliedFilters(filters)
  }

  async function deleteProfile(profile: AccessProfile) {
    const id = getProfileId(profile)
    if (!id) {
      toast.error('Perfil sem identificador para exclusao.')
      return
    }
    if (!window.confirm(`Excluir o perfil "${profile.nome}"?`)) return

    try {
      await ssoAccessApi.deleteProfile(id)
      toast.success('Perfil excluido com sucesso.')
      queryClient.invalidateQueries({ queryKey: ['access-profiles'] })
    } catch (err: unknown) {
      toast.error(readErrorMessage(err, 'Erro ao excluir perfil.'))
    }
  }

  return (
    <AppShell title="Perfis de Acesso" subtitle="Perfis, niveis e permissoes por modulo.">
      <div className="min-h-full w-full bg-background p-3 sm:p-4">
        <div className="w-full space-y-4">
          <section className="rounded-lg border border-blue-100 bg-white p-4 shadow-sm shadow-blue-950/5">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-md bg-blue-700 text-white">
                  <i className="bi bi-shield-check" aria-hidden />
                </div>
                <div>
                  <h1 className="text-lg font-semibold text-slate-900">Perfis de Acesso</h1>
                  <p className="text-sm text-slate-500">Gerencie perfis e regras de acesso do sistema.</p>
                </div>
              </div>
              <button type="button" onClick={() => navigate('/perfis-acesso/form')} className={primaryButtonClass}>
                <i className="bi bi-plus-lg" aria-hidden />
                Novo Perfil
              </button>
            </div>

            <div className="grid gap-3 md:grid-cols-12">
              <Field className="md:col-span-5" label="Nome">
                <input
                  value={filters.nome}
                  onChange={(e) => setFilters((f) => ({ ...f, nome: e.target.value }))}
                  onKeyDown={(e) => e.key === 'Enter' && applyFilters()}
                  className={inputClass}
                  placeholder="Nome do perfil"
                />
              </Field>
              <Field className="md:col-span-3" label="Tipo">
                <select value={filters.tipo} onChange={(e) => setFilters((f) => ({ ...f, tipo: e.target.value }))} className={inputClass}>
                  <option value="">Todos os tipos</option>
                  <option value="leitor">Leitor</option>
                  <option value="editor">Editor</option>
                  <option value="admin">Admin</option>
                  <option value="cliente">Cliente</option>
                </select>
              </Field>
              <Field className="md:col-span-3" label="Status">
                <select value={filters.ativo} onChange={(e) => setFilters((f) => ({ ...f, ativo: e.target.value }))} className={inputClass}>
                  <option value="">Todos os status</option>
                  <option value="S">Ativo</option>
                  <option value="N">Inativo</option>
                </select>
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
              <div className="max-h-[calc(100vh-310px)] overflow-auto">
                <table className="w-full table-fixed border-separate border-spacing-0 text-sm">
                  <colgroup>
                    <col className="w-20" />
                    <col className="w-[24%]" />
                    <col className="w-32" />
                    <col />
                    <col className="w-28" />
                    <col className="w-24" />
                  </colgroup>
                  <thead className="sticky top-0 z-10 bg-slate-50">
                    <tr>
                      {['#', 'Nome', 'Tipo', 'Descricao', 'Status', 'Acoes'].map((header) => (
                        <th key={header} className="border-b border-slate-200 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                          {header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {profilesQuery.isLoading ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-12 text-center text-sm text-slate-500">
                          <span className="mr-2 inline-block h-4 w-4 animate-spin rounded-full border-2 border-blue-700 border-t-transparent align-[-2px]" />
                          Carregando...
                        </td>
                      </tr>
                    ) : profiles.length > 0 ? (
                      profiles.map((profile) => {
                        const id = getProfileId(profile)
                        return (
                          <tr key={id ?? profile.nome} className="hover:bg-slate-50/80">
                            <td className="border-b border-slate-100 px-4 py-3 text-slate-700">{id ?? '-'}</td>
                            <td className="truncate border-b border-slate-100 px-4 py-3 font-medium text-slate-900">{profile.nome}</td>
                            <td className="border-b border-slate-100 px-4 py-3">
                              <TypeBadge tipo={profile.tipo} />
                            </td>
                            <td className="truncate border-b border-slate-100 px-4 py-3 text-slate-600">{profile.descricao ?? '-'}</td>
                            <td className="border-b border-slate-100 px-4 py-3">
                              <StatusBadge ativo={profile.ativo} />
                            </td>
                            <td className="border-b border-slate-100 px-4 py-3">
                              <div className="flex items-center gap-1">
                                <IconButton title="Editar" icon="bi bi-pencil" tone="primary" onClick={() => navigate('/perfis-acesso/form', { state: { perfil: profile } })} />
                                <IconButton title="Excluir" icon="bi bi-trash" tone="danger" onClick={() => deleteProfile(profile)} />
                              </div>
                            </td>
                          </tr>
                        )
                      })
                    ) : (
                      <tr>
                        <td colSpan={6} className="px-4 py-14 text-center">
                          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-blue-700 ring-1 ring-blue-100">
                            <i className="bi bi-shield-slash text-xl" aria-hidden />
                          </div>
                          <p className="mt-3 text-sm font-semibold text-slate-800">Nenhum perfil encontrado</p>
                          <p className="mt-1 text-xs text-slate-500">Ajuste os filtros ou crie um novo perfil.</p>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex flex-col gap-3 border-t border-slate-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-slate-500">
                Registros: <span className="font-semibold text-slate-700">{totalElements}</span>
                <span className="mx-2">|</span>
                Paginas: <span className="font-semibold text-slate-700">{totalPages}</span>
              </p>
              <div className="flex items-center justify-end gap-2">
                <button className={pagerButtonClass} onClick={() => setPageNumber(1)} disabled={pageNumber <= 1}>Primeira</button>
                <button className={pagerButtonClass} onClick={() => setPageNumber((p) => Math.max(1, p - 1))} disabled={pageNumber <= 1}>Anterior</button>
                <span className="rounded-md border border-slate-200 px-3 py-1.5 text-sm text-slate-700">{pageNumber}</span>
                <button className={pagerButtonClass} onClick={() => setPageNumber((p) => Math.min(totalPages, p + 1))} disabled={pageNumber >= totalPages}>Proxima</button>
                <button className={pagerButtonClass} onClick={() => setPageNumber(totalPages)} disabled={pageNumber >= totalPages}>Ultima</button>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value))
                    setPageNumber(1)
                  }}
                  className="h-9 rounded-md border border-slate-200 bg-white px-2 text-sm outline-none focus:ring-2 focus:ring-blue-100"
                >
                  {pageSizes.map((size) => <option key={size} value={size}>{size}</option>)}
                </select>
              </div>
            </div>
          </section>
        </div>
      </div>
    </AppShell>
  )
}

export function getProfileId(profile: AccessProfile): number | string | undefined {
  return profile.id_perfil ?? profile.idPerfil ?? profile.id
}

export function readErrorMessage(err: unknown, fallback: string) {
  return (
    (err as { response?: { data?: { message?: string; messageError?: string } } })?.response?.data?.messageError ??
    (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
    fallback
  )
}

const inputClass = 'h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100'
const primaryButtonClass = 'inline-flex h-9 items-center gap-2 rounded-md bg-blue-700 px-3 text-sm font-semibold text-white transition hover:bg-blue-800'
const pagerButtonClass = 'rounded-md border border-slate-200 px-3 py-1.5 text-sm text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50'

function Field({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <label className={['block space-y-1', className].filter(Boolean).join(' ')}>
      <span className="text-sm font-medium text-slate-700">{label}</span>
      {children}
    </label>
  )
}

function TypeBadge({ tipo }: { tipo: PerfilTipo }) {
  const meta = typeMeta[String(tipo)] ?? { label: String(tipo || '-'), className: 'border-slate-200 bg-slate-50 text-slate-700' }
  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${meta.className}`}>{meta.label}</span>
}

function StatusBadge({ ativo }: { ativo: string }) {
  const active = ativo === 'S' || ativo === 'true' || ativo === '1'
  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${active ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-slate-50 text-slate-600'}`}>
      {active ? 'Ativo' : 'Inativo'}
    </span>
  )
}

function IconButton({ title, icon, tone, onClick }: { title: string; icon: string; tone: 'primary' | 'danger'; onClick: () => void }) {
  const cls = tone === 'primary'
    ? 'border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100'
    : 'border-red-200 bg-red-50 text-red-700 hover:bg-red-100'

  return (
    <button type="button" title={title} onClick={onClick} className={`inline-flex h-8 w-8 items-center justify-center rounded-md border transition ${cls}`}>
      <i className={icon} aria-hidden />
    </button>
  )
}

function compact(filters: Filters) {
  return Object.fromEntries(Object.entries(filters).filter(([, value]) => value !== ''))
}
