import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AppShell } from '@/components/layout/AppShell'
import { useToast } from '@/components/ui/Toast'
import { entityApi } from '@/api/entity.api'
import { readErrorMessage } from './PerfisAcessoPage'

interface EngineUser {
  id_usuario: number | string
  nm_usuario?: string
  email?: string
  username?: string
  ativo?: string
}

interface Papel {
  id_papel: number | string
  nm_papel: string
  ds_papel?: string | null
  nm_modulo?: string | null
  fl_ativo?: string
}

interface UsuarioPapelLink {
  id_usuario_papel: number | string
  id_papel: number | string
  nm_papel?: string
  nm_modulo?: string
  fl_ativo?: string
}

const pageSizes = [10, 25, 50, 100]

const moduleMeta: Record<string, { label: string; className: string }> = {
  COMPRAS:    { label: 'Compras',    className: 'border-blue-200 bg-blue-50 text-blue-700' },
  FINANCEIRO: { label: 'Financeiro', className: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
  DEMANDAS:   { label: 'Demandas',   className: 'border-amber-200 bg-amber-50 text-amber-700' },
  WORKFLOW:   { label: 'Workflow',   className: 'border-violet-200 bg-violet-50 text-violet-700' },
  ESTOQUE:    { label: 'Estoque',    className: 'border-orange-200 bg-orange-50 text-orange-700' },
  FISCAL:     { label: 'Fiscal',     className: 'border-rose-200 bg-rose-50 text-rose-700' },
}

export default function PapeisPage() {
  const toast = useToast()
  const [userSearch, setUserSearch] = useState('')
  const [appliedUserSearch, setAppliedUserSearch] = useState('')
  const [papelSearch, setPapelSearch] = useState('')
  const [selectedUser, setSelectedUser] = useState<EngineUser | null>(null)
  const [pageNumber, setPageNumber] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const [linkedPapelMap, setLinkedPapelMap] = useState<Map<string, number | string>>(new Map())
  const [toggling, setToggling] = useState<Set<string>>(new Set())

  const userParams = useMemo(() => ({
    pageNumber,
    pageSize,
    orderBy: 'nm_usuario,asc',
    ...(appliedUserSearch ? { nm_usuario: appliedUserSearch } : {}),
  }), [appliedUserSearch, pageNumber, pageSize])

  const usersQuery = useQuery({
    queryKey: ['papeis-page-users', userParams],
    queryFn: () => entityApi.getList<EngineUser>('users', userParams),
    staleTime: 10_000,
  })

  const allPapeisQuery = useQuery({
    queryKey: ['papeis-page-all-papeis'],
    queryFn: () => entityApi.getList<Papel>('vw_papel', { pageSize: 9999, orderBy: 'nm_modulo,nm_papel,asc' }),
    enabled: !!selectedUser,
    staleTime: 30_000,
  })

  const userPapeisQuery = useQuery({
    queryKey: ['papeis-page-user-papeis', selectedUser?.id_usuario],
    queryFn: () => entityApi.getList<UsuarioPapelLink>('vw_usuario_papel', {
      id_usuario: selectedUser!.id_usuario,
      pageSize: 9999,
    }),
    enabled: !!selectedUser?.id_usuario,
    staleTime: 5_000,
  })

  useEffect(() => {
    const map = new Map<string, number | string>()
    ;(userPapeisQuery.data?.data ?? []).forEach((link) => {
      map.set(String(link.id_papel), link.id_usuario_papel)
    })
    setLinkedPapelMap(map)
  }, [userPapeisQuery.data])

  const users = usersQuery.data?.data ?? []
  const totalElements = usersQuery.data?.totalElements ?? 0
  const totalPages = Math.max(1, Math.ceil(totalElements / pageSize))
  const allPapeis = allPapeisQuery.data?.data ?? []
  const filteredPapeis = papelSearch.trim()
    ? allPapeis.filter(
        (p) =>
          p.nm_papel?.toLowerCase().includes(papelSearch.trim().toLowerCase()) ||
          p.nm_modulo?.toLowerCase().includes(papelSearch.trim().toLowerCase()),
      )
    : allPapeis

  function applyUserSearch() {
    setPageNumber(1)
    setAppliedUserSearch(userSearch.trim())
  }

  function selectUser(user: EngineUser) {
    setSelectedUser(user)
    setPapelSearch('')
    setLinkedPapelMap(new Map())
  }

  async function togglePapel(papel: Papel) {
    if (!selectedUser?.id_usuario) return
    const papelKey = String(papel.id_papel)
    const linked = linkedPapelMap.has(papelKey)
    setToggling((prev) => new Set(prev).add(papelKey))

    try {
      if (linked) {
        const linkId = linkedPapelMap.get(papelKey)!
        await entityApi.remove('usuario_papel', linkId)
        setLinkedPapelMap((prev) => {
          const next = new Map(prev)
          next.delete(papelKey)
          return next
        })
        toast.success(`Papel "${papel.nm_papel}" removido.`)
      } else {
        const result = await entityApi.create<{ id_usuario_papel: number | string }>(
          'usuario_papel',
          { id_usuario: selectedUser.id_usuario, id_papel: papel.id_papel, fl_ativo: 'SIM' },
        )
        setLinkedPapelMap((prev) => new Map(prev).set(papelKey, result.data.id_usuario_papel))
        toast.success(`Papel "${papel.nm_papel}" vinculado.`)
      }
    } catch (err: unknown) {
      toast.error(readErrorMessage(err, 'Erro ao atualizar vínculo.'))
    } finally {
      setToggling((prev) => {
        const next = new Set(prev)
        next.delete(papelKey)
        return next
      })
    }
  }

  return (
    <AppShell title="Papeis e Usuários" subtitle="Vincule papeis organizacionais aos usuários do tenant.">
      <div className="min-h-full w-full bg-background p-3 sm:p-4">
        <div className="w-full space-y-4">
          <section className="rounded-lg border border-blue-100 bg-white p-4 shadow-sm shadow-blue-950/5">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-md bg-blue-700 text-white">
                <i className="bi bi-person-badge" aria-hidden />
              </div>
              <div>
                <h1 className="text-lg font-semibold text-slate-900">Papeis e Usuários</h1>
                <p className="text-sm text-slate-500">Selecione um usuário e ajuste seus papeis organizacionais.</p>
              </div>
            </div>
          </section>

          <div className="grid gap-4 lg:grid-cols-[minmax(360px,0.9fr)_minmax(0,1.1fr)]">
            {/* Painel esquerdo: Usuários */}
            <section className="rounded-lg border border-blue-100 bg-white shadow-sm shadow-blue-950/5">
              <div className="border-b border-slate-100 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 font-semibold text-slate-900">
                    <i className="bi bi-people text-blue-700" aria-hidden />
                    Usuários
                  </div>
                  <span className="text-xs font-medium text-slate-500">{totalElements} no total</span>
                </div>
                <div className="mt-3 flex gap-2">
                  <input
                    type="search"
                    value={userSearch}
                    onChange={(e) => setUserSearch(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && applyUserSearch()}
                    className={inputClass}
                    placeholder="Buscar por nome"
                  />
                  <button
                    type="button"
                    onClick={applyUserSearch}
                    title="Buscar"
                    className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-blue-700 text-white transition hover:bg-blue-800"
                  >
                    <i className="bi bi-search" aria-hidden />
                  </button>
                </div>
              </div>

              <div className="max-h-[calc(100vh-350px)] overflow-auto">
                <table className="w-full table-fixed border-separate border-spacing-0 text-sm">
                  <colgroup>
                    <col />
                  </colgroup>
                  <thead className="sticky top-0 z-10 bg-slate-50">
                    <tr>
                      <th className={thClass}>Nome / Email</th>
                    </tr>
                  </thead>
                  <tbody>
                    {usersQuery.isLoading ? (
                      <tr>
                        <td className="px-4 py-12 text-center text-sm text-slate-500">
                          <span className="mr-2 inline-block h-4 w-4 animate-spin rounded-full border-2 border-blue-700 border-t-transparent align-[-2px]" />
                          Carregando...
                        </td>
                      </tr>
                    ) : users.length > 0 ? (
                      users.map((user) => {
                        const selected = String(selectedUser?.id_usuario) === String(user.id_usuario)
                        return (
                          <tr key={user.id_usuario}>
                            <td className="border-b border-slate-100 p-2">
                              <button
                                type="button"
                                onClick={() => selectUser(user)}
                                className={`w-full rounded-md px-3 py-2 text-left transition ${selected ? 'bg-blue-50 text-blue-950 ring-1 ring-blue-200' : 'hover:bg-slate-50'}`}
                              >
                                <span className="block truncate text-sm font-semibold">
                                  {user.nm_usuario ?? user.username ?? user.email ?? user.id_usuario}
                                </span>
                                <span className="mt-0.5 block truncate text-xs text-slate-500">{user.email ?? '-'}</span>
                              </button>
                            </td>
                          </tr>
                        )
                      })
                    ) : (
                      <tr>
                        <td className="px-4 py-14 text-center">
                          <EmptyState icon="bi bi-person-x" title="Nenhum usuário encontrado" text="Ajuste a busca e tente novamente." />
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-col gap-3 border-t border-slate-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-slate-500">
                  Página <span className="font-semibold text-slate-700">{pageNumber}</span> de{' '}
                  <span className="font-semibold text-slate-700">{totalPages}</span>
                </p>
                <div className="flex items-center justify-end gap-2">
                  <button
                    className={pagerButtonClass}
                    onClick={() => setPageNumber((p) => Math.max(1, p - 1))}
                    disabled={pageNumber <= 1}
                  >
                    Anterior
                  </button>
                  <button
                    className={pagerButtonClass}
                    onClick={() => setPageNumber((p) => Math.min(totalPages, p + 1))}
                    disabled={pageNumber >= totalPages}
                  >
                    Próxima
                  </button>
                  <select
                    value={pageSize}
                    onChange={(e) => {
                      setPageSize(Number(e.target.value))
                      setPageNumber(1)
                    }}
                    className="h-9 rounded-md border border-slate-200 bg-white px-2 text-sm outline-none focus:ring-2 focus:ring-blue-100"
                  >
                    {pageSizes.map((size) => (
                      <option key={size} value={size}>{size}</option>
                    ))}
                  </select>
                </div>
              </div>
            </section>

            {/* Painel direito: Papeis */}
            <section className="rounded-lg border border-blue-100 bg-white shadow-sm shadow-blue-950/5">
              <div className="border-b border-slate-100 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="flex items-center gap-2 font-semibold text-slate-900">
                      <i className="bi bi-person-badge text-blue-700" aria-hidden />
                      {selectedUser
                        ? `Papeis de ${selectedUser.nm_usuario ?? selectedUser.email ?? selectedUser.id_usuario}`
                        : 'Papeis'}
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      {selectedUser
                        ? `${linkedPapelMap.size} vínculo(s) ativo(s)`
                        : 'Selecione um usuário para carregar os papeis.'}
                    </p>
                  </div>
                  <input
                    type="search"
                    value={papelSearch}
                    onChange={(e) => setPapelSearch(e.target.value)}
                    disabled={!selectedUser}
                    className={`${inputClass} sm:max-w-72`}
                    placeholder="Buscar papel ou módulo"
                  />
                </div>
              </div>

              {!selectedUser ? (
                <div className="flex min-h-80 items-center justify-center p-6">
                  <EmptyState
                    icon="bi bi-person-check"
                    title="Selecione um usuário"
                    text="Os papeis disponíveis aparecem aqui após a seleção."
                  />
                </div>
              ) : allPapeisQuery.isLoading || userPapeisQuery.isLoading ? (
                <div className="py-16 text-center text-sm text-slate-500">
                  <span className="mr-2 inline-block h-4 w-4 animate-spin rounded-full border-2 border-blue-700 border-t-transparent align-[-2px]" />
                  Carregando papeis...
                </div>
              ) : (
                <div className="max-h-[calc(100vh-350px)] overflow-auto">
                  <table className="w-full table-fixed border-separate border-spacing-0 text-sm">
                    <colgroup>
                      <col />
                      <col className="w-32" />
                      <col className="w-20" />
                    </colgroup>
                    <thead className="sticky top-0 z-10 bg-slate-50">
                      <tr>
                        <th className={thClass}>Papel</th>
                        <th className={thClass}>Módulo</th>
                        <th className={`${thClass} text-center`}>Ativo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredPapeis.length > 0 ? (
                        filteredPapeis.map((papel) => {
                          const key = String(papel.id_papel)
                          const linked = linkedPapelMap.has(key)
                          const busy = toggling.has(key)
                          return (
                            <tr key={key} className="hover:bg-slate-50">
                              <td className="border-b border-slate-100 px-4 py-3">
                                <p className={`truncate text-sm ${linked ? 'font-semibold text-slate-950' : 'font-medium text-slate-800'}`}>
                                  {papel.nm_papel}
                                </p>
                                <p className="mt-0.5 truncate text-xs text-slate-500">{papel.ds_papel ?? '-'}</p>
                              </td>
                              <td className="border-b border-slate-100 px-4 py-3">
                                <ModuleBadge modulo={papel.nm_modulo} />
                              </td>
                              <td className="border-b border-slate-100 px-4 py-3 text-center">
                                {busy ? (
                                  <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-blue-700 border-t-transparent" />
                                ) : (
                                  <Switch checked={linked} onChange={() => togglePapel(papel)} />
                                )}
                              </td>
                            </tr>
                          )
                        })
                      ) : (
                        <tr>
                          <td colSpan={3} className="px-4 py-14 text-center">
                            <EmptyState
                              icon="bi bi-person-badge"
                              title="Nenhum papel encontrado"
                              text="Ajuste a busca ou cadastre papeis ativos."
                            />
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>
        </div>
      </div>
    </AppShell>
  )
}

// ─── CSS classes ──────────────────────────────────────────────────────────────

const inputClass =
  'h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400'
const pagerButtonClass =
  'rounded-md border border-slate-200 px-3 py-1.5 text-sm text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50'
const thClass =
  'border-b border-slate-200 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500'

// ─── Componentes internos ─────────────────────────────────────────────────────

function ModuleBadge({ modulo }: { modulo?: string | null }) {
  const key = (modulo ?? '').toUpperCase()
  const meta = moduleMeta[key] ?? {
    label: modulo ?? '-',
    className: 'border-slate-200 bg-slate-50 text-slate-700',
  }
  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${meta.className}`}>
      {meta.label}
    </span>
  )
}

function Switch({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      type="button"
      onClick={onChange}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition ${checked ? 'bg-blue-700' : 'bg-slate-300'}`}
      title={checked ? 'Remover vínculo' : 'Vincular papel'}
    >
      <span
        className={`inline-block h-4 w-4 rounded-full bg-white shadow transition ${checked ? 'translate-x-4' : 'translate-x-0.5'}`}
      />
    </button>
  )
}

function EmptyState({ icon, title, text }: { icon: string; title: string; text: string }) {
  return (
    <div>
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-blue-700 ring-1 ring-blue-100">
        <i className={`${icon} text-xl`} aria-hidden />
      </div>
      <p className="mt-3 text-sm font-semibold text-slate-800">{title}</p>
      <p className="mt-1 text-xs text-slate-500">{text}</p>
    </div>
  )
}
