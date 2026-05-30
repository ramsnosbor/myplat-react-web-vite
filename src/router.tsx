import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'

// ─── Lazy pages ───────────────────────────────────────────────────────────────

const LoginPage = lazy(() => import('@/pages/auth/LoginPage'))
const TenantPage = lazy(() => import('@/pages/auth/TenantPage'))
const MfaPage = lazy(() => import('@/pages/auth/MfaPage'))
const MainPage = lazy(() => import('@/pages/main/MainPage'))

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

// ─── Guard: rotas públicas (redireciona autenticado) ──────────────────────────

function PublicLayout() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated())
  const homePath = useAuthStore((s) => s.homePath)
  if (isAuthenticated) {
    return <Navigate to={homePath} replace />
  }
  return <Outlet />
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
          </Route>

          {/* Fluxo de autenticação (sem guard de redirect) */}
          <Route path="/tenant" element={<TenantPage />} />
          <Route path="/mfa" element={<MfaPage />} />

          {/* Rotas protegidas */}
          <Route element={<ProtectedLayout />}>
            <Route path="/home" element={<MainPage />} />
            <Route path="/home/:screen" element={<MainPage />} />
          </Route>

          {/* Raiz → redireciona */}
          <Route path="/" element={<Navigate to="/home" replace />} />

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
