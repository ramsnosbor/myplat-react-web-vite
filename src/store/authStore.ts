import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import Cookies from 'js-cookie'
import type { User, Tenant, AclMap } from '@/api/auth.api'

const COOKIE_NAME = 'myplat_token'
const ACL_KEY = 'myplat_acl'

// ─── Estado de autenticação ───────────────────────────────────────────────────

interface AuthState {
  token: string | null
  user: User | null
  tenant: Tenant | null
  acl: AclMap | null
  homePath: string

  // Ações
  setAuth: (payload: {
    token: string
    user: User
    tenant?: Tenant
    acl?: AclMap
    homePath?: string
  }) => void
  setTenant: (tenant: Tenant) => void
  setAcl: (acl: AclMap) => void
  logout: () => void

  // Helpers
  isAuthenticated: () => boolean
  hasAccess: (moduleId: string, menuId: string, minLevel?: string) => boolean
}

const LEVELS: Record<string, number> = {
  sem_acesso: 0,
  leitor: 1,
  editor: 2,
  admin: 3,
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      user: null,
      tenant: null,
      acl: null,
      homePath: '/home',

      setAuth({ token, user, tenant, acl, homePath }) {
        // Persiste o token em cookie (30 dias)
        Cookies.set(COOKIE_NAME, token, { expires: 30, sameSite: 'Strict' })

        // Persiste ACL em sessionStorage
        if (acl) {
          sessionStorage.setItem(ACL_KEY, JSON.stringify(acl))
        }

        set({
          token,
          user,
          tenant: tenant ?? get().tenant,
          acl: acl ?? get().acl,
          homePath: homePath ?? '/home',
        })
      },

      setTenant(tenant) {
        set({ tenant })
      },

      setAcl(acl) {
        sessionStorage.setItem(ACL_KEY, JSON.stringify(acl))
        set({ acl })
      },

      logout() {
        Cookies.remove(COOKIE_NAME)
        sessionStorage.removeItem(ACL_KEY)
        set({ token: null, user: null, tenant: null, acl: null, homePath: '/home' })
      },

      isAuthenticated() {
        // Token válido tanto no state quanto no cookie
        const cookieToken = Cookies.get(COOKIE_NAME)
        return !!get().token && !!cookieToken
      },

      hasAccess(moduleId, menuId, minLevel = 'leitor') {
        const { acl, user } = get()
        if (!acl) return false

        // Verifica se é usuário admin completo
        if (user?.type === 'admin') return true

        const nivel = acl[moduleId]?.[menuId] ?? 'sem_acesso'
        return (LEVELS[nivel] ?? 0) >= (LEVELS[minLevel] ?? 0)
      },
    }),
    {
      name: 'myplat-auth',
      // Persiste apenas dados não sensíveis no localStorage
      partialize: (state) => ({
        user: state.user,
        tenant: state.tenant,
        homePath: state.homePath,
      }),
    },
  ),
)
