import { apiClient } from './client'

// ─── Tipos de autenticação ────────────────────────────────────────────────────

export interface LoginCredentials {
  username: string
  password: string
}

export interface Tenant {
  id: string
  name: string
  logo?: string
}

export interface User {
  id: string
  username: string
  name: string
  email?: string
  type?: string
}

export interface AclMap {
  [moduleId: string]: {
    [menuId: string]: 'sem_acesso' | 'leitor' | 'editor' | 'admin'
  }
}

export interface AuthResponse {
  token: string
  user: User
  tenant?: Tenant
  acl?: AclMap
  homePath?: string
  requiresMfa?: boolean
  requiresTenant?: boolean
  tenants?: Tenant[]
}

// ─── Auth API ─────────────────────────────────────────────────────────────────

export const authApi = {
  /**
   * Autentica com usuário e senha.
   * Se requiresMfa=true → redirecionar para /mfa
   * Se requiresTenant=true → redirecionar para /tenant
   */
  login(credentials: LoginCredentials): Promise<AuthResponse> {
    return apiClient
      .post<AuthResponse>('/auth/login', credentials)
      .then((r) => r.data)
  },

  /**
   * Seleciona tenant após login.
   */
  selectTenant(tenantId: string): Promise<AuthResponse> {
    return apiClient
      .post<AuthResponse>('/auth/tenant', { tenantId })
      .then((r) => r.data)
  },

  /**
   * Verifica código MFA.
   */
  verifyMfa(code: string): Promise<AuthResponse> {
    return apiClient
      .post<AuthResponse>('/auth/mfa', { code })
      .then((r) => r.data)
  },

  /**
   * Reenvia código MFA.
   */
  resendMfa(): Promise<void> {
    return apiClient.post('/auth/mfa/resend').then(() => undefined)
  },

  /**
   * Obtém permissões (ACL) do usuário atual.
   */
  getAcl(): Promise<AclMap> {
    return apiClient.get<AclMap>('/auth/acl').then((r) => r.data)
  },

  /**
   * Encerra a sessão.
   */
  logout(): Promise<void> {
    return apiClient.post('/auth/logout').then(() => undefined)
  },
}
