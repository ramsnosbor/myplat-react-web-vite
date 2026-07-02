/**
 * Decodifica o payload de um JWT sem verificar a assinatura.
 * Uso: apenas client-side para ler dados públicos do token.
 */
export function parseJwt<T = Record<string, unknown>>(token: string): T {
  try {
    const base64 = token.split('.')[1]
    const binary = atob(base64.replace(/-/g, '+').replace(/_/g, '/'))
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
    const decoded = new TextDecoder('utf-8').decode(bytes)
    return JSON.parse(decoded) as T
  } catch {
    return {} as T
  }
}

export interface JwtPayload {
  sub?: string
  exp?: number
  iat?: number
  /** Mapa tenantCode → tenantLabel */
  supportedTenants?: Record<string, string>
  /** IDs dos módulos (system_module) ativos vinculados ao tenant atual */
  tenantModules?: number[]
  tenant?: string
  username?: string
  name?: string
  type?: string
  tpVinculo?: string
  grantedAuthorities?: string[]
  authorities?: string[]
  id_usuario?: number
  userId?: number
  [key: string]: unknown
}

/**
 * Extrai o ID do usuário do JWT.
 * O token contém o claim `userId` (número).
 */
export function getUserId(token: string): number | null {
  try {
    const jwt = parseJwt<JwtPayload>(token)
    const id = jwt.userId ?? jwt.id_usuario
    return typeof id === 'number' ? id : null
  } catch {
    return null
  }
}
