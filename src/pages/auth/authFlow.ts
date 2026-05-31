import { parseJwt, type JwtPayload } from '@/lib/jwt'
import type { LoginResponse } from '@/api/auth.api'

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

export function getNextIdentityValidationPath(state: Pick<LoginResponse, 'confirmedEmail' | 'confirmedTelephone' | 'email' | 'telephone'>) {
  if (!state.confirmedEmail) return '/email-confirmation'
  if (!state.confirmedTelephone) return '/phone-confirmation'
  return null
}
