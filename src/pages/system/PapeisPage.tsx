import { useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
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

interface PapelComVinculo {
  id_papel: number | string
  nm_papel: string
  ds_papel?: string | null
  nm_modulo?: string | null
  fl_ativo?: string
  id_usuario: number | string
  id_usuario_papel?: number | string | null
  fl_vinculado: 'SIM' | 'NAO'
}

const pageSizes = [10, 25, 50, 100]

const moduleMeta: Record<string, string> = {
  COMPRAS: 'border-blue-200 bg-blue-50 text-blue-700',
  FINANCEIRO: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  DEMANDAS: 'border-amber-200 bg-amber-50 text-amber-700',
  WORKFLOW: 'border-violet-200 bg-violet-50 text-violet-700',
  ESTOQUE: 'border-orange-200 bg-orange-50 text-orange-700',
  FISCAL: 'border-rose-200 bg-rose-50 text-rose-700',
}

export default function PapeisPage() {
  const toast = useToast()
  const queryClient = useQueryClient()
  const [novoPapelOpen, setNovoPapelOpen] = useState(false)
  const [userSearch, setUserSearch] = useState('')
  const [appliedUserSearch, setAppliedUserSearch] = useState('')
  const [papelSearch, setPapelSearch] = useState('')
  const [selectedUser, setSelectedUser] = useState<EngineUser | null>(null)
  const [pageNumber, setPageNumber] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const [linkedPapelMap, setLinkedPapelMap] = useState<Map<string, number | string>>(new Map())
  const [toggling, setToggling] = useState<Set<string>>(new Set())

  const usersQuery = useQuery({
    queryKey: ['engine-users-papeis', appliedUserSearch, pageNumber, pageSize],
    queryFn: () =>
      entityApi.getList<EngineUser>('users', {
        pageNumber,
        pageSize,
        orderBy: 'nm_usuario,asc',
        ...(appliedUserSearch ? { nm_usuario: appliedUserSearch } : {}),
      }),
    staleTime: 10_000,
  })

  const papeisQuery = useQuery({
    queryKey: ['papeis-por-usuario', selectedUser?.id_usuario],
    queryFn: () =>
      entityApi.getList<PapelComVinculo>('vw_papeis_por_usuario', {
        id_usuario: selectedUser!.id_usuario,
        pageSize: 9999,
      }),
    enabled: !!selectedUser?.id_usuario,
    staleTime: 5_000,
  })

  useEffect(() => {
    const map = new Map<string, number | string>()
    for (const item of papeisQuery.data?.data ?? []) {
      if (item.id_usuario_papel) {
        map.set(String(item.id_papel), item.id_usuario_papel)
      }
    }
    setLinkedPapelMap(map)
  }, [papeisQuery.data])

  const users = usersQuery.data?.data ?? []
  const totalElements = usersQuery.data?.totalElements ?? 0
  const totalPages = Math.max(1, Math.ceil(totalElements / pageSize))

  const allPapeis = papeisQuery.data?.data ?? []
  const filteredPapeis = papelSearch.trim()
    ? allPapeis.filter(
        (p) =>
          p.nm_papel?.toLowerCase().includes(papelSearch.toLowerCase()) ||
          p.nm_modulo?.toLowerCase().includes(papelSearch.toLowerCase()),
      )
    : allPapeis

  function applyUserSearch() {
    setPageNumber(1)
    setAppliedUserSearch(userSearch.trim())
  }

  function selectUser(user: EngineUser) {
    setSelectedUser(user)
    setPapelSearch('')
  }

  async function togglePapel(papel: PapelComVinculo) {
    if (!selectedUser?.id_usuario) return
    const papelKey = String(papel.id_papel)
    const linked = linkedPapelMap.has(papelKey)
    setToggling((prev) => new Set(prev).add(papelKey))

    try {
      if (linked) {
        const idUsuarioPapel = linkedPapelMap.get(papelKey)!
        await entityApi.remove('usuario_papel', idUsuarioPapel)
        setLinkedPapelMap((prev) => {
          const next = new Map(prev)
          next.delete(papelKey)
          return next
        })
        toast.success(`Papel "${papel.nm_papel}" removido.`)
      } else {
        const result = await entityApi.create<{ id_usuario_papel: number | string }>('usuario_papel', {
          id_usuario: selectedUser.id_usuario,
          id_papel: papel.id_papel,
          fl_ativo: 'SIM',
        })
        setLinkedPapelMap((prev) => new Map(prev).set(papelKey, result.data.id_usuario_papel))
        toast.success(`Papel "${papel.nm_papel}" vinculado.`)
      }
    } catch (err: unknown) {
      toast.error(readErrorMessage(err, 'Erro ao atualizar vinculo.'))
    } finally {
      setToggling((prev) => {
        const next = new Set(prev)
        next.delete(papelKey)
        return next
      })
    }
  }

  return (
    <AppShell title="Papeis e Usuarios" subtitle="Vinculo entre usuarios e papeis organizacionais.">
      <div className="min-h-full w-full bg-background p-3 sm:p-4">
        <div className="w-full space-y-4">
          <section className="rounded-lg border border-blue-100 bg-white p-4 shadow-sm shadow-blue-950/5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-md bg-blue-700 text-white">
                  <i className="bi bi-person-badge" aria-hidden />
                </div>
                <div>
                  <h1 className="text-lg font-semibold text-slate-900">Papeis e Usuarios</h1>
                  <p className="text-sm text-slate-500">Selecione um usuario e ajuste seus papeis organizacionais.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setNovoPapelOpen(true)}
                className="inline-flex h-9 items-center gap-2 rounded-md bg-blue-700 px-3 text-sm font-semibold text-white transition hover:bg-blue-800"
              >
                <i className="bi bi-plus-circle" aria-hidden />
                Novo Papel
              </button>
            </div>
          </section>

          <div className="grid gap-4 lg:grid-cols-[minmax(360px,0.9fr)_minmax(0,1.1fr)]">
            <section className="rounded-lg border border-blue-100 bg-white shadow-sm shadow-blue-950/5">
              <div className="border-b border-slate-100 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 font-semibold text-slate-900">
                    <i className="bi bi-people text-blue-700" aria-hidden />
                    Usuarios
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
                      <th className={thClass}>Usuario</th>
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
                                  {user.nm_usuario ?? user.email ?? user.username ?? String(user.id_usuario)}
                                </span>
                                {user.email && (
                                  <span className="mt-0.5 block truncate text-xs text-slate-500">{user.email}</span>
                                )}
                              </button>
                            </td>
                          </tr>
                        )
                      })
                    ) : (
                      <tr>
                        <td className="px-4 py-14 text-center">
                          <EmptyState icon="bi bi-person-x" title="Nenhum usuario encontrado" text="Ajuste a busca e tente novamente." />
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-col gap-3 border-t border-slate-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-slate-500">
                  Pagina <span className="font-semibold text-slate-700">{pageNumber}</span> de{' '}
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
                    Proxima
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
                      <option key={size} value={size}>
                        {size}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </section>

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
                        ? `${linkedPapelMap.size} vinculo(s) ativo(s)`
                        : 'Selecione um usuario para carregar os papeis.'}
                    </p>
                  </div>
                  <input
                    type="search"
                    value={papelSearch}
                    onChange={(e) => setPapelSearch(e.target.value)}
                    disabled={!selectedUser}
                    className={`${inputClass} sm:max-w-72`}
                    placeholder="Buscar papel ou modulo"
                  />
                </div>
              </div>

              {!selectedUser ? (
                <div className="flex min-h-80 items-center justify-center p-6">
                  <EmptyState
                    icon="bi bi-person-check"
                    title="Selecione um usuario"
                    text="Os papeis disponiveis aparecem aqui depois da selecao."
                  />
                </div>
              ) : papeisQuery.isLoading ? (
                <div className="py-16 text-center text-sm text-slate-500">
                  <span className="mr-2 inline-block h-4 w-4 animate-spin rounded-full border-2 border-blue-700 border-t-transparent align-[-2px]" />
                  Carregando papeis...
                </div>
              ) : (
                <div className="max-h-[calc(100vh-350px)] overflow-auto">
                  <table className="w-full table-fixed border-separate border-spacing-0 text-sm">
                    <colgroup>
                      <col />
                      <col className="w-36" />
                      <col className="w-24" />
                    </colgroup>
                    <thead className="sticky top-0 z-10 bg-slate-50">
                      <tr>
                        <th className={thClass}>Papel</th>
                        <th className={thClass}>Modulo</th>
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
                                {papel.ds_papel && (
                                  <p className="mt-0.5 truncate text-xs text-slate-500">{papel.ds_papel}</p>
                                )}
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
      {novoPapelOpen && (
        <NovoPapelModal
          onClose={() => setNovoPapelOpen(false)}
          onCreated={() => {
            queryClient.invalidateQueries({ queryKey: ['papeis-por-usuario'] })
            setNovoPapelOpen(false)
          }}
        />
      )}
    </AppShell>
  )
}

const inputClass =
  'h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400'
const pagerButtonClass =
  'rounded-md border border-slate-200 px-3 py-1.5 text-sm text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50'
const thClass =
  'border-b border-slate-200 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500'

function ModuleBadge({ modulo }: { modulo?: string | null }) {
  if (!modulo) return <span className="text-xs text-slate-400">—</span>
  const className = moduleMeta[modulo.toUpperCase()] ?? 'border-slate-200 bg-slate-50 text-slate-700'
  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${className}`}>{modulo}</span>
  )
}

function Switch({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      type="button"
      onClick={onChange}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition ${checked ? 'bg-blue-700' : 'bg-slate-300'}`}
      title={checked ? 'Remover vinculo' : 'Vincular papel'}
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

interface NovoPapelForm {
  nm_papel: string
  nm_modulo: string
  ds_papel: string
  fl_ativo: 'SIM' | 'NAO'
}

const emptyForm: NovoPapelForm = { nm_papel: '', nm_modulo: '', ds_papel: '', fl_ativo: 'SIM' }

function NovoPapelModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const toast = useToast()
  const [form, setForm] = useState<NovoPapelForm>(emptyForm)
  const [saving, setSaving] = useState(false)
  const firstRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    firstRef.current?.focus()
  }, [])

  function set(field: keyof NovoPapelForm, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.nm_papel.trim()) return
    setSaving(true)
    try {
      await entityApi.create('papel', {
        nm_papel: form.nm_papel.trim(),
        nm_modulo: form.nm_modulo.trim() || null,
        ds_papel: form.ds_papel.trim() || null,
        fl_ativo: form.fl_ativo,
      })
      toast.success(`Papel "${form.nm_papel}" criado.`)
      onCreated()
    } catch (err: unknown) {
      toast.error(readErrorMessage(err, 'Erro ao criar papel.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg overflow-hidden rounded-xl border border-blue-100 bg-white shadow-2xl shadow-blue-950/25"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-blue-700 text-white">
              <i className="bi bi-person-badge" aria-hidden />
            </div>
            <h2 className="text-base font-semibold text-slate-900">Novo Papel</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
          >
            <i className="bi bi-x-lg text-sm" aria-hidden />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 px-6 py-5">
          <div>
            <label className={labelClass}>
              Nome <span className="text-red-500">*</span>
            </label>
            <input
              ref={firstRef}
              type="text"
              value={form.nm_papel}
              onChange={(e) => set('nm_papel', e.target.value)}
              className={inputClass}
              placeholder="Ex: Aprovador de Compras"
              required
            />
          </div>

          <div>
            <label className={labelClass}>Módulo</label>
            <input
              type="text"
              value={form.nm_modulo}
              onChange={(e) => set('nm_modulo', e.target.value.toUpperCase())}
              className={inputClass}
              placeholder="Ex: COMPRAS, FINANCEIRO, DEMANDAS"
            />
          </div>

          <div>
            <label className={labelClass}>Descrição</label>
            <input
              type="text"
              value={form.ds_papel}
              onChange={(e) => set('ds_papel', e.target.value)}
              className={inputClass}
              placeholder="Descreva a responsabilidade deste papel"
            />
          </div>

          <div className="flex items-center gap-3">
            <Switch
              checked={form.fl_ativo === 'SIM'}
              onChange={() => set('fl_ativo', form.fl_ativo === 'SIM' ? 'NAO' : 'SIM')}
            />
            <span className="text-sm text-slate-700">Ativo</span>
          </div>

          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
            <button type="button" onClick={onClose} className="rounded-md border border-slate-200 px-4 py-2 text-sm text-slate-700 transition hover:bg-slate-50">
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving || !form.nm_papel.trim()}
              className="inline-flex items-center gap-2 rounded-md bg-blue-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving && <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />}
              Salvar
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

const labelClass = 'mb-1.5 block text-sm font-medium text-slate-700'
