import axios, { type AxiosInstance } from 'axios'
import Cookies from 'js-cookie'

// ─── Nomes de cookie — padrão compartilhado com o Maker ──────────────────────
// Devem ser idênticos ao COOKIE_NAMES do cookieManager.js do Maker.

export const TOKEN_KEY         = 'myplat_auth_token'
export const COOKIE_TENANT_ID  = 'myplat_app_tenant_id'
export const COOKIE_TENANT_LABEL = 'myplat_app_tenant_label'

const COOKIE_DOMAIN = import.meta.env.VITE_COOKIE_DOMAIN as string | undefined
const COOKIE_DAYS   = Number(import.meta.env.VITE_COOKIE_EXPIRATION_DAYS ?? 7)

// ─── Leitura com suporte a chunk ──────────────────────────────────────────────
// O Maker divide tokens > 4000 chars em cookies ${name}_chunk0, _chunk1 …
// e um cookie de controle ${name}_chunks com a contagem.

function readCookieWithChunks(name: string): string | null {
  const direct = Cookies.get(name)
  if (direct) return direct

  const chunksCountStr = Cookies.get(`${name}_chunks`)
  if (!chunksCountStr) return null

  const count = parseInt(chunksCountStr, 10)
  if (isNaN(count) || count <= 0) return null

  let value = ''
  for (let i = 0; i < count; i++) {
    const chunk = Cookies.get(`${name}_chunk${i}`)
    if (!chunk) return null
    value += chunk
  }
  return value || null
}

// ─── Token em memória ──────────────────────────────────────────────────────────

let _token: string | null =
  readCookieWithChunks(TOKEN_KEY) ??
  sessionStorage.getItem(TOKEN_KEY) ??
  null

export function setClientToken(token: string | null) {
  _token = token

  if (token) {
    Cookies.set(TOKEN_KEY, token, {
      expires: COOKIE_DAYS,
      domain: COOKIE_DOMAIN,
      sameSite: 'Lax',
      secure: COOKIE_DOMAIN !== undefined,
    })
    sessionStorage.setItem(TOKEN_KEY, token)
  } else {
    Cookies.remove(TOKEN_KEY, { domain: COOKIE_DOMAIN })
    Cookies.remove(TOKEN_KEY)
    sessionStorage.removeItem(TOKEN_KEY)
  }
}

export function getClientToken(): string | null {
  return _token
}

// ─── Tenant dos cookies compartilhados ───────────────────────────────────────
// Usados na restauração de sessão ao chegar do Maker.

export function getSharedTenant(): { code: string; label: string } | null {
  const code = Cookies.get(COOKIE_TENANT_ID)
  if (!code) return null
  return { code, label: Cookies.get(COOKIE_TENANT_LABEL) ?? code }
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

  instance.interceptors.request.use((config) => {
    const token = getClientToken()
    if (token) config.headers.Authorization = `Bearer ${token}`
    return config
  })

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

export const apiClient = createClient(
  import.meta.env.VITE_API_URL ?? 'http://localhost:3000',
)

export const ssoClient = createClient(
  import.meta.env.VITE_SSO_URL ?? 'http://localhost:3001',
)

export const nfeClient = createClient(
  import.meta.env.VITE_NFE_URL ?? 'http://localhost:3002',
)
