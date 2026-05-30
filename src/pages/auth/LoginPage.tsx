import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { authApi } from '@/api/auth.api'
import { useAuthStore } from '@/store/authStore'

// ─── Schema de validação ──────────────────────────────────────────────────────

const schema = z.object({
  username: z.string().min(1, 'Usuário obrigatório'),
  password: z.string().min(1, 'Senha obrigatória'),
})

type FormData = z.infer<typeof schema>

// ─── Componente ───────────────────────────────────────────────────────────────

export default function LoginPage() {
  const navigate = useNavigate()
  const setAuth = useAuthStore((s) => s.setAuth)
  const [error, setError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({ resolver: zodResolver(schema) })

  async function onSubmit(data: FormData) {
    setError(null)
    try {
      const result = await authApi.login(data)

      if (result.requiresMfa) {
        // Salva token temporário para o fluxo de MFA
        sessionStorage.setItem('mfa_token', result.token)
        navigate('/mfa')
        return
      }

      if (result.requiresTenant) {
        // Salva token temporário + lista de tenants para seleção
        sessionStorage.setItem('pre_token', result.token)
        sessionStorage.setItem('tenants', JSON.stringify(result.tenants ?? []))
        navigate('/tenant')
        return
      }

      setAuth({
        token: result.token,
        user: result.user,
        tenant: result.tenant,
        acl: result.acl,
        homePath: result.homePath,
      })

      navigate(result.homePath ?? '/home')
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Usuário ou senha inválidos.'
      setError(msg)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-6">
        {/* Logo / Título */}
        <div className="text-center">
          <h1 className="text-2xl font-bold tracking-tight">MyPlat</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Acesse sua conta
          </p>
        </div>

        {/* Formulário */}
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {/* Usuário */}
          <div className="space-y-1">
            <label htmlFor="username" className="text-sm font-medium">
              Usuário
            </label>
            <input
              id="username"
              type="text"
              autoComplete="username"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="seu.usuario"
              {...register('username')}
            />
            {errors.username && (
              <p className="text-xs text-destructive">{errors.username.message}</p>
            )}
          </div>

          {/* Senha */}
          <div className="space-y-1">
            <label htmlFor="password" className="text-sm font-medium">
              Senha
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="••••••••"
              {...register('password')}
            />
            {errors.password && (
              <p className="text-xs text-destructive">{errors.password.message}</p>
            )}
          </div>

          {/* Erro global */}
          {error && (
            <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {isSubmitting ? 'Entrando...' : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  )
}
