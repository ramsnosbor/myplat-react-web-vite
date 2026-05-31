import { useState, useEffect, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { authApi } from '@/api/auth.api'
import type { AclMap, ModuleDefinition, MenuItemDefinition } from '@/api/auth.api'
import { getTenantModuleIds, filterModules } from '@/pages/auth/authFlow'

const LEAF_TYPES = new Set(['son', 'item', 'I'])

function isLeaf(menu: MenuItemDefinition) {
  return LEAF_TYPES.has(menu.type) && !!menu.url
}

function parseMenuUrl(url: string): {
  screen?: string
  params?: Record<string, string>
  external?: boolean
  href?: string
} {
  if (!url) return {}
  if (url.startsWith('http')) return { external: true, href: url }

  const [path, qs] = url.split('?')
  const params: Record<string, string> = {}
  if (qs) {
    for (const part of qs.split('&')) {
      const [k, v] = part.split('=')
      if (k) params[k] = v ?? ''
    }
  }

  return {
    screen: path,
    params: Object.keys(params).length > 0 ? params : undefined,
  }
}

export function AppSidebar() {
  const modules = useAuthStore((s) => s.modules)
  const acl = useAuthStore((s) => s.acl)
  const token = useAuthStore((s) => s.token)
  const setModules = useAuthStore((s) => s.setModules)
  const setAcl = useAuthStore((s) => s.setAcl)
  const setUser = useAuthStore((s) => s.setUser)
  const navigate = useNavigate()

  const [activeModuleId, setActiveModuleId] = useState<number | null>(null)
  const [bootStatus, setBootStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [flyoutOpen, setFlyoutOpen] = useState(false)
  const [showScrollHint, setShowScrollHint] = useState(false)
  const didBoot = useRef(false)
  const navRef = useRef<HTMLDivElement | null>(null)

  const activeModule = modules.find((m) => m.idModulo === activeModuleId) ?? modules[0] ?? null

  useEffect(() => {
    if (modules.length > 0) return
    if (!token) return
    if (didBoot.current) return
    didBoot.current = true
    bootMenu()

    async function bootMenu() {
      setBootStatus('loading')
      try {
        let resolvedAcl: AclMap = acl ?? {}

        if (!acl) {
          const [permsResult, userResult] = await Promise.allSettled([
            authApi.getPermissions(),
            authApi.getLoggedUser(),
          ])
          if (permsResult.status === 'rejected') {
            setBootStatus('error')
            return
          }
          const perms = permsResult.value
          resolvedAcl = perms.menus
          setAcl(perms.menus, perms.homePath ?? undefined)
          if (userResult.status === 'fulfilled') setUser(userResult.value)
        }

        const tenantModuleIds = getTenantModuleIds(token ?? '')
        const allModules = await authApi.getSystemModules()
        setModules(filterModules(allModules, resolvedAcl, tenantModuleIds))
        setBootStatus('done')
      } catch (err) {
        console.error('[AppSidebar] bootMenu falhou:', err)
        setBootStatus('error')
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modules.length, token])

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
              navigate('/home')
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
  const groups = buildMenuGroups(module.menus ?? [])
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
  }, [module.idModulo, groups.length])

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
          {groups.length === 0 ? (
            <p className="px-4 py-3 text-sm text-slate-500">Nenhum menu disponivel.</p>
          ) : (
            groups.map((group, i) => (
              <FlyoutMenuGroup key={i} group={group} onNavigate={onClose} />
            ))
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

interface MenuGroup {
  label?: string
  items: MenuItemDefinition[]
}

function buildMenuGroups(menus: MenuItemDefinition[]): MenuGroup[] {
  const sorted = [...menus].sort((a, b) => (a.orderview ?? 0) - (b.orderview ?? 0))
  const leaves = sorted.filter((m) => isLeaf(m))
  const groups: MenuGroup[] = []
  const parentLabels = Array.from(
    new Set(leaves.filter((m) => m.parentmenu).map((m) => m.parentmenu!)),
  )
  const rootItems = leaves.filter((m) => !m.parentmenu)

  if (rootItems.length > 0) groups.push({ items: rootItems })
  for (const label of parentLabels) {
    const items = leaves.filter((m) => m.parentmenu === label)
    if (items.length > 0) groups.push({ label, items })
  }

  return groups
}

function FlyoutMenuGroup({
  group,
  onNavigate,
}: {
  group: MenuGroup
  onNavigate: () => void
}) {
  const [open, setOpen] = useState(false)

  if (!group.label) {
    return (
      <div className="space-y-1 px-2">
        {group.items.map((item) => (
          <FlyoutMenuItem key={item.idMenu} item={item} onNavigate={onNavigate} />
        ))}
      </div>
    )
  }

  return (
    <div className={['mx-2 mb-2 rounded-md transition-colors', open ? 'bg-blue-50/80 ring-1 ring-blue-100' : ''].join(' ')}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={[
          'flex w-full items-center justify-between rounded-md px-3 py-2 text-xs font-semibold uppercase tracking-wide transition-colors',
          open ? 'text-blue-800' : 'text-slate-500 hover:bg-blue-50 hover:text-blue-700',
        ].join(' ')}
      >
        <span className="truncate">{group.label}</span>
        <i
          className={`bi bi-chevron-down shrink-0 text-xs transition-transform ${open ? '' : '-rotate-90'}`}
          aria-hidden
        />
      </button>

      {open && (
        <div className="space-y-1 px-2 pb-2">
          {group.items.map((item) => (
            <FlyoutMenuItem key={item.idMenu} item={item} onNavigate={onNavigate} />
          ))}
        </div>
      )}
    </div>
  )
}

function FlyoutMenuItem({
  item,
  onNavigate,
}: {
  item: MenuItemDefinition
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
    if (parsed.params) {
      navigate(`/home/${parsed.screen}`, { state: { initialParams: parsed.params } })
    } else {
      navigate(`/home/${parsed.screen}`)
    }
    onNavigate()
  }

  return (
    <button
      type="button"
      onClick={handleClick}
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
