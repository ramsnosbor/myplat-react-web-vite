import type { ModuleDefinition } from '@/api/auth.api'
import type { ComponentAction, CrudAction } from '@/types/view.types'

type PermissionAction = ComponentAction | CrudAction | {
  action?: string
  title?: string
  name?: string
  tooltip?: string
  type?: string
  objectAction?: string
  permission?: string
  requiredAction?: string
  actionPermission?: string
  script?: string
  scriptId?: string
}

const KNOWN_PERMISSIONS = new Set(['criar', 'editar', 'exportar', 'imprimir', 'auditar', 'cancelar'])

export function resolveCurrentMenuId(modules: ModuleDefinition[], pathname: string) {
  const current = normalizeAppPath(pathname)
  if (!current) return null

  const candidates = modules
    .flatMap((module) => module.menus ?? [])
    .map((menu) => ({
      idMenu: menu.idMenu,
      path: normalizeAppPath(menu.url),
    }))
    .filter((item) => item.idMenu !== undefined && item.idMenu !== null && item.path)

  const exact = candidates.find((item) => item.path === current)
  if (exact) return String(exact.idMenu)

  const nested = candidates
    .filter((item) => item.path && current.startsWith(`${item.path}/`))
    .sort((a, b) => String(b.path).length - String(a.path).length)[0]

  return nested ? String(nested.idMenu) : null
}

export function resolveRequiredAction(action: PermissionAction, mode?: string): string | null {
  const explicit = action.permission ?? action.requiredAction ?? action.actionPermission
  if (explicit) return normalizePermission(explicit)

  const actionType = String(action.action ?? '').toLowerCase()
  const objectAction = String(action.objectAction ?? '').toLowerCase()
  const type = String(action.type ?? '').toLowerCase()
  const text = [
    action.action,
    action.title,
    action.name,
    action.tooltip,
    action.script,
    action.scriptId,
  ].filter(Boolean).join(' ').toLowerCase()

  if (
    actionType === 'new' ||
    actionType === 'create' ||
    objectAction === 'create' ||
    textMatches(text, ['novo', 'nova', 'criar', 'adicionar', 'incluir', 'cadastrar'])
  ) return 'criar'
  if (actionType === 'save' || actionType === 'submit') return mode === 'create' ? 'criar' : 'editar'
  if (actionType === 'edit' || objectAction === 'edit' || textMatches(text, ['editar', 'alterar'])) return 'editar'
  if (actionType === 'delete' || textMatches(text, ['cancel', 'exclu', 'delete', 'remov'])) return 'cancelar'
  if (actionType.includes('export') || type === 'csv' || textMatches(text, ['export'])) return 'exportar'
  if (
    actionType === 'generatereport' ||
    actionType.includes('print') ||
    actionType.includes('download') ||
    type === 'pdf' ||
    textMatches(text, ['imprim', 'relatorio', 'relatório', 'danfe', 'pdf'])
  ) return 'imprimir'
  if (textMatches(text, ['audit', 'auditoria', 'auditar'])) return 'auditar'

  return null
}

export function isActionAllowed(
  action: PermissionAction,
  menuId: string | number | null | undefined,
  hasActionAccess: (menuId: string | number | null | undefined, action: string | null | undefined) => boolean,
  mode?: string,
) {
  const required = resolveRequiredAction(action, mode)
  return !required || hasActionAccess(menuId, required)
}

function normalizePermission(value: string) {
  const normalized = value.trim().toLowerCase()
  if (KNOWN_PERMISSIONS.has(normalized)) return normalized
  return normalized
}

function normalizeAppPath(url: string | null | undefined) {
  if (!url || /^https?:\/\//i.test(url)) return null

  const [rawPath] = url.trim().split('?')
  if (!rawPath) return null
  if (rawPath === '/') return '/home'
  if (rawPath.startsWith('/home')) return rawPath
  if (rawPath.startsWith('/')) return rawPath

  return `/home/${rawPath.replace(/^home\/?/, '')}`
}

function textMatches(text: string, needles: string[]) {
  return needles.some((needle) => text.includes(needle))
}
