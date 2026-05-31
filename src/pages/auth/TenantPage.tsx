import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { finalizarLogin } from './LoginPage'
import type { TenantOption } from './authFlow'

export default function TenantPage() {
  const navigate = useNavigate()
  const { user, tenant: currentTenant, homePath, setToken, setUser, setTenant, setAcl, setModules } = useAuthStore()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const sessionTenants = parseSessionTenants()
  const isLoginFlow = sessionTenants.length > 0
  const isSwitchTenantFlow = !isLoginFlow && !!currentTenant
  const userTenants = Object.entries(user?.tenantSupported ?? {}).map(([code, label]) => ({ code, label }))
  const tenants: TenantOption[] = sessionTenants.length > 0 ? sessionTenants : userTenants

  async function handleSelect(tenant: TenantOption) {
    setLoading(true)
    setError(null)
    try {
      sessionStorage.removeItem('supported_tenants')
      await finalizarLogin(
        tenant.code,
        tenant.label,
        setToken,
        setTenant,
        setAcl,
        isSwitchTenantFlow ? (path) => window.location.assign(path) : navigate,
        setModules,
        setUser,
      )
    } catch {
      setError('Erro ao selecionar empresa. Tente novamente.')
      setLoading(false)
    }
  }

  function goBack() {
    if (isLoginFlow) {
      sessionStorage.removeItem('supported_tenants')
      navigate('/login')
      return
    }
    navigate(homePath || '/home')
  }

  if (!tenants.length) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#eaf2ff] px-4">
        <div className="w-full max-w-md rounded-lg border border-blue-100 bg-white p-8 text-center shadow-xl shadow-blue-950/10">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-md bg-blue-700 text-white">
            <i className="bi bi-building" aria-hidden />
          </div>
          <p className="mt-4 text-sm font-medium text-slate-700">Nenhuma empresa disponivel.</p>
          <button
            onClick={goBack}
            className="mt-5 text-sm font-medium text-blue-700 hover:text-blue-900"
          >
            {isLoginFlow ? 'Voltar ao login' : 'Voltar ao inicio'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#eaf2ff] px-4 py-8 text-slate-900">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-3xl items-center justify-center">
        <div className="w-full rounded-lg border border-blue-100 bg-white p-6 shadow-2xl shadow-blue-950/10 sm:p-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium text-blue-700">Ambiente de trabalho</p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight">Selecione a empresa</h1>
              <p className="mt-1 text-sm text-slate-500">
                Escolha com qual empresa deseja entrar.
              </p>
            </div>
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-blue-700 text-white shadow-sm shadow-blue-700/20">
              <i className="bi bi-building text-lg" aria-hidden />
            </div>
          </div>

          {error && (
            <div className="mt-5 rounded-md border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
          )}

          <ul className="mt-6 grid gap-3 sm:grid-cols-2">
            {tenants.map((t) => (
              <li key={t.code}>
                <button
                  onClick={() => handleSelect(t)}
                  disabled={loading || (!isLoginFlow && t.code === currentTenant?.code)}
                  className={[
                    'group flex min-h-20 w-full items-center gap-3 rounded-md border px-4 py-3 text-left transition disabled:cursor-not-allowed',
                    !isLoginFlow && t.code === currentTenant?.code
                      ? 'border-blue-300 bg-blue-50'
                      : 'border-blue-100 bg-white hover:border-blue-300 hover:bg-blue-50 disabled:opacity-60',
                  ].join(' ')}
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-blue-100 text-sm font-semibold text-blue-700 group-hover:bg-blue-700 group-hover:text-white">
                    {t.label.slice(0, 2).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-slate-800">{t.label}</span>
                    <span className="mt-0.5 block truncate text-xs text-slate-500">{t.code}</span>
                  </span>
                  {!isLoginFlow && t.code === currentTenant?.code ? (
                    <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-700">Atual</span>
                  ) : (
                    <i className="bi bi-arrow-right text-sm text-blue-400 group-hover:text-blue-700" aria-hidden />
                  )}
                </button>
              </li>
            ))}
          </ul>

          <button
            onClick={goBack}
            className="mt-6 text-sm font-medium text-slate-500 transition hover:text-blue-700"
          >
            {isLoginFlow ? 'Voltar ao login' : 'Voltar ao inicio'}
          </button>
        </div>
      </div>
    </div>
  )
}

function parseSessionTenants(): TenantOption[] {
  try {
    const raw = sessionStorage.getItem('supported_tenants')
    if (!raw) return []
    const parsed = JSON.parse(raw) as TenantOption[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}
