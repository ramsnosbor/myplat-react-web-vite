import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { AppShell } from '@/components/layout/AppShell'
import { useToast } from '@/components/ui/Toast'
import { userAdminApi, type UserAdminRecord } from '@/api/user-admin.api'
import { ssoAccessApi, type AccessProfile, type PerfilTipo } from '@/api/sso-access.api'
import { getProfileId, readErrorMessage } from './PerfisAcessoPage'

const pageSizes = [10, 25, 50, 100]
const typeMeta: Record<string, { label: string; className: string }> = {
  leitor: { label: 'Leitor', className: 'border-sky-200 bg-sky-50 text-sky-700' },
  editor: { label: 'Editor', className: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
  admin: { label: 'Admin', className: 'border-amber-200 bg-amber-50 text-amber-700' },
  cliente: { label: 'Cliente', className: 'border-violet-200 bg-violet-50 text-violet-700' },
}

export default function UsuarioPerfisPage() {
  const navigate = useNavigate()
  const toast = useToast()
  const [userSearch, setUserSearch] = useState('')
  const [appliedUserSearch, setAppliedUserSearch] = useState('')
  const [profileSearch, setProfileSearch] = useState('')
  const [selectedUser, setSelectedUser] = useState<UserAdminRecord | null>(null)
  const [pageNumber, setPageNumber] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const [linkedProfileIds, setLinkedProfileIds] = useState<Set<string>>(new Set())
  const [toggling, setToggling] = useState<Set<string>>(new Set())

  const userParams = useMemo(() => ({
    pageNumber,
    pageSize,
    ...(appliedUserSearch ? { search: appliedUserSearch, email: appliedUserSearch, name: appliedUserSearch } : {}),
  }), [appliedUserSearch, pageNumber, pageSize])

  const usersQuery = useQuery({
    queryKey: ['tenant-users-profile-link', userParams],
    queryFn: () => userAdminApi.getTenantUsers(userParams),
    staleTime: 10_000,
  })

  const profilesQuery = useQuery({
    queryKey: ['active-access-profiles'],
    queryFn: () => ssoAccessApi.getProfiles({ pageSize: 9999, ativo: 'S', orderBy: 'nome,asc' }),
    enabled: !!selectedUser,
    staleTime: 30_000,
  })

  const userProfilesQuery = useQuery({
    queryKey: ['user-access-profiles', selectedUser?.id],
    queryFn: () => ssoAccessApi.getUserProfiles(selectedUser?.id ?? ''),
    enabled: !!selectedUser?.id,
    staleTime: 5_000,
  })

  useEffect(() => {
    const ids = new Set((userProfilesQuery.data ?? []).map((profile) => String(getLinkedProfileId(profile))))
    setLinkedProfileIds(ids)
  }, [userProfilesQuery.data])

  const users = usersQuery.data?.table ?? []
  const totalElements = usersQuery.data?.size ?? 0
  const totalPages = Math.max(1, Math.ceil(totalElements / pageSize))
  const profilesResponse = profilesQuery.data
  const allProfiles = Array.isArray(profilesResponse) ? profilesResponse : profilesResponse?.data ?? profilesResponse?.table ?? []
  const filteredProfiles = profileSearch.trim()
    ? allProfiles.filter((profile) => profile.nome?.toLowerCase().includes(profileSearch.trim().toLowerCase()))
    : allProfiles

  function applyUserSearch() {
    setPageNumber(1)
    setAppliedUserSearch(userSearch.trim())
  }

  function selectUser(user: UserAdminRecord) {
    setSelectedUser(user)
    setProfileSearch('')
  }

  async function toggleProfile(profile: AccessProfile) {
    if (!selectedUser?.id) return
    const profileId = getProfileId(profile)
    if (!profileId) {
      toast.error('Perfil sem identificador.')
      return
    }

    const key = String(profileId)
    const linked = linkedProfileIds.has(key)
    setToggling((prev) => new Set(prev).add(key))

    try {
      if (linked) {
        await ssoAccessApi.removeUserProfile(selectedUser.id, profileId)
        setLinkedProfileIds((prev) => {
          const next = new Set(prev)
          next.delete(key)
          return next
        })
        toast.success(`Perfil "${profile.nome}" removido.`)
      } else {
        await ssoAccessApi.addUserProfile(selectedUser.id, profileId)
        setLinkedProfileIds((prev) => new Set(prev).add(key))
        toast.success(`Perfil "${profile.nome}" vinculado.`)
      }
    } catch (err: unknown) {
      toast.error(readErrorMessage(err, 'Erro ao atualizar vinculo.'))
    } finally {
      setToggling((prev) => {
        const next = new Set(prev)
        next.delete(key)
        return next
      })
    }
  }

  return (
    <AppShell title="Usuarios e Perfis" subtitle="Vinculo entre usuarios e perfis de acesso.">
      <div className="min-h-full bg-background p-4 sm:p-6">
        <div className="mx-auto max-w-7xl space-y-4">
          <section className="rounded-lg border border-blue-100 bg-white p-4 shadow-sm shadow-blue-950/5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-md bg-blue-700 text-white">
                  <i className="bi bi-person-lock" aria-hidden />
                </div>
                <div>
                  <h1 className="text-lg font-semibold text-slate-900">Usuarios e Perfis</h1>
                  <p className="text-sm text-slate-500">Selecione um usuario e ajuste seus perfis de acesso.</p>
                </div>
              </div>
              <button type="button" onClick={() => navigate('/perfis-acesso')} className={secondaryButtonClass}>
                <i className="bi bi-shield-check" aria-hidden />
                Perfis de Acesso
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
                    placeholder="Buscar por nome ou email"
                  />
                  <button type="button" onClick={applyUserSearch} title="Buscar" className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-blue-700 text-white transition hover:bg-blue-800">
                    <i className="bi bi-search" aria-hidden />
                  </button>
                </div>
              </div>

              <div className="max-h-[calc(100vh-390px)] overflow-auto">
                <table className="w-full table-fixed border-separate border-spacing-0 text-sm">
                  <colgroup>
                    <col />
                  </colgroup>
                  <thead className="sticky top-0 z-10 bg-slate-50">
                    <tr>
                      <th className={thClass}>Email / Nome</th>
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
                        const selected = selectedUser?.id === user.id
                        return (
                          <tr key={user.id}>
                            <td className="border-b border-slate-100 p-2">
                              <button
                                type="button"
                                onClick={() => selectUser(user)}
                                className={`w-full rounded-md px-3 py-2 text-left transition ${selected ? 'bg-blue-50 text-blue-950 ring-1 ring-blue-200' : 'hover:bg-slate-50'}`}
                              >
                                <span className="block truncate text-sm font-semibold">{user.email ?? user.name ?? user.nome ?? user.id}</span>
                                <span className="mt-0.5 block truncate text-xs text-slate-500">{user.name ?? user.nome ?? '-'}</span>
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
                <p className="text-sm text-slate-500">Pagina <span className="font-semibold text-slate-700">{pageNumber}</span> de <span className="font-semibold text-slate-700">{totalPages}</span></p>
                <div className="flex items-center justify-end gap-2">
                  <button className={pagerButtonClass} onClick={() => setPageNumber((p) => Math.max(1, p - 1))} disabled={pageNumber <= 1}>Anterior</button>
                  <button className={pagerButtonClass} onClick={() => setPageNumber((p) => Math.min(totalPages, p + 1))} disabled={pageNumber >= totalPages}>Proxima</button>
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

            <section className="rounded-lg border border-blue-100 bg-white shadow-sm shadow-blue-950/5">
              <div className="border-b border-slate-100 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="flex items-center gap-2 font-semibold text-slate-900">
                      <i className="bi bi-shield-lock text-blue-700" aria-hidden />
                      {selectedUser ? `Perfis de ${selectedUser.email ?? selectedUser.name ?? selectedUser.id}` : 'Perfis'}
                    </div>
                    <p className="mt-1 text-xs text-slate-500">{selectedUser ? `${linkedProfileIds.size} vinculo(s) ativo(s)` : 'Selecione um usuario para carregar os perfis.'}</p>
                  </div>
                  <input
                    type="search"
                    value={profileSearch}
                    onChange={(e) => setProfileSearch(e.target.value)}
                    disabled={!selectedUser}
                    className={`${inputClass} sm:max-w-72`}
                    placeholder="Buscar perfil"
                  />
                </div>
              </div>

              {!selectedUser ? (
                <div className="flex min-h-80 items-center justify-center p-6">
                  <EmptyState icon="bi bi-person-check" title="Selecione um usuario" text="Os perfis disponiveis aparecem aqui depois da selecao." />
                </div>
              ) : profilesQuery.isLoading || userProfilesQuery.isLoading ? (
                <div className="py-16 text-center text-sm text-slate-500">
                  <span className="mr-2 inline-block h-4 w-4 animate-spin rounded-full border-2 border-blue-700 border-t-transparent align-[-2px]" />
                  Carregando perfis...
                </div>
              ) : (
                <div className="max-h-[calc(100vh-390px)] overflow-auto">
                  <table className="w-full table-fixed border-separate border-spacing-0 text-sm">
                    <colgroup>
                      <col />
                      <col className="w-32" />
                      <col className="w-24" />
                    </colgroup>
                    <thead className="sticky top-0 z-10 bg-slate-50">
                      <tr>
                        <th className={thClass}>Perfil</th>
                        <th className={thClass}>Tipo</th>
                        <th className={`${thClass} text-center`}>Ativo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredProfiles.length > 0 ? (
                        filteredProfiles.map((profile) => {
                          const profileId = getProfileId(profile)
                          const key = String(profileId)
                          const linked = linkedProfileIds.has(key)
                          const busy = toggling.has(key)
                          return (
                            <tr key={key} className="hover:bg-slate-50">
                              <td className="border-b border-slate-100 px-4 py-3">
                                <p className={`truncate text-sm ${linked ? 'font-semibold text-slate-950' : 'font-medium text-slate-800'}`}>{profile.nome}</p>
                                <p className="mt-0.5 truncate text-xs text-slate-500">{profile.descricao ?? '-'}</p>
                              </td>
                              <td className="border-b border-slate-100 px-4 py-3">
                                <TypeBadge tipo={profile.tipo} />
                              </td>
                              <td className="border-b border-slate-100 px-4 py-3 text-center">
                                {busy ? (
                                  <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-blue-700 border-t-transparent" />
                                ) : (
                                  <Switch checked={linked} onChange={() => toggleProfile(profile)} />
                                )}
                              </td>
                            </tr>
                          )
                        })
                      ) : (
                        <tr>
                          <td colSpan={3} className="px-4 py-14 text-center">
                            <EmptyState icon="bi bi-shield-slash" title="Nenhum perfil encontrado" text="Ajuste a busca ou cadastre perfis ativos." />
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

const inputClass = 'h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400'
const secondaryButtonClass = 'inline-flex h-9 items-center gap-2 rounded-md border border-slate-200 px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50'
const pagerButtonClass = 'rounded-md border border-slate-200 px-3 py-1.5 text-sm text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50'
const thClass = 'border-b border-slate-200 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500'

function TypeBadge({ tipo }: { tipo: PerfilTipo }) {
  const meta = typeMeta[String(tipo)] ?? { label: String(tipo || '-'), className: 'border-slate-200 bg-slate-50 text-slate-700' }
  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${meta.className}`}>{meta.label}</span>
}

function getLinkedProfileId(profile: { id?: number | string; idPerfil?: number | string; id_perfil?: number | string }) {
  return profile.id_perfil ?? profile.idPerfil ?? profile.id
}

function Switch({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      type="button"
      onClick={onChange}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition ${checked ? 'bg-blue-700' : 'bg-slate-300'}`}
      title={checked ? 'Remover vinculo' : 'Vincular perfil'}
    >
      <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition ${checked ? 'translate-x-4' : 'translate-x-0.5'}`} />
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
