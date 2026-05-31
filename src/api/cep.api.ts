import { apiClient } from './client'

export interface CepResponse {
  /** Logradouro */
  street: string
  /** Bairro */
  district: string
  /** Nome da cidade */
  city: string
  /** ID da localidade no banco (FK para o autocomplete) */
  id: number | string
  /** Sigla da UF */
  uf: string
}

export const cepApi = {
  get(cep: string): Promise<CepResponse> {
    return apiClient
      .get<CepResponse>(`/address/cep/${cep}`)
      .then((res) => res.data)
  },
}
