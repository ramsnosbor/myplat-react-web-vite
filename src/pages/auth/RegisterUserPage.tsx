import { useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { authApi } from '@/api/auth.api'
import { setClientToken } from '@/api/client'
import { saveIdentityValidationState } from './authFlow'

const schema = z.object({
  name: z.string().min(1, 'Nome obrigatorio'),
  cpf: z.string().refine(validateCpf, 'CPF invalido'),
  email: z.string().email('E-mail invalido'),
  phone: z.string().refine(validatePhone, 'WhatsApp invalido'),
  password: z.string().refine(isStrongPassword, 'Senha fraca'),
  confirmPassword: z.string().min(1, 'Confirme a senha'),
}).refine((data) => data.password === data.confirmPassword, {
  path: ['confirmPassword'],
  message: 'As senhas nao conferem',
})

type FormData = z.infer<typeof schema>

export default function RegisterUserPage() {
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    mode: 'onChange',
    defaultValues: {
      name: '',
      cpf: '',
      email: '',
      phone: '',
      password: '',
      confirmPassword: '',
    },
  })

  const password = watch('password')
  const requirements = useMemo(() => getPasswordRequirements(password), [password])

  async function onSubmit(data: FormData) {
    setError(null)
    setSuccess(false)
    try {
      const createdUser = await authApi.createUser({
        username: data.email,
        password: data.password,
        nome: data.name,
        cpf: formatCpf(data.cpf),
        email: data.email,
        telephone: formatWhatsapp(data.phone),
        tenants: [],
        authorities: [],
      })
      if (createdUser.token) setClientToken(createdUser.token)
      saveIdentityValidationState({
        email: createdUser.email ?? data.email,
        telephone: createdUser.telephone ?? formatWhatsapp(data.phone),
        confirmedEmail: createdUser.confirmedEmail ?? false,
        confirmedTelephone: createdUser.confirmedTelephone ?? false,
        source: 'register',
      })
      setSuccess(true)
      window.setTimeout(() => navigate('/email-confirmation'), 500)
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string; messageError?: string } } })
          ?.response?.data?.messageError ??
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Erro ao tentar registrar usuario.'
      setError(msg)
    }
  }

  return (
    <div className="min-h-screen bg-[#eaf2ff] px-4 py-8 text-slate-900">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-5xl items-center justify-center">
        <div className="grid w-full overflow-hidden rounded-lg border border-blue-100 bg-white shadow-2xl shadow-blue-950/10 md:grid-cols-[0.9fr_1.1fr]">
          <section className="hidden bg-blue-700 px-10 py-12 text-white md:flex md:flex-col md:justify-between">
            <div>
              <div className="flex h-11 w-11 items-center justify-center rounded-md bg-white/15 text-sm font-bold ring-1 ring-white/20">
                MP
              </div>
              <div className="mt-10 space-y-4">
                <p className="text-sm font-medium uppercase tracking-[0.18em] text-blue-100">MyPlat</p>
                <h1 className="max-w-sm text-4xl font-semibold leading-tight">Crie seu acesso com seguranca.</h1>
                <p className="max-w-md text-sm leading-6 text-blue-100">
                  Cadastre seus dados para acessar empresas, modulos e rotinas liberadas para seu usuario.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3 text-xs text-blue-100">
              <div className="rounded-md bg-white/10 p-3 ring-1 ring-white/10">
                <p className="font-semibold text-white">Conta</p>
                <p className="mt-1">Acesso individual</p>
              </div>
              <div className="rounded-md bg-white/10 p-3 ring-1 ring-white/10">
                <p className="font-semibold text-white">Senha</p>
                <p className="mt-1">Regras fortes</p>
              </div>
              <div className="rounded-md bg-white/10 p-3 ring-1 ring-white/10">
                <p className="font-semibold text-white">SSO</p>
                <p className="mt-1">Cadastro central</p>
              </div>
            </div>
          </section>

          <section className="px-6 py-8 sm:px-10 md:py-12">
            <div className="mb-7">
              <p className="text-sm font-medium text-blue-700">Novo usuario</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight">Registrar conta</h2>
              <p className="mt-1 text-sm text-slate-500">Informe seus dados para criar o acesso.</p>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <FormField label="Nome completo" error={errors.name?.message}>
                <input className={inputClass} autoComplete="name" {...register('name')} />
              </FormField>

              <div className="grid gap-4 sm:grid-cols-2">
                <FormField label="CPF" error={errors.cpf?.message}>
                  <input
                    className={inputClass}
                    inputMode="numeric"
                    autoComplete="off"
                    maxLength={14}
                    {...register('cpf', {
                      onChange: (e) => setValue('cpf', formatCpf(e.target.value), { shouldValidate: true }),
                    })}
                  />
                </FormField>

                <FormField label="WhatsApp" error={errors.phone?.message}>
                  <input
                    className={inputClass}
                    inputMode="tel"
                    autoComplete="tel"
                    maxLength={14}
                    {...register('phone', {
                      onChange: (e) => setValue('phone', formatWhatsapp(e.target.value), { shouldValidate: true }),
                    })}
                  />
                </FormField>
              </div>

              <FormField label="E-mail" error={errors.email?.message}>
                <input className={inputClass} type="email" autoComplete="email" {...register('email')} />
              </FormField>

              <div className="grid gap-4 sm:grid-cols-2">
                <FormField label="Senha" error={errors.password?.message}>
                  <input className={inputClass} type="password" autoComplete="new-password" {...register('password')} />
                </FormField>

                <FormField label="Confirmar senha" error={errors.confirmPassword?.message}>
                  <input className={inputClass} type="password" autoComplete="new-password" {...register('confirmPassword')} />
                </FormField>
              </div>

              <div className="rounded-md border border-blue-100 bg-blue-50/60 p-3">
                <p className="text-xs font-semibold text-slate-700">Sua senha deve ter:</p>
                <div className="mt-2 grid gap-1 text-xs sm:grid-cols-2">
                  <PasswordRule valid={requirements.length} label="8 caracteres ou mais" />
                  <PasswordRule valid={requirements.uppercase} label="Letra maiuscula" />
                  <PasswordRule valid={requirements.lowercase} label="Letra minuscula" />
                  <PasswordRule valid={requirements.number} label="Numero" />
                  <PasswordRule valid={requirements.special} label="Caractere especial" />
                </div>
              </div>

              {error && (
                <div className="rounded-md border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
              )}
              {success && (
                <div className="rounded-md border border-green-100 bg-green-50 px-3 py-2 text-sm text-green-700">
                  Usuario registrado. Redirecionando para validacao...
                </div>
              )}

              <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => navigate('/login')}
                  className="flex h-10 items-center justify-center rounded-md border border-blue-100 px-4 text-sm font-semibold text-blue-700 transition hover:bg-blue-50"
                >
                  Voltar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex h-10 items-center justify-center rounded-md bg-blue-700 px-4 text-sm font-semibold text-white shadow-sm shadow-blue-700/20 transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSubmitting ? 'Registrando...' : 'Registrar'}
                </button>
              </div>
            </form>
          </section>
        </div>
      </div>
    </div>
  )
}

const inputClass = 'h-10 w-full rounded-md border border-blue-100 bg-white px-3 text-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100'

function FormField({ label, error, children }: { label: string; error?: string; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      {children}
      {error && <span className="block text-xs text-destructive">{error}</span>}
    </label>
  )
}

function PasswordRule({ valid, label }: { valid: boolean; label: string }) {
  return (
    <span className={valid ? 'text-green-700' : 'text-red-600'}>
      <i className={`bi ${valid ? 'bi-check-circle-fill' : 'bi-x-circle-fill'} mr-1`} aria-hidden />
      {label}
    </span>
  )
}

function getPasswordRequirements(value = '') {
  return {
    length: value.length >= 8,
    uppercase: /[A-Z]/.test(value),
    lowercase: /[a-z]/.test(value),
    number: /\d/.test(value),
    special: /[\W_]/.test(value),
  }
}

function isStrongPassword(value: string) {
  return Object.values(getPasswordRequirements(value)).every(Boolean)
}

function onlyDigits(value: string) {
  return value.replace(/\D/g, '')
}

function formatCpf(value: string) {
  const digits = onlyDigits(value).slice(0, 11)
  return digits
    .replace(/^(\d{3})(\d)/, '$1.$2')
    .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/^(\d{3})\.(\d{3})\.(\d{3})(\d)/, '$1.$2.$3-$4')
}

function formatWhatsapp(value: string) {
  const digits = onlyDigits(value).slice(0, 11)
  if (digits.length <= 2) return digits
  if (digits.length <= 7) return `${digits.slice(0, 2)} ${digits.slice(2)}`
  return `${digits.slice(0, 2)} ${digits.slice(2, 7)}-${digits.slice(7)}`
}

function validatePhone(value: string) {
  const digits = onlyDigits(value)
  return digits.length >= 10 && digits.length <= 13
}

function validateCpf(value: string) {
  const cpf = onlyDigits(value)
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false

  let sum = 0
  for (let i = 0; i < 9; i += 1) sum += Number(cpf[i]) * (10 - i)
  let digit = (sum * 10) % 11
  if (digit === 10) digit = 0
  if (digit !== Number(cpf[9])) return false

  sum = 0
  for (let i = 0; i < 10; i += 1) sum += Number(cpf[i]) * (11 - i)
  digit = (sum * 10) % 11
  if (digit === 10) digit = 0

  return digit === Number(cpf[10])
}
