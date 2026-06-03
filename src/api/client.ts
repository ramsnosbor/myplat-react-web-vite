import axios, { type AxiosInstance } from 'axios'
import Cookies from 'js-cookie'

// ─── Configuração de cookie ────────────────────────────────────────────────────

const TOKEN_KEY = 'myplat_token'

const COOKIE_DOMAIN = import.meta.env.VITE_COOKIE_DOMAIN as string | undefined
const COOKIE_DAYS  = Number(import.meta.env.VITE_COOKIE_EXPIRATION_DAYS ?? 7)

// ─── Token em memória ──────────────────────────────────────────────────────────
// Fonte de verdade para as chamadas axios (sem acesso ao DOM).
// Na inicialização do módulo, lê do cookie (persistente entre sessões) e,
// como fallback, do sessionStorage (compatibilidade com sessões anteriores).

let _token: string | null =
  Cookies.get(TOKEN_KEY) ??
  sessionStorage.getItem(TOKEN_KEY) ??
  null

/**
 * Salva o token nos três lugares:
 *   1. Variável de módulo  → usada imediatamente pelo axios interceptor
 *   2. Cookie              → persiste entre sessões / abas / subdomínios
 *   3. sessionStorage      → fallback por aba (compatibilidade)
 */
export function setClientToken(token: string | null) {
  _token = token

  if (token) {
    Cookies.set(TOKEN_KEY, token, {
      expires: COOKIE_DAYS,
      domain: COOKIE_DOMAIN,
      sameSite: 'Lax',
      // secure: true → habilitar em produção (HTTPS obrigatório)
    })
    sessionStorage.setItem(TOKEN_KEY, token)
  } else {
    Cookies.remove(TOKEN_KEY, { domain: COOKIE_DOMAIN })
    // Remove também sem domain para garantir limpeza em dev (localhost)
    Cookies.remove(TOKEN_KEY)
    sessionStorage.removeItem(TOKEN_KEY)
  }
}

export function getClientToken(): string | null {
  return _token
}

// ─── Helper de redirect ───────────────────────────────────────────────────────

function redirectToLogin() {
  if (window.location.pathname !== '/login') {
    setClientToken(null)
    window.location.href = '/login'
  }
}

const AUTH_PUBLIC_ROUTES = [
  /^\/users\/login$/,
  /^\/users\/crud$/,
  /^\/token\/activeAccount$/,
  /^\/token\/resend/,
  /^\/two-factor\/complete-login$/,
  /^\/two-factor\/request$/,
]

function shouldRedirectOnUnauthorized(url?: string) {
  if (!url) return true
  return !AUTH_PUBLIC_ROUTES.some((route) => route.test(url))
}

// ─── Factory ──────────────────────────────────────────────────────────────────

function createClient(baseURL: string): AxiosInstance {
  const instance = axios.create({
    baseURL,
    headers: { 'Content-Type': 'application/json' },
  })

  // Injeta Authorization: Bearer <token> em todas as requisições
  instance.interceptors.request.use((config) => {
    const token = getClientToken()
    if (token) config.headers.Authorization = `Bearer ${token}`
    return config
  })

  // 401 → limpa token e redireciona ao login
  instance.interceptors.response.use(
    (res) => res,
    (error) => {
      if (error.response?.status === 401 && shouldRedirectOnUnauthorized(error.config?.url)) {
        redirectToLogin()
      }
      return Promise.reject(error)
    },
  )

  return instance
}

// ─── Clientes ─────────────────────────────────────────────────────────────────

/** API principal: entidades, scripts, views. */
export const apiClient = createClient(
  import.meta.env.VITE_API_URL ?? 'http://localhost:3000',
)

/** SSO / Auth: login, MFA, tenant, permissões. */
export const ssoClient = createClient(
  import.meta.env.VITE_SSO_URL ?? 'http://localhost:3001',
)

/** NF-e / DFe. */
export const nfeClient = createClient(
  import.meta.env.VITE_NFE_URL ?? 'http://localhost:3002',
)
