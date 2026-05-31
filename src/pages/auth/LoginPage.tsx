import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { authApi } from '@/api/auth.api'
import { setClientToken } from '@/api/client'
import { getNextIdentityValidationPath, saveIdentityValidationState, storeSupportedTenantsFromToken } from './authFlow'
import { useAuthStore } from '@/store/authStore'

const schema = z.object({
  username: z.string().min(1, 'Usuario obrigatorio'),
  password: z.string().min(1, 'Senha obrigatoria'),
})
type FormData = z.infer<typeof schema>

export default function LoginPage() {
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  const { setToken, setTenant, setAcl, setModules, setUser } = useAuthStore()

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  async function onSubmit(data: FormData) {
    setError(null)
    try {
      const result = await authApi.login({ ...data, application: 'myplat' })

      setClientToken(result.token)

      if (result.twoFactorRequired) {
        await authApi.requestMfa().catch(() => {})
        navigate('/mfa')
        return
      }

      const validationPath = getNextIdentityValidationPath(result)
      if (validationPath) {
        saveIdentityValidationState({
          email: result.email,
          telephone: result.telephone,
          confirmedEmail: result.confirmedEmail,
          confirmedTelephone: result.confirmedTelephone,
          source: 'login',
        })
        navigate(validationPath)
        return
      }

      const tenants = storeSupportedTenantsFromToken(result.token)

      if (tenants.length === 0) {
        setError('Nenhuma empresa disponivel para este usuario.')
        return
      }

      if (tenants.length === 1) {
        sessionStorage.removeItem('supported_tenants')
        await finalizarLogin(tenants[0].code, tenants[0].label, setToken, setTenant, setAcl, navigate, setModules, setUser)
        return
      }

      navigate('/tenant')

    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Usuario ou senha invalidos.'
      setError(msg)
    }
  }

  return (
    <div className="min-h-screen bg-[#eaf2ff] px-4 py-8 text-slate-900">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-5xl items-center justify-center">
        <div className="grid w-full overflow-hidden rounded-lg border border-blue-100 bg-white shadow-2xl shadow-blue-950/10 md:grid-cols-[1.05fr_0.95fr]">
          <section className="hidden bg-blue-700 px-10 py-12 text-white md:flex md:flex-col md:justify-between">
            <div>
              <div className="flex h-11 w-11 items-center justify-center rounded-md bg-white/15 text-sm font-bold ring-1 ring-white/20">
                MP
              </div>
              <div className="mt-10 space-y-4">
                <p className="text-sm font-medium uppercase tracking-[0.18em] text-blue-100">MyPlat</p>
                <h1 className="max-w-sm text-4xl font-semibold leading-tight">
                  Gestao empresarial com acesso seguro.
                </h1>
                <p className="max-w-md text-sm leading-6 text-blue-100">
                  Entre na plataforma para acompanhar operacoes, modulos e rotinas do seu ambiente.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3 text-xs text-blue-100">
              <div className="rounded-md bg-white/10 p-3 ring-1 ring-white/10">
                <p className="font-semibold text-white">SSO</p>
                <p className="mt-1">Acesso centralizado</p>
              </div>
              <div className="rounded-md bg-white/10 p-3 ring-1 ring-white/10">
                <p className="font-semibold text-white">MFA</p>
                <p className="mt-1">Camada extra</p>
              </div>
              <div className="rounded-md bg-white/10 p-3 ring-1 ring-white/10">
                <p className="font-semibold text-white">Tenant</p>
                <p className="mt-1">Multiempresa</p>
              </div>
            </div>
          </section>

          <section className="px-6 py-8 sm:px-10 md:py-12">
            <div className="mb-8 md:hidden">
              <div className="flex h-11 w-11 items-center justify-center rounded-md bg-blue-700 text-sm font-bold text-white">
                MP
              </div>
            </div>

            <div className="mb-7">
              <p className="text-sm font-medium text-blue-700">Bem-vindo de volta</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight">Acesse sua conta</h2>
              <p className="mt-1 text-sm text-slate-500">Use suas credenciais MyPlat para continuar.</p>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div className="space-y-1.5">
                <label htmlFor="username" className="text-sm font-medium text-slate-700">Usuario</label>
                <input
                  id="username"
                  type="text"
                  autoComplete="username"
                  className="h-10 w-full rounded-md border border-blue-100 bg-white px-3 text-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                  placeholder="seu.usuario"
                  {...register('username')}
                />
                {errors.username && <p className="text-xs text-destructive">{errors.username.message}</p>}
              </div>

              <div className="space-y-1.5">
                <label htmlFor="password" className="text-sm font-medium text-slate-700">Senha</label>
                <input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  className="h-10 w-full rounded-md border border-blue-100 bg-white px-3 text-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                  placeholder="********"
                  {...register('password')}
                />
                {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
              </div>

              {error && (
                <div className="rounded-md border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
              )}

              <button
                type="submit"
                disabled={isSubmitting}
                className="mt-2 flex h-10 w-full items-center justify-center rounded-md bg-blue-700 px-4 text-sm font-semibold text-white shadow-sm shadow-blue-700/20 transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSubmitting ? 'Entrando...' : 'Entrar'}
              </button>
            </form>

            <p className="mt-6 text-center text-sm text-slate-500">
              Nao tem uma conta?{' '}
              <button
                type="button"
                onClick={() => navigate('/register-user')}
                className="font-semibold text-blue-700 transition hover:text-blue-900"
              >
                Registrar
              </button>
            </p>
          </section>
        </div>
      </div>
    </div>
  )
}

export async function finalizarLogin(
  tenantCode: string,
  tenantLabel: string,
  setToken: (t: string) => void,
  setTenant: (t: { code: string; label: string }) => void,
  setAcl: (acl: import('@/api/auth.api').AclMap, homePath?: string) => void,
  navigate: (path: string) => void,
  setModules?: (m: import('@/api/auth.api').ModuleDefinition[]) => void,
  setUser?: (u: import('@/api/auth.api').User) => void,
) {
  const tenantRes = await authApi.selectTenant(tenantCode)
  setToken(tenantRes.token)
  setTenant({ code: tenantCode, label: tenantLabel })

  const [permissions, userData] = await Promise.allSettled([
    authApi.getPermissions(),
    authApi.getLoggedUser(),
  ])

  if (permissions.status === 'rejected') throw permissions.reason

  const perms = permissions.value

  setAcl(perms.menus, '/home')

  if (setUser && userData.status === 'fulfilled') {
    setUser(userData.value)
  }

  if (setModules) {
    const allModules = await authApi.getSystemModules()

    const filtered = allModules
      .map((mod) => ({
        ...mod,
        menus: (mod.menus ?? []).filter((menu) => {
          const nivel = perms.menus[String(menu.idMenu)]
          return nivel !== 'sem_acesso'
        }),
      }))
      .filter((mod) => mod.menus.length > 0)
      .sort((a, b) => (a.nrOrdem ?? 99) - (b.nrOrdem ?? 99))

    setModules(filtered)
  }

  navigate('/home')
}
