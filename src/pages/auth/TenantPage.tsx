import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { authApi, type Tenant } from '@/api/auth.api'
import { useAuthStore } from '@/store/authStore'

export default function TenantPage() {
  const navigate = useNavigate()
  const setAuth = useAuthStore((s) => s.setAuth)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Tenants recebidos no fluxo de login
  const tenants: Tenant[] = JSON.parse(sessionStorage.getItem('tenants') ?? '[]')

  async function handleSelect(tenantId: string) {
    setLoading(true)
    setError(null)
    try {
      const result = await authApi.selectTenant(tenantId)
      sessionStorage.removeItem('pre_token')
      sessionStorage.removeItem('tenants')

      setAuth({
        token: result.token,
        user: result.user,
        tenant: result.tenant,
        acl: result.acl,
        homePath: result.homePath,
      })

      navigate(result.homePath ?? '/home')
    } catch {
      setError('Erro ao selecionar empresa. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  if (!tenants.length) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground">Nenhuma empresa disponível.</p>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold">Selecione a empresa</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Escolha com qual empresa deseja entrar
          </p>
        </div>

        {error && (
          <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        <ul className="space-y-2">
          {tenants.map((t) => (
            <li key={t.id}>
              <button
                onClick={() => handleSelect(t.id)}
                disabled={loading}
                className="w-full rounded-md border border-border bg-card px-4 py-3 text-left text-sm font-medium hover:bg-accent hover:text-accent-foreground transition-colors disabled:opacity-50"
              >
                {t.name}
              </button>
            </li>
          ))}
        </ul>

        <button
          onClick={() => navigate('/login')}
          className="w-full text-center text-sm text-muted-foreground hover:text-foreground"
        >
          Voltar ao login
        </button>
      </div>
    </div>
  )
}
