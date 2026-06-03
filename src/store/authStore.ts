import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { setClientToken, getClientToken } from '@/api/client'
import type { User, Tenant, AclMap, ModuleDefinition } from '@/api/auth.api'

// ─── Estado ───────────────────────────────────────────────────────────────────

interface AuthState {
  token: string | null
  user: User | null
  tenant: Tenant | null
  acl: AclMap | null
  modules: ModuleDefinition[]
  homePath: string

  setToken: (token: string) => void
  setUser: (user: User) => void
  setTenant: (tenant: Tenant) => void
  setAcl: (acl: AclMap, homePath?: string) => void
  setModules: (modules: ModuleDefinition[]) => void
  logout: () => void

  isAuthenticated: () => boolean
  /**
   * Verifica se o usuário tem acesso a um menuId (numérico como string).
   * AclMap plano: { "94": "editor", "95": "leitor" }
   */
  hasAccess: (menuId: string, minLevel?: string) => boolean
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
      modules: [],
      homePath: '/home',

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

      setAcl(acl, homePath) {
        set({ acl, homePath: homePath ?? get().homePath })
      },

      setModules(modules) {
        set({ modules })
      },

      logout() {
        // Limpa cookie + sessionStorage via setClientToken(null)
        setClientToken(null)
        // Reseta todo o estado reativo
        set({
          token: null,
          user: null,
          tenant: null,
          acl: null,
          modules: [],
          homePath: '/home',
        })
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
      }),

      // Reidratação (F5 ou nova aba):
      //   client.ts já leu o cookie no módulo load → getClientToken() retorna o valor
      //   Basta copiar para o estado Zustand e garantir que o axios está atualizado
      onRehydrateStorage: () => (state) => {
        if (!state) return

        // getClientToken() já leu do cookie/sessionStorage no init do módulo
        const token = getClientToken()
        if (token) {
          state.token = token
          // setClientToken não é necessário (já está no cliente), mas garante sync
          setClientToken(token)
        }
      },
    },
  ),
)
