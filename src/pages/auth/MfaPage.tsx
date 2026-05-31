import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { authApi } from '@/api/auth.api'
import { setClientToken } from '@/api/client'
import { getNextIdentityValidationPath, saveIdentityValidationState, storeSupportedTenantsFromToken } from './authFlow'
import { useAuthStore } from '@/store/authStore'
import { finalizarLogin } from './LoginPage'

const CODE_LENGTH = 6

export default function MfaPage() {
  const navigate = useNavigate()
  const [digits, setDigits] = useState<string[]>(Array(CODE_LENGTH).fill(''))
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [resent, setResent] = useState(false)
  const inputRefs = useRef<Array<HTMLInputElement | null>>([])
  const { setToken, setTenant, setAcl, setModules, setUser } = useAuthStore()

  function handleChange(index: number, value: string) {
    const digit = value.replace(/[^a-zA-Z0-9]/g, '').slice(-1).toUpperCase()
    const next = [...digits]
    next[index] = digit
    setDigits(next)
    if (digit && index < CODE_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus()
    }
    if (next.every((d) => d !== '') && digit) {
      handleVerify(next.join(''))
    }
  }

  function handleKeyDown(index: number, e: React.KeyboardEvent) {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus()
    }
  }

  async function handleVerify(code: string) {
    setLoading(true)
    setError(null)
    try {
      const result = await authApi.verifyMfa(code)

      setClientToken(result.token)

      const validationPath = getNextIdentityValidationPath({
        email: result.email ?? '',
        telephone: result.telephone ?? '',
        confirmedEmail: result.confirmedEmail ?? true,
        confirmedTelephone: result.confirmedTelephone ?? true,
      })
      if (validationPath) {
        saveIdentityValidationState({
          email: result.email,
          telephone: result.telephone,
          confirmedEmail: result.confirmedEmail ?? true,
          confirmedTelephone: result.confirmedTelephone ?? true,
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
    } catch {
      setError('Codigo invalido ou expirado. Tente novamente.')
      setDigits(Array(CODE_LENGTH).fill(''))
      inputRefs.current[0]?.focus()
    } finally {
      setLoading(false)
    }
  }

  async function handleResend() {
    try {
      await authApi.requestMfa()
      setResent(true)
      setTimeout(() => setResent(false), 30000)
    } catch {
      setError('Nao foi possivel reenviar o codigo.')
    }
  }

  return (
    <div className="min-h-screen bg-[#eaf2ff] px-4 py-8 text-slate-900">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-md items-center justify-center">
        <div className="w-full rounded-lg border border-blue-100 bg-white p-6 text-center shadow-2xl shadow-blue-950/10 sm:p-8">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-md bg-blue-700 text-white shadow-sm shadow-blue-700/20">
            <i className="bi bi-shield-lock text-lg" aria-hidden />
          </div>

          <h1 className="mt-5 text-2xl font-semibold tracking-tight">Verificacao</h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            Digite o codigo de 6 digitos enviado para voce.
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

          {error && (
            <div className="mt-5 rounded-md border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          {resent && (
            <p className="mt-5 rounded-md bg-blue-50 px-3 py-2 text-sm text-blue-700">
              Codigo reenviado com sucesso.
            </p>
          )}

          <div className="mt-6 flex flex-col gap-2">
            <button
              onClick={() => handleVerify(digits.join(''))}
              disabled={loading || digits.some((d) => !d)}
              className="flex h-10 w-full items-center justify-center rounded-md bg-blue-700 px-4 text-sm font-semibold text-white shadow-sm shadow-blue-700/20 transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? 'Verificando...' : 'Confirmar'}
            </button>

            <button
              onClick={handleResend}
              disabled={resent}
              className="text-center text-sm font-medium text-slate-500 transition hover:text-blue-700 disabled:opacity-50"
            >
              {resent ? 'Aguarde para reenviar' : 'Reenviar codigo'}
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
