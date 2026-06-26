import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { AppMobileBottomNav, AppSidebar, DEFAULT_MENU_ITEM_ICON, parseMenuUrl, useMenuNavigate } from './AppSidebar'
import type { MenuItemDefinition, ModuleDefinition } from '@/api/auth.api'
import { notificationApi, type NotificationItem } from '@/api/notification.api'
import { useAuthStore } from '@/store/authStore'
import { isClienteToken } from '@/pages/auth/authFlow'

interface AppShellProps {
  title: string
  subtitle?: string
  children: React.ReactNode
}

export function AppShell({ title, subtitle, children }: AppShellProps) {
  const navigate = useNavigate()
  const menuNavigate = useMenuNavigate()
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [menuSearchTerm, setMenuSearchTerm] = useState('')
  const [menuSearchOpen, setMenuSearchOpen] = useState(false)
  const user = useAuthStore((s) => s.user)
  const tenant = useAuthStore((s) => s.tenant)
  const token = useAuthStore((s) => s.token)
  const homePath = useAuthStore((s) => s.homePath)
  const modules = useAuthStore((s) => s.modules)
  const logout = useAuthStore((s) => s.logout)
  const queryClient = useQueryClient()
  const menuRef = useRef<HTMLDivElement | null>(null)
  const menuSearchRef = useRef<HTMLDivElement | null>(null)
  const tenantName = tenant?.label ?? tenant?.code ?? user?.tenant?.name ?? user?.tenant?.code ?? 'Tenant'
  const isClienteAccess = isClienteToken(token ?? '') ||
    String(user?.type ?? '').toUpperCase() === 'CLIENTE' ||
    homePath.includes('portalCliente')

  const unreadQuery = useQuery({
    queryKey: ['notifications-unread-count', tenant?.code],
    queryFn: notificationApi.getUnreadCount,
    enabled: !!tenant?.code,
    refetchInterval: 60_000,
    staleTime: 30_000,
  })

  const notificationsQuery = useQuery({
    queryKey: ['notifications-list', tenant?.code],
    queryFn: () => notificationApi.getList({ limit: 8, unreadOnly: true }),
    enabled: notificationsOpen && !!tenant?.code,
    staleTime: 10_000,
  })

  const markAllMutation = useMutation({
    mutationFn: notificationApi.markAllAsRead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] })
      queryClient.invalidateQueries({ queryKey: ['notifications-list'] })
    },
  })

  const markReadMutation = useMutation({
    mutationFn: notificationApi.markAsRead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] })
      queryClient.invalidateQueries({ queryKey: ['notifications-list'] })
    },
  })

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) {
        setSettingsOpen(false)
        setUserMenuOpen(false)
      }
      if (!menuSearchRef.current?.contains(event.target as Node)) {
        setMenuSearchOpen(false)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [])

  function goTo(path: string) {
    setSettingsOpen(false)
    setUserMenuOpen(false)
    setNotificationsOpen(false)
    setMenuSearchOpen(false)
    navigate(path)
  }

  function handleLogout() {
    setUserMenuOpen(false)
    logout()
    navigate('/login')
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {sidebarOpen && (
        <div className="hidden shrink-0 md:block">
          <AppSidebar />
        </div>
      )}

      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-blue-100 bg-white px-4 shadow-sm shadow-blue-950/5">
          <div className="flex min-w-0 items-center gap-3">
            <button
              onClick={() => setSidebarOpen((o) => !o)}
              className="hidden rounded-md p-2 text-blue-700 transition-colors hover:bg-blue-50 hover:text-blue-900 md:block"
              title={sidebarOpen ? 'Recolher menu' : 'Expandir menu'}
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>

            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-900">{title}</p>
              <p className="truncate text-xs text-slate-500">{subtitle ?? tenant?.label ?? ''}</p>
            </div>
          </div>

          <MenuSearch
            refEl={menuSearchRef}
            modules={modules}
            value={menuSearchTerm}
            open={menuSearchOpen}
            onChange={setMenuSearchTerm}
            onOpenChange={setMenuSearchOpen}
            onNavigate={(item) => {
              menuNavigate(item.parsed)
              setMenuSearchTerm('')
              setMenuSearchOpen(false)
              setSettingsOpen(false)
              setUserMenuOpen(false)
              setNotificationsOpen(false)
            }}
          />

          <div ref={menuRef} className="relative flex min-w-0 items-center gap-2">
            <button
              type="button"
              onClick={() => goTo('/tenant')}
              className="inline-flex h-9 max-w-52 shrink-0 items-center gap-2 rounded-md border border-blue-100 bg-blue-50 px-2.5 text-xs font-semibold text-blue-700 transition-colors hover:border-blue-200 hover:bg-blue-100"
              title="Trocar empresa"
            >
              <i className="bi bi-building" aria-hidden />
              <span className="hidden truncate sm:block">{tenantName}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setNotificationsOpen((open) => !open)
                setSettingsOpen(false)
                setUserMenuOpen(false)
              }}
              className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-blue-50 hover:text-blue-700"
              title="Notificacoes"
            >
              <i className="bi bi-bell text-base" aria-hidden />
              {!!unreadQuery.data && unreadQuery.data > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold leading-none text-white">
                  {unreadQuery.data > 9 ? '9+' : unreadQuery.data}
                </span>
              )}
            </button>

            {!isClienteAccess && (
              <button
                type="button"
                onClick={() => {
                  setSettingsOpen((open) => !open)
                  setUserMenuOpen(false)
                  setNotificationsOpen(false)
                }}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-blue-50 hover:text-blue-700"
                title="Configuracoes"
              >
                <i className="bi bi-gear text-base" aria-hidden />
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                setUserMenuOpen((open) => !open)
                setSettingsOpen(false)
                setNotificationsOpen(false)
              }}
              className="flex h-10 min-w-0 shrink-0 items-center gap-2 rounded-md border border-slate-200 bg-white px-2 text-left transition-colors hover:border-blue-200 hover:bg-blue-50"
              title="Menu do usuario"
            >
              <span className="hidden min-w-0 sm:block">
                <span className="block max-w-44 truncate text-sm font-medium text-slate-800">
                  {user?.name ?? user?.username ?? 'Usuario'}
                </span>
                {user?.email && (
                  <span className="block max-w-44 truncate text-xs text-slate-500">{user.email}</span>
                )}
              </span>
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-blue-700 text-xs font-semibold text-white">
                {(user?.name ?? user?.username ?? 'U').slice(0, 1).toUpperCase()}
              </span>
              <i className="bi bi-chevron-down hidden text-xs text-slate-400 sm:block" aria-hidden />
            </button>

            {settingsOpen && !isClienteAccess && <SettingsMenu onNavigate={goTo} />}
            {userMenuOpen && (
              <div className="absolute right-0 top-11 z-50 w-52 overflow-hidden rounded-md border border-blue-100 bg-white shadow-xl shadow-blue-950/15">
                <button
                  type="button"
                  onClick={() => goTo('/profile')}
                  className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm text-slate-700 transition-colors hover:bg-blue-50 hover:text-blue-700"
                >
                  <i className="bi bi-person-circle text-base" aria-hidden />
                  Perfil
                </button>
                <button
                  type="button"
                  onClick={() => goTo('/tenant')}
                  className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm text-slate-700 transition-colors hover:bg-blue-50 hover:text-blue-700"
                >
                  <i className="bi bi-building text-base" aria-hidden />
                  <span className="min-w-0">
                    <span className="block">Trocar empresa</span>
                    <span className="block truncate text-xs text-slate-500">{tenantName}</span>
                  </span>
                </button>
                <div className="h-px bg-slate-100" />
                <button
                  type="button"
                  onClick={handleLogout}
                  className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm text-red-600 transition-colors hover:bg-red-50"
                >
                  <i className="bi bi-box-arrow-right text-base" aria-hidden />
                  Sair
                </button>
              </div>
            )}
          </div>
        </header>

        <main className="flex-1 overflow-auto pb-[76px] md:pb-0">{children}</main>
      </div>

      {notificationsOpen && (
        <NotificationsPanel
          loading={notificationsQuery.isLoading}
          notifications={notificationsQuery.data?.notifications ?? []}
          unreadCount={unreadQuery.data ?? 0}
          onClose={() => setNotificationsOpen(false)}
          onMarkAll={() => markAllMutation.mutate()}
          onMarkRead={(id) => markReadMutation.mutate(id)}
        />
      )}

      <AppMobileBottomNav />
    </div>
  )
}

type ParsedMenuUrl = ReturnType<typeof parseMenuUrl>

interface MenuSearchResult {
  id: string
  label: string
  moduleName: string
  parent?: string
  icon?: string
  parsed: ParsedMenuUrl
}

function MenuSearch({
  refEl,
  modules,
  value,
  open,
  onChange,
  onOpenChange,
  onNavigate,
}: {
  refEl: RefObject<HTMLDivElement | null>
  modules: ModuleDefinition[]
  value: string
  open: boolean
  onChange: (value: string) => void
  onOpenChange: (open: boolean) => void
  onNavigate: (item: MenuSearchResult) => void
}) {
  const normalizedValue = normalizeSearch(value)
  const results = useMemo(() => {
    if (normalizedValue.length < 2) return []

    return modules
      .flatMap((mod) => (mod.menus ?? [])
        .filter(isSearchableMenu)
        .flatMap((menu) => {
          const haystack = normalizeSearch(`${menu.label} ${menu.parentmenu ?? ''} ${mod.name} ${mod.shortName ?? ''} ${menu.url ?? ''}`)
          if (!haystack.includes(normalizedValue)) return []
          return [{
            id: `${mod.idModulo}-${menu.idMenu}`,
            label: menu.label,
            moduleName: mod.shortName ?? mod.name,
            parent: menu.parentmenu,
            icon: menu.icon ?? mod.icon,
            parsed: parseMenuUrl(menu.url ?? ''),
          }]
        }))
      .slice(0, 8)
  }, [modules, normalizedValue])

  const showPanel = open && value.trim().length > 0

  return (
    <div ref={refEl} className="relative hidden min-w-[180px] max-w-xl flex-1 md:block">
      <div className="relative">
        <i className="bi bi-search pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400" aria-hidden />
        <input
          type="search"
          value={value}
          onChange={(event) => {
            onChange(event.target.value)
            onOpenChange(true)
          }}
          onFocus={() => onOpenChange(true)}
          placeholder="Buscar menu..."
          className="h-9 w-full rounded-md border border-blue-100 bg-blue-50/50 pl-9 pr-3 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 hover:border-blue-200 focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100"
        />
      </div>

      {showPanel && (
        <div className="absolute left-0 right-0 top-11 z-50 overflow-hidden rounded-md border border-blue-100 bg-white shadow-xl shadow-blue-950/15">
          {value.trim().length < 2 ? (
            <div className="px-4 py-3 text-sm text-slate-500">Digite pelo menos 2 caracteres.</div>
          ) : results.length > 0 ? (
            <div className="max-h-80 overflow-y-auto py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {results.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onNavigate(item)}
                  className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-blue-50"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-blue-100 text-blue-700">
                    <i className={item.icon ?? DEFAULT_MENU_ITEM_ICON} aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-slate-800">{item.label}</span>
                    <span className="mt-0.5 block truncate text-xs text-slate-500">
                      {item.parent ? `${item.moduleName} / ${item.parent}` : item.moduleName}
                    </span>
                  </span>
                  <i className="bi bi-arrow-right-short shrink-0 text-lg text-blue-400" aria-hidden />
                </button>
              ))}
            </div>
          ) : (
            <div className="px-4 py-5 text-center">
              <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-blue-50 text-blue-700 ring-1 ring-blue-100">
                <i className="bi bi-search" aria-hidden />
              </div>
              <p className="mt-2 text-sm font-semibold text-slate-800">Nenhum menu encontrado</p>
              <p className="mt-1 text-xs text-slate-500">A busca considera apenas menus liberados para o seu acesso.</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function SettingsMenu({ onNavigate }: { onNavigate: (path: string) => void }) {
  return (
    <div className="absolute right-10 top-11 z-50 w-72 overflow-hidden rounded-md border border-blue-100 bg-white shadow-xl shadow-blue-950/15">
      <MenuSection icon="bi bi-stars" title="Centro de Criacao" />
      <MenuItem icon="bi bi-sliders" label="Tags - Parametros" onClick={() => onNavigate('/parameterConfig')} />
      <MenuItem icon="bi bi-table" label="Tabelas" onClick={() => onNavigate('/tabelas')} />
      <div className="my-1 h-px bg-slate-100" />
      <MenuSection icon="bi bi-shield-lock" title="Usuarios" />
      <MenuItem icon="bi bi-people" label="Lista de Usuarios" onClick={() => onNavigate('/usuarioList')} />
      <MenuItem icon="bi bi-shield-check" label="Perfis de Acesso" onClick={() => onNavigate('/perfis-acesso')} />
      <MenuItem icon="bi bi-person-lock" label="Usuarios e Perfis" onClick={() => onNavigate('/usuario-perfis')} />
      <MenuItem icon="bi bi-person-badge" label="Papeis e Usuarios" onClick={() => onNavigate('/papeis')} />
      <MenuItem icon="bi bi-person-badge" label="Usuarios Cliente" onClick={() => onNavigate('/usuario-cliente')} />
      <div className="my-1 h-px bg-slate-100" />
      <MenuSection icon="bi bi-bell" title="Mensagens" />
      <MenuItem icon="bi bi-chat-square-text" label="Templates" onClick={() => onNavigate('/template')} />
      <MenuItem icon="bi bi-bell" label="Mensagens Automatizadas" onClick={() => onNavigate('/messagesDefinition')} />
    </div>
  )
}

function NotificationsPanel({
  loading,
  notifications,
  unreadCount,
  onClose,
  onMarkAll,
  onMarkRead,
}: {
  loading: boolean
  notifications: NotificationItem[]
  unreadCount: number
  onClose: () => void
  onMarkAll: () => void
  onMarkRead: (id: number | string) => void
}) {
  return (
    <div className="fixed inset-0 z-[70] flex justify-end bg-slate-950/25" onClick={onClose}>
      <aside
        className="flex h-full w-full max-w-md flex-col border-l border-blue-100 bg-white shadow-2xl shadow-blue-950/25"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex h-16 shrink-0 items-center justify-between gap-3 border-b border-blue-100 bg-white px-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-blue-700 text-white">
              <i className="bi bi-bell" aria-hidden />
            </div>
            <div className="min-w-0">
              <h2 className="truncate text-sm font-semibold text-slate-900">Notificacoes</h2>
              <p className="truncate text-xs text-slate-500">
                {unreadCount > 0 ? `${unreadCount} nao lida${unreadCount > 1 ? 's' : ''}` : 'Tudo em dia'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={onMarkAll}
                className="rounded-md px-2.5 py-1.5 text-xs font-semibold text-blue-700 transition-colors hover:bg-blue-50"
              >
                Marcar todas
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="flex h-9 w-9 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-blue-50 hover:text-blue-700"
              aria-label="Fechar notificacoes"
            >
              <i className="bi bi-x-lg text-sm" aria-hidden />
            </button>
          </div>
        </header>

      <div className="flex-1 overflow-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
        {loading ? (
          <div className="flex h-full items-center justify-center text-sm text-slate-500">
            <span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-blue-700 border-t-transparent" />
            Carregando...
          </div>
        ) : notifications.length > 0 ? (
          <div className="divide-y divide-slate-100">
            {notifications.map((notification) => (
              <button
                key={notification.id}
                type="button"
                onClick={() => onMarkRead(notification.id)}
                className="flex w-full gap-3 px-4 py-4 text-left transition-colors hover:bg-blue-50"
              >
                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-blue-100 text-blue-700">
                  <i className={getNotificationIcon(notification.type)} aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-slate-800">{notification.title}</span>
                  <span className="mt-0.5 line-clamp-2 block text-xs leading-5 text-slate-500">
                    {notification.message || 'Sem detalhes.'}
                  </span>
                  <span className="mt-1 block text-[11px] text-slate-400">{formatNotificationDate(notification.timestamp)}</span>
                </span>
              </button>
            ))}
          </div>
        ) : (
          <div className="flex h-full flex-col items-center justify-center px-6 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-blue-700 ring-1 ring-blue-100">
              <i className="bi bi-bell-slash text-xl" aria-hidden />
            </div>
            <p className="mt-3 text-sm font-semibold text-slate-800">Sem notificacoes</p>
            <p className="mt-1 text-xs text-slate-500">Quando houver novidades, elas aparecem aqui.</p>
          </div>
        )}
      </div>
      </aside>
    </div>
  )
}

function MenuSection({ icon, title }: { icon: string; title: string }) {
  return (
    <div className="flex items-center gap-2 bg-blue-50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-blue-700">
      <i className={icon} aria-hidden />
      {title}
    </div>
  )
}

function getNotificationIcon(type: string) {
  const normalized = type.toLowerCase()
  if (normalized.includes('error') || normalized.includes('danger')) return 'bi bi-exclamation-octagon'
  if (normalized.includes('warn')) return 'bi bi-exclamation-triangle'
  if (normalized.includes('success')) return 'bi bi-check-circle'
  return 'bi bi-info-circle'
}

function formatNotificationDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function MenuItem({ icon, label, onClick }: { icon: string; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm text-slate-700 transition-colors hover:bg-blue-50 hover:text-blue-700"
    >
      <i className={`${icon} text-base`} aria-hidden />
      <span className="truncate">{label}</span>
    </button>
  )
}

function isSearchableMenu(menu: MenuItemDefinition) {
  if (!menu.url) return false
  return ['son', 'item', 'I'].includes(menu.type)
}

function normalizeSearch(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}
