import { ssoClient } from './client'

export interface ParameterRecord {
  id: number | string
  cdParameter: string
  dsParameter?: string
  vlParameter?: string | number | null
  activeFlag?: number | string | boolean
  tag?: { id?: number | string; nomeTag?: string }
}

export const parameterApi = {
  getConfig(params: Record<string, unknown> = {}): Promise<{ table?: ParameterRecord[] }> {
    return ssoClient.get('/parameters', { params }).then((r) => r.data ?? {})
  },

  update(id: number | string, data: Partial<ParameterRecord>): Promise<ParameterRecord> {
    return ssoClient.put(`/parameters/${id}`, data).then((r) => r.data)
  },

  active(id: number | string): Promise<void> {
    return ssoClient.put(`/parameters/activate/${id}`).then(() => undefined)
  },

  inactive(id: number | string): Promise<void> {
    return ssoClient.put(`/parameters/inactivate/${id}`).then(() => undefined)
  },
}
