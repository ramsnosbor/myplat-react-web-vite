import { ssoClient } from './client'

export interface UserAdminRecord {
  id: number | string
  name?: string
  nome?: string
  cpf?: string
  email?: string
  telephone?: string
}

export interface UserEntityPermission {
  entityId: number | string
  entity: string
  verbValue: number
}

export interface UserListResponse {
  table: UserAdminRecord[]
  size: number
}

export const userAdminApi = {
  getTenantUsers(params: Record<string, unknown>): Promise<UserListResponse> {
    return ssoClient.get('/tenants/users', { params }).then((r) => r.data)
  },

  getUserByEmail(email: string): Promise<UserAdminRecord | null> {
    return ssoClient.get(`/users/byEmail/${encodeURIComponent(email)}`).then((r) => r.data ?? null)
  },

  getUserEntities(userId: number | string): Promise<{ table: UserEntityPermission[] }> {
    return ssoClient.get(`/users/${userId}/entities`).then((r) => r.data)
  },

  updateUserEntities(userId: number | string, data: UserEntityPermission[]): Promise<void> {
    return ssoClient.put(`/users/${userId}/entities`, data).then(() => undefined)
  },
}
