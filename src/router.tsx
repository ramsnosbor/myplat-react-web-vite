import { lazy, Suspense, useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { isClienteToken, isFullAdminToken, getTenantModuleIds, filterModules, resolveHomePath } from '@/pages/auth/authFlow'
import { authApi } from '@/api/auth.api'
import { getSharedTenant } from '@/api/client'

// ─── Lazy pages ───────────────────────────────────────────────────────────────

const LoginPage = lazy(() => import('@/pages/auth/LoginPage'))
const RegisterUserPage = lazy(() => import('@/pages/auth/RegisterUserPage'))
const TenantPage = lazy(() => import('@/pages/auth/TenantPage'))
const MfaPage = lazy(() => import('@/pages/auth/MfaPage'))
const IdentityConfirmationPage = lazy(() => import('@/pages/auth/IdentityConfirmationPage'))
const MainPage = lazy(() => import('@/pages/main/MainPage'))
const ParameterConfigPage = lazy(() => import('@/pages/system/ParameterConfigPage'))
const ProfilePage = lazy(() => import('@/pages/system/ProfilePage'))
const UsuarioListPage = lazy(() => import('@/pages/system/UsuarioListPage'))
const UserPermissionsPage = lazy(() => import('@/pages/system/UserPermissionsPage'))
const PerfisAcessoPage = lazy(() => import('@/pages/system/PerfisAcessoPage'))
const PerfisAcessoFormPage = lazy(() => import('@/pages/system/PerfisAcessoFormPage'))
const UsuarioPerfisPage = lazy(() => import('@/pages/system/UsuarioPerfisPage'))
const UsuarioClientePage = lazy(() => import('@/pages/system/UsuarioClientePage'))
const UsuarioClienteFormPage = lazy(() => import('@/pages/system/UsuarioClienteFormPage'))
const TemplatePage = lazy(() => import('@/pages/system/TemplatePage'))
const TemplateFormPage = lazy(() => import('@/pages/system/TemplateFormPage'))
const MessagesDefinitionPage = lazy(() => import('@/pages/system/MessagesDefinitionPage'))
const MessagesDefinitionFormPage = lazy(() => import('@/pages/system/MessagesDefinitionFormPage'))
const DFeConsultaPage = lazy(() => import('@/pages/system/DFeConsultaPage'))
const ReportViewerPage = lazy(() => import('@/pages/system/ReportViewerPage'))
const ReportsListPage = lazy(() => import('@/pages/system/ReportsListPage'))
const InsightsPage = lazy(() => import('@/pages/system/InsightsPage'))
const NfeViewerPage = lazy(() => import('@/pages/system/NfeViewerPage'))

// ─── Loading fallback ─────────────────────────────────────────────────────────

function PageLoader() {
  return (
    <div className="flex h-screen items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
    </div>
  )
}

// ─── Guard: rotas protegidas ──────────────────────────────────────────────────

function ProtectedLayout() {
  const token = useAuthStore((s) => s.token)
  const tenant = useAuthStore((s) => s.tenant)
  const hasHydrated = useAuthStore((s) => s._hasHydrated)
  const { setUser, setTenant, setAcl, setModules, logout } = useAuthStore()
  const navigate = useNavigate()
  const [restoring, setRestoring] = useState(false)

  useEffect(() => {
    // Aguarda Zustand terminar a reidratação do localStorage antes de agir.
    // Sem isso, um F5 normal com tenant no localStorage dispararia o restore
    // desnecessariamente enquanto a reidratação ainda não chegou.
    if (!hasHydrated) return
    // Nenhum token → guard abaixo cuida do redirect
    if (!token) return
    // Tenant já carregado → sessão completa (F5 normal ou login normal)
    if (tenant) return

    // Token presente mas sem tenant → chegou do Maker com cookie compartilhado.
    // Restaura sessão chamando as APIs com o token existente (sem selectTenant).
    setRestoring(true)

    // Tenta ler tenant dos cookies do Maker para não depender do getLoggedUser
    const sharedTenant = getSharedTenant()

    const apiCalls = sharedTenant
      ? ([authApi.getPermissions(), authApi.getSystemModules()] as const)
      : ([authApi.getLoggedUser(), authApi.getPermissions(), authApi.getSystemModules()] as const)

    Promise.all(apiCalls)
      .then((results) => {
        let tenantCode: string | undefined
        let tenantLabel: string

        if (sharedTenant) {
          const [perms, allModules] = results as [
            Awaited<ReturnType<typeof authApi.getPermissions>>,
            Awaited<ReturnType<typeof authApi.getSystemModules>>,
          ]
          tenantCode = sharedTenant.code
          tenantLabel = sharedTenant.label

          if (!tenantCode) throw new Error('tenant indisponível nos cookies')

          const tenantModuleIds = getTenantModuleIds(token)
          const isClienteAccess = isClienteToken(token) ||
            (perms.perfis ?? []).some((p) => String(p.tipo ?? '').toUpperCase() === 'CLIENTE')
          const homePath = resolveHomePath(perms, allModules, isClienteAccess)

          setTenant({ code: tenantCode, label: tenantLabel })
          setAcl(perms.menus, homePath)
          setModules(filterModules(allModules, perms.menus, tenantModuleIds, {
            failClosed: isClienteAccess,
            unrestricted: isFullAdminToken(token),
          }))
          navigate(homePath, { replace: true })
          return
        }

        const [userData, perms, allModules] = results as [
          Awaited<ReturnType<typeof authApi.getLoggedUser>>,
          Awaited<ReturnType<typeof authApi.getPermissions>>,
          Awaited<ReturnType<typeof authApi.getSystemModules>>,
        ]
        tenantCode = perms.tenantCode ?? userData.tenant?.code
        tenantLabel = userData.tenant?.name ?? userData.tenant?.description ?? tenantCode ?? ''

        if (!tenantCode) throw new Error('tenant indisponível no token')

        const tenantModuleIds = getTenantModuleIds(token)
        const isClienteAccess =
          isClienteToken(token) ||
          String(userData.type ?? '').toUpperCase() === 'CLIENTE' ||
          (perms.perfis ?? []).some((p) => String(p.tipo ?? '').toUpperCase() === 'CLIENTE')
        const homePath = resolveHomePath(perms, allModules, isClienteAccess)

        setUser(userData)
        setTenant({ code: tenantCode, label: tenantLabel })
        setAcl(perms.menus, homePath)
        setModules(
          filterModules(allModules, perms.menus, tenantModuleIds, {
            failClosed: isClienteAccess,
            unrestricted: isFullAdminToken(token),
          }),
        )
        navigate(homePath, { replace: true })
      })
      .catch(() => {
        logout()
        navigate('/login', { replace: true })
      })
      .finally(() => setRestoring(false))
  }, [hasHydrated, token, tenant]) // eslint-disable-line react-hooks/exhaustive-deps

  // Aguarda reidratação antes de redirecionar — evita flash de login
  if (!hasHydrated) return <PageLoader />
  if (!token) return <Navigate to="/login" replace />
  if (restoring || !tenant) return <PageLoader />

  return <Outlet />
}

function ClientRouteGuard() {
  const location = useLocation()
  const token = useAuthStore((s) => s.token)
  const user = useAuthStore((s) => s.user)
  const homePath = useAuthStore((s) => s.homePath)
  const modules = useAuthStore((s) => s.modules)
  const isClienteAccess = isClienteToken(token ?? '') ||
    String(user?.type ?? '').toUpperCase() === 'CLIENTE' ||
    homePath.includes('portalCliente')

  if (!isClienteAccess) return <Outlet />

  const fallbackPath = homePath || '/home/portalCliente'
  const currentPath = location.pathname

  if (currentPath === '/home' && fallbackPath !== '/home') {
    return <Navigate to={fallbackPath} replace />
  }

  if (isAlwaysAllowedClientPath(currentPath)) return <Outlet />
  if (isBlockedClientPath(currentPath)) return <Navigate to={fallbackPath} replace />

  if (modules.length === 0) return <Outlet />

  const allowedPaths = getAllowedClientPaths(modules)
  allowedPaths.add(normalizeAppPath(fallbackPath) ?? fallbackPath)

  return allowedPaths.has(currentPath) ? <Outlet /> : <Navigate to={fallbackPath} replace />
}

// ─── Guard: rotas públicas (redireciona autenticado) ──────────────────────────

function PublicLayout() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated())
  const homePath = useAuthStore((s) => s.homePath)
  if (isAuthenticated) {
    return <Navigate to={homePath} replace />
  }
  return <Outlet />
}

function HomeRedirect() {
  const homePath = useAuthStore((s) => s.homePath)
  return <Navigate to={homePath || '/home'} replace />
}

const CLIENT_BLOCKED_PATHS = new Set([
  '/parameterConfig',
  '/usuarioList',
  '/usuario',
  '/perfis-acesso',
  '/perfis-acesso/form',
  '/usuario-perfis',
  '/usuario-cliente',
  '/usuario-cliente/form',
  '/template',
  '/template/form',
  '/templateCreateEdit',
  '/messagesDefinition',
  '/messagesDefinition/form',
  '/messagesDefinitionCreateEdit',
  '/MessagesDefinitionCreateEdit',
])

function isAlwaysAllowedClientPath(path: string) {
  return path === '/profile'
}

function isBlockedClientPath(path: string) {
  return CLIENT_BLOCKED_PATHS.has(path)
}

function getAllowedClientPaths(modules: ReturnType<typeof useAuthStore.getState>['modules']) {
  const paths = new Set<string>()
  modules.forEach((mod) => {
    ;(mod.menus ?? []).forEach((menu) => {
      const path = normalizeAppPath(menu.url)
      if (path) paths.add(path)
    })
  })
  return paths
}

function normalizeAppPath(url: string | null | undefined) {
  if (!url || /^https?:\/\//i.test(url)) return null

  const [rawPath] = url.trim().split('?')
  if (!rawPath) return null
  if (rawPath === '/') return '/home'
  if (rawPath.startsWith('/home')) return rawPath
  if (rawPath.startsWith('/')) return rawPath

  return `/home/${rawPath.replace(/^home\/?/, '')}`
}

// ─── Router ───────────────────────────────────────────────────────────────────

export function AppRouter() {
  return (
    <BrowserRouter>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          {/* Rotas públicas */}
          <Route element={<PublicLayout />}>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/login/:tenant" element={<LoginPage />} />
            <Route path="/register-user" element={<RegisterUserPage />} />
          </Route>

          {/* Fluxo de autenticação (sem guard de redirect) */}
          <Route path="/tenant" element={<TenantPage />} />
          <Route path="/mfa" element={<MfaPage />} />
          <Route path="/email-confirmation" element={<IdentityConfirmationPage type="email" />} />
          <Route path="/phone-confirmation" element={<IdentityConfirmationPage type="phone" />} />

          {/* Rotas protegidas */}
          <Route element={<ProtectedLayout />}>
            <Route element={<ClientRouteGuard />}>
              <Route path="/home" element={<MainPage />} />
              <Route path="/home/:screen" element={<MainPage />} />
              <Route path="/profile" element={<ProfilePage />} />
              <Route path="/parameterConfig" element={<ParameterConfigPage />} />
              <Route path="/usuarioList" element={<UsuarioListPage />} />
              <Route path="/usuario" element={<UserPermissionsPage />} />
              <Route path="/perfis-acesso" element={<PerfisAcessoPage />} />
              <Route path="/perfis-acesso/form" element={<PerfisAcessoFormPage />} />
              <Route path="/usuario-perfis" element={<UsuarioPerfisPage />} />
              <Route path="/usuario-cliente" element={<UsuarioClientePage />} />
              <Route path="/usuario-cliente/form" element={<UsuarioClienteFormPage />} />
              <Route path="/template" element={<TemplatePage />} />
              <Route path="/template/form" element={<TemplateFormPage />} />
              <Route path="/templateCreateEdit" element={<TemplateFormPage />} />
              <Route path="/messagesDefinition" element={<MessagesDefinitionPage />} />
              <Route path="/messagesDefinition/form" element={<MessagesDefinitionFormPage />} />
              <Route path="/messagesDefinitionCreateEdit" element={<MessagesDefinitionFormPage />} />
              <Route path="/MessagesDefinitionCreateEdit" element={<MessagesDefinitionFormPage />} />
              <Route path="/dfe-consulta" element={<DFeConsultaPage />} />
              <Route path="/dfe-emitentes" element={<DFeConsultaPage initialTopTab="emitentes" />} />
              <Route path="/reports" element={<ReportsListPage />} />
              <Route path="/insights" element={<InsightsPage />} />
              <Route path="/nfe-viewer" element={<NfeViewerPage />} />
              <Route path="/report-viewer" element={<ReportViewerPage />} />
            </Route>
          </Route>

          {/* Raiz → redireciona */}
          <Route path="/" element={<HomeRedirect />} />

          {/* 404 */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}

function NotFound() {
  return (
    <div className="flex h-screen flex-col items-center justify-center gap-4">
      <h1 className="text-4xl font-bold">404</h1>
      <p className="text-muted-foreground">Página não encontrada.</p>
      <a href="/home" className="text-primary underline">
        Voltar para o início
      </a>
    </div>
  )
}
