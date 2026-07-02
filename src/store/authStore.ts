import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { setClientToken, getClientToken } from '@/api/client'
import type { User, Tenant, AclMap, ModuleDefinition, ActionAclMap } from '@/api/auth.api'

// ─── Estado ───────────────────────────────────────────────────────────────────

interface AuthState {
  token: string | null
  user: User | null
  tenant: Tenant | null
  acl: AclMap | null
  actionAcl: ActionAclMap | null
  modules: ModuleDefinition[]
  homePath: string
  /** ID do usuário no banco do tenant (vindo de PermissionsResponse.idUsuario) */
  idUsuario: number | null
  /** true após o persist terminar a reidratação do localStorage */
  _hasHydrated: boolean

  setToken: (token: string) => void
  setUser: (user: User) => void
  setTenant: (tenant: Tenant) => void
  setAcl: (acl: AclMap, homePath?: string, idUsuario?: number | null, actionAcl?: ActionAclMap | null) => void
  setModules: (modules: ModuleDefinition[]) => void
  logout: () => void
  _setHasHydrated: (v: boolean) => void

  isAuthenticated: () => boolean
  /**
   * Verifica se o usuário tem acesso a um menuId (numérico como string).
   * AclMap plano: { "94": "editor", "95": "leitor" }
   */
  hasAccess: (menuId: string, minLevel?: string) => boolean
  hasActionAccess: (menuId: string | number | null | undefined, action: string | null | undefined) => boolean
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
      token: getClientToken(),
      user: null,
      tenant: null,
      acl: null,
      actionAcl: null,
      modules: [],
      homePath: '/home',
      idUsuario: null,
      _hasHydrated: false,

      setToken(token) {
        // 1. Atualiza cookie + sessionStorage + variável de módulo (axios interceptor)
        setClientToken(token)
        // 2. Atualiza o store Zustand (reativo para componentes)
        set({ token })
      },

      setUser(user) {
        set({ user })
      },

      setTenant(tenant) {
        set({ tenant })
      },

      setAcl(acl, homePath, idUsuario, actionAcl) {
        set({
          acl,
          ...(actionAcl !== undefined ? { actionAcl: actionAcl ?? {} } : {}),
          homePath: homePath ?? get().homePath,
          ...(idUsuario !== undefined ? { idUsuario: idUsuario ?? null } : {}),
        })
      },

      setModules(modules) {
        set({ modules })
      },

      logout() {
        setClientToken(null)
        set({
          token: null,
          user: null,
          tenant: null,
          acl: null,
          actionAcl: null,
          modules: [],
          homePath: '/home',
          idUsuario: null,
        })
      },

      _setHasHydrated(v) {
        set({ _hasHydrated: v })
      },

      isAuthenticated() {
        return !!get().token
      },

      hasAccess(menuId, minLevel = 'leitor') {
        const { acl, user } = get()
        if (!acl) return false
        if (user?.type === 'admin') return true
        const nivel = acl[menuId] ?? 'sem_acesso'
        return (LEVELS[nivel] ?? 0) >= (LEVELS[minLevel] ?? 0)
      },

      hasActionAccess(menuId, action) {
        const { actionAcl, user } = get()
        if (!menuId || !action) return true
        if (user?.type === 'admin') return true
        if (!actionAcl) return true
        const allowed = actionAcl[String(menuId)]
        if (!allowed) return false
        return allowed.map((item) => item.toLowerCase()).includes(String(action).toLowerCase())
      },
    }),
    {
      name: 'myplat-auth',

      // O que persiste no localStorage:
      //   user, tenant, homePath, acl → recuperados no F5 sem nova chamada de API
      //   token → NÃO persiste aqui (fica no cookie via setClientToken)
      partialize: (state) => ({
        user: state.user,
        tenant: state.tenant,
        homePath: state.homePath,
        acl: state.acl,
        actionAcl: state.actionAcl,
      }),

      // Merge customizado: token NUNCA vem do localStorage (versões antigas
      // podiam persistir token; o merge garante que ele sempre vem do cookie).
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Record<string, unknown>
        const { token: _ignored, ...rest } = p
        return { ...current, ...(rest as Partial<AuthState>) }
      },

      // Reidratação (F5 ou nova aba):
      //   client.ts já leu o cookie no módulo load → getClientToken() retorna o valor
      //   Basta copiar para o estado Zustand e garantir que o axios está atualizado
      onRehydrateStorage: () => (state) => {
        if (!state) return

        // getClientToken() já leu do cookie/sessionStorage no init do módulo
        const token = getClientToken()
        if (token) {
          state.token = token
          setClientToken(token)
        }
        state._hasHydrated = true
      },
    },
  ),
)
