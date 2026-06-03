import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { isClienteToken } from '@/pages/auth/authFlow'

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
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated())
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }
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
