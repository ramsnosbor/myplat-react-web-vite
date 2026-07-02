import { parseJwt, type JwtPayload } from '@/lib/jwt'
import type { LoginResponse, ModuleDefinition, AclMap, PermissionsResponse } from '@/api/auth.api'

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

export function isClienteToken(token: string): boolean {
  const jwt = parseJwt<JwtPayload>(token)
  return String(jwt.tpVinculo ?? jwt.type ?? '').toUpperCase() === 'CLIENTE'
}

export function isFullAdminToken(token: string): boolean {
  const jwt = parseJwt<JwtPayload>(token)
  if (String(jwt.type ?? '').toLowerCase() === 'admin') return true

  const authorities = [
    ...toStringArray(jwt.grantedAuthorities),
    ...toStringArray(jwt.authorities),
  ]

  return authorities.some((authority) => /^ADMIN\..+\.FULL$/i.test(authority))
}

interface FilterModulesOptions {
  failClosed?: boolean
  unrestricted?: boolean
}

const CLIENT_HOME_PATH = '/home/portalCliente'

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
  options: FilterModulesOptions = {},
): ModuleDefinition[] {
  const hasAcl = Object.keys(acl).length > 0
  const shouldApplyAcl = hasAcl || !options.unrestricted

  return allModules
    .filter((mod) => tenantModuleIds.size === 0 || tenantModuleIds.has(mod.idModulo))
    .map((mod) => ({
      ...mod,
      menus: shouldApplyAcl
        ? filterMenusByAcl(mod.menus ?? [], acl)
        : sortMenusByModuleOrder(mod.menus ?? []),
    }))
    .filter((mod) => mod.menus.length > 0)
    .sort((a, b) => normalizeOrder(a.nr_ordem ?? a.nrOrdem) - normalizeOrder(b.nr_ordem ?? b.nrOrdem))
}

export function sortMenusByModuleOrder<T extends { nr_ordem?: number | string; nrOrdem?: number | string; orderview?: number | string; label?: string; idMenu?: number | string }>(menus: T[]): T[] {
  return [...menus].sort((a, b) => {
    const orderDiff = normalizeOrder(a.nr_ordem ?? a.nrOrdem ?? a.orderview) - normalizeOrder(b.nr_ordem ?? b.nrOrdem ?? b.orderview)
    if (orderDiff !== 0) return orderDiff

    const labelDiff = (a.label ?? '').localeCompare(b.label ?? '', 'pt-BR')
    if (labelDiff !== 0) return labelDiff

    return String(a.idMenu ?? '').localeCompare(String(b.idMenu ?? ''), 'pt-BR')
  })
}

function normalizeOrder(value: number | string | undefined) {
  if (value === undefined || value === null || value === '') return Number.MAX_SAFE_INTEGER
  const numberValue = Number(value)
  return Number.isFinite(numberValue) ? numberValue : Number.MAX_SAFE_INTEGER
}

function filterMenusByAcl(menus: ModuleDefinition['menus'], acl: AclMap) {
  const sorted = sortMenusByModuleOrder(menus ?? [])
  const childrenByParent = sorted.reduce((acc, menu) => {
    if (!menu.parentmenu) return acc
    const children = acc.get(menu.parentmenu) ?? []
    children.push(menu)
    acc.set(menu.parentmenu, children)
    return acc
  }, new Map<string, typeof sorted>())

  const hasVisibleDescendant = (menuLabel: string, visited = new Set<string>()): boolean => {
    if (visited.has(menuLabel)) return false
    visited.add(menuLabel)

    return (childrenByParent.get(menuLabel) ?? []).some((child) => {
      const childChildren = childrenByParent.get(child.label) ?? []
      if (childChildren.length === 0) return hasMenuAccess(child.idMenu, acl)
      return hasVisibleDescendant(child.label, new Set(visited))
    })
  }

  return sorted.filter((menu) => {
    const children = childrenByParent.get(menu.label) ?? []
    if (children.length === 0) return hasMenuAccess(menu.idMenu, acl)
    return hasVisibleDescendant(menu.label)
  })
}

function hasMenuAccess(menuId: number | string | undefined, acl: AclMap) {
  if (menuId === undefined || menuId === null || menuId === '') return false
  const nivel = acl[String(menuId)] ?? 'sem_acesso'
  return nivel !== 'sem_acesso'
}

function toStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

export function resolveHomePath(
  permissions: Pick<PermissionsResponse, 'homePath' | 'homeMenuId'>,
  modules: ModuleDefinition[],
  isClienteAccess: boolean,
) {
  const normalizedHomePath = normalizeMenuPath(permissions.homePath ?? undefined)
  if (normalizedHomePath && (!isClienteAccess || normalizedHomePath !== '/home')) return normalizedHomePath

  const homeMenuPath = getMenuPathById(modules, permissions.homeMenuId)
  if (homeMenuPath) return homeMenuPath

  return isClienteAccess ? CLIENT_HOME_PATH : normalizedHomePath ?? '/home'
}

function getMenuPathById(modules: ModuleDefinition[], menuId: number | string | null | undefined) {
  if (menuId === undefined || menuId === null || menuId === '') return null
  const targetId = String(menuId)
  const menu = modules
    .flatMap((mod) => mod.menus ?? [])
    .find((item) => String(item.idMenu) === targetId)

  return normalizeMenuPath(menu?.url)
}

function normalizeMenuPath(path: string | null | undefined) {
  if (!path) return null
  if (/^https?:\/\//i.test(path)) return null

  const trimmed = path.trim()
  if (!trimmed) return null
  if (trimmed === '/') return '/home'
  if (trimmed.startsWith('/home')) return trimmed
  if (trimmed.startsWith('/')) return trimmed

  return `/home/${trimmed.replace(/^home\/?/, '')}`
}

export function getNextIdentityValidationPath(state: Pick<LoginResponse, 'confirmedEmail' | 'confirmedTelephone' | 'email' | 'telephone'>) {
  if (!state.confirmedEmail) return '/email-confirmation'
  if (!state.confirmedTelephone) return '/phone-confirmation'
  return null
}
