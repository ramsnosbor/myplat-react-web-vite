import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { authApi } from '@/api/auth.api'
import {
  clearIdentityValidationState,
  getIdentityValidationState,
  saveIdentityValidationState,
  storeSupportedTenantsFromToken,
} from './authFlow'
import { getClientToken } from '@/api/client'
import { useAuthStore } from '@/store/authStore'
import { finalizarLogin } from './LoginPage'

const CODE_LENGTH = 6

interface IdentityConfirmationPageProps {
  type: 'email' | 'phone'
}

export default function IdentityConfirmationPage({ type }: IdentityConfirmationPageProps) {
  const navigate = useNavigate()
  const [digits, setDigits] = useState<string[]>(Array(CODE_LENGTH).fill(''))
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [cooldown, setCooldown] = useState(0)
  const [resendCount, setResendCount] = useState(0)
  const inputRefs = useRef<Array<HTMLInputElement | null>>([])
  const { setToken, setTenant, setAcl, setModules, setUser } = useAuthStore()
  const state = getIdentityValidationState()
  const label = type === 'email' ? 'E-mail' : 'WhatsApp'
  const destination = type === 'email' ? state.email : state.telephone

  useEffect(() => {
    if (cooldown <= 0) return
    const timer = window.setInterval(() => setCooldown((value) => value - 1), 1000)
    return () => window.clearInterval(timer)
  }, [cooldown])

  function handleChange(index: number, value: string) {
    const digit = value.replace(/[^a-zA-Z0-9]/g, '').slice(-1).toUpperCase()
    const next = [...digits]
    next[index] = digit
    setDigits(next)
    if (digit && index < CODE_LENGTH - 1) inputRefs.current[index + 1]?.focus()
    if (next.every(Boolean) && digit) handleVerify(next.join(''))
  }

  function handleKeyDown(index: number, e: React.KeyboardEvent) {
    if (e.key === 'Backspace' && !digits[index] && index > 0) inputRefs.current[index - 1]?.focus()
  }

  async function continueAfterValidation(nextState = getIdentityValidationState()): Promise<void> {
    if (type === 'email' && !nextState.confirmedTelephone) {
      navigate('/phone-confirmation')
      return
    }

    clearIdentityValidationState()
    const token = getClientToken()
    if (!token && nextState.source === 'register') {
      navigate('/login', { replace: true })
      return
    }
    if (!token) {
      setError('Nenhuma empresa disponivel para este usuario.')
      return
    }

    const tenants = storeSupportedTenantsFromToken(token)

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
  }

  async function handleVerify(code: string) {
    setLoading(true)
    setError(null)
    setMessage(null)
    try {
      await authApi.validateAccountToken(code)
      const nextState = {
        ...getIdentityValidationState(),
        confirmedEmail: type === 'email' ? true : getIdentityValidationState().confirmedEmail,
        confirmedTelephone: type === 'phone' ? true : getIdentityValidationState().confirmedTelephone,
      }
      saveIdentityValidationState(nextState)
      setMessage(`${label} validado com sucesso.`)
      window.setTimeout(() => continueAfterValidation(nextState), 350)
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { details?: string; message?: string; messageError?: string } } })
          ?.response?.data?.details ??
        (err as { response?: { data?: { messageError?: string } } })?.response?.data?.messageError ??
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Codigo invalido ou expirado.'
      setError(msg)
      setDigits(Array(CODE_LENGTH).fill(''))
      inputRefs.current[0]?.focus()
    } finally {
      setLoading(false)
    }
  }

  async function handleResend() {
    setError(null)
    setMessage(null)
    try {
      await authApi.resendConfirmationToken(type === 'email' ? 'EMAIL' : 'WHATSAPP')
      setMessage('Token reenviado com sucesso.')
      setCooldown(45 * Math.max(1, 2 ** resendCount))
      setResendCount((count) => count + 1)
    } catch {
      setError('Erro ao reenviar token.')
    }
  }

  return (
    <div className="min-h-screen bg-[#eaf2ff] px-4 py-8 text-slate-900">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-md items-center justify-center">
        <div className="w-full rounded-lg border border-blue-100 bg-white p-6 text-center shadow-2xl shadow-blue-950/10 sm:p-8">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-md bg-blue-700 text-white shadow-sm shadow-blue-700/20">
            <i className={`bi ${type === 'email' ? 'bi-envelope-check' : 'bi-whatsapp'} text-lg`} aria-hidden />
          </div>

          <h1 className="mt-5 text-2xl font-semibold tracking-tight">Validacao de {label}</h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            {destination
              ? `Foi enviado um token para ${destination}. Confirme para continuar.`
              : `Foi enviado um token para seu ${label}. Confirme para continuar.`}
          </p>

          <div className="mt-6 flex justify-center gap-2">
            {digits.map((digit, i) => (
              <input
                key={i}
                ref={(el) => { inputRefs.current[i] = el }}
                type="text"
                inputMode="text"
                maxLength={1}
                value={digit}
                onChange={(e) => handleChange(i, e.target.value)}
                onKeyDown={(e) => handleKeyDown(i, e)}
                disabled={loading}
                className="h-12 w-10 rounded-md border border-blue-100 bg-white text-center text-lg font-semibold text-slate-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100 disabled:opacity-50"
              />
            ))}
          </div>

          {error && <div className="mt-5 rounded-md border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
          {message && <div className="mt-5 rounded-md border border-green-100 bg-green-50 px-3 py-2 text-sm text-green-700">{message}</div>}

          <div className="mt-6 flex flex-col gap-2">
            <button
              onClick={() => handleVerify(digits.join(''))}
              disabled={loading || digits.some((d) => !d)}
              className="flex h-10 w-full items-center justify-center rounded-md bg-blue-700 px-4 text-sm font-semibold text-white shadow-sm shadow-blue-700/20 transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? 'Validando...' : 'Confirmar'}
            </button>

            <button
              onClick={handleResend}
              disabled={cooldown > 0}
              className="text-center text-sm font-medium text-slate-500 transition hover:text-blue-700 disabled:opacity-50"
            >
              {cooldown > 0 ? `Aguarde ${cooldown}s para reenviar` : 'Reenviar token'}
            </button>

            <button
              onClick={() => navigate('/login')}
              className="text-center text-sm font-medium text-slate-500 transition hover:text-blue-700"
            >
              Voltar ao login
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
