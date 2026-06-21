import { apiClient, ssoClient, nfeClient } from './client'

export interface PageResponse<T> {
  table?: T[]
  data?: T[]
  totalPages?: number
  totalElements?: number
  number?: number
  size?: number
}

export interface DFeRecord {
  id: number | string
  dataEmissao?: string
  nomeEmitente?: string
  cnpjEmitente?: string
  chaveNfe?: string
  status?: string | number
  tipoManifestacao?: string
  justificativaManifestacao?: string
  protocolo?: string
  /** Número da nota fiscal retornado pelo endpoint /nfe-dfe */
  numeroNf?: string | number
  /** Valor total da nota — tag XML vlTotalNota retornada pelo endpoint /nfe-dfe */
  vlTotalNota?: number
  [key: string]: unknown
}

export interface NfeRecord {
  id_nfe?: number | string
  id_movimento?: number | string
  data_emissao?: string
  nome_pessoa_cli_for?: string
  chave_acesso?: string
  nm_arquivo_xml?: string
  valor_total_nfe?: number
  ds_tipo_nfe?: string
  ds_nfe_status?: string
  numero?: string | number
  nr_protocolo?: string
  [key: string]: unknown
}

export interface EmpresaEmitente {
  id_pessoa: number | string
  nome_pessoa?: string
  cnpj_cpf?: string
  fl_emite_nfe?: string
  usa_nfe?: string
  [key: string]: unknown
}

export interface EmpresaEmitentePeriodo extends EmpresaEmitente {
  id_empresa_emissao_periodo?: number | string | null
  fl_emissao_executada?: string | null
  dt_marcacao?: string | null
}

export interface NfeRepeticaoRecord extends NfeRecord {
  id_pessoa_empresa?: number | string
  id_empresa_emissao_periodo?: number | string | null
  id_nfe_repetir?: number | string | null
  id_nfe_gerada?: number | string | null
  fl_marcada_repetir?: string | null
  fl_executado?: string | null
  numero?: string | number
  destinatario?: string
  id_servico?: number | string | null
  vl_servico?: number | string | null
  vl_servico_repetir?: number | string | null
  ds_complemento?: string | null
}

export interface ServicoRecord {
  id_servico?: number | string
  ds_servico?: string
  tx_descricao_servico?: string
  [key: string]: unknown
}

const FLAG_NAO = 'Não'

export const dfeApi = {
  list(params: Record<string, unknown>): Promise<PageResponse<DFeRecord>> {
    return ssoClient.get('/nfe-dfe', { params }).then((r) => r.data)
  },

  manifestar(id: number | string, data: { tpEvento: string; dsMotivoManifestacao?: string }): Promise<void> {
    return ssoClient.patch(`/nfe-dfe/manifestar/${id}`, data).then(() => undefined)
  },

  manifestarLista(data: { tpEvento: string; dsMotivoManifestacao?: string; ids: Array<{ id: number | string }> }): Promise<void> {
    return ssoClient.patch('/nfe-dfe/manifestar/list', data).then(() => undefined)
  },

  updateStatus(id: number | string, status: number): Promise<void> {
    return ssoClient.patch(`/nfe-dfe/${id}`, { status }).then(() => undefined)
  },

  downloadPdf(id: number | string): Promise<Blob> {
    return ssoClient.get(`/nfe-dfe/${id}/pdf`, { responseType: 'blob' }).then((r) => r.data)
  },

  getXml(id: number | string): Promise<string> {
    return ssoClient.get(`/nfe-dfe/${id}/xml`, { responseType: 'text' }).then((r) => r.data)
  },

  // ── NF-e emitida (API NFe) ──────────────────────────────────────────────────

  getNfeXml(nmArquivoXml: string, dataEmissao: string, tenantId: string): Promise<string> {
    const month = toMonthParam(dataEmissao)
    return nfeClient.get(`/danfe/download/${encodeURIComponent(nmArquivoXml)}`, {
      params: { month },
      headers: { 'X-Tenant-Id': tenantId },
      responseType: 'text',
    }).then((r) => r.data as string)
  },

  async downloadNfePdf(chave: string, nmArquivoXml: string, dataEmissao: string, tenantId: string): Promise<Blob> {
    const month = toMonthParam(dataEmissao)
    // Passo 1: baixa o XML
    const xmlText = await nfeClient.get<string>(
      `/danfe/download/${encodeURIComponent(nmArquivoXml)}`,
      { params: { month }, headers: { 'X-Tenant-Id': tenantId }, responseType: 'text' },
    ).then((r) => r.data)
    // Passo 2: gera PDF a partir do XML
    return nfeClient.post<Blob>(
      `/danfe/generate-from-xml`,
      xmlText,
      {
        params: { fileName: chave },
        headers: { 'X-Tenant-Id': tenantId, 'Content-Type': 'text/xml' },
        responseType: 'blob',
      },
    ).then((r) => r.data)
  },

  // ── NFS-e emitida (API NFe) ─────────────────────────────────────────────────

  downloadNfseXml(chave: string, dataEmissao: string, tenantId: string): Promise<Blob> {
    const month = toMonthParam(dataEmissao)
    const fileName = `${chave}-nfse-proc.xml`
    return nfeClient.get(`/danfe/download/${encodeURIComponent(fileName)}`, {
      params: { month },
      headers: { 'X-Tenant-Id': tenantId },
      responseType: 'blob',
    }).then((r) => r.data as Blob)
  },

  downloadNfsePdf(chave: string, dataEmissao: string, tenantId: string): Promise<Blob> {
    const month = toMonthParam(dataEmissao)
    const fileName = `${chave}-nfse-proc-danfse.pdf`
    return nfeClient.get(`/danfe/download/${encodeURIComponent(fileName)}`, {
      params: { month },
      headers: { 'X-Tenant-Id': tenantId },
      responseType: 'blob',
    }).then((r) => r.data as Blob)
  },

  downloadZip(params: { dataInicio: string; dataFim: string; tipoArquivo?: string; tipoNota?: string }): Promise<Blob> {
    return apiClient.get('/dfe/download-zip', { params: { tipoArquivo: 'ambos', tipoNota: 'entrada', ...params }, responseType: 'blob' }).then((r) => r.data)
  },

  getDefault<T = Record<string, unknown>>(entity: string, params: Record<string, unknown>): Promise<PageResponse<T>> {
    return apiClient.get(`/default/${entity}`, { params }).then((r) => r.data)
  },

  getEmpresasEmitentes(): Promise<EmpresaEmitente[]> {
    return apiClient.get('/default/v_empresa_emitente_nfe', { params: { pageNumber: 1, pageSize: 500, orderBy: 'nome_pessoa,asc' } }).then((r) => rows<EmpresaEmitente>(r.data))
  },

  getEmpresaEmissaoPeriodo(ano: number, mes: number): Promise<EmpresaEmitentePeriodo[]> {
    return apiClient.get('/default/empresa_emissao_periodo', { params: { nr_ano: ano, nr_mes: mes, pageNumber: 1, pageSize: 500 } }).then((r) => rows<EmpresaEmitentePeriodo>(r.data))
  },

  gerarPeriodoEmpresas(empresas: EmpresaEmitente[], ano: number, mes: number): Promise<unknown[]> {
    return Promise.all(empresas.map((empresa) => apiClient.post('/default/empresa_emissao_periodo', {
      id_pessoa_empresa: empresa.id_pessoa,
      nr_ano: ano,
      nr_mes: mes,
      fl_emissao_executada: FLAG_NAO,
      dt_marcacao: toMysqlDatetime(),
    })))
  },

  atualizarEmissaoExecutada(idEmpresaEmissaoPeriodo: number | string, executada: boolean): Promise<void> {
    return apiClient.patch('/default/empresa_emissao_periodo', {
      id_empresa_emissao_periodo: idEmpresaEmissaoPeriodo,
      fl_emissao_executada: executada ? 'Sim' : FLAG_NAO,
      dt_marcacao: toMysqlDatetime(),
    }).then(() => undefined)
  },

  marcarEmissaoExecutada(idPessoaEmpresa: number | string, ano: number, mes: number, executada: boolean): Promise<EmpresaEmitentePeriodo> {
    return apiClient.post('/default/empresa_emissao_periodo', {
      id_pessoa_empresa: idPessoaEmpresa,
      nr_ano: ano,
      nr_mes: mes,
      fl_emissao_executada: executada ? 'Sim' : FLAG_NAO,
      dt_marcacao: toMysqlDatetime(),
    }).then((r) => r.data)
  },

  getNotasMesAnteriorTodasEmpresas(dataInicio: string, dataFim: string): Promise<NfeRepeticaoRecord[]> {
    return apiClient.get('/default/v_nfe_mes_anterior', {
      params: { data_emissao: `${dataInicio},${dataFim}`, pageNumber: 1, pageSize: 5000, orderBy: 'data_emissao,desc' },
    }).then((r) => rows<NfeRepeticaoRecord>(r.data))
  },

  getNotasMesAnterior(idPessoaEmpresa: number | string, dataInicio: string, dataFim: string): Promise<NfeRepeticaoRecord[]> {
    return apiClient.get('/default/v_nfe_mes_anterior', {
      params: { id_pessoa_empresa: idPessoaEmpresa, data_emissao: `${dataInicio},${dataFim}`, pageNumber: 1, pageSize: 500, orderBy: 'data_emissao,desc' },
    }).then((r) => rows<NfeRepeticaoRecord>(r.data))
  },

  getNotasPorPeriodo(idPessoaEmpresa: number | string, dataInicio: string, dataFim: string): Promise<NfeRepeticaoRecord[]> {
    return apiClient.get('/default/v_nfe_mes_anterior', {
      params: { id_pessoa_empresa: idPessoaEmpresa, data_emissao: `${dataInicio},${dataFim}`, pageNumber: 1, pageSize: 500, orderBy: 'data_emissao,desc' },
    }).then((r) => rows<NfeRepeticaoRecord>(r.data))
  },

  getServicos(): Promise<ServicoRecord[]> {
    return apiClient.get('/default/servico', { params: { pageNumber: 1, pageSize: 1000, orderBy: 'ds_servico,asc' } }).then((r) => rows<ServicoRecord>(r.data))
  },

  marcarNotaRepetir(data: {
    id_nfe: number | string
    id_pessoa_empresa: number | string
    id_empresa_emissao_periodo: number | string
    nr_ano_referencia: number
    nr_mes_referencia: number
    id_servico?: number | string | null
    vl_servico?: number | string | null
    ds_complemento?: string | null
  }): Promise<NfeRepeticaoRecord> {
    return apiClient.post('/default/nfe_repetir', {
      ...data,
      fl_marcada_repetir: 'Sim',
      fl_executado: FLAG_NAO,
      dt_marcacao: toMysqlDatetime(),
    }).then((r) => r.data)
  },

  atualizarNotaRepetir(idNfeRepetir: number | string, data: Partial<NfeRepeticaoRecord>): Promise<void> {
    return apiClient.patch(`/default/nfe_repetir/${idNfeRepetir}`, { id_nfe_repetir: idNfeRepetir, ...data }).then(() => undefined)
  },

  desmarcarNotaRepetir(idNfeRepetir: number | string): Promise<void> {
    return apiClient.delete(`/default/nfe_repetir/${idNfeRepetir}`).then(() => undefined)
  },

  getCertificadoStatus(): Promise<Record<string, unknown>[]> {
    return apiClient.get('/default/v_emitente_certificado_status', { params: { pageNumber: 1, pageSize: 500 } }).then((r) => rows(r.data))
  },

  async executarRepeticaoNotas(data: {
    idPessoaEmpresa: number | string
    anoReferencia: number
    mesReferencia: number
    notas: NfeRepeticaoRecord[]
  }): Promise<{ successCount: number; failureCount: number; total: number }> {
    let successCount = 0
    let failureCount = 0
    for (const nota of data.notas) {
      try {
        await apiClient.post('/default/script/gerarMovimentoViaMovimento', {
          formData: {
            id_pessoa_empresa: nota.id_pessoa_empresa ?? data.idPessoaEmpresa,
            id_empresa_emissao_periodo: nota.id_empresa_emissao_periodo,
            nr_ano_referencia: data.anoReferencia,
            nr_mes_referencia: data.mesReferencia,
            id_nfe_repetir: nota.id_nfe_repetir,
            id_nfe_origem: nota.id_nfe,
            id_servico: nota.id_servico ?? null,
            vl_servico: parseMoneyValue(nota.vl_servico_repetir ?? nota.vl_servico),
            ds_complemento: nota.ds_complemento ?? null,
            origem_execucao: 'dfe_repeticao',
          },
          rowData: {
            id_nfe: nota.id_nfe,
            id_movimento: nota.id_movimento,
            id_pessoa_empresa: nota.id_pessoa_empresa ?? data.idPessoaEmpresa,
          },
          metadata: { origem: 'dfe-consulta-emitentes' },
        })
        successCount += 1
      } catch {
        failureCount += 1
      }
    }
    return { successCount, failureCount, total: data.notas.length }
  },
}

export function rows<T>(payload: unknown): T[] {
  const shaped = payload as { data?: T[]; table?: T[]; entities?: Array<{ data?: T[] }> } | null
  const list = shaped?.data ?? shaped?.table ?? shaped?.entities?.[0]?.data ?? []
  return Array.isArray(list) ? list : []
}

function toMonthParam(dataEmissao: string): string {
  const d = new Date(dataEmissao)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  return `${y}${m}`
}

function toMysqlDatetime() {
  return new Date().toISOString().slice(0, 19).replace('T', ' ')
}

function parseMoneyValue(value: unknown) {
  if (typeof value === 'number') return value
  if (typeof value !== 'string') return 0
  const normalized = value.replace(/\./g, '').replace(',', '.').replace(/[^\d.-]/g, '')
  return Number(normalized) || 0
}
