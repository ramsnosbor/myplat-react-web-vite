import { Fragment, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { authApi, type MenuItemDefinition } from '@/api/auth.api'
import { ssoAccessApi, type AccessProfile, type MenuNivel, type PerfilTipo } from '@/api/sso-access.api'
import { AppShell } from '@/components/layout/AppShell'
import { useToast } from '@/components/ui/Toast'
import { getProfileId, readErrorMessage } from './PerfisAcessoPage'

type TabKey = 'dados' | 'menus' | 'acoes'
type NivelMap = Record<string, MenuNivel>
type AcoesMap = Record<string, Record<string, boolean>>

interface MenuLeaf extends MenuItemDefinition {
  id_menu?: number
  menu?: string
}

const actions = [
  { key: 'criar', label: 'Criar', defaultLeitor: false, defaultEditor: true },
  { key: 'editar', label: 'Editar', defaultLeitor: false, defaultEditor: true },
  { key: 'excluir', label: 'Excluir', defaultLeitor: false, defaultEditor: false },
  { key: 'aprovar', label: 'Aprovar', defaultLeitor: false, defaultEditor: false },
  { key: 'rejeitar', label: 'Rejeitar', defaultLeitor: false, defaultEditor: false },
  { key: 'cancelar', label: 'Cancelar', defaultLeitor: false, defaultEditor: false },
  { key: 'exportar', label: 'Exportar', defaultLeitor: true, defaultEditor: true },
  { key: 'imprimir', label: 'Imprimir', defaultLeitor: true, defaultEditor: true },
  { key: 'configurar', label: 'Configurar', defaultLeitor: false, defaultEditor: false },
  { key: 'auditar', label: 'Auditar', defaultLeitor: true, defaultEditor: true },
]

const levels: Array<{ value: MenuNivel; label: string }> = [
  { value: 'sem_acesso', label: 'Sem acesso' },
  { value: 'leitor', label: 'Leitor' },
  { value: 'editor', label: 'Editor' },
]

export default function PerfisAcessoFormPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const toast = useToast()
  const profileEdit = (location.state as { perfil?: AccessProfile } | null)?.perfil ?? null
  const isEdit = !!profileEdit
  const [tab, setTab] = useState<TabKey>('dados')
  const [saving, setSaving] = useState(false)
  const [menuSearch, setMenuSearch] = useState('')
  const [nivelFilter, setNivelFilter] = useState<MenuNivel | 'todos'>('todos')
  const [form, setForm] = useState({
    nome: profileEdit?.nome ?? '',
    descricao: profileEdit?.descricao ?? '',
    tipo: profileEdit?.tipo ?? 'leitor',
    ativo: profileEdit?.ativo ?? 'S',
    idMenuHome: String(profileEdit?.id_menu_home ?? profileEdit?.idMenuHome ?? ''),
  })
  const [nivelMap, setNivelMap] = useState<NivelMap>({})
  const [acoesMap, setAcoesMap] = useState<AcoesMap>({})

  const modulesQuery = useQuery({
    queryKey: ['system-modules-full'],
    queryFn: authApi.getSystemModules,
    staleTime: 60_000,
  })

  const { allMenus, allItems } = useMemo(() => {
    const seen = new Set<string>()
    const flat = (modulesQuery.data ?? []).flatMap((mod) => mod.menus ?? []).map((item) => ({
      ...item,
      menu: (item as MenuLeaf).menu ?? item.label,
    })) as MenuLeaf[]

    const unique = flat.filter((item) => {
      const id = getMenuId(item)
      if (!id || seen.has(String(id))) return false
      seen.add(String(id))
      return true
    })

    const leaves = unique.filter((item) => {
      const name = getMenuName(item)
      return !unique.some((candidate) => candidate.parentmenu === name)
    })

    return { allMenus: leaves, allItems: unique }
  }, [modulesQuery.data])

  useEffect(() => {
    if (!isEdit || allMenus.length === 0) return
    const idPerfil = getProfileId(profileEdit)
    if (!idPerfil) return
    const perfilId = idPerfil

    async function loadPermissions() {
      try {
        const [menus, actionPermissions] = await Promise.all([
          ssoAccessApi.getMenuPermissions(perfilId),
          ssoAccessApi.getActionPermissions(perfilId),
        ])

        const nextNivel: NivelMap = {}
        menus.forEach((permission) => {
          const id = permission.id_menu ?? permission.idMenu
          if (id) nextNivel[String(id)] = permission.nivel ?? 'sem_acesso'
        })
        setNivelMap(nextNivel)

        const nextAcoes: AcoesMap = {}
        actionPermissions.forEach((permission) => {
          const id = permission.id_menu ?? permission.idMenu
          if (!id) return
          const key = String(id)
          nextAcoes[key] = { ...(nextAcoes[key] ?? {}), [permission.acao]: permission.permitido === 'S' || permission.permitido === true }
        })
        setAcoesMap(nextAcoes)
      } catch (err: unknown) {
        toast.error(readErrorMessage(err, 'Erro ao carregar permissoes do perfil.'))
      }
    }

    loadPermissions()
  }, [allMenus.length, isEdit, profileEdit, toast])

  const groups = useMemo(() => {
    const search = menuSearch.trim().toLowerCase()
    const grouped = allMenus.reduce<Record<string, MenuLeaf[]>>((acc, menu) => {
      const id = getMenuId(menu)
      const level = id ? nivelMap[String(id)] ?? 'sem_acesso' : 'sem_acesso'
      const matchesSearch = !search || getMenuName(menu).toLowerCase().includes(search)
      const matchesLevel = nivelFilter === 'todos' || level === nivelFilter
      if (!matchesSearch || !matchesLevel) return acc
      const key = menu.parentmenu ?? '__root__'
      acc[key] = [...(acc[key] ?? []), menu]
      return acc
    }, {})

    return Object.entries(grouped).sort(([a], [b]) => {
      if (a === '__root__') return 1
      if (b === '__root__') return -1
      return a.localeCompare(b, 'pt-BR')
    })
  }, [allMenus, menuSearch, nivelFilter, nivelMap])

  const menusWithAccess = allMenus.filter((menu) => {
    const id = getMenuId(menu)
    return id && (nivelMap[String(id)] ?? 'sem_acesso') !== 'sem_acesso'
  })

  function handleNivelChange(menu: MenuLeaf, level: MenuNivel) {
    const id = getMenuId(menu)
    if (!id) return
    const key = String(id)
    setNivelMap((prev) => ({ ...prev, [key]: level }))
    setAcoesMap((prev) => ({
      ...prev,
      [key]: level === 'sem_acesso' ? {} : defaultActionsFor(form.tipo, level),
    }))
  }

  function setAllInGroup(parentName: string | null, level: MenuNivel) {
    allMenus
      .filter((menu) => parentName === null ? !menu.parentmenu : menu.parentmenu === parentName)
      .forEach((menu) => handleNivelChange(menu, level))
  }

  function handleActionChange(menu: MenuLeaf, action: string, checked: boolean) {
    const id = getMenuId(menu)
    if (!id) return
    const key = String(id)
    setAcoesMap((prev) => ({ ...prev, [key]: { ...(prev[key] ?? {}), [action]: checked } }))
  }

  async function saveProfile() {
    if (!form.nome.trim()) {
      toast.error('Informe o nome do perfil.')
      setTab('dados')
      return
    }

    setSaving(true)
    try {
      const selectedHome = form.idMenuHome ? Number(form.idMenuHome) : null
      const selectedHomeLevel = selectedHome ? nivelMap[String(selectedHome)] : 'sem_acesso'
      const payload = {
        nome: form.nome.trim(),
        descricao: form.descricao?.trim() ?? '',
        tipo: form.tipo,
        ativo: form.ativo,
        idMenuHome: form.tipo === 'cliente' && selectedHome && selectedHomeLevel !== 'sem_acesso' ? selectedHome : null,
      }

      let idPerfil = profileEdit ? getProfileId(profileEdit) : undefined
      if (isEdit && idPerfil) {
        await ssoAccessApi.updateProfile(idPerfil, payload)
      } else {
        const created = await ssoAccessApi.createProfile(payload)
        idPerfil = getProfileId(created)
      }

      if (!idPerfil) throw new Error('Perfil salvo sem identificador retornado.')

      await ssoAccessApi.setMenuPermissions(idPerfil, allMenus.map((menu) => {
        const id = getMenuId(menu) ?? 0
        return { idMenu: id, nivel: nivelMap[String(id)] ?? 'sem_acesso' }
      }))

      const actionPayload: Array<{ idMenu: number; acao: string; permitido: 'S' | 'N' }> = []
      Object.entries(acoesMap).forEach(([idMenu, values]) => {
        if ((nivelMap[idMenu] ?? 'sem_acesso') === 'sem_acesso') return
        actions.forEach((action) => {
          actionPayload.push({ idMenu: Number(idMenu), acao: action.key, permitido: values[action.key] ? 'S' : 'N' })
        })
      })
      await ssoAccessApi.setActionPermissions(idPerfil, actionPayload)

      toast.success(`Perfil ${isEdit ? 'atualizado' : 'criado'} com sucesso.`)
      navigate('/perfis-acesso')
    } catch (err: unknown) {
      toast.error(readErrorMessage(err, `Erro ao ${isEdit ? 'atualizar' : 'criar'} perfil.`))
    } finally {
      setSaving(false)
    }
  }

  return (
    <AppShell title={isEdit ? 'Editar Perfil' : 'Novo Perfil'} subtitle="Configure dados, menus e acoes permitidas.">
      <div className="min-h-full bg-background p-4 sm:p-6">
        <div className="mx-auto max-w-7xl space-y-4">
          <section className="rounded-lg border border-blue-100 bg-white p-4 shadow-sm shadow-blue-950/5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-md bg-blue-700 text-white">
                  <i className="bi bi-shield-lock" aria-hidden />
                </div>
                <div>
                  <h1 className="text-lg font-semibold text-slate-900">{isEdit ? `Editar Perfil: ${profileEdit?.nome}` : 'Novo Perfil de Acesso'}</h1>
                  <p className="text-sm text-slate-500">Defina o acesso por tela e por acao.</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => navigate('/perfis-acesso')} className={secondaryButtonClass}>
                  <i className="bi bi-arrow-left" aria-hidden />
                  Voltar
                </button>
                <button type="button" onClick={saveProfile} disabled={saving} className={primaryButtonClass}>
                  {saving ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" /> : <i className="bi bi-check-lg" aria-hidden />}
                  Salvar
                </button>
              </div>
            </div>
          </section>

          <section className="rounded-lg border border-blue-100 bg-white shadow-sm shadow-blue-950/5">
            <div className="flex flex-wrap border-b border-slate-100 px-4 pt-3">
              <TabButton active={tab === 'dados'} onClick={() => setTab('dados')} icon="bi bi-card-text" label="Dados Basicos" />
              <TabButton active={tab === 'menus'} onClick={() => setTab('menus')} icon="bi bi-menu-button-wide" label="Permissoes de Menu" />
              <TabButton active={tab === 'acoes'} onClick={() => setTab('acoes')} icon="bi bi-ui-checks-grid" label="Permissoes de Acao" />
            </div>

            <div className="p-4">
              {tab === 'dados' && (
                <div className="grid max-w-3xl gap-4 md:grid-cols-2">
                  <Field label="Nome *">
                    <input value={form.nome} onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))} className={inputClass} placeholder="Ex: Compras - Editor" maxLength={100} />
                  </Field>
                  <Field label="Tipo Base">
                    <select value={form.tipo} onChange={(e) => setForm((f) => ({ ...f, tipo: e.target.value as PerfilTipo }))} className={inputClass}>
                      <option value="leitor">Leitor - somente leitura por padrao</option>
                      <option value="editor">Editor - leitura e escrita por padrao</option>
                      <option value="admin">Admin - acesso total por padrao</option>
                      <option value="cliente">Cliente - usuarios externos</option>
                    </select>
                  </Field>
                  <Field label="Status">
                    <select value={form.ativo} onChange={(e) => setForm((f) => ({ ...f, ativo: e.target.value }))} className={inputClass}>
                      <option value="S">Ativo</option>
                      <option value="N">Inativo</option>
                    </select>
                  </Field>
                  {form.tipo === 'cliente' && (
                    <Field label="Tela inicial do cliente">
                      <select value={form.idMenuHome} onChange={(e) => setForm((f) => ({ ...f, idMenuHome: e.target.value }))} className={inputClass}>
                        <option value="">Padrao: /home</option>
                        {menusWithAccess.map((menu) => {
                          const id = getMenuId(menu)
                          return <option key={id} value={id}>{menu.parentmenu ? `${menu.parentmenu} > ${getMenuName(menu)}` : getMenuName(menu)}</option>
                        })}
                      </select>
                    </Field>
                  )}
                  <Field className="md:col-span-2" label="Descricao">
                    <textarea value={form.descricao ?? ''} onChange={(e) => setForm((f) => ({ ...f, descricao: e.target.value }))} className={`${inputClass} min-h-24 py-2`} placeholder="Descreva brevemente as permissoes deste perfil" maxLength={500} />
                  </Field>
                </div>
              )}

              {tab === 'menus' && (
                <div className="space-y-4">
                  <div className="flex flex-wrap gap-3">
                    <input value={menuSearch} onChange={(e) => setMenuSearch(e.target.value)} className={`${inputClass} max-w-xs`} placeholder="Buscar menu" />
                    <select value={nivelFilter} onChange={(e) => setNivelFilter(e.target.value as MenuNivel | 'todos')} className={`${inputClass} max-w-48`}>
                      <option value="todos">Todos os niveis</option>
                      <option value="sem_acesso">Sem acesso</option>
                      <option value="leitor">Leitor</option>
                      <option value="editor">Editor</option>
                    </select>
                  </div>
                  <PermissionMenuTable
                    loading={modulesQuery.isLoading}
                    groups={groups}
                    allItems={allItems}
                    nivelMap={nivelMap}
                    onNivelChange={handleNivelChange}
                    onSetAllInGroup={setAllInGroup}
                  />
                </div>
              )}

              {tab === 'acoes' && (
                <ActionPermissionTable
                  loading={modulesQuery.isLoading}
                  menus={menusWithAccess}
                  allItems={allItems}
                  nivelMap={nivelMap}
                  acoesMap={acoesMap}
                  onActionChange={handleActionChange}
                />
              )}
            </div>
          </section>
        </div>
      </div>
    </AppShell>
  )
}

function PermissionMenuTable({
  loading,
  groups,
  allItems,
  nivelMap,
  onNivelChange,
  onSetAllInGroup,
}: {
  loading: boolean
  groups: Array<[string, MenuLeaf[]]>
  allItems: MenuLeaf[]
  nivelMap: NivelMap
  onNivelChange: (menu: MenuLeaf, level: MenuNivel) => void
  onSetAllInGroup: (parentName: string | null, level: MenuNivel) => void
}) {
  if (loading) return <LoadingRow label="Carregando menus..." />

  return (
    <div className="max-h-[calc(100vh-390px)] overflow-auto rounded-lg border border-slate-100">
      <table className="w-full table-fixed border-separate border-spacing-0 text-sm">
        <colgroup>
          <col />
          <col className="w-56" />
        </colgroup>
        <thead className="sticky top-0 z-10 bg-slate-50">
          <tr>
            <th className={thClass}>Menu / Tela</th>
            <th className={`${thClass} w-56`}>Nivel de Acesso</th>
          </tr>
        </thead>
        <tbody>
          {groups.length === 0 ? (
            <EmptyRow colSpan={2} label="Nenhum menu encontrado." />
          ) : groups.map(([groupKey, menus]) => {
            const isRoot = groupKey === '__root__'
            const parent = isRoot ? null : allItems.find((item) => getMenuName(item) === groupKey)
            return (
              <Fragment key={groupKey}>
                <tr className="bg-blue-50/70">
                  <td colSpan={2} className="border-b border-blue-100 px-4 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2 font-semibold text-blue-950">
                        {parent?.icon && <i className={parent.icon} aria-hidden />}
                        {isRoot ? 'Geral' : getMenuName(parent ?? menus[0])}
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {levels.map((level) => (
                          <button key={level.value} type="button" onClick={() => onSetAllInGroup(isRoot ? null : groupKey, level.value)} className="rounded-md border border-blue-200 bg-white px-2 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-50">
                            Todos: {level.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </td>
                </tr>
                {menus.map((menu) => {
                  const id = getMenuId(menu)
                  const level = id ? nivelMap[String(id)] ?? 'sem_acesso' : 'sem_acesso'
                  return (
                    <tr key={id ?? getMenuName(menu)} className="hover:bg-slate-50">
                      <td className="border-b border-slate-100 px-4 py-3 text-slate-700">
                        <span className="inline-flex items-center gap-2 pl-4">
                          {menu.icon && <i className={menu.icon} aria-hidden />}
                          {getMenuName(menu)}
                        </span>
                      </td>
                      <td className="border-b border-slate-100 px-4 py-3">
                        <select value={level} onChange={(e) => onNivelChange(menu, e.target.value as MenuNivel)} className={`${inputClass} max-w-44`}>
                          {levels.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                        </select>
                      </td>
                    </tr>
                  )
                })}
              </Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function ActionPermissionTable({
  loading,
  menus,
  allItems,
  nivelMap,
  acoesMap,
  onActionChange,
}: {
  loading: boolean
  menus: MenuLeaf[]
  allItems: MenuLeaf[]
  nivelMap: NivelMap
  acoesMap: AcoesMap
  onActionChange: (menu: MenuLeaf, action: string, checked: boolean) => void
}) {
  const grouped = menus.reduce<Record<string, MenuLeaf[]>>((acc, menu) => {
    const key = menu.parentmenu ?? '__root__'
    acc[key] = [...(acc[key] ?? []), menu]
    return acc
  }, {})
  const groupEntries = Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b, 'pt-BR'))

  if (loading) return <LoadingRow label="Carregando permissoes..." />

  return (
    <div className="max-h-[calc(100vh-342px)] overflow-auto rounded-lg border border-slate-100">
      <table className="w-full min-w-[980px] table-fixed border-separate border-spacing-0 text-sm">
        <colgroup>
          <col className="w-72" />
          {actions.map((action) => <col key={action.key} className="w-[72px]" />)}
        </colgroup>
        <thead className="sticky top-0 z-10 bg-slate-50">
          <tr>
            <th className={thClass}>Menu / Tela</th>
            {actions.map((action) => <th key={action.key} className={`${thClass} text-center`}>{action.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {menus.length === 0 ? (
            <EmptyRow colSpan={actions.length + 1} label="Nenhum menu com acesso configurado." />
          ) : groupEntries.map(([groupKey, items]) => {
            const isRoot = groupKey === '__root__'
            const parent = isRoot ? null : allItems.find((item) => getMenuName(item) === groupKey)
            return (
              <Fragment key={groupKey}>
                <tr className="bg-blue-50/70">
                  <td colSpan={actions.length + 1} className="border-b border-blue-100 px-4 py-3 font-semibold text-blue-950">
                    {parent?.icon && <i className={`${parent.icon} mr-2`} aria-hidden />}
                    {isRoot ? 'Geral' : getMenuName(parent ?? items[0])}
                  </td>
                </tr>
                {items.map((menu) => {
                  const id = getMenuId(menu)
                  const key = String(id)
                  return (
                    <tr key={key} className="hover:bg-slate-50">
                      <td className="border-b border-slate-100 px-4 py-3 text-slate-700">
                        <span className="font-medium text-slate-900">{getMenuName(menu)}</span>
                        <span className="ml-2 rounded-full border border-blue-100 bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700">{nivelMap[key]}</span>
                      </td>
                      {actions.map((action) => (
                        <td key={action.key} className="border-b border-slate-100 px-4 py-3 text-center">
                          <input
                            type="checkbox"
                            checked={!!acoesMap[key]?.[action.key]}
                            onChange={(e) => onActionChange(menu, action.key, e.target.checked)}
                            className="h-4 w-4 rounded border-slate-300 text-blue-700 accent-blue-700"
                          />
                        </td>
                      ))}
                    </tr>
                  )
                })}
              </Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function defaultActionsFor(tipo: PerfilTipo, nivel: MenuNivel) {
  if (nivel === 'sem_acesso') return {}
  return Object.fromEntries(actions.map((action) => [
    action.key,
    nivel === 'leitor' ? action.defaultLeitor : tipo === 'admin' ? true : action.defaultEditor,
  ]))
}

function getMenuId(menu: MenuLeaf) {
  return menu.idMenu ?? menu.id_menu
}

function getMenuName(menu: MenuLeaf) {
  return menu.menu ?? menu.label ?? ''
}

const inputClass = 'h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100'
const primaryButtonClass = 'inline-flex h-9 items-center gap-2 rounded-md bg-blue-700 px-3 text-sm font-semibold text-white transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-70'
const secondaryButtonClass = 'inline-flex h-9 items-center gap-2 rounded-md border border-slate-200 px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50'
const thClass = 'border-b border-slate-200 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500'

function Field({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <label className={['block space-y-1', className].filter(Boolean).join(' ')}>
      <span className="text-sm font-medium text-slate-700">{label}</span>
      {children}
    </label>
  )
}

function TabButton({ active, icon, label, onClick }: { active: boolean; icon: string; label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={`inline-flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-semibold transition ${active ? 'border-blue-700 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-900'}`}>
      <i className={icon} aria-hidden />
      {label}
    </button>
  )
}

function LoadingRow({ label }: { label: string }) {
  return (
    <div className="py-12 text-center text-sm text-slate-500">
      <span className="mr-2 inline-block h-4 w-4 animate-spin rounded-full border-2 border-blue-700 border-t-transparent align-[-2px]" />
      {label}
    </div>
  )
}

function EmptyRow({ colSpan, label }: { colSpan: number; label: string }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 py-12 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-blue-700 ring-1 ring-blue-100">
          <i className="bi bi-inbox text-xl" aria-hidden />
        </div>
        <p className="mt-3 text-sm font-semibold text-slate-800">{label}</p>
      </td>
    </tr>
  )
}
