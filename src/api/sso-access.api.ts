import { ssoClient } from './client'

export type PerfilTipo = 'leitor' | 'editor' | 'admin' | 'cliente' | string
export type PerfilAtivo = 'S' | 'N' | string
export type MenuNivel = 'sem_acesso' | 'leitor' | 'editor'

export interface AccessProfile {
  id?: number | string
  idPerfil?: number | string
  id_perfil?: number | string
  nome: string
  descricao?: string | null
  tipo: PerfilTipo
  ativo: PerfilAtivo
  idMenuHome?: number | string | null
  id_menu_home?: number | string | null
}

export interface AccessProfileListResponse {
  data?: AccessProfile[]
  table?: AccessProfile[]
  total?: number
  totalElements?: number
}

export interface MenuPermission {
  idMenu?: number | string
  id_menu?: number | string
  nivel?: MenuNivel
}

export interface ActionPermission {
  idMenu?: number | string
  id_menu?: number | string
  acao: string
  permitido: 'S' | 'N' | boolean
}

export interface AccessProfilePayload {
  nome: string
  descricao?: string
  tipo: PerfilTipo
  ativo: PerfilAtivo
  idMenuHome?: number | null
}

export interface UserProfileLink {
  id?: number | string
  idPerfil?: number | string
  id_perfil?: number | string
  nome?: string
  tipo?: PerfilTipo
  descricao?: string | null
}

export interface ClientUserScope {
  paramKey: string
  paramValue: string
}

export interface ClientUserRecord {
  id?: number | string
  userId?: number | string
  nome?: string
  name?: string
  cpf?: string
  email?: string
  telefone?: string
  telephone?: string
  idPerfil?: number | string
  nomePerfil?: string
  perfilNome?: string
  ativo?: PerfilAtivo
  escopos?: ClientUserScope[]
}

export interface ClientUserPayload {
  cpf?: string
  nome: string
  email?: string
  telefone?: string
  idPerfil: number
  escopos: ClientUserScope[]
}

export interface ClientUserLookup {
  exists?: boolean
  userId?: number | string
  nome?: string
  email?: string
  telefone?: string
  jaVinculadoAoTenant?: boolean
  tpVinculo?: string
}

export const ssoAccessApi = {
  getProfiles(params: Record<string, unknown>): Promise<AccessProfileListResponse | AccessProfile[]> {
    return ssoClient.get('/api/sso/perfis', { params }).then((r) => r.data)
  },

  createProfile(data: AccessProfilePayload): Promise<AccessProfile> {
    return ssoClient.post('/api/sso/perfis', data).then((r) => r.data)
  },

  updateProfile(idPerfil: number | string, data: AccessProfilePayload): Promise<void> {
    return ssoClient.put(`/api/sso/perfis/${idPerfil}`, data).then(() => undefined)
  },

  deleteProfile(idPerfil: number | string): Promise<void> {
    return ssoClient.delete(`/api/sso/perfis/${idPerfil}`).then(() => undefined)
  },

  getMenuPermissions(idPerfil: number | string): Promise<MenuPermission[]> {
    return ssoClient.get(`/api/sso/perfis/${idPerfil}/menus`).then((r) => unwrapList<MenuPermission>(r.data))
  },

  setMenuPermissions(idPerfil: number | string, items: Array<{ idMenu: number | string; nivel: MenuNivel }>): Promise<void> {
    return ssoClient.put(`/api/sso/perfis/${idPerfil}/menus`, items).then(() => undefined)
  },

  getActionPermissions(idPerfil: number | string): Promise<ActionPermission[]> {
    return ssoClient.get(`/api/sso/perfis/${idPerfil}/acoes`).then((r) => unwrapList<ActionPermission>(r.data))
  },

  setActionPermissions(idPerfil: number | string, items: Array<{ idMenu: number; acao: string; permitido: 'S' | 'N' }>): Promise<void> {
    return ssoClient.put(`/api/sso/perfis/${idPerfil}/acoes`, items).then(() => undefined)
  },

  getUserProfiles(idUsuario: number | string): Promise<UserProfileLink[]> {
    return ssoClient.get(`/api/sso/usuarios/${idUsuario}/perfis`).then((r) => unwrapList<UserProfileLink>(r.data))
  },

  addUserProfile(idUsuario: number | string, idPerfil: number | string): Promise<void> {
    return ssoClient.post(`/api/sso/usuarios/${idUsuario}/perfis/${idPerfil}`).then(() => undefined)
  },

  removeUserProfile(idUsuario: number | string, idPerfil: number | string): Promise<void> {
    return ssoClient.delete(`/api/sso/usuarios/${idUsuario}/perfis/${idPerfil}`).then(() => undefined)
  },

  getClientUsers(): Promise<ClientUserRecord[]> {
    return ssoClient.get('/api/sso/usuarios-cliente').then((r) => unwrapList<ClientUserRecord>(r.data))
  },

  getClientUser(userId: number | string): Promise<ClientUserRecord> {
    return ssoClient.get(`/api/sso/usuarios-cliente/${userId}`).then((r) => r.data ?? {})
  },

  createClientUser(data: ClientUserPayload): Promise<void> {
    return ssoClient.post('/api/sso/usuarios-cliente', data).then(() => undefined)
  },

  updateClientUser(userId: number | string, data: Omit<ClientUserPayload, 'cpf'>): Promise<void> {
    return ssoClient.put(`/api/sso/usuarios-cliente/${userId}`, data).then(() => undefined)
  },

  deactivateClientUser(userId: number | string): Promise<void> {
    return ssoClient.delete(`/api/sso/usuarios-cliente/${userId}`).then(() => undefined)
  },

  reactivateClientUser(userId: number | string): Promise<void> {
    return ssoClient.patch(`/api/sso/usuarios-cliente/${userId}/reativar`).then(() => undefined)
  },

  getClientProfiles(): Promise<AccessProfile[]> {
    return ssoClient.get('/api/sso/perfis-cliente').then((r) => unwrapList<AccessProfile>(r.data))
  },

  lookupClientUserByCpf(cpf: string): Promise<ClientUserLookup> {
    return ssoClient.get('/api/sso/usuarios-cliente/lookup', { params: { cpf } }).then((r) => r.data ?? {})
  },
}

function unwrapList<T>(data: unknown): T[] {
  if (Array.isArray(data)) return data as T[]
  const shaped = data as { data?: T[]; table?: T[] } | null
  return shaped?.data ?? shaped?.table ?? []
}
