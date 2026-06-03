import { ssoClient } from './client'

export interface TagRecord {
  id: number | string
  nomeTag: string
  descricao?: string
  activeFlag?: number | string | boolean
}

export const tagApi = {
  getAll(): Promise<TagRecord[]> {
    return ssoClient.get('/tags').then((r) => r.data ?? [])
  },

  getById(id: number | string): Promise<TagRecord> {
    return ssoClient.get(`/tags/${id}`).then((r) => r.data)
  },

  create(data: Partial<TagRecord>): Promise<TagRecord> {
    return ssoClient.post('/tags', data).then((r) => r.data)
  },

  update(id: number | string, data: Partial<TagRecord>): Promise<TagRecord> {
    return ssoClient.put(`/tags/${id}`, data).then((r) => r.data)
  },
}
