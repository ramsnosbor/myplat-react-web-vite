import { ssoClient } from './client'

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface LoginCredentials {
  username: string
  password: string
  application: string
}

/** Resposta real do POST /users/login */
export interface LoginResponse {
  token: string
  email: string
  telephone: string
  confirmedEmail: boolean
  confirmedTelephone: boolean
  twoFactorRequired: boolean
  twoFactorType?: 'EMAIL' | 'WHATSAPP'
  firstAccess: boolean
  nextMfaConfirmation?: string
}

/** Resposta do POST /users/tenant/:code */
export interface TenantResponse {
  token: string
  [key: string]: unknown
}

/** Item de menu — estrutura real do GET /system-module/full */
export interface MenuItemDefinition {
  idMenu: number
  label: string
  /** "son" | "item" | "I" = folha navegável; "father" | "M" = agrupador */
  type: string
  /** Screen name ou URL completa. Ex: "listRequisicaoCompra" ou "listNfe?tipo_nfe=Saida" */
  url?: string
  icon?: string
  parentmenu?: string   // label do agrupador pai
  orderview?: number
  nr_ordem?: number
  nrOrdem?: number
}

/** Módulo — estrutura real do GET /system-module/full */
export interface ModuleDefinition {
  idModulo: number
  idSystem?: number
  name: string
  shortName?: string
  icon?: string
  color?: string
  nr_ordem?: number
  nrOrdem?: number
  urlHome?: string
  menus?: MenuItemDefinition[]
}

export type NivelAcesso = 'sem_acesso' | 'leitor' | 'editor' | 'admin'

/**
 * Mapa plano de acesso: { menuId (string do número) → nivel }
 * Formato real da API: { "94": "editor", "95": "leitor", ... }
 */
export type AclMap = Record<string, NivelAcesso>

/** Resposta real do GET /api/sso/permissions */
export interface PermissionsResponse {
  idUsuario?: number
  tenantCode?: string
  perfis?: Array<{ idPerfil: number; nome: string; tipo: string }>
  /** Mapa plano: { menuId: nivel } — IDs numéricos como string */
  menus: AclMap
  acoes?: Record<string, string[]>
  homeMenuId?: number | null
  homePath?: string | null
  cachedAt?: string
  ttlSeconds?: number
}

export interface User {
  id?: string
  username: string
  name: string
  email?: string
  telephone?: string
  confirmedEmail?: boolean
  confirmedTelephone?: boolean
  cpf?: string
  createdAt?: string
  mfaEnabled?: boolean
  mfaType?: 'EMAIL' | 'WHATSAPP' | string
  type?: string
  tenant?: {
    code?: string
    name?: string
    description?: string
    company?: string
    cnpjCpf?: string
    email?: string
    telephone?: string
    usaNfe?: string | number | boolean
    cdAmbiente?: string | number
  }
  tenantSupported?: Record<string, string>
}

export interface Tenant {
  code: string
  label: string
}

// ─── Auth API ─────────────────────────────────────────────────────────────────

export const authApi = {
  /**
   * Login com usuário e senha.
   * POST /users/login
   */
  login(credentials: LoginCredentials): Promise<LoginResponse> {
    return ssoClient
      .post<LoginResponse>('/users/login', credentials)
      .then((r) => r.data)
  },

  /**
   * Seleciona tenant e obtém token com escopo do tenant.
   * POST /users/tenant/:tenantCode
   */
  selectTenant(tenantCode: string): Promise<TenantResponse> {
    return ssoClient
      .post<TenantResponse>(`/users/tenant/${tenantCode}`)
      .then((r) => r.data)
  },

  /**
   * Solicita / reenvia código MFA.
   * POST /two-factor/request
   */
  requestMfa(): Promise<void> {
    return ssoClient.post('/two-factor/request').then(() => undefined)
  },

  /**
   * Verifica código MFA e retorna token final.
   * POST /two-factor/complete-login
   */
  verifyMfa(code: string): Promise<{
    token: string
    email?: string
    telephone?: string
    confirmedEmail?: boolean
    confirmedTelephone?: boolean
  }> {
    return ssoClient
      .post<{
        token: string
        email?: string
        telephone?: string
        confirmedEmail?: boolean
        confirmedTelephone?: boolean
      }>('/two-factor/complete-login', { code })
      .then((r) => r.data)
  },

  validateAccountToken(token: string): Promise<void> {
    return ssoClient.put('/token/activeAccount', { token }).then(() => undefined)
  },

  resendConfirmationToken(notificationType: 'EMAIL' | 'WHATSAPP'): Promise<void> {
    return ssoClient.get(`/token/resend?notificationType=${notificationType}`).then(() => undefined)
  },

  /**
   * Carrega permissões + homePath após autenticação completa.
   * GET /sso/api/sso/permissions  (via ssoClient → base /sso + /api/sso/permissions)
   */
  getPermissions(): Promise<PermissionsResponse> {
    return ssoClient
      .get<PermissionsResponse>('/api/sso/permissions')
      .then((r) => r.data)
  },

  /**
   * Carrega todos os módulos com seus menus.
   * GET /system-module/full  (via ssoClient — mesmo host do login)
   */
  getSystemModules(): Promise<ModuleDefinition[]> {
    return ssoClient
      .get<ModuleDefinition[]>('/system-module/full')
      .then((r) => r.data)
      .catch((err) => {
        console.error(
          '[getSystemModules] falhou:',
          err?.response?.status,
          err?.response?.data ?? err?.message,
        )
        return []
      })
  },

  /**
   * Dados do usuário logado.
   * GET /users/logged
   */
  getLoggedUser(): Promise<User> {
    return ssoClient.get<User>('/users/logged').then((r) => r.data)
  },

  updateProfile(data: { nome: string; flDuploFator: 'S' | 'N'; tpEnviarPor?: string | null }): Promise<User> {
    return ssoClient.put<User>('/users/profile', data).then((r) => r.data)
  },

  /** Logout — apenas client-side (sem chamada à API). */
  logout(): void { /* limpeza feita pelo authStore.logout() */ },

  createUser(data: {
    username: string
    password: string
    nome: string
    cpf: string
    email: string
    telephone: string
    tenants: unknown[]
    authorities: unknown[]
  }): Promise<User & { token?: string }> {
    return ssoClient.post<User & { token?: string }>('/users/crud', data).then((r) => r.data)
  },

  forgotPassword(email: string): Promise<void> {
    return ssoClient
      .get(`/users/password/${encodeURIComponent(email)}/forgot`)
      .then(() => undefined)
  },

  changePassword(data: { password: string; token?: string }): Promise<void> {
    return ssoClient.post('/users/changePassword', data).then(() => undefined)
  },

  getTenantBranding(tenantSlug: string): Promise<{ logo?: string; name?: string; primaryColor?: string }> {
    return ssoClient.get(`/tenants/${tenantSlug}/branding`).then((r) => r.data)
  },
}
