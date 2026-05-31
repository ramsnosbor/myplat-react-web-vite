import { parseJwt, type JwtPayload } from '@/lib/jwt'
import type { LoginResponse, ModuleDefinition, AclMap } from '@/api/auth.api'

export interface IdentityValidationState {
  email?: string
  telephone?: string
  confirmedEmail?: boolean
  confirmedTelephone?: boolean
  source?: 'login' | 'register'
}

const IDENTITY_KEY = 'identity_validation'

export function saveIdentityValidationState(state: IdentityValidationState) {
  sessionStorage.setItem(IDENTITY_KEY, JSON.stringify(state))
}

export function getIdentityValidationState(): IdentityValidationState {
  try {
    const raw = sessionStorage.getItem(IDENTITY_KEY)
    return raw ? JSON.parse(raw) as IdentityValidationState : {}
  } catch {
    return {}
  }
}

export function clearIdentityValidationState() {
  sessionStorage.removeItem(IDENTITY_KEY)
}

export interface TenantOption {
  code: string
  label: string
}

export function storeSupportedTenantsFromToken(token: string): TenantOption[] {
  const jwt = parseJwt<JwtPayload>(token)
  const tenants = Object.entries(jwt.supportedTenants ?? {}).map(([code, label]) => ({ code, label }))

  if (tenants.length === 0) return []

  sessionStorage.setItem('supported_tenants', JSON.stringify(tenants))
  return tenants
}

/**
 * Lê o claim `tenantModules` do JWT e retorna um Set com os IDs permitidos.
 * Se o claim estiver ausente (token legado), retorna Set vazio → nenhum módulo bloqueado.
 */
export function getTenantModuleIds(token: string): Set<number> {
  const modules = parseJwt<JwtPayload>(token).tenantModules ?? []
  return new Set(modules)
}

/**
 * Filtra e ordena a lista de módulos aplicando dois critérios:
 * 1. Módulo deve estar na lista do tenant (tenantModuleIds do token)
 * 2. Ao menos um menu do módulo deve ter acesso via ACL
 *
 * Se `tenantModuleIds` estiver vazio, o filtro por tenant é ignorado
 * (compatibilidade com tokens sem o claim).
 */
export function filterModules(
  allModules: ModuleDefinition[],
  acl: AclMap,
  tenantModuleIds: Set<number>,
): ModuleDefinition[] {
  const hasAcl = Object.keys(acl).length > 0

  return allModules
    .filter((mod) => tenantModuleIds.size === 0 || tenantModuleIds.has(mod.idModulo))
    .map((mod) => ({
      ...mod,
      menus: (mod.menus ?? []).filter((menu) => {
        if (!hasAcl) return true
        const nivel = acl[String(menu.idMenu)]
        return nivel !== 'sem_acesso'
      }),
    }))
    .filter((mod) => mod.menus.length > 0)
    .sort((a, b) => (a.nrOrdem ?? 99) - (b.nrOrdem ?? 99))
}

export function getNextIdentityValidationPath(state: Pick<LoginResponse, 'confirmedEmail' | 'confirmedTelephone' | 'email' | 'telephone'>) {
  if (!state.confirmedEmail) return '/email-confirmation'
  if (!state.confirmedTelephone) return '/phone-confirmation'
  return null
}
