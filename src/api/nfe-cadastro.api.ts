import { apiClient } from './client'

export type TipoPessoaCadastro = 'FISICA' | 'JURIDICA'

export interface NfeCadastroRequest {
  cnpjEmitente: string
  tipoPessoa: TipoPessoaCadastro
  documento: string
  uf: string
}

export interface NfeCadastroInfo {
  cnpj?: string | null
  cpf?: string | null
  inscricaoEstadual?: string | null
  razaoSocial?: string | null
  nomeFantasia?: string | null
  situacaoCadastral?: string | null
  logradouro?: string | null
  numero?: string | null
  complemento?: string | null
  bairro?: string | null
  municipio?: string | null
  uf?: string | null
  cep?: string | null
  codigoMunicipio?: string | null
}

export interface NfeCadastroResponse {
  status: string
  statusCode: string
  statusMensagem: string
  mensagem: string
  cadastros?: NfeCadastroInfo[] | null
}

export const nfeCadastroApi = {
  consultar(data: NfeCadastroRequest): Promise<NfeCadastroResponse> {
    return apiClient
      .post<NfeCadastroResponse>('/dfe/consulta-cadastro', data)
      .then((response) => response.data)
  },
}
