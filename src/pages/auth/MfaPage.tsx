import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { authApi } from '@/api/auth.api'
import { useAuthStore } from '@/store/authStore'

const CODE_LENGTH = 6

export default function MfaPage() {
  const navigate = useNavigate()
  const setAuth = useAuthStore((s) => s.setAuth)
  const [digits, setDigits] = useState<string[]>(Array(CODE_LENGTH).fill(''))
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [resent, setResent] = useState(false)
  const inputRefs = useRef<Array<HTMLInputElement | null>>([])

  function handleChange(index: number, value: string) {
    const digit = value.replace(/\D/g, '').slice(-1)
    const next = [...digits]
    next[index] = digit
    setDigits(next)
    if (digit && index < CODE_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus()
    }
    // Auto-submit quando todos preenchidos
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
      sessionStorage.removeItem('mfa_token')

      setAuth({
        token: result.token,
        user: result.user,
        tenant: result.tenant,
        acl: result.acl,
        homePath: result.homePath,
      })

      navigate(result.homePath ?? '/home')
    } catch {
      setError('Código inválido ou expirado. Tente novamente.')
      setDigits(Array(CODE_LENGTH).fill(''))
      inputRefs.current[0]?.focus()
    } finally {
      setLoading(false)
    }
  }

  async function handleResend() {
    try {
      await authApi.resendMfa()
      setResent(true)
      setTimeout(() => setResent(false), 30000)
    } catch {
      setError('Não foi possível reenviar o código.')
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold">Verificação</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Digite o código de 6 dígitos enviado para você
          </p>
        </div>

        {/* OTP inputs */}
        <div className="flex justify-center gap-2">
          {digits.map((digit, i) => (
            <input
              key={i}
              ref={(el) => { inputRefs.current[i] = el }}
              type="text"
              inputMode="numeric"
              maxLength={1}
              value={digit}
              onChange={(e) => handleChange(i, e.target.value)}
              onKeyDown={(e) => handleKeyDown(i, e)}
              disabled={loading}
              className="h-12 w-10 rounded-md border border-input bg-background text-center text-lg font-semibold focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
            />
          ))}
        </div>

        {error && (
          <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive text-center">
            {error}
          </div>
        )}

        {resent && (
          <p className="text-center text-sm text-muted-foreground">
            Código reenviado com sucesso.
          </p>
        )}

        <div className="flex flex-col gap-2">
          <button
            onClick={() => handleVerify(digits.join(''))}
            disabled={loading || digits.some((d) => !d)}
            className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {loading ? 'Verificando...' : 'Confirmar'}
          </button>

          <button
            onClick={handleResend}
            disabled={resent}
            className="text-center text-sm text-muted-foreground hover:text-foreground disabled:opacity-50"
          >
            {resent ? 'Aguarde para reenviar' : 'Reenviar código'}
          </button>

          <button
            onClick={() => navigate('/login')}
            className="text-center text-sm text-muted-foreground hover:text-foreground"
          >
            Voltar ao login
          </button>
        </div>
      </div>
    </div>
  )
}
