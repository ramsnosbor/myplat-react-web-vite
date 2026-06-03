import { ssoClient } from './client'

export interface TermsStatus {
  aceiteId?: number | string
  aceitouVigente?: boolean
  versao?: string
  aceitoEm?: string
}

export interface CurrentTerms {
  id?: number | string
  versao?: string
  urlDocumento?: string
}

export const termsApi = {
  getCurrent(): Promise<CurrentTerms> {
    return ssoClient.get('/api/termos/vigente').then((r) => r.data)
  },

  getAcceptanceStatus(): Promise<TermsStatus> {
    return ssoClient.get('/api/termos/aceite/status').then((r) => r.data)
  },

  revokeAcceptance(aceiteId: number | string, motivoRevogacao = ''): Promise<void> {
    return ssoClient
      .post('/api/termos/revogar', { aceiteId, motivoRevogacao })
      .then(() => undefined)
  },
}
