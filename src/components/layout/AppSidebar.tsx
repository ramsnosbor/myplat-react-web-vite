import { useState, useEffect, useRef } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { authApi } from '@/api/auth.api'
import type { AclMap, ModuleDefinition, MenuItemDefinition } from '@/api/auth.api'
import { getTenantModuleIds, filterModules, sortMenusByModuleOrder, isClienteToken, isFullAdminToken, resolveHomePath } from '@/pages/auth/authFlow'

const LEAF_TYPES = new Set(['son', 'item', 'I'])
const STATIC_SCREEN_ROUTES: Record<string, string> = {
  'dfe-consulta': '/dfe-consulta',
  dfeConsulta: '/dfe-consulta',
  'dfe-emitentes': '/dfe-emitentes',
  dfeEmitentes: '/dfe-emitentes',
}

function isLeaf(menu: MenuItemDefinition) {
  return LEAF_TYPES.has(menu.type) && !!menu.url
}

function parseMenuUrl(url: string): {
  screen?: string
  params?: Record<string, string>
  search?: string
  external?: boolean
  href?: string
} {
  if (!url) return {}
  if (url.startsWith('http')) return { external: true, href: url }

  const [rawPath, ...queryParts] = url.split('?')
  const path = rawPath.replace(/^\/+/, '').replace(/^home\/?/, '')
  const qs = queryParts.join('?')
  const search = qs ? `?${qs}` : ''
  const params = Object.fromEntries(new URLSearchParams(qs).entries())

  return {
    screen: path,
    params: Object.keys(params).length > 0 ? params : undefined,
    search,
  }
}

function useEnsureModulesLoaded() {
  const modules = useAuthStore((s) => s.modules)
  const acl = useAuthStore((s) => s.acl)
  const token = useAuthStore((s) => s.token)
  const user = useAuthStore((s) => s.user)
  const setModules = useAuthStore((s) => s.setModules)
  const setAcl = useAuthStore((s) => s.setAcl)
  const setUser = useAuthStore((s) => s.setUser)
  const [bootStatus, setBootStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const didBoot = useRef(false)

  useEffect(() => {
    if (modules.length > 0) {
      setBootStatus('done')
      return
    }
    if (!token) return
    if (didBoot.current) return
    didBoot.current = true
    bootMenu()

    async function bootMenu() {
      setBootStatus('loading')
      try {
        let resolvedAcl: AclMap = acl ?? {}
        let isClienteAccess = isClienteToken(token ?? '') || String(user?.type ?? '').toUpperCase() === 'CLIENTE'

        const [permsResult, userResult] = await Promise.allSettled([
          authApi.getPermissions(),
          authApi.getLoggedUser(),
        ])
        if (permsResult.status === 'rejected') {
          if (!acl) {
            setBootStatus('error')
            return
          }
        } else {
          const perms = permsResult.value
          resolvedAcl = perms.menus
          isClienteAccess = isClienteAccess || (perms.perfis ?? []).some((perfil) => String(perfil.tipo ?? '').toUpperCase() === 'CLIENTE')
          if (userResult.status === 'fulfilled') {
            isClienteAccess = isClienteAccess || String(userResult.value.type ?? '').toUpperCase() === 'CLIENTE'
            setUser(userResult.value)
          }
        }

        const tenantModuleIds = getTenantModuleIds(token ?? '')
        const allModules = await authApi.getSystemModules()
        if (permsResult.status === 'fulfilled') {
          const homePath = resolveHomePath(permsResult.value, allModules, isClienteAccess)
          setAcl(permsResult.value.menus, homePath)
        }
        setModules(filterModules(allModules, resolvedAcl, tenantModuleIds, {
          failClosed: isClienteAccess,
          unrestricted: isFullAdminToken(token ?? ''),
        }))
        setBootStatus('done')
      } catch (err) {
        console.error('[AppSidebar] bootMenu falhou:', err)
        setBootStatus('error')
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modules.length, token])

  return { modules, bootStatus }
}

function navigateToParsedMenu(navigate: ReturnType<typeof useNavigate>, parsed: ReturnType<typeof parseMenuUrl>) {
  const staticRoute = STATIC_SCREEN_ROUTES[parsed.screen ?? '']
  if (staticRoute) {
    navigate(`${staticRoute}${parsed.search ?? ''}`, parsed.params ? { state: { initialParams: parsed.params } } : undefined)
    return
  }
  navigate(`/home/${parsed.screen}${parsed.search ?? ''}`, parsed.params ? { state: { initialParams: parsed.params } } : undefined)
}

export function AppSidebar() {
  const { modules, bootStatus } = useEnsureModulesLoaded()
  const homePath = useAuthStore((s) => s.homePath)
  const navigate = useNavigate()

  const [activeModuleId, setActiveModuleId] = useState<number | null>(null)
  const [flyoutOpen, setFlyoutOpen] = useState(false)
  const [showScrollHint, setShowScrollHint] = useState(false)
  const navRef = useRef<HTMLDivElement | null>(null)

  const activeModule = modules.find((m) => m.idModulo === activeModuleId) ?? modules[0] ?? null

  function handleModuleClick(mod: ModuleDefinition) {
    setActiveModuleId(mod.idModulo)
    setFlyoutOpen(true)
  }

  function updateScrollHint() {
    const el = navRef.current
    if (!el) return
    setShowScrollHint(el.scrollTop + el.clientHeight < el.scrollHeight - 4)
  }

  useEffect(() => {
    updateScrollHint()
    window.addEventListener('resize', updateScrollHint)
    return () => window.removeEventListener('resize', updateScrollHint)
  }, [modules.length, bootStatus])

  return (
    <>
      <aside className="relative z-50 flex h-screen w-[86px] flex-col border-r border-blue-900/20 bg-blue-950 text-blue-50 shadow-xl shadow-blue-950/15">
        <div className="flex h-16 shrink-0 items-center justify-center border-b border-white/10">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-blue-500 text-xs font-bold text-white shadow-sm shadow-blue-500/30">
            MP
          </div>
        </div>

        <nav
          ref={navRef}
          onScroll={updateScrollHint}
          className="flex-1 overflow-y-auto overscroll-contain scroll-smooth px-1.5 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          <SidebarTile
            icon="bi bi-house"
            label="Inicio"
            active={!flyoutOpen}
            onClick={() => {
              setFlyoutOpen(false)
              navigate(homePath || '/home')
            }}
          />

          <div className="my-2 h-px bg-white/10" />

          {modules.map((mod) => (
            <SidebarTile
              key={mod.idModulo}
              icon={mod.icon ?? 'bi bi-grid'}
              label={mod.shortName ?? mod.name}
              active={flyoutOpen && activeModule?.idModulo === mod.idModulo}
              onClick={() => handleModuleClick(mod)}
            />
          ))}

          {bootStatus === 'loading' && modules.length === 0 && (
            <div className="mt-3 flex justify-center">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-blue-300 border-t-transparent" />
            </div>
          )}

          {bootStatus === 'error' && (
            <div className="mt-3 text-center text-[10px] leading-tight text-red-200">
              Erro
            </div>
          )}
        </nav>

        {showScrollHint && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 flex h-12 items-end justify-center bg-gradient-to-t from-blue-950 via-blue-950/85 to-transparent pb-1.5">
            <i className="bi bi-chevron-down text-xs text-blue-200/80" aria-hidden />
          </div>
        )}
      </aside>

      {flyoutOpen && activeModule && (
        <ModuleFlyout
          module={activeModule}
          onClose={() => setFlyoutOpen(false)}
        />
      )}
    </>
  )
}

export function AppMobileBottomNav() {
  const { modules, bootStatus } = useEnsureModulesLoaded()
  const homePath = useAuthStore((s) => s.homePath)
  const navigate = useNavigate()
  const location = useLocation()
  const [activeModuleId, setActiveModuleId] = useState<number | null>(null)
  const [sheetMode, setSheetMode] = useState<'module' | 'modules' | null>(null)

  const visibleModules = modules.slice(0, 3)
  const activeModule = modules.find((mod) => mod.idModulo === activeModuleId) ?? visibleModules[0] ?? modules[0] ?? null
  const isHome = location.pathname === (homePath || '/home')

  function openModule(mod: ModuleDefinition) {
    setActiveModuleId(mod.idModulo)
    setSheetMode('module')
  }

  function closeSheet() {
    setSheetMode(null)
  }

  function goHome() {
    closeSheet()
    navigate(homePath || '/home')
  }

  return (
    <>
      <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-blue-100 bg-white/95 shadow-2xl shadow-blue-950/20 backdrop-blur md:hidden">
        <div className="grid h-[68px] grid-cols-5 pb-[env(safe-area-inset-bottom)]">
          <MobileNavButton icon="bi bi-house" label="Home" active={isHome && !sheetMode} onClick={goHome} />
          {visibleModules.map((mod) => (
            <MobileNavButton
              key={mod.idModulo}
              icon={mod.icon ?? 'bi bi-grid'}
              label={mod.shortName ?? mod.name}
              active={sheetMode === 'module' && activeModuleId === mod.idModulo}
              onClick={() => openModule(mod)}
            />
          ))}
          <MobileNavButton
            icon={bootStatus === 'loading' ? 'bi bi-arrow-clockwise' : 'bi bi-grid-3x3-gap'}
            label="Modulos"
            active={sheetMode === 'modules'}
            onClick={() => setSheetMode((mode) => mode === 'modules' ? null : 'modules')}
          />
        </div>
      </nav>

      {sheetMode && (
        <div className="fixed inset-0 z-40 bg-slate-950/30 md:hidden" onClick={closeSheet}>
          <section
            className="absolute inset-x-0 top-0 bottom-[68px] flex flex-col overflow-hidden border-b border-blue-100 bg-background shadow-2xl shadow-blue-950/25"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="flex items-center justify-between gap-3 border-b border-blue-100 bg-white px-4 py-3 shadow-sm shadow-blue-950/5">
              <div className="min-w-0">
                <h2 className="truncate text-sm font-semibold text-slate-900">
                  {sheetMode === 'modules' ? 'Modulos' : activeModule?.name}
                </h2>
                <p className="truncate text-xs text-slate-500">
                  {sheetMode === 'modules' ? 'Selecione um modulo' : 'Selecione uma opcao'}
                </p>
              </div>
              <button
                type="button"
                onClick={closeSheet}
                className="flex h-9 w-9 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-blue-50 hover:text-blue-700"
                aria-label="Fechar menu"
              >
                <i className="bi bi-x-lg" aria-hidden />
              </button>
            </header>

            <div className="flex-1 overflow-y-auto px-3 py-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {sheetMode === 'modules' ? (
                modules.length > 0 ? (
                  <div className="grid grid-cols-3 gap-2">
                    {modules.map((mod) => (
                      <MobilePanelCard
                        key={mod.idModulo}
                        icon={mod.icon ?? 'bi bi-grid'}
                        label={mod.shortName ?? mod.name}
                        active={activeModuleId === mod.idModulo}
                        onClick={() => openModule(mod)}
                      />
                    ))}
                  </div>
                ) : (
                  <MobilePanelEmpty loading={bootStatus === 'loading'} />
                )
              ) : activeModule ? (
                <MobileModuleMenus module={activeModule} onNavigate={closeSheet} />
              ) : (
                <MobilePanelEmpty loading={bootStatus === 'loading'} />
              )}
            </div>
          </section>
        </div>
      )}
    </>
  )
}

function MobileNavButton({ icon, label, active, onClick }: { icon: string; label: string; active?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      className={[
        'flex min-w-0 flex-col items-center justify-center gap-1 px-1 text-center transition-colors',
        active ? 'text-blue-700' : 'text-slate-500 hover:bg-blue-50 hover:text-blue-700',
      ].join(' ')}
    >
      <span className={['flex h-8 w-10 items-center justify-center rounded-full transition-colors', active ? 'bg-blue-100' : ''].join(' ')}>
        <i className={`${icon} text-lg leading-none ${icon === 'bi bi-arrow-clockwise' ? 'animate-spin' : ''}`} aria-hidden />
      </span>
      <span className="block w-full truncate text-[10px] font-semibold leading-tight">{label}</span>
    </button>
  )
}

function MobilePanelCard({ icon, label, active, onClick }: { icon: string; label: string; active?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      className={[
        'flex min-h-24 flex-col items-center justify-center gap-2 rounded-lg border px-2 py-3 text-center transition-colors',
        active
          ? 'border-blue-200 bg-blue-50 text-blue-800'
          : 'border-slate-200 bg-white text-slate-700 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-800',
      ].join(' ')}
    >
      <i className={`${icon} text-2xl`} aria-hidden />
      <span className="line-clamp-2 text-xs font-semibold leading-tight">{label}</span>
    </button>
  )
}

function MobileModuleMenus({ module, onNavigate }: { module: ModuleDefinition; onNavigate: () => void }) {
  const tree = buildMenuTree(module.menus ?? [])
  if (tree.length === 0) return <MobilePanelEmpty loading={false} />
  const rootLeaves = tree.filter((node) => isLeaf(node.item)).map((node) => node.item)
  const groups = tree.filter((node) => !isLeaf(node.item))

  return (
    <div className="space-y-4">
      {rootLeaves.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {rootLeaves.map((leaf) => (
            <MobileMenuLeaf key={leaf.idMenu} item={leaf} onNavigate={onNavigate} />
          ))}
        </div>
      )}
      {groups.map((node) => (
        <MobileMenuGroup key={node.item.idMenu} node={node} onNavigate={onNavigate} />
      ))}
    </div>
  )
}

function MobileMenuGroup({ node, onNavigate }: { node: MenuTreeNode; onNavigate: () => void }) {
  const item = node.item
  if (isLeaf(item)) return null

  const leaves = collectLeafMenus(node)
  if (leaves.length === 0) return null

  return (
    <section>
      <h3 className="mb-2 flex items-center gap-2 px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
        {item.icon && <i className={`${item.icon} text-sm`} aria-hidden />}
        {item.label}
      </h3>
      <div className="grid grid-cols-3 gap-2">
        {leaves.map((leaf) => (
          <MobileMenuLeaf key={leaf.idMenu} item={leaf} onNavigate={onNavigate} />
        ))}
      </div>
    </section>
  )
}

function MobileMenuLeaf({ item, onNavigate }: { item: MenuItemDefinition; onNavigate: () => void }) {
  const navigate = useNavigate()
  const parsed = parseMenuUrl(item.url ?? '')

  function handleClick() {
    if (parsed.external && parsed.href) {
      window.open(parsed.href, '_blank', 'noopener,noreferrer')
      onNavigate()
      return
    }
    if (!parsed.screen) return
    navigateToParsedMenu(navigate, parsed)
    onNavigate()
  }

  return (
    <MobilePanelCard
      icon={item.icon ?? 'bi bi-circle'}
      label={item.label}
      onClick={handleClick}
    />
  )
}

function collectLeafMenus(node: MenuTreeNode): MenuItemDefinition[] {
  if (isLeaf(node.item)) return [node.item]
  return node.children.flatMap(collectLeafMenus)
}

function MobilePanelEmpty({ loading }: { loading: boolean }) {
  return (
    <div className="px-4 py-12 text-center text-sm text-slate-500">
      {loading ? (
        <>
          <span className="mx-auto mb-3 block h-7 w-7 animate-spin rounded-full border-4 border-blue-700 border-t-transparent" />
          Carregando menus...
        </>
      ) : (
        <>
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-blue-700 ring-1 ring-blue-100">
            <i className="bi bi-grid" aria-hidden />
          </div>
          <p className="mt-3 font-semibold text-slate-800">Nenhum menu disponivel</p>
        </>
      )}
    </div>
  )
}

function SidebarTile({
  icon,
  label,
  active,
  onClick,
}: {
  icon: string
  label: string
  active?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      className={[
        'mb-0.5 flex h-[56px] w-full flex-col items-center justify-center gap-0.5 rounded-md px-1 text-center transition-colors',
        active
          ? 'bg-white text-blue-900 shadow-sm'
          : 'text-blue-100 hover:bg-white/10 hover:text-white',
      ].join(' ')}
    >
      <i className={`${icon} text-lg leading-none`} aria-hidden />
      <span className="block w-full truncate text-[10px] font-medium leading-tight">
        {label}
      </span>
    </button>
  )
}

function ModuleFlyout({
  module,
  onClose,
}: {
  module: ModuleDefinition
  onClose: () => void
}) {
  const tree = buildMenuTree(module.menus ?? [])
  const [showScrollHint, setShowScrollHint] = useState(false)
  const contentRef = useRef<HTMLDivElement | null>(null)

  function updateScrollHint() {
    const el = contentRef.current
    if (!el) return
    setShowScrollHint(el.scrollTop + el.clientHeight < el.scrollHeight - 4)
  }

  useEffect(() => {
    updateScrollHint()
    window.addEventListener('resize', updateScrollHint)
    return () => window.removeEventListener('resize', updateScrollHint)
  }, [module.idModulo, tree.length])

  return (
    <div className="fixed inset-0 z-40" onClick={onClose}>
      <section
        className="absolute bottom-0 left-[86px] top-0 flex w-80 flex-col border-r border-blue-100 bg-white shadow-2xl shadow-blue-950/15"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex h-16 shrink-0 items-center justify-between gap-3 border-b border-blue-100 px-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-blue-700 text-white">
              <i className={`${module.icon ?? 'bi bi-grid'} text-lg`} aria-hidden />
            </div>
            <div className="min-w-0">
              <h2 className="truncate text-sm font-semibold text-slate-900">
                {module.shortName ?? module.name}
              </h2>
              <p className="truncate text-xs text-slate-500">Menu do modulo</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-blue-50 hover:text-blue-700"
            aria-label="Fechar menu"
          >
            <i className="bi bi-x-lg text-sm" aria-hidden />
          </button>
        </header>

        <div
          ref={contentRef}
          onScroll={updateScrollHint}
          className="flex-1 overflow-y-auto overscroll-contain scroll-smooth py-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {tree.length === 0 ? (
            <p className="px-4 py-3 text-sm text-slate-500">Nenhum menu disponivel.</p>
          ) : (
            <div className="space-y-0.5 py-1">
              {tree.map((node) => (
                <MenuTreeNodeView key={node.item.idMenu} node={node} depth={0} onNavigate={onClose} />
              ))}
            </div>
          )}
        </div>

        {showScrollHint && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 flex h-12 items-end justify-center bg-gradient-to-t from-white via-white/90 to-transparent pb-2">
            <i className="bi bi-chevron-down text-xs text-blue-600/70" aria-hidden />
          </div>
        )}
      </section>
    </div>
  )
}

// ─── Árvore de menu ───────────────────────────────────────────────────────────

interface MenuTreeNode {
  item: MenuItemDefinition
  children: MenuTreeNode[]
}

/**
 * Constrói árvore n-ária a partir de lista plana.
 * Raízes = itens sem parentmenu OU cujo parentmenu não existe como label de outro item.
 * Filhos = itens cujo parentmenu === label do pai.
 * Suporte a profundidade ilimitada.
 */
function buildMenuTree(menus: MenuItemDefinition[]): MenuTreeNode[] {
  const sorted = sortMenusByModuleOrder(menus)
  const labelSet = new Set(sorted.map((m) => m.label))

  // Raízes: sem parentmenu ou parentmenu não bate com nenhum label existente
  const roots = sorted.filter((m) => !m.parentmenu || !labelSet.has(m.parentmenu))

  function buildNode(item: MenuItemDefinition, visited: Set<number>): MenuTreeNode {
    if (visited.has(item.idMenu)) return { item, children: [] } // guarda circular
    const next = new Set(visited)
    next.add(item.idMenu)
    const children = sorted
      .filter((m) => m.parentmenu === item.label)
      .map((child) => buildNode(child, next))
    return { item, children }
  }

  return roots.map((item) => buildNode(item, new Set()))
}

// ─── Nó recursivo do menu ─────────────────────────────────────────────────────

function MenuTreeNodeView({
  node,
  depth = 0,
  onNavigate,
}: {
  node: MenuTreeNode
  depth?: number
  onNavigate: () => void
}) {
  const [open, setOpen] = useState(false)
  const { item, children } = node
  const hasChildren = children.length > 0
  const isRoot = depth === 0

  if (hasChildren) {
    return (
      <div className={isRoot ? 'mx-2 mb-1' : 'mb-0.5'}>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          style={!isRoot ? { paddingLeft: `${8 + depth * 8}px` } : undefined}
          className={[
            'flex w-full items-center justify-between rounded-md px-3 py-2 transition-colors',
            isRoot
              ? `text-xs font-semibold uppercase tracking-wide ${
                  open
                    ? 'bg-blue-50/80 text-blue-800 ring-1 ring-blue-100'
                    : 'text-slate-500 hover:bg-blue-50 hover:text-blue-700'
                }`
              : `text-sm font-medium ${
                  open ? 'text-blue-700' : 'text-slate-600 hover:bg-blue-50 hover:text-blue-700'
                }`,
          ].join(' ')}
        >
          <div className="flex min-w-0 items-center gap-2">
            {item.icon && <i className={`${item.icon} shrink-0 text-base`} aria-hidden />}
            <span className="truncate">{item.label}</span>
          </div>
          <i
            className={`bi bi-chevron-down shrink-0 text-xs transition-transform ${open ? '' : '-rotate-90'}`}
            aria-hidden
          />
        </button>

        {open && (
          <div
            className={
              isRoot
                ? 'mt-0.5 rounded-md bg-blue-50/50 pb-1.5 ring-1 ring-blue-100'
                : ''
            }
          >
            {children.map((child) => (
              <MenuTreeNodeView
                key={child.item.idMenu}
                node={child}
                depth={depth + 1}
                onNavigate={onNavigate}
              />
            ))}
          </div>
        )}
      </div>
    )
  }

  // Folha navegável — usa o mesmo mx-2 do grupo raiz para alinhar horizontalmente
  if (isLeaf(item)) {
    return (
      <div className={isRoot ? 'mx-2' : ''}>
        <FlyoutMenuItem item={item} depth={depth} onNavigate={onNavigate} />
      </div>
    )
  }

  // Pai sem filhos e sem URL — oculta
  return null
}

function FlyoutMenuItem({
  item,
  depth = 0,
  onNavigate,
}: {
  item: MenuItemDefinition
  depth?: number
  onNavigate: () => void
}) {
  const navigate = useNavigate()
  const { screen: activeScreen } = useParams<{ screen?: string }>()
  const parsed = parseMenuUrl(item.url ?? '')

  if (parsed.external) {
    return (
      <a
        href={parsed.href}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-3 rounded-md px-3 py-2.5 text-sm text-slate-600 transition-colors hover:bg-blue-50 hover:text-blue-700"
      >
        <i className={`${item.icon ?? 'bi bi-box-arrow-up-right'} shrink-0 text-base`} aria-hidden />
        <span className="min-w-0 flex-1 truncate">{item.label}</span>
        <i className="bi bi-box-arrow-up-right shrink-0 text-xs opacity-60" aria-hidden />
      </a>
    )
  }

  if (!parsed.screen) return null

  const isActive = (activeScreen ?? 'home') === parsed.screen

  function handleClick() {
    const staticRoute = STATIC_SCREEN_ROUTES[parsed.screen ?? '']
    if (staticRoute) {
      navigate(`${staticRoute}${parsed.search ?? ''}`, parsed.params ? { state: { initialParams: parsed.params } } : undefined)
      onNavigate()
      return
    }

    navigate(`/home/${parsed.screen}${parsed.search ?? ''}`, parsed.params ? { state: { initialParams: parsed.params } } : undefined)
    onNavigate()
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      style={depth > 0 ? { paddingLeft: `${12 + depth * 8}px` } : undefined}
      className={[
        'group relative flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm transition-colors',
        isActive
          ? 'bg-blue-100 font-semibold text-blue-900'
          : 'text-slate-600 hover:bg-blue-100 hover:text-blue-900 focus-visible:bg-blue-100 focus-visible:text-blue-900 focus-visible:outline-none',
      ].join(' ')}
    >
      <span
        className={[
          'absolute left-0 top-2 bottom-2 w-1 rounded-r-full transition-opacity',
          isActive ? 'bg-blue-700 opacity-100' : 'bg-blue-600 opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100',
        ].join(' ')}
        aria-hidden
      />
      <i className={`${item.icon ?? 'bi bi-circle'} shrink-0 text-base`} aria-hidden />
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
    </button>
  )
}
