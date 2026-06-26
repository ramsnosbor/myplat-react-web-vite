import React, { useEffect, useMemo, useState } from 'react'
import ReactDOM from 'react-dom'
import { useLocation, useNavigate } from 'react-router-dom'
import { AppShell } from '@/components/layout/AppShell'
import { entityApi } from '@/api/entity.api'
import { scriptApi } from '@/api/script.api'
import { cepApi } from '@/api/cep.api'
import { dfeApi, rows } from '@/api/dfe.api'
import { takePendingUpload } from '@/utils/pendingUpload'
import { useToast } from '@/components/ui/Toast'

// ─── Types ────────────────────────────────────────────────────────────────────

interface NfeImpostos {
  icms?: {
    tipo?: string; cst?: string; csosn?: string; origem?: string
    modBC?: string; vBC?: string; pICMS?: string; pRedBC?: string; vICMS?: string
    modBCST?: string; pMVAST?: string; vBCST?: string; vICMSST?: string
    pFCP?: string; vFCP?: string
    pICMSInter?: string; vICMSUFDest?: string
  }
  ipi?: { tipo?: string; cst?: string; cEnq?: string; vBC?: string; pIPI?: string; vIPI?: string }
  pis?: { tipo?: string; cst?: string; vBC?: string; pPIS?: string; vPIS?: string }
  cofins?: { tipo?: string; cst?: string; vBC?: string; pCOFINS?: string; vCOFINS?: string }
  ibs?: { tipo?: string; cst?: string; vBC?: string; pIBS?: string; vIBS?: string }
  cbs?: { tipo?: string; cst?: string; vBC?: string; pCBS?: string; vCBS?: string }
  vTotTrib?: string
  vDesc?: string; vOutro?: string; vFrete?: string; vSeg?: string
}

interface NfeItem {
  number: string
  code: string
  description: string
  cfop: string
  unit: string
  quantity: number
  unitValue: number
  total: number
  impostos: NfeImpostos
}

interface NfeVolume {
  quantidade: number; especie?: string; marca?: string
  numeracao?: string; pesoLiquido: number; pesoBruto: number
}

interface NfeDraft {
  key: string
  number: string
  series: string
  issuedAt: string
  operation: string
  tipoEmissao: string
  ambiente: string
  consumidorFinal: string
  protocolo?: string
  dataAutorizacao?: string
  issuer: {
    name: string; document: string; ie?: string; phone?: string
    logradouro?: string; numero?: string; complemento?: string
    bairro?: string; municipio?: string; uf?: string; cep?: string
  }
  recipient: { name: string; document: string; email?: string; uf?: string }
  totals: {
    vProd: number; vFrete: number; vSeg: number; vDesc: number
    vOutro: number; vICMS: number; vIPI: number; vNF: number
  }
  products: NfeItem[]
  transport: {
    modalidadeFrete: string
    cnpjCpf?: string; razaoSocial?: string
    placa?: string; ufVeiculo?: string
    volumes: NfeVolume[]
  } | null
  financeiro: {
    duplicatas: { numero?: string; dataVencimento?: string; valor: number }[]
    formasPagamento: { tipo?: string; valor: number }[]
  }
  informacoesAdicionais: string
}

interface LocationState {
  uploadToken?: string
  uploadFileName?: string
  dfeId?: string | number
  xmlContent?: string
}

interface Mapping { productId: string; cfopId: string }

interface IssuerExtra {
  email: string; emailNfe: string; nomeContato: string
  cdRegimeTributario: string; nrInscricaoMunicipal: string
  nrInscricaoSuframa: string; tpContribuinteIcms: string; flReterIss: string
}

type ProgressStatus = 'loading' | 'success' | 'warning' | 'error'
type ProgressItem = { step: string; status: ProgressStatus; message: string }

// ─── Component ────────────────────────────────────────────────────────────────

export default function NfeViewerPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const toast = useToast()
  const state = (location.state ?? {}) as LocationState
  const [draft, setDraft] = useState<NfeDraft | null>(null)
  const [xmlContent, setXmlContent] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [checking, setChecking] = useState(false)
  const [alreadyImported, setAlreadyImported] = useState(false)
  const [series, setSeries] = useState<Record<string, unknown>[]>([])
  const [products, setProducts] = useState<Record<string, unknown>[]>([])
  const [cfops, setCfops] = useState<Record<string, unknown>[]>([])
  const [selectedSeriesId, setSelectedSeriesId] = useState('')
  const [mappings, setMappings] = useState<Record<string, Mapping>>({})
  const [issuerFound, setIssuerFound] = useState<boolean | null>(null)
  const [impostosItem, setImpostosItem] = useState<NfeItem | null>(null)
  const [issuerExtra, setIssuerExtra] = useState<IssuerExtra>({
    email: '', emailNfe: '', nomeContato: '',
    cdRegimeTributario: '', nrInscricaoMunicipal: '',
    nrInscricaoSuframa: '', tpContribuinteIcms: '', flReterIss: '',
  })
  const [produtosFornecedor, setProdutosFornecedor] = useState<Record<string, unknown>[]>([])
  const [consumidorFinal, setConsumidorFinal] = useState('Sim')
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [importing, setImporting] = useState(false)
  const [progress, setProgress] = useState<ProgressItem[]>([])

  // Parse XML from file upload or passed state
  useEffect(() => {
    if (state.xmlContent) {
      try {
        const parsed = parseNfe(state.xmlContent)
        setXmlContent(state.xmlContent)
        setDraft(parsed)
        setConsumidorFinal(parsed.consumidorFinal)
        setMappings(Object.fromEntries(parsed.products.map((p) => [p.number, { productId: '', cfopId: '' }])))
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Nao foi possivel processar o XML.')
      }
      return
    }
    const file = takePendingUpload(state.uploadToken)
    if (!file) {
      setError('Nenhum XML foi fornecido. Selecione o arquivo novamente.')
      return
    }
    file.text()
      .then((content) => {
        setXmlContent(content)
        const parsed = parseNfe(content)
        setDraft(parsed)
        setConsumidorFinal(parsed.consumidorFinal)
        setMappings(Object.fromEntries(parsed.products.map((p) => [p.number, { productId: '', cfopId: '' }])))
      })
      .catch(() => setError('Nao foi possivel ler o arquivo XML selecionado.'))
  }, [state.uploadToken, state.xmlContent])

  // Load references and auto-suggest CFOPs
  useEffect(() => {
    if (!draft) return
    let cancelled = false

    async function load() {
      setChecking(true)
      try {
        const [nfeResult, productResult, cfopResult, recipientResult, issuerResult] = await Promise.all([
          entityApi.getList<Record<string, unknown>>('nfe', { chave_acesso: draft!.key, pageNumber: 1, pageSize: 1 }),
          entityApi.getList<Record<string, unknown>>('v_produto', { pageNumber: 1, pageSize: 500, orderBy: 'nome_produto,asc' }),
          entityApi.getList<Record<string, unknown>>('vCfopAutocomplete', {
            pageNumber: 1, pageSize: 500, orderBy: 'cfop,asc',
            naturazaOperacao: 0,
            tipoOperacao: draft!.issuer.uf && draft!.recipient.uf && draft!.issuer.uf === draft!.recipient.uf ? 'interna' : 'externa',
          }),
          entityApi.getList<Record<string, unknown>>('pessoas', { cpf: maskCpfCnpj(draft!.recipient.document), pageNumber: 1, pageSize: 1 }),
          entityApi.getList<Record<string, unknown>>('pessoas', { cpf: maskCpfCnpj(draft!.issuer.document), pageNumber: 1, pageSize: 1 }),
        ])
        if (cancelled) return

        setAlreadyImported(entityRows(nfeResult).length > 0)

        // Se emitente já existe, pré-preenche os campos extras com dados do banco
        const issuerPerson = entityRows(issuerResult)[0]
        setIssuerFound(!!issuerPerson)
        if (issuerPerson) {
          setIssuerExtra({
            email: value(issuerPerson, 'email'),
            emailNfe: value(issuerPerson, 'email_nfe'),
            nomeContato: value(issuerPerson, 'nomecontato'),
            cdRegimeTributario: value(issuerPerson, 'cd_regime_tributario'),
            nrInscricaoMunicipal: value(issuerPerson, 'nr_inscricao_municipal'),
            nrInscricaoSuframa: value(issuerPerson, 'nr_inscricao_suframa'),
            tpContribuinteIcms: value(issuerPerson, 'tp_contribuinte_icms'),
            flReterIss: value(issuerPerson, 'fl_reter_iss'),
          })
        }
        const productList = entityRows(productResult)
        const cfopList = entityRows(cfopResult)
        setProducts(productList)
        setCfops(cfopList)

        // Busca vínculos produto-fornecedor para auto-sugerir produtos
        let pfList: Record<string, unknown>[] = []
        if (issuerPerson) {
          try {
            const pfResult = await entityApi.getList<Record<string, unknown>>('produto_fornecedor', {
              id_pessoa: value(issuerPerson, 'id_pessoa'), pageNumber: 1, pageSize: 500,
            })
            pfList = entityRows(pfResult)
            if (!cancelled) setProdutosFornecedor(pfList)
          } catch { /* sem vínculo ainda */ }
        }

        // Auto-suggest CFOP de entrada equivalente para cada item
        setMappings((current) => {
          const next = { ...current }
          for (const item of draft!.products) {
            const entradaCfop = convertCfopToEntrada(item.cfop)
            const foundCfop = cfopList.find(
              (c) => value(c, 'cfop') === entradaCfop || value(c, 'cd_cfop') === entradaCfop,
            )
            const foundPf = pfList.find((pf) => value(pf, 'cd_produto_fornecedor') === item.code)
            next[item.number] = {
              productId: next[item.number]?.productId || (foundPf ? String(value(foundPf, 'id_produto') ?? '') : ''),
              cfopId: next[item.number]?.cfopId || (foundCfop ? value(foundCfop, 'id_cfop') : ''),
            }
          }
          return next
        })

        const recipient = entityRows(recipientResult)[0]
        if (recipient) {
          const recipientId = value(recipient, 'id_pessoa')
          const seriesResult = await entityApi.getList<Record<string, unknown>>('serie', {
            id_empresa: recipientId, tp_movimento: 'entrada', pageNumber: 1, pageSize: 100,
          })
          if (!cancelled) {
            const available = entityRows(seriesResult)
            setSeries(available)
            if (available.length === 1) setSelectedSeriesId(value(available[0], 'id_serie'))
          }
        }
      } catch {
        if (!cancelled) setError('Nao foi possivel carregar as referencias necessarias.')
      } finally {
        if (!cancelled) setChecking(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [draft])

  function updateMapping(itemNumber: string, field: keyof Mapping, next: string) {
    setMappings((cur) => ({ ...cur, [itemNumber]: { ...(cur[itemNumber] ?? { productId: '', cfopId: '' }), [field]: next } }))
  }

  function validateBeforeConfirm() {
    if (!draft) return false
    if (!selectedSeriesId) { toast.error('Selecione a serie de entrada antes de importar.'); return false }
    const missing = draft.products.find((p) => !mappings[p.number]?.productId || !mappings[p.number]?.cfopId)
    if (missing) { toast.error(`Vincule o produto e o CFOP do item ${missing.number} antes de importar.`); return false }
    setConfirmOpen(true)
    return true
  }

  async function importNfe() {
    if (!draft) return
    setConfirmOpen(false)
    setImporting(true)
    setProgress([])

    const add = (step: string, status: ProgressStatus, message: string) =>
      setProgress((cur) => [...cur, { step, status, message }])

    try {
      // ── Emitente ──────────────────────────────────────────────────────────
      const issuerId = await resolveOrCreatePerson(draft.issuer, issuerExtra, add)

      // ── Destinatario ──────────────────────────────────────────────────────
      add('Destinatario', 'loading', 'Validando empresa destinataria...')
      const recipientResult = await entityApi.getList<Record<string, unknown>>('pessoas', {
        cpf: maskCpfCnpj(draft.recipient.document), pageNumber: 1, pageSize: 1,
      })
      const recipient = entityRows(recipientResult)[0]
      const recipientId = value(recipient, 'id_pessoa')
      if (!recipientId) throw new Error('O destinatario da nota nao esta cadastrado como empresa no sistema.')
      add('Destinatario', 'success', 'Empresa destinataria localizada.')

      // ── Enderecos para o movimento ─────────────────────────────────────────
      const issuerAddr = await fetchFirstAddress(issuerId)
      const recipientAddr = await fetchFirstAddress(recipientId)

      // ── Movimento ─────────────────────────────────────────────────────────
      add('Movimento', 'loading', 'Criando movimento de entrada...')
      const firstCfopId = mappings[draft.products[0].number]?.cfopId
      if (!firstCfopId) throw new Error('CFOP nao selecionado para o primeiro produto.')

      const movement = await entityApi.create<Record<string, unknown>>('movimento', compact({
        id_pessoa_emitente: issuerId,
        id_pessoa_destino: recipientId,
        id_serie: selectedSeriesId,
        id_cfop: firstCfopId,
        id_tipo_nota: 0,
        nr_nota: draft.number,
        dt_movimento: toDate(draft.issuedAt),
        dt_saida_entrada: toDate(draft.issuedAt),
        hr_saida_entrada: draft.issuedAt?.includes('T') ? draft.issuedAt.split('T')[1]?.substring(0, 5) : null,
        id_status: 8,
        id_pessoa_endereco_emitente: issuerAddr,
        id_pessoa_endereco_destino: recipientAddr,
        vl_total_produto: draft.totals.vProd,
        vl_total_nota: draft.totals.vNF,
        vl_total_icms: draft.totals.vICMS,
        vl_total_ipi: draft.totals.vIPI,
        vl_frete: draft.totals.vFrete,
        vl_frete_seguro: draft.totals.vSeg,
        vl_outros_descontos: draft.totals.vDesc,
        vl_outras_despesas: draft.totals.vOutro,
        vl_embalagem: 0,
        vl_acrescimo: 0,
        fl_reserva_estoque: 'Nao',
        cd_venda_presencial: 0,
        informacoes_adicionais_fisco: draft.informacoesAdicionais,
        informacoes_complementares: `Importacao XML NF-e ${draft.number}`,
        indicador_consumidor_final: consumidorFinal,
        email_nfe_destino: draft.recipient.email,
        id_tipo_nota_emissao: parseInt(draft.tipoEmissao) || 1,
      }))
      const movementId = value(movement.data, 'id_movimento') || value(movement.data, 'id')
      if (!movementId) throw new Error('O movimento foi criado sem identificador retornado pela API.')
      add('Movimento', 'success', `Movimento ${movementId} criado.`)

      // ── Atualiza registro NFe ──────────────────────────────────────────────
      try {
        add('NFe', 'loading', 'Atualizando dados fiscais...')
        const nfeResult = await entityApi.getList<Record<string, unknown>>('nfe', { id_movimento: movementId, pageNumber: 1, pageSize: 1 })
        const nfeRec = entityRows(nfeResult)[0]
        if (nfeRec) {
          const digitoVerif = draft.key?.length === 44 ? draft.key.slice(-1) : null
          await entityApi.update('nfe', compact({
            id_nfe: value(nfeRec, 'id_nfe'),
            id_movimento: movementId,
            id_status: 8,
            chave_acesso: draft.key,
            digito_verificador: digitoVerif,
            nr_protocolo: draft.protocolo,
            dt_hora_recibo: draft.dataAutorizacao ? toDate(draft.dataAutorizacao) : null,
            dt_movimento: toDate(draft.issuedAt),
            cd_tipo_ambiente: draft.ambiente === 'Producao' ? 1 : 2,
            versao_aplicativo: '4.00',
          }))
          add('NFe', 'success', 'Dados fiscais atualizados.')
        } else {
          add('NFe', 'warning', 'NFe nao localizada para complemento (movimento criado).')
        }
      } catch {
        add('NFe', 'warning', 'Nao foi possivel atualizar os dados fiscais (nao critico).')
      }

      // ── Produtos + Impostos ────────────────────────────────────────────────
      add('Produtos', 'loading', `Incluindo ${draft.products.length} item(ns)...`)
      let produtosOk = 0; let produtosErros: string[] = []
      let impostosOk = 0; let impostosErros: string[] = []

      for (const item of draft.products) {
        const m = mappings[item.number]
        let idMovProduto: string = ''
        try {
          const res = await entityApi.create<Record<string, unknown>>('movimento_produto', compact({
            id_movimento: movementId,
            id_produto: m.productId,
            id_cfop: m.cfopId,
            id_tributacao: 0,
            id_tabela_preco: 0,
            unidade_medida_cadastro: item.unit,
            unidade_medida_movimento: item.unit,
            nr_fator_conversao: 1,
            qt_movimento: item.quantity,
            vl_valor_unitario: item.unitValue,
            vl_desconto: toNum(item.impostos.vDesc),
            vl_valor_total: item.total,
            vl_outras_despesas: toNum(item.impostos.vOutro),
            vl_frete_seguro: toNum(item.impostos.vSeg),
            vl_frete: toNum(item.impostos.vFrete),
            vl_embalagem: 0,
            vl_acrescimo: 0,
          }))
          idMovProduto = value(res.data, 'id_movimento_produto') || value(res.data, 'id')
          produtosOk++
        } catch (err) {
          produtosErros.push(`Item ${item.number}: ${errMsg(err)}`)
          continue
        }

        if (!idMovProduto) continue
        const imp = item.impostos

        // ICMS
        if (imp.icms && (imp.icms.cst || imp.icms.csosn || imp.icms.vICMS)) {
          try {
            await entityApi.create('movimento_imposto', compact({
              id_movimento_produto: idMovProduto,
              id_imposto: 1,
              vl_base_calculo: toNum(imp.icms.vBC),
              nr_percentual_aliquota: toNum(imp.icms.pICMS),
              nr_percentual_aliquota_interna: toNum(imp.icms.pICMSInter),
              nr_percentual_aliquota_difal: 0,
              nr_percentual_reducao: toNum(imp.icms.pRedBC),
              vl_imposto: toNum(imp.icms.vICMS),
              vl_imposto_difal: toNum(imp.icms.vICMSUFDest),
              cd_cst: imp.icms.csosn || imp.icms.cst,
              cd_csosn: imp.icms.csosn,
              cd_mod_bc_st: imp.icms.modBCST,
              cd_origem_mercadoria: imp.icms.origem,
              vl_base_st: toNum(imp.icms.vBCST),
              vl_imposto_st: toNum(imp.icms.vICMSST),
              nr_perc_margem_st: toNum(imp.icms.pMVAST),
              fl_com_st: toNum(imp.icms.vICMSST) > 0 ? 'S' : 'N',
              nr_percentual_fcp: toNum(imp.icms.pFCP),
              vl_imposto_fcp: toNum(imp.icms.vFCP),
            }))
            impostosOk++
          } catch (err) { impostosErros.push(`ICMS item ${item.number}: ${errMsg(err)}`) }
        }
        // IPI
        if (imp.ipi?.vIPI) {
          try {
            await entityApi.create('movimento_imposto', compact({
              id_movimento_produto: idMovProduto, id_imposto: 2,
              vl_base_calculo: toNum(imp.ipi.vBC), nr_percentual_aliquota: toNum(imp.ipi.pIPI),
              vl_imposto: toNum(imp.ipi.vIPI),
              nr_percentual_aliquota_interna: 0, nr_percentual_aliquota_difal: 0,
              nr_percentual_reducao: 0, vl_imposto_difal: 0,
              vl_base_st: 0, vl_imposto_st: 0, nr_percentual_fcp: 0, vl_imposto_fcp: 0,
              nr_perc_margem_st: 0, fl_com_st: 'N',
              cd_cst: imp.ipi.cst, cd_enquadramento_ipi: imp.ipi.cEnq,
            }))
            impostosOk++
          } catch (err) { impostosErros.push(`IPI item ${item.number}: ${errMsg(err)}`) }
        }
        // PIS
        if (imp.pis?.vPIS) {
          try {
            await entityApi.create('movimento_imposto', compact({
              id_movimento_produto: idMovProduto, id_imposto: 3,
              vl_base_calculo: toNum(imp.pis.vBC), nr_percentual_aliquota: toNum(imp.pis.pPIS),
              vl_imposto: toNum(imp.pis.vPIS), cd_cst: imp.pis.cst,
              nr_percentual_aliquota_interna: 0, nr_percentual_aliquota_difal: 0,
              nr_percentual_reducao: 0, vl_imposto_difal: 0,
              vl_base_st: 0, vl_imposto_st: 0, nr_percentual_fcp: 0, vl_imposto_fcp: 0,
              nr_perc_margem_st: 0, fl_com_st: 'N',
            }))
            impostosOk++
          } catch (err) { impostosErros.push(`PIS item ${item.number}: ${errMsg(err)}`) }
        }
        // COFINS
        if (imp.cofins?.vCOFINS) {
          try {
            await entityApi.create('movimento_imposto', compact({
              id_movimento_produto: idMovProduto, id_imposto: 4,
              vl_base_calculo: toNum(imp.cofins.vBC), nr_percentual_aliquota: toNum(imp.cofins.pCOFINS),
              vl_imposto: toNum(imp.cofins.vCOFINS), cd_cst: imp.cofins.cst,
              nr_percentual_aliquota_interna: 0, nr_percentual_aliquota_difal: 0,
              nr_percentual_reducao: 0, vl_imposto_difal: 0,
              vl_base_st: 0, vl_imposto_st: 0, nr_percentual_fcp: 0, vl_imposto_fcp: 0,
              nr_perc_margem_st: 0, fl_com_st: 'N',
            }))
            impostosOk++
          } catch (err) { impostosErros.push(`COFINS item ${item.number}: ${errMsg(err)}`) }
        }
        // IBS (Reforma Tributaria)
        if (imp.ibs?.vIBS) {
          try {
            await entityApi.create('movimento_imposto', compact({
              id_movimento_produto: idMovProduto, id_imposto: 17,
              vl_base_calculo: toNum(imp.ibs.vBC), nr_percentual_aliquota: toNum(imp.ibs.pIBS),
              vl_imposto: toNum(imp.ibs.vIBS), cd_cst: imp.ibs.cst,
              nr_percentual_aliquota_interna: 0, nr_percentual_aliquota_difal: 0,
              nr_percentual_reducao: 0, vl_imposto_difal: 0,
              vl_base_st: 0, vl_imposto_st: 0, nr_percentual_fcp: 0, vl_imposto_fcp: 0,
              nr_perc_margem_st: 0, fl_com_st: 'N',
            }))
            impostosOk++
          } catch (err) { impostosErros.push(`IBS item ${item.number}: ${errMsg(err)}`) }
        }
        // CBS (Reforma Tributaria)
        if (imp.cbs?.vCBS) {
          try {
            await entityApi.create('movimento_imposto', compact({
              id_movimento_produto: idMovProduto, id_imposto: 18,
              vl_base_calculo: toNum(imp.cbs.vBC), nr_percentual_aliquota: toNum(imp.cbs.pCBS),
              vl_imposto: toNum(imp.cbs.vCBS), cd_cst: imp.cbs.cst,
              nr_percentual_aliquota_interna: 0, nr_percentual_aliquota_difal: 0,
              nr_percentual_reducao: 0, vl_imposto_difal: 0,
              vl_base_st: 0, vl_imposto_st: 0, nr_percentual_fcp: 0, vl_imposto_fcp: 0,
              nr_perc_margem_st: 0, fl_com_st: 'N',
            }))
            impostosOk++
          } catch (err) { impostosErros.push(`CBS item ${item.number}: ${errMsg(err)}`) }
        }
      }

      add('Produtos', produtosErros.length ? 'warning' : 'success',
        produtosErros.length
          ? `${produtosOk}/${draft.products.length} item(ns). Erros: ${produtosErros.join('; ')}`
          : `${produtosOk} item(ns) inserido(s).`)
      if (impostosOk > 0 || impostosErros.length > 0) {
        add('Impostos', impostosErros.length ? 'warning' : 'success',
          impostosErros.length
            ? `${impostosOk} imposto(s). Erros: ${impostosErros.join('; ')}`
            : `${impostosOk} imposto(s) inserido(s).`)
      }

      // ── Vínculos produto-fornecedor ───────────────────────────────────────
      try {
        for (const item of draft.products) {
          const m = mappings[item.number]
          if (!m?.productId) continue
          const existing = produtosFornecedor.find(
            (pf) => value(pf, 'cd_produto_fornecedor') === item.code,
          )
          if (existing) {
            if (String(value(existing, 'id_produto')) !== String(m.productId)) {
              await entityApi.update('produto_fornecedor', {
                id_produto_fornecedor: value(existing, 'id_produto_fornecedor'),
                id_produto: m.productId,
                nm_produto_fornecedor: item.description,
              })
            }
          } else {
            await entityApi.create('produto_fornecedor', {
              id_pessoa: issuerId,
              id_produto: m.productId,
              cd_produto_fornecedor: item.code,
              nm_produto_fornecedor: item.description,
            })
          }
        }
      } catch { /* best-effort — vínculo sera gravado na próxima importação */ }

      // ── Parcelas financeiras ───────────────────────────────────────────────
      const duplicatas = draft.financeiro.duplicatas
      if (duplicatas.length > 0) {
        add('Parcelas', 'loading', `Incluindo ${duplicatas.length} parcela(s)...`)
        let parcelasOk = 0; const parcelasErros: string[] = []
        for (let i = 0; i < duplicatas.length; i++) {
          const dup = duplicatas[i]
          try {
            await entityApi.create('financeiro', compact({
              id_movimento: movementId,
              id_pessoa: issuerId,
              id_unidade: recipientId,
              data_emissao: toDate(draft.issuedAt),
              data_vencimento: dup.dataVencimento ? toDate(dup.dataVencimento) : null,
              data_vencimento_original: dup.dataVencimento ? toDate(dup.dataVencimento) : null,
              data_entrada: new Date().toISOString().slice(0, 10),
              tipo_movimento: 'Pagar',
              valor: dup.valor,
              observacao: `Provisão de Pagamento compra de mercadoria ${draft.issuer.name} ref a nota ${draft.number}`,
              complemento: '',
              numero_documento: `${draft.number}/${dup.numero || String(i + 1)}`,
              id_tipo_documento: 1,
              id_tipo_cobranca: 1,
              fl_previsao: 'Nao',
            }))
            parcelasOk++
          } catch (err) { parcelasErros.push(`Parcela ${i + 1}: ${errMsg(err)}`) }
        }
        add('Parcelas', parcelasErros.length ? 'warning' : 'success',
          parcelasErros.length
            ? `${parcelasOk}/${duplicatas.length}. Erros: ${parcelasErros.join('; ')}`
            : `${parcelasOk} parcela(s) inserida(s).`)
      }

      // ── Transporte + Volumes ───────────────────────────────────────────────
      const transp = draft.transport
      if (transp) {
        add('Transporte', 'loading', 'Cadastrando dados de transporte...')
        try {
          const modalidadeMap: Record<string, number> = {
            '0': 0, '1': 1, '2': 2, '3': 3, '4': 4, '9': 9,
          }
          const transpRes = await entityApi.create<Record<string, unknown>>('movimento_transporte', compact({
            id_movimento: movementId,
            id_modalidade_frete: modalidadeMap[transp.modalidadeFrete] ?? 9,
            placa_veiculo: transp.placa,
            uf_veiculo: transp.ufVeiculo,
            rntc_veiculo: null,
          }))
          const idTransporte = value(transpRes.data, 'id_movimento_transporte') || value(transpRes.data, 'id')
          add('Transporte', 'success', 'Dados de transporte inseridos.')

          if (idTransporte && transp.volumes.length > 0) {
            add('Volumes', 'loading', `Inserindo ${transp.volumes.length} volume(s)...`)
            let volOk = 0; const volErros: string[] = []
            for (const vol of transp.volumes) {
              try {
                await entityApi.create('movimento_transporte_volume', compact({
                  id_movimento_transporte: idTransporte,
                  id_movimento: movementId,
                  quantidade: vol.quantidade,
                  especie: vol.especie,
                  marca: vol.marca,
                  numeracao: vol.numeracao,
                  peso_liquido: vol.pesoLiquido,
                  peso_bruto: vol.pesoBruto,
                }))
                volOk++
              } catch (err) { volErros.push(errMsg(err)) }
            }
            add('Volumes', volErros.length ? 'warning' : 'success',
              volErros.length ? `${volOk}/${transp.volumes.length}. ${volErros.join('; ')}` : `${volOk} volume(s) inserido(s).`)
          }
        } catch (err) {
          add('Transporte', 'warning', `Nao foi possivel inserir transporte: ${errMsg(err)}`)
        }
      }

      // ── Estoque ───────────────────────────────────────────────────────────
      try {
        await scriptApi.execute('refazSaldoMovimento', { rowData: { id_movimento: movementId }, params: { id_movimento: movementId } })
        add('Estoque', 'success', 'Saldo do movimento recalculado.')
      } catch {
        add('Estoque', 'warning', 'Movimento criado; nao foi possivel recalcular o saldo agora.')
      }

      // ── DFe ───────────────────────────────────────────────────────────────
      if (state.dfeId) {
        try {
          await dfeApi.updateStatus(state.dfeId, 4)
          add('DFe', 'success', 'DFe marcada como importada.')
        } catch {
          add('DFe', 'warning', 'Nao foi possivel atualizar o status da DFe.')
        }
      }

      add('Concluido', 'success', 'Importacao concluida com sucesso.')
      toast.success('NFe importada com sucesso.')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro ao importar a NFe.'
      add('Importacao', 'error', msg)
      toast.error(msg)
    } finally {
      setImporting(false)
    }
  }

  // Summary computed for the aside panel
  const dupTotal = useMemo(
    () => draft?.financeiro.duplicatas.reduce((s, d) => s + d.valor, 0) ?? 0,
    [draft],
  )

  return (
    <AppShell title="Importar NF-e" subtitle={state.uploadFileName || 'Conferencia e importacao de XML'}>
      <div className="min-h-full bg-[#fafafa] p-3 sm:p-4">
        {error && <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
        {!draft && !error && (
          <div className="flex min-h-72 items-center justify-center text-sm text-slate-500">
            <span className="mr-2 h-5 w-5 animate-spin rounded-full border-2 border-blue-700 border-t-transparent" />
            Lendo XML...
          </div>
        )}
        {draft && (
          <div className="grid min-w-0 gap-3 xl:grid-cols-[minmax(0,1fr)_360px]">
            {/* ── Main column ── */}
            <div className="min-w-0 space-y-3">
              {/* Header card */}
              <section className="rounded-lg border border-blue-100 bg-white p-4 shadow-sm shadow-blue-950/5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">NF-e {draft.number} — Serie {draft.series}</p>
                    <h1 className="mt-1 text-lg font-semibold text-slate-900">{draft.operation || 'Documento fiscal eletronico'}</h1>
                    <p className="mt-1 text-sm text-slate-500">Chave: <span className="break-all font-mono text-xs">{draft.key}</span></p>
                    {draft.protocolo && <p className="mt-0.5 text-xs text-slate-500">Protocolo: {draft.protocolo} | Ambiente: {draft.ambiente}</p>}
                  </div>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${alreadyImported ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}>
                    {checking ? 'Verificando...' : alreadyImported ? 'Ja importada' : 'Pronta para importar'}
                  </span>
                </div>
                <div className="mt-4 grid gap-3 border-t border-slate-100 pt-3 sm:grid-cols-2">
                  <PartyCard title="Emitente" party={draft.issuer} />
                  <PartyCard title="Destinatario" party={draft.recipient} />
                </div>
              </section>

              {/* Emitente — sempre visível; campos editáveis pré-preenchidos do banco quando o emitente já existe */}
              <section className={`rounded-lg border bg-white p-4 shadow-sm shadow-blue-950/5 ${
                issuerFound === null ? 'border-slate-200' : issuerFound ? 'border-blue-100' : 'border-amber-200'
              }`}>
                <div className="flex items-start gap-3">
                  <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-white text-sm ${
                    issuerFound === null ? 'bg-slate-400' : issuerFound ? 'bg-blue-700' : 'bg-amber-500'
                  }`}>
                    <i className={`bi ${issuerFound === null ? 'bi-hourglass-split' : issuerFound ? 'bi-person-check-fill' : 'bi-person-plus-fill'}`} aria-hidden />
                  </span>
                  <div className="min-w-0">
                    <h2 className="text-sm font-semibold text-slate-900">
                      {issuerFound === null
                        ? 'Verificando emitente...'
                        : issuerFound
                        ? `Emitente — ${draft.issuer.name}`
                        : `Emitente nao cadastrado — ${draft.issuer.name}`}
                    </h2>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {issuerFound === null
                        ? 'Aguarde enquanto consultamos o banco de dados.'
                        : issuerFound
                        ? 'Fornecedor ja cadastrado. Dados complementares exibidos para referencia.'
                        : `${maskCpfCnpj(draft.issuer.document)} sera cadastrado ao importar. Preencha os dados complementares.`}
                    </p>
                  </div>
                </div>


                {/* Dados do XML — somente leitura */}
                {issuerFound !== null && (
                  <div className="mt-4 space-y-4 border-t border-slate-100 pt-4">
                    <div className="grid grid-cols-2 gap-x-6 gap-y-1 rounded-md bg-slate-50 p-3 text-xs text-slate-600">
                      <div><span className="font-medium text-slate-500">Razao Social:</span> {draft.issuer.name}</div>
                      <div><span className="font-medium text-slate-500">CNPJ/CPF:</span> {maskCpfCnpj(draft.issuer.document)}</div>
                      {draft.issuer.ie && <div><span className="font-medium text-slate-500">IE:</span> {draft.issuer.ie}</div>}
                      {draft.issuer.phone && <div><span className="font-medium text-slate-500">Telefone:</span> {draft.issuer.phone}</div>}
                      {draft.issuer.logradouro && (
                        <div className="col-span-2">
                          <span className="font-medium text-slate-500">Endereco:</span>{' '}
                          {[draft.issuer.logradouro, draft.issuer.numero, draft.issuer.bairro].filter(Boolean).join(', ')}
                          {draft.issuer.municipio ? ` — ${draft.issuer.municipio}` : ''}{draft.issuer.uf ? `/${draft.issuer.uf}` : ''}
                          {draft.issuer.cep ? ` — CEP ${draft.issuer.cep}` : ''}
                        </div>
                      )}
                    </div>

                    {/* Campos editáveis — usados na criação (fornecedor novo) ou para referência (já existe) */}
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <IssuerField label="E-mail">
                        <input type="email" className={inputClass} placeholder="email@empresa.com.br"
                          value={issuerExtra.email}
                          onChange={(e) => setIssuerExtra((p) => ({ ...p, email: e.target.value, emailNfe: p.emailNfe || e.target.value }))} />
                      </IssuerField>
                      <IssuerField label="E-mail NFe">
                        <input type="email" className={inputClass} placeholder="email para NF-e"
                          value={issuerExtra.emailNfe}
                          onChange={(e) => setIssuerExtra((p) => ({ ...p, emailNfe: e.target.value }))} />
                      </IssuerField>
                      <IssuerField label="Nome do Contato">
                        <input type="text" className={inputClass} placeholder="Responsavel pelo contato"
                          value={issuerExtra.nomeContato}
                          onChange={(e) => setIssuerExtra((p) => ({ ...p, nomeContato: e.target.value }))} />
                      </IssuerField>
                      <IssuerField label="Regime Tributario">
                        <select className={inputClass} value={issuerExtra.cdRegimeTributario}
                          onChange={(e) => setIssuerExtra((p) => ({ ...p, cdRegimeTributario: e.target.value }))}>
                          <option value="">Selecione</option>
                          <option value="1 - Simples Nacional">1 — Simples Nacional</option>
                          <option value="2 - Simples Nacional - Excesso receita bruta">2 — Simples Nacional (Excesso)</option>
                          <option value="3 - Normal">3 — Regime Normal</option>
                        </select>
                      </IssuerField>
                      <IssuerField label="Contribuinte ICMS">
                        <select className={inputClass} value={issuerExtra.tpContribuinteIcms}
                          onChange={(e) => setIssuerExtra((p) => ({ ...p, tpContribuinteIcms: e.target.value }))}>
                          <option value="">Selecione</option>
                          <option value="Sim">Sim</option>
                          <option value="Isento">Isento</option>
                          <option value="Nao">Nao</option>
                        </select>
                      </IssuerField>
                      <IssuerField label="Reter ISS">
                        <select className={inputClass} value={issuerExtra.flReterIss}
                          onChange={(e) => setIssuerExtra((p) => ({ ...p, flReterIss: e.target.value }))}>
                          <option value="">Selecione</option>
                          <option value="Sim">Sim</option>
                          <option value="Nao">Nao</option>
                        </select>
                      </IssuerField>
                      <IssuerField label="Inscricao Municipal">
                        <input type="text" className={inputClass} placeholder="Inscricao municipal"
                          value={issuerExtra.nrInscricaoMunicipal}
                          onChange={(e) => setIssuerExtra((p) => ({ ...p, nrInscricaoMunicipal: e.target.value }))} />
                      </IssuerField>
                      <IssuerField label="Inscricao SUFRAMA">
                        <input type="text" className={inputClass} placeholder="Inscricao SUFRAMA"
                          value={issuerExtra.nrInscricaoSuframa}
                          onChange={(e) => setIssuerExtra((p) => ({ ...p, nrInscricaoSuframa: e.target.value }))} />
                      </IssuerField>
                    </div>
                  </div>
                )}
              </section>

              {/* Itens */}
              <section className="overflow-hidden rounded-lg border border-blue-100 bg-white shadow-sm shadow-blue-950/5">
                <header className="border-b border-blue-100 px-4 py-3">
                  <h2 className="text-sm font-semibold text-slate-900">Itens e vinculacoes</h2>
                  <p className="mt-0.5 text-xs text-slate-500">CFOP sugerido automaticamente (saida convertida para entrada). Ajuste se necessario.</p>
                </header>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm" style={{ tableLayout: 'fixed' }}>
                    <colgroup>
                      <col style={{ width: '30%' }} />
                      <col style={{ width: '60px' }} />
                      <col style={{ width: '90px' }} />
                      <col />
                      <col style={{ width: '90px' }} />
                    </colgroup>
                    <thead className="bg-slate-50 text-left text-xs text-slate-500">
                      <tr>
                        <th className="px-3 py-2">Item</th>
                        <th className="px-3 py-2">Qtd.</th>
                        <th className="px-3 py-2">Total</th>
                        <th className="px-3 py-2">Produto / CFOP entrada</th>
                        <th className="px-3 py-2"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {draft.products.map((item) => (
                        <tr key={item.number}>
                          <td className="px-3 py-3">
                            <p className="font-medium text-slate-800">{item.description}</p>
                            <p className="text-xs text-slate-500">Cod. {item.code || '-'} | XML CFOP {item.cfop} → entrada {convertCfopToEntrada(item.cfop)}</p>
                          </td>
                          <td className="px-3 py-3 tabular-nums">{item.quantity}</td>
                          <td className="px-3 py-3 tabular-nums">{formatCurrency(item.total)}</td>
                          <td className="px-3 py-2">
                            <div className="flex flex-col gap-1.5">
                              <Combobox
                                value={mappings[item.number]?.productId ?? ''}
                                onChange={(id) => updateMapping(item.number, 'productId', id)}
                                options={products.map((p) => ({
                                  id: String(value(p, 'id_produto') ?? ''),
                                  label: String(value(p, 'nome_produto') || value(p, 'descricao_produto') || ''),
                                }))}
                                placeholder="Buscar produto..."
                              />
                              <Combobox
                                value={mappings[item.number]?.cfopId ?? ''}
                                onChange={(id) => updateMapping(item.number, 'cfopId', id)}
                                options={cfops.map((c) => ({
                                  id: String(value(c, 'id_cfop') ?? ''),
                                  label: `${value(c, 'cfop') || value(c, 'cd_cfop')} — ${value(c, 'ds_cfop')}`,
                                }))}
                                placeholder="Buscar CFOP..."
                              />
                            </div>
                          </td>
                          <td className="px-3 py-2 text-center">
                            <button
                              type="button"
                              onClick={() => setImpostosItem(item)}
                              className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium bg-sky-50 text-sky-700 border border-sky-200 hover:bg-sky-100 transition-colors"
                            >
                              <i className="bi bi-calculator" aria-hidden /> Impostos
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              {/* Totais */}
              <section className="rounded-lg border border-blue-100 bg-white p-4 shadow-sm shadow-blue-950/5">
                <h2 className="text-sm font-semibold text-slate-900">Totais da nota</h2>
                <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1.5 text-xs sm:grid-cols-4">
                  <TotalRow label="Produtos" value={draft.totals.vProd} />
                  <TotalRow label="ICMS" value={draft.totals.vICMS} />
                  <TotalRow label="IPI" value={draft.totals.vIPI} />
                  <TotalRow label="Frete" value={draft.totals.vFrete} />
                  <TotalRow label="Seguro" value={draft.totals.vSeg} />
                  <TotalRow label="Desconto" value={draft.totals.vDesc} negative />
                  <TotalRow label="Outras desp." value={draft.totals.vOutro} />
                  <div className="col-span-2 sm:col-span-1">
                    <dt className="font-semibold text-slate-700">Total NF-e</dt>
                    <dd className="font-bold text-slate-900">{formatCurrency(draft.totals.vNF)}</dd>
                  </div>
                </dl>
              </section>

              {/* Duplicatas */}
              {draft.financeiro.duplicatas.length > 0 && (
                <section className="rounded-lg border border-blue-100 bg-white p-4 shadow-sm shadow-blue-950/5">
                  <h2 className="text-sm font-semibold text-slate-900">Parcelas financeiras ({draft.financeiro.duplicatas.length})</h2>
                  <p className="mt-0.5 text-xs text-slate-500">Serao criadas como contas a pagar apos a importacao.</p>
                  <div className="mt-3 overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="text-left text-slate-500"><tr><th className="py-1 pr-4">Nr.</th><th className="py-1 pr-4">Vencimento</th><th className="py-1">Valor</th></tr></thead>
                      <tbody className="divide-y divide-slate-100">
                        {draft.financeiro.duplicatas.map((d, i) => (
                          <tr key={i}>
                            <td className="py-1.5 pr-4">{d.numero || String(i + 1)}</td>
                            <td className="py-1.5 pr-4">{d.dataVencimento ? formatDate(d.dataVencimento) : '—'}</td>
                            <td className="py-1.5 tabular-nums">{formatCurrency(d.valor)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}

              {/* Transporte */}
              {draft.transport && (
                <section className="rounded-lg border border-blue-100 bg-white p-4 shadow-sm shadow-blue-950/5">
                  <h2 className="text-sm font-semibold text-slate-900">Transporte</h2>
                  <dl className="mt-2 space-y-1 text-xs text-slate-600">
                    <div className="flex gap-2"><dt className="text-slate-400">Modalidade:</dt><dd>{freteLabelMap[draft.transport.modalidadeFrete] ?? draft.transport.modalidadeFrete}</dd></div>
                    {draft.transport.razaoSocial && <div className="flex gap-2"><dt className="text-slate-400">Transportadora:</dt><dd>{draft.transport.razaoSocial}</dd></div>}
                    {draft.transport.placa && <div className="flex gap-2"><dt className="text-slate-400">Placa:</dt><dd>{draft.transport.placa} ({draft.transport.ufVeiculo})</dd></div>}
                    {draft.transport.volumes.length > 0 && <div className="flex gap-2"><dt className="text-slate-400">Volumes:</dt><dd>{draft.transport.volumes.length}</dd></div>}
                  </dl>
                </section>
              )}
            </div>

            {/* ── Aside ── */}
            <aside className="space-y-3">
              <section className="rounded-lg border border-blue-100 bg-white p-4 shadow-sm shadow-blue-950/5">
                <h2 className="text-sm font-semibold text-slate-900">Confirmacao</h2>
                <label className="mt-4 block text-xs font-medium text-slate-600">Serie de entrada</label>
                <select className={`${selectClass} mt-1`} value={selectedSeriesId} onChange={(e) => setSelectedSeriesId(e.target.value)}>
                  <option value="">Selecione a serie</option>
                  {series.map((s) => (
                    <option key={value(s, 'id_serie')} value={value(s, 'id_serie')}>{value(s, 'descricao_serie') || value(s, 'serie') || value(s, 'id_serie')}</option>
                  ))}
                </select>
                <label className="mt-3 block text-xs font-medium text-slate-600">Consumidor Final</label>
                <select className={`${selectClass} mt-1`} value={consumidorFinal} onChange={(e) => setConsumidorFinal(e.target.value)}>
                  <option value="Sim">Sim</option>
                  <option value="Nao">Não</option>
                </select>
                <dl className="mt-4 space-y-2 border-t border-slate-100 pt-3 text-sm">
                  <div className="flex justify-between gap-3"><dt className="text-slate-500">Produtos</dt><dd className="font-medium text-slate-800">{draft.products.length}</dd></div>
                  {draft.financeiro.duplicatas.length > 0 && (
                    <div className="flex justify-between gap-3"><dt className="text-slate-500">Parcelas</dt><dd className="font-medium text-slate-800">{draft.financeiro.duplicatas.length} — {formatCurrency(dupTotal)}</dd></div>
                  )}
                  <div className="flex justify-between gap-3"><dt className="text-slate-500">Total</dt><dd className="font-semibold text-slate-900">{formatCurrency(draft.totals.vNF)}</dd></div>
                </dl>
                <button type="button" onClick={validateBeforeConfirm} disabled={checking || importing}
                  className="mt-5 flex h-10 w-full items-center justify-center gap-2 rounded-md bg-blue-700 px-3 text-sm font-semibold text-white transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60">
                  <i className="bi bi-box-arrow-in-down" aria-hidden />Importar NF-e
                </button>
                <button type="button" onClick={() => navigate(-1)} disabled={importing}
                  className="mt-2 h-9 w-full rounded-md text-sm font-medium text-slate-600 hover:bg-slate-50">
                  Voltar
                </button>
              </section>

              {progress.length > 0 && (
                <section className="rounded-lg border border-blue-100 bg-white p-4 shadow-sm shadow-blue-950/5">
                  <h2 className="text-sm font-semibold text-slate-900">Progresso</h2>
                  <div className="mt-3 space-y-2">
                    {progress.map((item, i) => <ProgressRow key={`${item.step}-${i}`} {...item} />)}
                  </div>
                </section>
              )}
            </aside>
          </div>
        )}
      </div>
      {confirmOpen && draft && (
        <ConfirmImportModal draft={draft} reimport={alreadyImported} onCancel={() => setConfirmOpen(false)} onConfirm={importNfe} />
      )}
      {impostosItem && (
        <ImpostosModal item={impostosItem} onClose={() => setImpostosItem(null)} />
      )}
    </AppShell>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ConfirmImportModal({ draft, reimport, onCancel, onConfirm }: {
  draft: NfeDraft; reimport: boolean; onCancel: () => void; onConfirm: () => void
}) {
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/40 p-4">
      <section className="w-full max-w-md overflow-hidden rounded-lg border border-blue-100 bg-white shadow-2xl">
        <header className="flex items-center gap-3 border-b border-blue-100 px-4 py-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-md bg-blue-700 text-white"><i className="bi bi-file-earmark-check" aria-hidden /></span>
          <div><h2 className="text-sm font-semibold text-slate-900">Confirmar importacao</h2><p className="text-xs text-slate-500">NF-e {draft.number} | {formatCurrency(draft.totals.vNF)}</p></div>
        </header>
        <div className="px-4 py-4 text-sm text-slate-600">
          {reimport
            ? <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-amber-800">Esta chave ja foi importada. Ao continuar, uma nova movimentacao sera criada.</p>
            : <p>Confirme para criar o movimento de entrada, itens, impostos, parcelas e transporte.</p>}
        </div>
        <footer className="flex justify-end gap-2 border-t border-blue-100 px-4 py-3">
          <button type="button" onClick={onCancel} className="h-9 rounded-md border border-slate-200 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">Cancelar</button>
          <button type="button" onClick={onConfirm} className="h-9 rounded-md bg-blue-700 px-3 text-sm font-semibold text-white hover:bg-blue-800">Confirmar importacao</button>
        </footer>
      </section>
    </div>
  )
}

function PartyCard({ title, party }: { title: string; party: { name: string; document: string; municipio?: string; uf?: string } }) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-medium text-slate-500">{title}</p>
      <p className="mt-1 truncate text-sm font-semibold text-slate-800">{party.name || '—'}</p>
      <p className="mt-0.5 text-xs text-slate-500">{maskCpfCnpj(party.document)}</p>
      {party.municipio && <p className="text-xs text-slate-400">{party.municipio}{party.uf ? `/${party.uf}` : ''}</p>}
    </div>
  )
}

function ProgressRow({ step, status, message }: { step: string; status: string; message: string }) {
  const icon = status === 'success' ? 'bi-check-circle-fill text-emerald-600'
    : status === 'warning' ? 'bi-exclamation-triangle-fill text-amber-600'
    : status === 'error' ? 'bi-x-circle-fill text-red-600'
    : 'bi-arrow-clockwise animate-spin text-blue-700'
  return (
    <div className="flex gap-2 text-xs">
      <i className={`bi ${icon} mt-0.5 shrink-0`} aria-hidden />
      <p className="min-w-0 text-slate-600"><span className="font-semibold text-slate-800">{step}:</span> {message}</p>
    </div>
  )
}

function TotalRow({ label, value: v, negative }: { label: string; value: number; negative?: boolean }) {
  if (!v) return null
  return (
    <div>
      <dt className="text-slate-400">{label}</dt>
      <dd className={negative ? 'text-red-600' : 'text-slate-700'}>{negative ? '-' : ''}{formatCurrency(v)}</dd>
    </div>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const freteLabelMap: Record<string, string> = {
  '0': 'CIF (Remetente)', '1': 'FOB (Destinatario)', '2': 'Terceiros',
  '3': 'Proprio Remetente', '4': 'Proprio Destinatario', '9': 'Sem frete',
}

function maskCpfCnpj(doc: string) {
  const n = doc.replace(/\D/g, '')
  if (n.length === 11) return n.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
  if (n.length === 14) return n.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')
  return doc
}

function convertCfopToEntrada(cfop: string): string {
  if (!cfop) return ''
  const s = cfop.toString()
  const first = s.charAt(0)
  if (first === '5') return '1' + s.slice(1)
  if (first === '6') return '2' + s.slice(1)
  if (first === '7') return '3' + s.slice(1)
  return s
}

async function resolveOrCreatePerson(
  issuer: NfeDraft['issuer'],
  extra: IssuerExtra,
  add: (step: string, status: ProgressStatus, message: string) => void,
): Promise<string> {
  const masked = maskCpfCnpj(issuer.document)

  add('Emitente', 'loading', `Localizando fornecedor ${masked}...`)
  const existing = await entityApi.getList<Record<string, unknown>>('pessoas', { cpf: masked, pageNumber: 1, pageSize: 1 })
  const person = entityRows(existing)[0]
  if (person) {
    add('Emitente', 'success', `Fornecedor encontrado: ${issuer.name}.`)
    return value(person, 'id_pessoa')
  }

  add('Emitente', 'loading', 'Fornecedor nao encontrado. Cadastrando...')
  const created = await entityApi.create<Record<string, unknown>>('pessoas', compact({
    cpf: masked,
    nome_pessoa: issuer.name,
    tipo_pessoa: 'Cliente',
    situacao: 'Completo',
    fl_envia_nfe_contador: 'N',
    fl_emite_nfe: 'Não',
    nr_inscricao_estadual: issuer.ie,
    telefone1: issuer.phone ? formatPhone(issuer.phone) : undefined,
    email: extra.email,
    email_nfe: extra.emailNfe,
    nomecontato: extra.nomeContato,
    cd_regime_tributario: extra.cdRegimeTributario,
    nr_inscricao_municipal: extra.nrInscricaoMunicipal,
    nr_inscricao_suframa: extra.nrInscricaoSuframa,
    tp_contribuinte_icms: extra.tpContribuinteIcms,
    fl_reter_iss: extra.flReterIss,
    observacao: `Importado via NF-e`,
  }))
  const id = value(created.data, 'id_pessoa') || value(created.data, 'id')
  if (!id) throw new Error('Nao foi possivel criar o emitente da nota.')
  add('Emitente', 'success', `Fornecedor cadastrado: ${issuer.name}.`)

  // Endereço
  if (issuer.cep) {
    add('Endereco emitente', 'loading', `Consultando CEP ${issuer.cep}...`)
    try {
      const cepClean = issuer.cep.replace(/\D/g, '')
      let localidadeId: number | string | undefined
      try {
        const cepData = await cepApi.get(cepClean)
        localidadeId = cepData.id
        add('Endereco emitente', 'loading', `CEP encontrado: ${cepData.city}. Cadastrando endereco...`)
      } catch {
        add('Endereco emitente', 'warning', 'CEP nao localizado. Endereco sera cadastrado sem localidade.')
      }

      const addrExists = await entityApi.getList('pessoa_endereco', { id_pessoa: id, cep: issuer.cep, pageNumber: 1, pageSize: 1 })
      if (entityRows(addrExists).length === 0) {
        await entityApi.create('pessoa_endereco', compact({
          id_pessoa: id,
          logradouro: issuer.logradouro,
          numero: issuer.numero,
          complemento: issuer.complemento,
          bairro: issuer.bairro,
          cep: issuer.cep,
          id_localidade: localidadeId,
          ativo: 1,
          data_cadastro: new Date().toISOString().slice(0, 10),
          id_tipo_endereco: 2,
        }))
        add('Endereco emitente', 'success', `Endereco cadastrado: ${issuer.logradouro ?? ''}, ${issuer.bairro ?? ''} — ${issuer.municipio ?? ''}/${issuer.uf ?? ''}.`)
      } else {
        add('Endereco emitente', 'success', 'Endereco ja cadastrado para este CEP.')
      }
    } catch (err) {
      add('Endereco emitente', 'warning', `Nao foi possivel cadastrar o endereco: ${errMsg(err)}`)
    }
  } else {
    add('Endereco emitente', 'warning', 'CEP nao informado no XML. Endereco nao sera cadastrado.')
  }

  return id
}

async function fetchFirstAddress(pessoaId: string): Promise<string | undefined> {
  try {
    const res = await entityApi.getList<Record<string, unknown>>('pessoa_endereco', { id_pessoa: pessoaId, pageNumber: 1, pageSize: 1 })
    const row = entityRows(res)[0]
    return row ? value(row, 'id_endereco') || value(row, 'id_pessoa_endereco') : undefined
  } catch { return undefined }
}

function parseNfe(xml: string): NfeDraft {
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  if (doc.querySelector('parsererror')) throw new Error('O arquivo selecionado nao possui um XML valido.')

  const infNFe = first(doc, 'infNFe')
  const ide = first(doc, 'ide')
  const emit = first(doc, 'emit')
  const dest = first(doc, 'dest')
  const ICMSTot = first(doc, 'ICMSTot')
  const transp = first(doc, 'transp')
  const cobr = doc.querySelector('cobr')
  const infAdic = first(doc, 'infAdic')
  const protNFe = doc.querySelector('protNFe')

  let protocolo: string | undefined
  let dataAutorizacao: string | undefined
  if (protNFe) {
    const infProt = first(protNFe as unknown as Document, 'infProt')
    protocolo = text(infProt, 'nProt') || undefined
    dataAutorizacao = text(infProt, 'dhRecbto') || undefined
  }

  const tpAmb = text(ide, 'tpAmb')
  const ambiente = tpAmb === '1' ? 'Producao' : 'Homologacao'

  // Transport
  let transport: NfeDraft['transport'] = null
  if (transp && transp.tagName !== 'transp' ? false : true) {
    const modFrete = text(transp, 'modFrete')
    const veicEl = transp.querySelector ? transp.querySelector('veicTransp') : elements(transp as unknown as Document, 'veicTransp')[0]
    const volEls = elements(transp as unknown as Document, 'vol')
    transport = {
      modalidadeFrete: modFrete,
      cnpjCpf: text(transp, 'CNPJ') || text(transp, 'CPF') || undefined,
      razaoSocial: text(transp, 'xNome') || undefined,
      placa: veicEl ? text(veicEl as unknown as Element, 'placa') : undefined,
      ufVeiculo: veicEl ? text(veicEl as unknown as Element, 'UF') : undefined,
      volumes: volEls.map((v) => ({
        quantidade: num(text(v, 'qVol')),
        especie: text(v, 'esp') || undefined,
        marca: text(v, 'marca') || undefined,
        numeracao: text(v, 'nVol') || undefined,
        pesoLiquido: num(text(v, 'pesoL')),
        pesoBruto: num(text(v, 'pesoB')),
      })),
    }
  }

  // Financeiro
  const dupEls = cobr ? elements(cobr as unknown as Document, 'dup') : []
  const pagEls = elements(doc, 'detPag')
  const financeiro: NfeDraft['financeiro'] = {
    duplicatas: dupEls.map((d) => ({
      numero: text(d, 'nDup') || undefined,
      dataVencimento: text(d, 'dVenc') || undefined,
      valor: num(text(d, 'vDup')),
    })),
    formasPagamento: pagEls.map((p) => ({
      tipo: text(p, 'tPag') || undefined,
      valor: num(text(p, 'vPag')),
    })),
  }

  // Products
  const products = elements(doc, 'det').map((det, index) => {
    const prod = first(det as unknown as Document, 'prod')
    const impostoEl = det.querySelector ? det.querySelector('imposto') : elements(det as unknown as Document, 'imposto')[0]
    const impostos = impostoEl ? parseImpostos(impostoEl) : {}
    return {
      number: det.getAttribute('nItem') || String(index + 1),
      code: text(prod, 'cProd'),
      description: text(prod, 'xProd'),
      cfop: text(prod, 'CFOP'),
      unit: text(prod, 'uCom'),
      quantity: num(text(prod, 'qCom')),
      unitValue: num(text(prod, 'vUnCom')),
      total: num(text(prod, 'vProd')),
      impostos,
    }
  })

  return {
    key: (infNFe.getAttribute('Id') || '').replace(/^NFe/, ''),
    number: text(ide, 'nNF'),
    series: text(ide, 'serie'),
    issuedAt: text(ide, 'dhEmi') || text(ide, 'dEmi'),
    operation: text(ide, 'natOp'),
    tipoEmissao: text(ide, 'tpEmis'),
    ambiente,
    consumidorFinal: text(ide, 'indFinal') === '1' ? 'Sim' : 'Nao',
    protocolo,
    dataAutorizacao,
    issuer: {
      name: text(emit, 'xNome'),
      document: text(emit, 'CNPJ') || text(emit, 'CPF'),
      ie: text(emit, 'IE') || undefined,
      phone: text(emit, 'fone') || undefined,
      logradouro: text(emit, 'xLgr') || undefined,
      numero: text(emit, 'nro') || undefined,
      complemento: text(emit, 'xCpl') || undefined,
      bairro: text(emit, 'xBairro') || undefined,
      municipio: text(emit, 'xMun') || undefined,
      uf: text(emit, 'UF') || undefined,
      cep: text(emit, 'CEP') || undefined,
    },
    recipient: {
      name: text(dest, 'xNome'),
      document: text(dest, 'CNPJ') || text(dest, 'CPF'),
      email: text(dest, 'email') || undefined,
      uf: text(first(dest, 'enderDest'), 'UF') || undefined,
    },
    totals: {
      vProd: num(text(ICMSTot, 'vProd')),
      vFrete: num(text(ICMSTot, 'vFrete')),
      vSeg: num(text(ICMSTot, 'vSeg')),
      vDesc: num(text(ICMSTot, 'vDesc')),
      vOutro: num(text(ICMSTot, 'vOutro')),
      vICMS: num(text(ICMSTot, 'vICMS')),
      vIPI: num(text(ICMSTot, 'vIPI')),
      vNF: num(text(ICMSTot, 'vNF')),
    },
    products,
    transport,
    financeiro,
    informacoesAdicionais: text(infAdic, 'infCpl'),
  }
}

function parseImpostos(impostoEl: Element): NfeImpostos {
  const t = (el: Element | null | undefined, tag: string) => el?.querySelector(tag)?.textContent?.trim()
  const result: NfeImpostos = {}

  result.vTotTrib = impostoEl.querySelector('vTotTrib')?.textContent?.trim()

  const icmsGroup = impostoEl.querySelector('ICMS')
  if (icmsGroup) {
    const icmsType = icmsGroup.children[0]
    if (icmsType) {
      result.icms = {
        tipo: icmsType.tagName,
        cst: t(icmsType, 'CST'),
        csosn: t(icmsType, 'CSOSN'),
        origem: t(icmsType, 'orig'),
        modBC: t(icmsType, 'modBC'),
        vBC: t(icmsType, 'vBC'),
        pICMS: t(icmsType, 'pICMS'),
        pRedBC: t(icmsType, 'pRedBC'),
        vICMS: t(icmsType, 'vICMS'),
        modBCST: t(icmsType, 'modBCST'),
        pMVAST: t(icmsType, 'pMVAST'),
        vBCST: t(icmsType, 'vBCST'),
        vICMSST: t(icmsType, 'vICMSST'),
        pFCP: t(icmsType, 'pFCP'),
        vFCP: t(icmsType, 'vFCP'),
        pICMSInter: t(icmsType, 'pICMSInter'),
        vICMSUFDest: t(icmsType, 'vICMSUFDest'),
      }
    }
  }
  const ipiGroup = impostoEl.querySelector('IPI')
  if (ipiGroup) {
    const ipiType = ipiGroup.children[0]
    if (ipiType) result.ipi = {
      tipo: ipiType.tagName,
      cst: t(ipiType, 'CST'),
      cEnq: t(ipiGroup, 'cEnq'),
      vBC: t(ipiType, 'vBC'),
      pIPI: t(ipiType, 'pIPI'),
      vIPI: t(ipiType, 'vIPI'),
    }
  }
  const pisGroup = impostoEl.querySelector('PIS')
  if (pisGroup) {
    const pisType = pisGroup.children[0]
    if (pisType) result.pis = {
      tipo: pisType.tagName,
      cst: t(pisType, 'CST'),
      vBC: t(pisType, 'vBC'),
      pPIS: t(pisType, 'pPIS'),
      vPIS: t(pisType, 'vPIS'),
    }
  }
  const cofinsGroup = impostoEl.querySelector('COFINS')
  if (cofinsGroup) {
    const cofinsType = cofinsGroup.children[0]
    if (cofinsType) result.cofins = {
      tipo: cofinsType.tagName,
      cst: t(cofinsType, 'CST'),
      vBC: t(cofinsType, 'vBC'),
      pCOFINS: t(cofinsType, 'pCOFINS'),
      vCOFINS: t(cofinsType, 'vCOFINS'),
    }
  }
  const ibsGroup = impostoEl.querySelector('IBS')
  if (ibsGroup) {
    const ibsType = ibsGroup.children[0]
    if (ibsType) result.ibs = {
      tipo: ibsType.tagName,
      cst: t(ibsType, 'CST'),
      vBC: t(ibsType, 'vBC'),
      pIBS: t(ibsType, 'pIBS'),
      vIBS: t(ibsType, 'vIBS'),
    }
  }
  const cbsGroup = impostoEl.querySelector('CBS')
  if (cbsGroup) {
    const cbsType = cbsGroup.children[0]
    if (cbsType) result.cbs = {
      tipo: cbsType.tagName,
      cst: t(cbsType, 'CST'),
      vBC: t(cbsType, 'vBC'),
      pCBS: t(cbsType, 'pCBS'),
      vCBS: t(cbsType, 'vCBS'),
    }
  }
  return result
}

function first(element: Document | Element, name: string): Element {
  return elements(element, name)[0] ?? document.createElement(name)
}
function elements(element: Document | Element, name: string): Element[] {
  return Array.from(element.getElementsByTagName('*')).filter((n) => n.localName === name || n.nodeName === name) as Element[]
}
function text(element: Element, name: string): string {
  return elements(element, name)[0]?.textContent?.trim() ?? ''
}
function num(v: string): number { return Number(v.replace(',', '.')) || 0 }
function toNum(v?: string): number { return v ? num(v) : 0 }
function value(record: Record<string, unknown> | undefined, key: string): string {
  const raw = record?.[key]; return raw === undefined || raw === null ? '' : String(raw)
}
function entityRows(payload: unknown) { return rows<Record<string, unknown>>(payload) }
function compact(data: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(data).filter(([, v]) => v !== null && v !== undefined && v !== ''))
}
function toDate(v: string): string { return v ? v.slice(0, 10) : new Date().toISOString().slice(0, 10) }
function formatCurrency(v: number) { return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) }
function formatDate(v: string) { return v.slice(0, 10).split('-').reverse().join('/') }
function formatPhone(v: string): string {
  const d = v.replace(/\D/g, '').slice(0, 11)
  if (d.length === 11) return d.replace(/(\d{2})(\d{5})(\d{4})/, '$1 $2-$3')
  if (d.length === 10) return d.replace(/(\d{2})(\d{4})(\d{4})/, '$1 $2-$3')
  return d
}
function errMsg(err: unknown): string {
  return (err as any)?.response?.data?.messageError ?? (err as any)?.response?.data?.message ?? (err instanceof Error ? err.message : 'Erro desconhecido')
}

const DROPDOWN_MAX_H = 220

let _portalRoot: HTMLDivElement | null = null
function getPortalRoot(): HTMLDivElement {
  if (!_portalRoot || !document.body.contains(_portalRoot)) {
    _portalRoot = document.createElement('div')
    _portalRoot.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483647;'
    document.body.appendChild(_portalRoot)
  }
  return _portalRoot
}

function Combobox({ value, onChange, options, placeholder }: {
  value: string
  onChange: (id: string) => void
  options: { id: string; label: string }[]
  placeholder?: string
}) {
  const [query, setQuery] = React.useState('')
  const [open, setOpen] = React.useState(false)
  const [pos, setPos] = React.useState<{ top: number; left: number; width: number; above: boolean } | null>(null)
  const containerRef = React.useRef<HTMLDivElement>(null)

  const selectedLabel = options.find((o) => o.id === value)?.label ?? ''
  const filtered = query.trim()
    ? options.filter((o) => o.label.toLowerCase().includes(query.toLowerCase()))
    : options

  const close = React.useCallback(() => { setOpen(false); setQuery('') }, [])

  const openDropdown = () => {
    const el = containerRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const spaceBelow = window.innerHeight - r.bottom
    const above = spaceBelow < DROPDOWN_MAX_H + 8 && r.top > DROPDOWN_MAX_H
    setPos({ top: above ? r.top : r.bottom + 2, left: r.left, width: Math.max(r.width, 240), above })
    setOpen(true)
    setQuery('')
  }

  React.useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) close()
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('scroll', close, true)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('scroll', close, true)
    }
  }, [open, close])

  const select = (id: string) => { onChange(id); close() }

  const dropdown = open && pos ? ReactDOM.createPortal(
    <div style={{ position: 'absolute', top: pos.above ? undefined : pos.top, bottom: pos.above ? window.innerHeight - pos.top : undefined, left: pos.left, width: pos.width, pointerEvents: 'auto' }}>
      <ul style={{ maxHeight: DROPDOWN_MAX_H }} className="overflow-y-auto rounded-md border border-slate-200 bg-white shadow-xl text-xs">
        {filtered.length === 0 ? (
          <li className="px-3 py-2 text-slate-400">Nenhum resultado</li>
        ) : (
          filtered.slice(0, 100).map((o) => (
            <li
              key={o.id}
              className={`cursor-pointer px-3 py-2 hover:bg-blue-50 ${o.id === value ? 'bg-blue-50 font-medium text-blue-700' : 'text-slate-700'}`}
              onMouseDown={(e) => {
                // stopImmediatePropagation impede o listener de mousedown no document de fechar
                // o dropdown antes que a seleção seja registrada
                e.preventDefault()
                e.nativeEvent.stopImmediatePropagation()
                select(o.id)
              }}
            >
              {o.label}
            </li>
          ))
        )}
      </ul>
    </div>,
    getPortalRoot(),
  ) : null

  return (
    <div ref={containerRef} className="relative w-full">
      <div
        className="flex h-9 w-full items-center rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-700 outline-none focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100 cursor-text"
        onClick={openDropdown}
      >
        {open ? (
          <input
            autoFocus
            className="flex-1 bg-transparent outline-none placeholder:text-slate-400"
            placeholder={placeholder ?? 'Buscar...'}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') close()
              if (e.key === 'Enter' && filtered.length > 0) { onChange(filtered[0].id); close() }
            }}
          />
        ) : (
          <span className={`flex-1 truncate ${value ? 'text-slate-800' : 'text-slate-400'}`}>
            {selectedLabel || placeholder || 'Selecione'}
          </span>
        )}
        <i className={`bi bi-chevron-${open ? 'up' : 'down'} ml-1 shrink-0 text-slate-400`} aria-hidden />
      </div>

      {dropdown}
    </div>
  )
}

function IssuerField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-600">{label}</span>
      {children}
    </label>
  )
}

function ImpostosModal({ item, onClose }: { item: NfeItem; onClose: () => void }) {
  const imp = item.impostos
  // converte string do XML para currency formatada
  const fc = (v: string | undefined) => v ? formatCurrency(parseFloat(v)) : undefined
  const pct = (v: string | undefined) => v ? `${v}%` : undefined

  const rows: { label: string; cols: { k: string; v: string | undefined }[] }[] = [
    ...(imp.icms ? [{
      label: 'ICMS',
      cols: [
        { k: 'Tipo', v: imp.icms.tipo },
        { k: 'Origem', v: imp.icms.origem },
        { k: 'CST/CSOSN', v: imp.icms.cst ?? imp.icms.csosn },
        { k: 'Mod. BC', v: imp.icms.modBC },
        { k: 'Base de cálculo', v: fc(imp.icms.vBC) },
        { k: 'Alíquota', v: pct(imp.icms.pICMS) },
        { k: 'Valor ICMS', v: fc(imp.icms.vICMS) },
      ],
    }] : []),
    ...(imp.ipi ? [{
      label: 'IPI',
      cols: [
        { k: 'Tipo', v: imp.ipi.tipo },
        { k: 'CST', v: imp.ipi.cst },
        { k: 'Base de cálculo', v: fc(imp.ipi.vBC) },
        { k: 'Alíquota', v: pct(imp.ipi.pIPI) },
        { k: 'Valor IPI', v: fc(imp.ipi.vIPI) },
      ],
    }] : []),
    ...(imp.pis ? [{
      label: 'PIS',
      cols: [
        { k: 'Tipo', v: imp.pis.tipo },
        { k: 'CST', v: imp.pis.cst },
        { k: 'Base de cálculo', v: fc(imp.pis.vBC) },
        { k: 'Alíquota', v: pct(imp.pis.pPIS) },
        { k: 'Valor PIS', v: fc(imp.pis.vPIS) },
      ],
    }] : []),
    ...(imp.cofins ? [{
      label: 'COFINS',
      cols: [
        { k: 'Tipo', v: imp.cofins.tipo },
        { k: 'CST', v: imp.cofins.cst },
        { k: 'Base de cálculo', v: fc(imp.cofins.vBC) },
        { k: 'Alíquota', v: pct(imp.cofins.pCOFINS) },
        { k: 'Valor COFINS', v: fc(imp.cofins.vCOFINS) },
      ],
    }] : []),
    ...(imp.cbs ? [{
      label: 'CBS (Reforma)',
      cols: [
        { k: 'Tipo', v: imp.cbs.tipo },
        { k: 'CST', v: imp.cbs.cst },
        { k: 'Base de cálculo', v: fc(imp.cbs.vBC) },
        { k: 'Alíquota', v: pct(imp.cbs.pCBS) },
        { k: 'Valor CBS', v: fc(imp.cbs.vCBS) },
      ],
    }] : []),
    ...(imp.ibs ? [{
      label: 'IBS (Reforma)',
      cols: [
        { k: 'Tipo', v: imp.ibs.tipo },
        { k: 'CST', v: imp.ibs.cst },
        { k: 'Base de cálculo', v: fc(imp.ibs.vBC) },
        { k: 'Alíquota', v: pct(imp.ibs.pIBS) },
        { k: 'Valor IBS', v: fc(imp.ibs.vIBS) },
      ],
    }] : []),
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Impostos do item</h2>
            <p className="mt-0.5 text-xs text-slate-500 truncate max-w-xs">{item.description}</p>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <i className="bi bi-x-lg text-base" aria-hidden />
          </button>
        </div>

        {imp.vTotTrib && (
          <div className="border-b border-slate-100 px-5 py-2 text-xs">
            <span className="text-slate-500">Total tributos:</span>{' '}
            <span className="font-semibold text-slate-800">{formatCurrency(parseFloat(imp.vTotTrib))}</span>
          </div>
        )}

        <div className="max-h-[60vh] overflow-y-auto px-5 py-4 space-y-4">
          {rows.map((group) => {
            const visible = group.cols.filter((c) => c.v != null && c.v !== '')
            if (!visible.length) return null
            return (
              <div key={group.label}>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">{group.label}</h3>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                  {visible.map((col) => (
                    <div key={col.k} className="flex flex-col">
                      <dt className="text-xs text-slate-500">{col.k}</dt>
                      <dd className="text-xs font-medium text-slate-800">{col.v}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            )
          })}
        </div>

        <div className="border-t border-slate-100 px-5 py-3 text-right">
          <button type="button" onClick={onClose} className="rounded-md bg-slate-100 px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-200">
            Fechar
          </button>
        </div>
      </div>
    </div>
  )
}

const selectClass = 'h-9 w-full min-w-40 rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100'
const inputClass = 'h-9 w-full rounded-md border border-slate-200 bg-white px-2.5 text-xs text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100'
