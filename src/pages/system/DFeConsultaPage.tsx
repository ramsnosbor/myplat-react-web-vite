import { Fragment, useEffect, useMemo, useState } from 'react'
import dayjs from 'dayjs'
import { Cell, Pie, PieChart } from 'recharts'
import { useToast } from '@/components/ui/Toast'
import { AppShell } from '@/components/layout/AppShell'
import { dfeApi, rows, type DFeRecord, type EmpresaEmitentePeriodo, type NfeRecord, type NfeRepeticaoRecord, type ServicoRecord } from '@/api/dfe.api'

type TopTab = 'hub' | 'emitentes'
type HubTab = 'pendentes' | 'emitidos' | 'recebidos'
type ManifestAction = '210210' | '210200' | '210220' | '210240'

interface DFeConsultaPageProps {
  initialTopTab?: TopTab
}

const today = dayjs()
const firstDay = today.startOf('month')
const pageSizes = [10, 25, 50, 100]
const FLAG_SIM = 'sim'
const mesesNome = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
const manifestOptions: Array<{ value: ManifestAction; label: string }> = [
  { value: '210210', label: 'Ciencia da operacao' },
  { value: '210200', label: 'Confirmacao da operacao' },
  { value: '210220', label: 'Desconhecimento da operacao' },
  { value: '210240', label: 'Operacao nao realizada' },
]

export default function DFeConsultaPage({ initialTopTab = 'hub' }: DFeConsultaPageProps) {
  const toast = useToast()
  const [topTab, setTopTab] = useState<TopTab>(initialTopTab)
  const [hubTab, setHubTab] = useState<HubTab>('pendentes')
  const [filters, setFilters] = useState({
    dataEmissaoInicio: firstDay.format('YYYY-MM-DD'),
    dataEmissaoFim: today.format('YYYY-MM-DD'),
    chaveNfe: '',
    nomeEmitente: '',
  })
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const [orderBy, setOrderBy] = useState('id')
  const [orderDirection, setOrderDirection] = useState<'asc' | 'desc'>('desc')
  const [loading, setLoading] = useState(false)
  const [dfeList, setDfeList] = useState<DFeRecord[]>([])
  const [nfeList, setNfeList] = useState<NfeRecord[]>([])
  const [totalPages, setTotalPages] = useState(1)
  const [totalElements, setTotalElements] = useState(0)
  const [selectedIds, setSelectedIds] = useState<Array<number | string>>([])
  const [manifestModal, setManifestModal] = useState<{ open: boolean; items: DFeRecord[] }>({ open: false, items: [] })
  const [manifestType, setManifestType] = useState<ManifestAction>('210210')
  const [manifestReason, setManifestReason] = useState('')
  const [zipLoading, setZipLoading] = useState(false)
  const [empresas, setEmpresas] = useState<EmpresaEmitentePeriodo[]>([])
  const [periodo, setPeriodo] = useState({ ano: today.year(), mes: today.month() + 1 })
  const [empresasLoading, setEmpresasLoading] = useState(false)
  const [expandedEmpresaId, setExpandedEmpresaId] = useState<number | string | null>(null)
  const [expandedVisualizarEmpresaId, setExpandedVisualizarEmpresaId] = useState<number | string | null>(null)
  const [notasMesAnterior, setNotasMesAnterior] = useState<NfeRepeticaoRecord[]>([])
  const [notasMesAtual, setNotasMesAtual] = useState<NfeRepeticaoRecord[]>([])
  const [loadingNotasMesAnterior, setLoadingNotasMesAnterior] = useState(false)
  const [loadingNotasMesAtual, setLoadingNotasMesAtual] = useState(false)
  const [agregadosMesAnterior, setAgregadosMesAnterior] = useState<Record<string, { qtd: number; valorTotal: number; qtdCopiadas: number }>>({})
  const [servicos, setServicos] = useState<ServicoRecord[]>([])
  const [executandoRepeticao, setExecutandoRepeticao] = useState(false)
  const [selectedEmpresaId, setSelectedEmpresaId] = useState('')
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [summaryData, setSummaryData] = useState({
    fechamentos: { fechadas: 0, total: 0 },
    emitidas_nfse: 0,
    emitidas_nfe: 0,
    recebidas: 0,
    canceladas: 0,
    pendentes: 0,
  })
  const [certGaugeData, setCertGaugeData] = useState<Array<{ status_certificado?: string; total?: number | string; cor?: string }>>([])
  const [certGaugeLoading, setCertGaugeLoading] = useState(false)
  const [emissaoFrame, setEmissaoFrame] = useState<{ url: string; title: string } | null>(null)

  const hubRows = hubTab === 'pendentes' ? dfeList : nfeList
  const selectedDfe = useMemo(() => dfeList.filter((item) => selectedIds.includes(item.id)), [dfeList, selectedIds])
  const selectedEmpresa = useMemo(() => empresas.find((empresa) => sameId(empresa.id_pessoa, selectedEmpresaId)) ?? null, [empresas, selectedEmpresaId])
  const empresasFiltradas = useMemo(() => selectedEmpresa ? empresas.filter((empresa) => sameId(empresa.id_pessoa, selectedEmpresa.id_pessoa)) : empresas, [empresas, selectedEmpresa])
  const empresasSemPeriodoFiltradas = useMemo(() => empresasFiltradas.filter((empresa) => !empresa.id_empresa_emissao_periodo), [empresasFiltradas])
  const periodoExiste = empresasFiltradas.some((empresa) => Boolean(empresa.id_empresa_emissao_periodo))

  useEffect(() => {
    if (topTab === 'emitentes') loadEmitentes()
    else loadHub(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topTab, hubTab, page, pageSize, orderBy, orderDirection, periodo.ano, periodo.mes])

  useEffect(() => {
    if (topTab !== 'emitentes') return
    loadEmitentesSummary()
    loadCertGauge()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topTab, periodo.ano, periodo.mes, selectedEmpresaId])

  async function loadHub(reset = false) {
    setLoading(true)
    try {
      const nextPage = reset ? 1 : page
      if (hubTab === 'pendentes') {
        const response = await dfeApi.list({
          ...formatDfeFilters(filters),
          pageNumber: nextPage,
          pageSize,
          orderBy: `${orderBy},${orderDirection}`,
        })
        setDfeList(response.table ?? [])
        setTotalPages(response.totalPages ?? 1)
        setTotalElements(response.totalElements ?? response.table?.length ?? 0)
      } else {
        const entity = hubTab === 'emitidos' ? 'v_nfe' : 'v_nfe_entrada'
        const params: Record<string, unknown> = {
          pageNumber: nextPage,
          pageSize,
          orderBy: 'data_emissao,desc',
        }
        if (filters.dataEmissaoInicio && filters.dataEmissaoFim) params.data_emissao = `${filters.dataEmissaoInicio},${filters.dataEmissaoFim}`
        if (filters.chaveNfe) params.chave_acesso = filters.chaveNfe
        if (filters.nomeEmitente) params.nome_pessoa_cli_for = filters.nomeEmitente
        if (hubTab === 'emitidos') params.ds_tipo_nfe = 'Saida'

        const response = await dfeApi.getDefault<NfeRecord>(entity, params)
        setNfeList(rows<NfeRecord>(response))
        setTotalPages(response.totalPages ?? 1)
        setTotalElements(response.totalElements ?? rows<NfeRecord>(response).length)
      }
      if (reset) setPage(1)
      setSelectedIds([])
    } catch (err) {
      console.error('[DFeConsulta] loadHub', err)
      toast.error('Erro ao carregar documentos fiscais.')
    } finally {
      setLoading(false)
    }
  }

  function openEmissao(path: string, title: string) {
    const separator = path.includes('?') ? '&' : '?'
    setEmissaoFrame({ url: `${window.location.origin}/home/${path}${separator}hideMenu=true`, title })
  }

  function closeEmissao() {
    setEmissaoFrame(null)
    if (topTab === 'emitentes') {
      loadEmitentes()
      loadEmitentesSummary()
    } else {
      loadHub()
    }
  }

  async function loadEmitentes() {
    setEmpresasLoading(true)
    try {
      const [empresasBase, periodos] = await Promise.all([
        dfeApi.getEmpresasEmitentes(),
        dfeApi.getEmpresaEmissaoPeriodo(periodo.ano, periodo.mes),
      ])
      const merged = empresasBase.map((empresa) => {
        const periodoEmpresa = periodos.find((item) => sameId(item.id_pessoa_empresa, empresa.id_pessoa) || sameId(item.id_pessoa, empresa.id_pessoa))
        return {
          ...empresa,
          id_empresa_emissao_periodo: periodoEmpresa?.id_empresa_emissao_periodo ?? null,
          fl_emissao_executada: periodoEmpresa?.fl_emissao_executada ?? 'Nao',
          dt_marcacao: periodoEmpresa?.dt_marcacao ?? null,
        }
      })
      setEmpresas(merged)
      fetchAgregadosMesAnterior(merged)
      loadServicos()
      loadCertGauge()
    } catch (err) {
      console.error('[DFeConsulta] loadEmitentes', err)
      toast.error('Erro ao carregar empresas emitentes.')
    } finally {
      setEmpresasLoading(false)
    }
  }

  async function loadEmitentesSummary() {
    setSummaryLoading(true)
    try {
      const inicio = dayjs(new Date(periodo.ano, periodo.mes - 1, 1)).format('YYYY-MM-DD')
      const fim = dayjs(new Date(periodo.ano, periodo.mes, 0)).format('YYYY-MM-DD')
      const nfeParams: Record<string, unknown> = { pageNumber: 1, pageSize: 1, orderBy: 'data_emissao,desc', data_emissao: `${inicio},${fim}` }
      const pendentesParams: Record<string, unknown> = { pageNumber: 1, pageSize: 1, orderBy: 'id,desc', dataEmissaoInicio: `${inicio}T00:00:00`, dataEmissaoFim: `${fim}T23:59:59` }
      if (selectedEmpresaId) {
        nfeParams.id_empresa = selectedEmpresaId
        pendentesParams.idEmpresa = selectedEmpresaId
      }

      const [empresasBase, periodos, pendentes, emitidasNfe, emitidasNfse, recebidas, canceladas] = await Promise.all([
        dfeApi.getEmpresasEmitentes(),
        dfeApi.getEmpresaEmissaoPeriodo(periodo.ano, periodo.mes),
        dfeApi.list(pendentesParams),
        dfeApi.getDefault<NfeRecord>('v_nfe', { ...nfeParams, ds_tipo_nfe: 'Saida' }),
        dfeApi.getDefault<NfeRecord>('v_nfe', { ...nfeParams, ds_tipo_nfe: 'Serviço' }),
        dfeApi.getDefault<NfeRecord>('v_nfe', { ...nfeParams, ds_tipo_nfe: 'Entrada' }),
        dfeApi.getDefault<NfeRecord>('v_nfe', { ...nfeParams, ds_nfe_status: 'Cancelada' }),
      ])

      const empresasResumo = selectedEmpresaId ? empresasBase.filter((empresa) => sameId(empresa.id_pessoa, selectedEmpresaId)) : empresasBase
      const periodosResumo = selectedEmpresaId ? periodos.filter((item) => sameId(item.id_pessoa_empresa, selectedEmpresaId) || sameId(item.id_pessoa, selectedEmpresaId)) : periodos
      const totalFechamentos = periodosResumo.length > 0 ? periodosResumo.length : empresasResumo.length
      const fechadas = periodosResumo.filter(isEmpresaComEmissaoExecutada).length
      setSummaryData({
        fechamentos: { fechadas, total: totalFechamentos },
        emitidas_nfse: getTotalElements(emitidasNfse),
        emitidas_nfe: getTotalElements(emitidasNfe),
        recebidas: getTotalElements(recebidas),
        canceladas: getTotalElements(canceladas),
        pendentes: getTotalElements(pendentes),
      })
    } catch (err) {
      console.error('[DFeConsulta] loadEmitentesSummary', err)
    } finally {
      setSummaryLoading(false)
    }
  }

  async function loadCertGauge() {
    setCertGaugeLoading(true)
    try {
      setCertGaugeData(await dfeApi.getCertificadoStatus() as Array<{ status_certificado?: string; total?: number | string; cor?: string }>)
    } catch (err) {
      console.error('[DFeConsulta] loadCertGauge', err)
    } finally {
      setCertGaugeLoading(false)
    }
  }

  async function loadServicos() {
    try {
      setServicos(await dfeApi.getServicos())
    } catch (err) {
      console.error('[DFeConsulta] loadServicos', err)
    }
  }

  function getMesAnteriorRange() {
    const base = dayjs(new Date(periodo.ano, periodo.mes - 1, 1)).subtract(1, 'month')
    return {
      inicio: base.startOf('month').format('YYYY-MM-DD'),
      fim: base.endOf('month').format('YYYY-MM-DD'),
    }
  }

  async function fetchAgregadosMesAnterior(empresasLista = empresas) {
    try {
      const { inicio, fim } = getMesAnteriorRange()
      const notas = await dfeApi.getNotasMesAnteriorTodasEmpresas(inicio, fim)
      const next = notas.reduce<Record<string, { qtd: number; valorTotal: number; qtdCopiadas: number }>>((acc, nota) => {
        const key = String(nota.id_pessoa_empresa ?? '')
        if (!key) return acc
        acc[key] ??= { qtd: 0, valorTotal: 0, qtdCopiadas: 0 }
        acc[key].qtd += 1
        acc[key].valorTotal += Number(nota.vl_servico ?? nota.valor_total_nfe ?? 0)
        if (isNotaMarcadaParaRepetir(nota) || nota.id_nfe_gerada) acc[key].qtdCopiadas += 1
        return acc
      }, {})
      for (const empresa of empresasLista) {
        const key = String(empresa.id_pessoa)
        next[key] ??= { qtd: 0, valorTotal: 0, qtdCopiadas: 0 }
      }
      setAgregadosMesAnterior(next)
    } catch (err) {
      console.error('[DFeConsulta] fetchAgregadosMesAnterior', err)
    }
  }

  async function fetchNotasMesAnteriorByEmpresa(idPessoaEmpresa: number | string) {
    setLoadingNotasMesAnterior(true)
    try {
      const { inicio, fim } = getMesAnteriorRange()
      setNotasMesAnterior(await dfeApi.getNotasMesAnterior(idPessoaEmpresa, inicio, fim))
    } catch {
      toast.error('Erro ao carregar notas do mes anterior.')
    } finally {
      setLoadingNotasMesAnterior(false)
    }
  }

  async function fetchNotasMesAtualByEmpresa(idPessoaEmpresa: number | string) {
    setLoadingNotasMesAtual(true)
    try {
      const inicio = dayjs(new Date(periodo.ano, periodo.mes - 1, 1)).format('YYYY-MM-DD')
      const fim = dayjs(new Date(periodo.ano, periodo.mes, 0)).format('YYYY-MM-DD')
      setNotasMesAtual(await dfeApi.getNotasPorPeriodo(idPessoaEmpresa, inicio, fim))
    } catch {
      toast.error('Erro ao carregar notas do periodo.')
    } finally {
      setLoadingNotasMesAtual(false)
    }
  }

  function handleExpandEmpresa(idPessoaEmpresa: number | string) {
    setExpandedVisualizarEmpresaId(null)
    if (sameId(expandedEmpresaId, idPessoaEmpresa)) {
      setExpandedEmpresaId(null)
      setNotasMesAnterior([])
      return
    }
    setExpandedEmpresaId(idPessoaEmpresa)
    fetchNotasMesAnteriorByEmpresa(idPessoaEmpresa)
  }

  function handleVisualizarMesAtualEmpresa(idPessoaEmpresa: number | string) {
    setExpandedEmpresaId(null)
    if (sameId(expandedVisualizarEmpresaId, idPessoaEmpresa)) {
      setExpandedVisualizarEmpresaId(null)
      setNotasMesAtual([])
      return
    }
    setExpandedVisualizarEmpresaId(idPessoaEmpresa)
    fetchNotasMesAtualByEmpresa(idPessoaEmpresa)
  }

  function applyFilters() {
    setPage(1)
    if (topTab === 'hub') loadHub(true)
    else loadEmitentes()
  }

  function toggleSelectAll() {
    setSelectedIds((current) => current.length === dfeList.length ? [] : dfeList.map((item) => item.id))
  }

  function toggleSelectItem(id: number | string) {
    setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id])
  }

  async function submitManifest() {
    try {
      if (manifestModal.items.length > 1) {
        await dfeApi.manifestarLista({
          tpEvento: manifestType,
          dsMotivoManifestacao: manifestReason,
          ids: manifestModal.items.map((item) => ({ id: item.id })),
        })
      } else {
        const item = manifestModal.items[0]
        await dfeApi.manifestar(item.id, { tpEvento: manifestType, dsMotivoManifestacao: manifestReason })
      }
      toast.success('Manifestacao solicitada. Aguarde alguns segundos e consulte novamente.')
      setManifestModal({ open: false, items: [] })
      setManifestReason('')
      loadHub()
    } catch (err) {
      console.error('[DFeConsulta] manifestacao', err)
      toast.error('Erro ao manifestar NFe.')
    }
  }

  async function rejectDFe(item: DFeRecord) {
    if (!window.confirm('Marcar esta NFe como tratada manualmente?')) return
    try {
      await dfeApi.updateStatus(item.id, 5)
      toast.success('NFe marcada como tratada.')
      loadHub()
    } catch {
      toast.error('Erro ao atualizar status da NFe.')
    }
  }

  async function downloadPdf(item: DFeRecord | NfeRecord) {
    try {
      const id = getDfeId(item)
      if (!id) return
      const blob = await dfeApi.downloadPdf(id)
      downloadBlob(blob, `DFe_${getDfeKey(item) || id}.pdf`)
    } catch {
      toast.error('Erro ao baixar PDF.')
    }
  }

  async function downloadXml(item: DFeRecord | NfeRecord) {
    try {
      const id = getDfeId(item)
      if (!id) return
      const xml = await dfeApi.getXml(id)
      downloadBlob(new Blob([xml], { type: 'application/xml' }), `${getDfeKey(item) || id}-nfe.xml`)
    } catch {
      toast.error('Erro ao baixar XML.')
    }
  }

  async function downloadZip() {
    if (!filters.dataEmissaoInicio || !filters.dataEmissaoFim) return toast.error('Selecione o periodo.')
    setZipLoading(true)
    try {
      const blob = await dfeApi.downloadZip({ dataInicio: filters.dataEmissaoInicio, dataFim: filters.dataEmissaoFim, tipoArquivo: 'ambos', tipoNota: 'entrada' })
      downloadBlob(blob, `dfe-${filters.dataEmissaoInicio}-${filters.dataEmissaoFim}.zip`)
    } catch {
      toast.error('Erro ao baixar ZIP.')
    } finally {
      setZipLoading(false)
    }
  }

  async function gerarPeriodo(empresasAlvo = empresasFiltradas) {
    if (empresasAlvo.length === 0) return toast.error('Nenhuma empresa emitente disponivel.')
    try {
      const semPeriodo = empresasAlvo.filter((empresa) => !empresa.id_empresa_emissao_periodo)
      await dfeApi.gerarPeriodoEmpresas(semPeriodo.length ? semPeriodo : empresasAlvo, periodo.ano, periodo.mes)
      toast.success('Periodo gerado para as empresas emitentes.')
      loadEmitentes()
      loadEmitentesSummary()
    } catch {
      toast.error('Erro ao gerar periodo.')
    }
  }

  async function ensureEmpresaPeriodo(empresa: EmpresaEmitentePeriodo) {
    if (empresa.id_empresa_emissao_periodo) return empresa.id_empresa_emissao_periodo
    const created = await dfeApi.marcarEmissaoExecutada(empresa.id_pessoa, periodo.ano, periodo.mes, false)
    const id = created.id_empresa_emissao_periodo ?? (created as Record<string, unknown>).id
    setEmpresas((current) => current.map((item) => sameId(item.id_pessoa, empresa.id_pessoa) ? { ...item, id_empresa_emissao_periodo: id as number | string | null } : item))
    return id as number | string
  }

  async function handleToggleEmissaoExecutada(empresa: EmpresaEmitentePeriodo) {
    try {
      const next = !isEmpresaComEmissaoExecutada(empresa)
      let idEmpresaEmissaoPeriodo = empresa.id_empresa_emissao_periodo
      if (empresa.id_empresa_emissao_periodo) await dfeApi.atualizarEmissaoExecutada(empresa.id_empresa_emissao_periodo, next)
      else {
        const created = await dfeApi.marcarEmissaoExecutada(empresa.id_pessoa, periodo.ano, periodo.mes, next)
        idEmpresaEmissaoPeriodo = created.id_empresa_emissao_periodo ?? (created as Record<string, unknown>).id as number | string | null
      }
      setEmpresas((current) => current.map((item) => sameId(item.id_pessoa, empresa.id_pessoa) ? { ...item, id_empresa_emissao_periodo: idEmpresaEmissaoPeriodo, fl_emissao_executada: next ? 'Sim' : 'Nao' } : item))
      toast.success(next ? 'Empresa marcada como executada.' : 'Empresa reaberta para emissao.')
    } catch {
      toast.error('Erro ao alterar status de emissao.')
    }
  }

  async function handleToggleRepetirNota(empresa: EmpresaEmitentePeriodo, nota: NfeRepeticaoRecord) {
    if (isNotaBloqueadaPorEmissao(empresa, nota)) return toast.error('Esta nota esta bloqueada porque a emissao ja foi executada.')
    try {
      if (isNotaMarcadaParaRepetir(nota) && nota.id_nfe_repetir) {
        await dfeApi.desmarcarNotaRepetir(nota.id_nfe_repetir)
        setNotasMesAnterior((current) => current.map((item) => sameId(item.id_nfe, nota.id_nfe) ? { ...item, id_nfe_repetir: null, fl_marcada_repetir: 'Nao' } : item))
      } else {
        const idPeriodo = await ensureEmpresaPeriodo(empresa)
        const created = await dfeApi.marcarNotaRepetir({
          id_nfe: nota.id_nfe ?? '',
          id_pessoa_empresa: empresa.id_pessoa,
          id_empresa_emissao_periodo: idPeriodo,
          nr_ano_referencia: periodo.ano,
          nr_mes_referencia: periodo.mes,
          id_servico: nota.id_servico,
          vl_servico: nota.vl_servico_repetir ?? nota.vl_servico ?? nota.valor_total_nfe,
          ds_complemento: nota.ds_complemento ?? null,
        })
        setNotasMesAnterior((current) => current.map((item) => sameId(item.id_nfe, nota.id_nfe) ? { ...item, ...created, fl_marcada_repetir: 'Sim' } : item))
      }
      fetchAgregadosMesAnterior()
    } catch {
      toast.error('Erro ao atualizar repeticao da nota.')
    }
  }

  function handleNotaFieldChange(idNfe: number | string | undefined, field: keyof NfeRepeticaoRecord, value: string) {
    setNotasMesAnterior((current) => current.map((nota) => sameId(nota.id_nfe, idNfe) ? { ...nota, [field]: value } : nota))
  }

  async function handleUpdateNotaRepetir(nota: NfeRepeticaoRecord, field: keyof NfeRepeticaoRecord, value: string) {
    handleNotaFieldChange(nota.id_nfe, field, value)
    if (!nota.id_nfe_repetir) return
    try {
      await dfeApi.atualizarNotaRepetir(nota.id_nfe_repetir, { [field]: value })
    } catch {
      toast.error('Erro ao salvar alteracao da nota.')
    }
  }

  async function handleExecutarRepeticao(empresa: EmpresaEmitentePeriodo) {
    const selecionadas = notasMesAnterior.filter((nota) => isNotaMarcadaParaRepetir(nota) && !isNotaJaGerada(nota))
    if (!selecionadas.length) return toast.error('Nenhuma nota pendente selecionada para repetir.')
    setExecutandoRepeticao(true)
    try {
      const result = await dfeApi.executarRepeticaoNotas({ idPessoaEmpresa: empresa.id_pessoa, anoReferencia: periodo.ano, mesReferencia: periodo.mes, notas: selecionadas })
      toast.success(`${result.successCount} nota(s) repetida(s).`)
      if (result.failureCount) toast.error(`${result.failureCount} nota(s) nao foram geradas.`)
      fetchNotasMesAnteriorByEmpresa(empresa.id_pessoa)
      fetchNotasMesAtualByEmpresa(empresa.id_pessoa)
      fetchAgregadosMesAnterior()
    } catch {
      toast.error('Erro ao executar repeticao.')
    } finally {
      setExecutandoRepeticao(false)
    }
  }

  return (
    <AppShell title="HUB DFe" subtitle="Documentos Fiscais Eletronicos">
      {emissaoFrame ? (
        <div className="flex h-full min-h-full flex-col bg-background p-2 sm:p-3">
          <section className="mb-2 flex shrink-0 items-center gap-3 rounded-lg border border-blue-100 bg-white px-3 py-2 shadow-sm shadow-blue-950/5">
            <button type="button" onClick={closeEmissao} className={secondaryButtonClass}><i className="bi bi-arrow-left" aria-hidden />Voltar</button>
            <div className="min-w-0">
              <h1 className="truncate text-lg font-semibold text-slate-900">{emissaoFrame.title}</h1>
              <p className="text-sm text-slate-500">HUB DFe - emissao embutida</p>
            </div>
          </section>
          <iframe src={emissaoFrame.url} title={emissaoFrame.title} className="min-h-[calc(100vh-128px)] flex-1 rounded-lg border border-blue-100 bg-white shadow-sm shadow-blue-950/5" />
        </div>
      ) : (
      <div className="min-h-full bg-background p-2 sm:p-3">
        <div className="w-full space-y-3">
          <section className="rounded-lg border border-blue-100 bg-white p-3 shadow-sm shadow-blue-950/5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-md bg-blue-700 text-white"><i className="bi bi-receipt" aria-hidden /></div>
                <div><h1 className="text-lg font-semibold text-slate-900">HUB DFe - Documentos Fiscais Eletronicos</h1><p className="text-sm text-slate-500">Consulta, manifestacao e download de documentos fiscais.</p></div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => openEmissao('crudMovimento?tipo_nfe=Saida&action=create', 'Emitir NF-e')} className={secondaryButtonClass}>+ Emitir NF-e</button>
                <button type="button" onClick={() => openEmissao(`crudMovimento?tipo_nfe=${encodeURIComponent('Serviço')}&action=create`, 'Emitir NFSe')} className={primaryButtonClass}>+ Emitir NFSe</button>
              </div>
            </div>
          </section>

          <div className="flex flex-wrap gap-2">
            <TabButton active={topTab === 'emitentes'} onClick={() => setTopTab('emitentes')} icon="bi bi-building" label="Emitentes" />
            <TabButton active={topTab === 'hub'} onClick={() => setTopTab('hub')} icon="bi bi-grid" label="Hub" />
          </div>

          {topTab === 'hub' ? (
            <>
              <section className="rounded-lg border border-blue-100 bg-white p-3 shadow-sm shadow-blue-950/5">
                <div className="grid gap-3 md:grid-cols-12">
                  <Field className="md:col-span-2" label="Inicio"><input type="date" value={filters.dataEmissaoInicio} onChange={(e) => setFilters((f) => ({ ...f, dataEmissaoInicio: e.target.value }))} className={inputClass} /></Field>
                  <Field className="md:col-span-2" label="Fim"><input type="date" value={filters.dataEmissaoFim} onChange={(e) => setFilters((f) => ({ ...f, dataEmissaoFim: e.target.value }))} className={inputClass} /></Field>
                  <Field className="md:col-span-3" label="Chave"><input value={filters.chaveNfe} onChange={(e) => setFilters((f) => ({ ...f, chaveNfe: e.target.value }))} className={inputClass} /></Field>
                  <Field className="md:col-span-3" label="Emitente/Destinatario"><input value={filters.nomeEmitente} onChange={(e) => setFilters((f) => ({ ...f, nomeEmitente: e.target.value }))} className={inputClass} /></Field>
                  <div className="flex items-end gap-2 md:col-span-2">
                    <button type="button" onClick={applyFilters} className={primaryButtonClass}><i className="bi bi-search" aria-hidden />Filtrar</button>
                    <button type="button" onClick={downloadZip} disabled={zipLoading} className={secondaryButtonClass}><i className="bi bi-download" aria-hidden />ZIP</button>
                  </div>
                </div>
              </section>

              <div className="flex flex-wrap gap-2">
                <TabButton active={hubTab === 'pendentes'} onClick={() => { setHubTab('pendentes'); setPage(1) }} icon="bi bi-hourglass-split" label="Pendentes" />
                <TabButton active={hubTab === 'emitidos'} onClick={() => { setHubTab('emitidos'); setPage(1) }} icon="bi bi-send-check" label="Emitidos" />
                <TabButton active={hubTab === 'recebidos'} onClick={() => { setHubTab('recebidos'); setPage(1) }} icon="bi bi-inbox" label="Recebidos" />
              </div>

              {hubTab === 'pendentes' && selectedIds.length > 0 && (
                <div className="rounded-lg border border-blue-100 bg-blue-50 p-3">
                  <button type="button" onClick={() => setManifestModal({ open: true, items: selectedDfe })} className={primaryButtonClass}>Manifestar Selecionados ({selectedIds.length})</button>
                </div>
              )}

              <DFeTable
                tab={hubTab}
                loading={loading}
                rowsData={hubRows}
                selectedIds={selectedIds}
                onToggleAll={toggleSelectAll}
                onToggle={toggleSelectItem}
                onManifest={(item) => setManifestModal({ open: true, items: [item] })}
                onReject={rejectDFe}
                onPdf={downloadPdf}
                onXml={downloadXml}
                orderBy={orderBy}
                orderDirection={orderDirection}
                onSort={(field) => {
                  setOrderBy(field)
                  setOrderDirection((current) => orderBy === field && current === 'asc' ? 'desc' : 'asc')
                }}
              />

              <PaginationFooter page={page} totalPages={totalPages} totalElements={totalElements} pageSize={pageSize} onPage={setPage} onPageSize={(size) => { setPageSize(size); setPage(1) }} />
            </>
          ) : (
            <>
              <EmitentesSummaryPanel summary={summaryData} loading={summaryLoading} certData={certGaugeData} certLoading={certGaugeLoading} />

              <section className="rounded-lg border border-blue-100 bg-white shadow-sm shadow-blue-950/5">
                <div className="flex flex-col gap-3 border-b border-slate-100 p-3 xl:flex-row xl:items-end xl:justify-between">
                  <div className="grid flex-1 gap-3 md:grid-cols-12">
                    <Field className="md:col-span-5" label="Empresa">
                      <select value={selectedEmpresaId} onChange={(e) => setSelectedEmpresaId(e.target.value)} className={inputClass}>
                        <option value="">Todas as empresas</option>
                        {empresas.map((empresa) => <option key={String(empresa.id_pessoa)} value={String(empresa.id_pessoa)}>{empresa.nome_pessoa ?? empresa.id_pessoa}</option>)}
                      </select>
                    </Field>
                    <Field className="md:col-span-4" label="Periodo">
                      <div className="grid grid-cols-[1fr_110px] gap-2">
                        <select value={periodo.mes} onChange={(e) => setPeriodo((p) => ({ ...p, mes: Number(e.target.value) }))} className={inputClass}>
                          {mesesNome.map((mes, index) => <option key={mes} value={index + 1}>{mes}</option>)}
                        </select>
                        <input type="number" value={periodo.ano} onChange={(e) => setPeriodo((p) => ({ ...p, ano: Number(e.target.value) }))} className={inputClass} />
                      </div>
                    </Field>
                    <div className="flex items-end gap-2 md:col-span-3">
                      <button type="button" onClick={loadEmitentes} className={secondaryButtonClass}><i className="bi bi-arrow-clockwise" aria-hidden />Atualizar</button>
                      <button type="button" onClick={() => { setSelectedEmpresaId(''); setExpandedEmpresaId(null); setExpandedVisualizarEmpresaId(null) }} className={secondaryButtonClass}>Limpar</button>
                    </div>
                  </div>
                  <button type="button" onClick={() => gerarPeriodo()} className={primaryButtonClass}>Gerar Periodo</button>
                </div>

                {!empresasLoading && empresasFiltradas.length > 0 && !periodoExiste && (
                  <div className="border-b border-amber-100 bg-amber-50 px-3 py-3 text-sm text-amber-900">
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <p>
                        <i className="bi bi-exclamation-triangle mr-2" aria-hidden />
                        Nenhum registro de emissão encontrado para <strong>{formatPeriodoExtenso(periodo.mes, periodo.ano)}</strong>. Gere o período para iniciar o controle de emissão das <strong>{empresasFiltradas.length}</strong> empresa(s) cadastradas.
                      </p>
                      <button type="button" onClick={() => gerarPeriodo(empresasFiltradas)} className={primaryButtonClass}>Gerar {formatPeriodoExtenso(periodo.mes, periodo.ano)}</button>
                    </div>
                  </div>
                )}

                {!empresasLoading && periodoExiste && empresasSemPeriodoFiltradas.length > 0 && (
                  <div className="border-b border-blue-100 bg-blue-50 px-3 py-2.5 text-sm text-blue-900">
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <p>{empresasSemPeriodoFiltradas.length} empresa(s) sem registro para <strong>{formatPeriodoExtenso(periodo.mes, periodo.ano)}</strong>.</p>
                      <button type="button" onClick={() => gerarPeriodo(empresasSemPeriodoFiltradas)} className={secondaryButtonClass}>Atualizar Periodo</button>
                    </div>
                  </div>
                )}

                {empresasLoading ? (
                  <div className="px-3 py-10 text-center text-sm text-slate-500">
                    <span className="mr-2 inline-block h-4 w-4 animate-spin rounded-full border-2 border-blue-700 border-t-transparent align-[-2px]" />
                    Carregando empresas...
                  </div>
                ) : periodoExiste ? (
                  <div className="max-h-[calc(100vh-390px)] overflow-auto">
                  <table className="w-full min-w-[1120px] table-fixed border-separate border-spacing-0 text-sm">
                  <colgroup><col /><col className="w-44" /><col className="w-36" /><col className="w-36" /><col className="w-36" /><col className="w-36" /><col className="w-72" /></colgroup>
                  <thead className="sticky top-0 z-10 bg-slate-50">
                    <tr>
                      <th className={thClass}>Empresa</th>
                      <th className={thClass}>CNPJ</th>
                      <th className={thClass}>Emite NF-e</th>
                      <th className={thClass}>Notas ant.</th>
                      <th className={thClass}>Copiadas</th>
                      <th className={thClass}>Executada</th>
                      <th className={thClass}>Acoes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {empresasLoading ? <LoadingRow colSpan={7} /> : empresasFiltradas.length > 0 ? empresasFiltradas.map((empresa) => {
                      const agregado = agregadosMesAnterior[String(empresa.id_pessoa)] ?? { qtd: 0, valorTotal: 0, qtdCopiadas: 0 }
                      const expandedRepetir = sameId(expandedEmpresaId, empresa.id_pessoa)
                      const expandedVisualizar = sameId(expandedVisualizarEmpresaId, empresa.id_pessoa)
                      return (
                        <Fragment key={empresa.id_pessoa}>
                          <tr className="hover:bg-slate-50">
                            <td className={`${tdClass} font-medium text-slate-900`}>{empresa.nome_pessoa ?? '-'}</td>
                            <td className={tdClass}>{empresa.cnpj_cpf ?? '-'}</td>
                            <td className={tdClass}>{empresa.fl_emite_nfe ?? empresa.usa_nfe ?? '-'}</td>
                            <td className={tdClass}><span className="font-semibold text-slate-800">{agregado.qtd}</span><span className="ml-2 text-xs text-slate-400">{formatCurrency(agregado.valorTotal)}</span></td>
                            <td className={tdClass}><span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">{agregado.qtdCopiadas}</span></td>
                            <td className={tdClass}>
                              <button type="button" onClick={() => handleToggleEmissaoExecutada(empresa)} className={`inline-flex h-7 items-center rounded-full border px-2.5 text-xs font-semibold transition ${isEmpresaComEmissaoExecutada(empresa) ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-slate-50 text-slate-600'}`}>
                                {isEmpresaComEmissaoExecutada(empresa) ? 'Sim' : 'Nao'}
                              </button>
                            </td>
                            <td className={tdClass}>
                              <div className="flex flex-wrap items-center gap-1.5">
                                <button type="button" onClick={() => handleExpandEmpresa(empresa.id_pessoa)} className={secondaryButtonClass}><i className={`bi ${expandedRepetir ? 'bi-chevron-up' : 'bi-files'}`} aria-hidden />Repetir</button>
                                <button type="button" onClick={() => handleVisualizarMesAtualEmpresa(empresa.id_pessoa)} className={secondaryButtonClass}><i className={`bi ${expandedVisualizar ? 'bi-chevron-up' : 'bi-eye'}`} aria-hidden />Ver</button>
                                <button type="button" onClick={() => openEmissao(`crudMovimento?tipo_nfe=Saida&action=create&id_pessoa_empresa=${empresa.id_pessoa}`, 'Emitir NF-e')} className={primaryButtonClass}>Emitir</button>
                              </div>
                            </td>
                          </tr>
                          {expandedRepetir && (
                            <tr key={`${empresa.id_pessoa}-repetir`} className="bg-blue-50/40">
                              <td colSpan={7} className="border-b border-blue-100 p-4">
                                <EmpresaNotasAnteriorTable
                                  empresa={empresa}
                                  notas={notasMesAnterior}
                                  servicos={servicos}
                                  loading={loadingNotasMesAnterior}
                                  executando={executandoRepeticao}
                                  onToggle={(nota) => handleToggleRepetirNota(empresa, nota)}
                                  onChange={handleNotaFieldChange}
                                  onBlur={handleUpdateNotaRepetir}
                                  onExecutar={() => handleExecutarRepeticao(empresa)}
                                />
                              </td>
                            </tr>
                          )}
                          {expandedVisualizar && (
                            <tr key={`${empresa.id_pessoa}-visualizar`} className="bg-slate-50">
                              <td colSpan={7} className="border-b border-slate-100 p-4">
                                <EmpresaNotasAtualTable notas={notasMesAtual} loading={loadingNotasMesAtual} onOpen={(nota) => openEmissao(`crudMovimento?tipo_nfe=${encodeURIComponent(String(nota.ds_tipo_nfe ?? 'Saida'))}&action=edit&entities=movimento&id_movimento=${nota.id_movimento ?? ''}`, 'Editar Nota')} />
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      )
                    }) : <EmptyRow colSpan={7} title="Nenhuma empresa emitente encontrada" />}
                  </tbody>
                  </table>
                  </div>
                ) : empresasFiltradas.length === 0 ? (
                  <div className="px-3 py-12 text-center">
                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-blue-700 ring-1 ring-blue-100"><i className="bi bi-inbox text-xl" aria-hidden /></div>
                    <p className="mt-3 text-sm font-semibold text-slate-800">Nenhuma empresa emitente encontrada</p>
                  </div>
                ) : null}
              </section>
            </>
          )}
        </div>
      </div>
      )}

      {!emissaoFrame && manifestModal.open && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/40 p-4">
          <div className="w-full max-w-lg rounded-lg bg-white p-5 shadow-2xl">
            <h2 className="text-lg font-semibold text-slate-900">Manifestar NFe</h2>
            <p className="mt-1 text-sm text-slate-500">{manifestModal.items.length} documento(s) selecionado(s).</p>
            <div className="mt-4 space-y-3">
              <Field label="Tipo de evento"><select value={manifestType} onChange={(e) => setManifestType(e.target.value as ManifestAction)} className={inputClass}>{manifestOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></Field>
              <Field label="Motivo"><textarea value={manifestReason} onChange={(e) => setManifestReason(e.target.value)} className={`${inputClass} min-h-24 py-2`} /></Field>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setManifestModal({ open: false, items: [] })} className={secondaryButtonClass}>Cancelar</button>
              <button type="button" onClick={submitManifest} className={primaryButtonClass}>Confirmar</button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  )
}

function EmitentesSummaryPanel({
  summary,
  loading,
  certData,
  certLoading,
}: {
  summary: {
    fechamentos: { fechadas: number; total: number }
    emitidas_nfse: number
    emitidas_nfe: number
    recebidas: number
    canceladas: number
    pendentes: number
  }
  loading: boolean
  certData: Array<{ status_certificado?: string; total?: number | string; cor?: string }>
  certLoading: boolean
}) {
  const certTotal = certData.reduce((sum, item) => sum + (Number(item.total) || 0), 0)
  return (
    <section className="grid gap-2 lg:grid-cols-[minmax(250px,330px)_repeat(6,minmax(118px,1fr))]">
      <div className="rounded-lg border border-blue-100 bg-white p-3 shadow-sm shadow-blue-950/5">
        <h2 className="text-sm font-semibold text-slate-700">Certificados Digitais</h2>
        {certLoading ? (
          <div className="py-10 text-center text-sm text-slate-500">Carregando...</div>
        ) : certData.length === 0 ? (
          <div className="py-10 text-center text-sm text-slate-500">Nenhum dado disponivel</div>
        ) : (
          <div className="mt-2 grid grid-cols-[160px_1fr] items-center gap-2">
            <div className="relative h-[96px]">
              <PieChart width={160} height={96}>
                <Pie
                  data={[...certData.map((item) => ({ name: item.status_certificado, value: Number(item.total) || 0 })), { name: '_fill', value: certTotal || 1 }]}
                  cx={80}
                  cy={92}
                  startAngle={180}
                  endAngle={0}
                  innerRadius={46}
                  outerRadius={68}
                  paddingAngle={2}
                  dataKey="value"
                  isAnimationActive={false}
                >
                  {certData.map((item, index) => <Cell key={`${item.status_certificado}-${index}`} fill={item.cor || certColor(item.status_certificado, index)} stroke="none" />)}
                  <Cell fill="#e5e7eb" stroke="none" />
                </Pie>
              </PieChart>
              <div className="absolute inset-x-0 top-9 text-center">
                <div className="text-xl font-bold text-slate-900">{certTotal}</div>
                <div className="text-[11px] text-slate-500">Certificados</div>
              </div>
            </div>
            <div className="space-y-1">
              {certData.map((item, index) => (
                <div key={`${item.status_certificado}-${index}-label`} className="flex items-center justify-between gap-2 text-xs">
                  <span className="flex min-w-0 items-center gap-1.5 text-slate-600"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.cor || certColor(item.status_certificado, index) }} /> <span className="truncate">{item.status_certificado ?? '-'}</span></span>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-slate-700">{item.total ?? 0}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      <SummaryCard title="Fechamentos" value={loading ? '...' : `${summary.fechamentos.fechadas}/${summary.fechamentos.total}`} hint="Fechadas / Total" tone="blue" />
      <SummaryCard title="Emitidas NFSe" value={loading ? '...' : summary.emitidas_nfse} hint="documentos" tone="blue" />
      <SummaryCard title="Emitidas NF-e" value={loading ? '...' : summary.emitidas_nfe} hint="documentos" tone="blue" />
      <SummaryCard title="Recebidas" value={loading ? '...' : summary.recebidas} hint="documentos" tone="green" />
      <SummaryCard title="Canceladas" value={loading ? '...' : summary.canceladas} hint="documentos" tone="red" />
      <SummaryCard title="Pendentes" value={loading ? '...' : summary.pendentes} hint="documentos" tone="orange" />
    </section>
  )
}

function SummaryCard({ title, value, hint, tone }: { title: string; value: string | number; hint: string; tone: 'blue' | 'green' | 'red' | 'orange' }) {
  const toneClass = {
    blue: 'text-blue-700',
    green: 'text-emerald-700',
    red: 'text-red-700',
    orange: 'text-orange-600',
  }[tone]
  return <div className="rounded-lg border border-blue-100 bg-white p-3 text-center shadow-sm shadow-blue-950/5"><div className="text-xs font-semibold text-slate-600">{title}</div><div className={`mt-2 text-2xl font-bold leading-none ${toneClass}`}>{value}</div><div className="mt-1.5 text-xs text-slate-400">{hint}</div></div>
}

function EmpresaNotasAnteriorTable({
  empresa,
  notas,
  servicos,
  loading,
  executando,
  onToggle,
  onChange,
  onBlur,
  onExecutar,
}: {
  empresa: EmpresaEmitentePeriodo
  notas: NfeRepeticaoRecord[]
  servicos: ServicoRecord[]
  loading: boolean
  executando: boolean
  onToggle: (nota: NfeRepeticaoRecord) => void
  onChange: (idNfe: number | string | undefined, field: keyof NfeRepeticaoRecord, value: string) => void
  onBlur: (nota: NfeRepeticaoRecord, field: keyof NfeRepeticaoRecord, value: string) => void
  onExecutar: () => void
}) {
  const selecionadas = notas.filter((nota) => isNotaMarcadaParaRepetir(nota) && !isNotaJaGerada(nota)).length
  return (
    <div className="rounded-lg border border-blue-100 bg-white">
      <div className="flex flex-col gap-2 border-b border-blue-100 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Notas do mes anterior</h3>
          <p className="text-xs text-slate-500">{selecionadas} nota(s) selecionada(s) para repetir.</p>
        </div>
        <button type="button" onClick={onExecutar} disabled={executando || selecionadas === 0 || isEmpresaComEmissaoExecutada(empresa)} className={primaryButtonClass}>
          <i className="bi bi-play-fill" aria-hidden />Executar repeticao
        </button>
      </div>
      <div className="max-h-80 overflow-auto">
        <table className="w-full min-w-[980px] table-fixed border-separate border-spacing-0 text-xs">
          <colgroup><col className="w-20" /><col className="w-24" /><col className="w-28" /><col /><col className="w-56" /><col className="w-32" /><col className="w-64" /></colgroup>
          <thead className="sticky top-0 bg-slate-50">
            <tr><th className={thClass}>Repetir</th><th className={thClass}>Numero</th><th className={thClass}>Emissao</th><th className={thClass}>Destinatario</th><th className={thClass}>Servico</th><th className={thClass}>Valor</th><th className={thClass}>Complemento</th></tr>
          </thead>
          <tbody>
            {loading ? <LoadingRow colSpan={7} /> : notas.length > 0 ? notas.map((nota) => {
              const blocked = isNotaBloqueadaPorEmissao(empresa, nota)
              return (
                <tr key={String(nota.id_nfe ?? nota.id_nfe_repetir)} className={blocked ? 'bg-slate-50 text-slate-400' : 'hover:bg-blue-50/40'}>
                  <td className={tdClass}>
                    <input type="checkbox" checked={isNotaMarcadaParaRepetir(nota)} disabled={blocked} onChange={() => onToggle(nota)} />
                    {isNotaJaGerada(nota) && <span className="ml-2 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">Gerada</span>}
                  </td>
                  <td className={tdClass}>{nota.numero ?? nota.id_nfe ?? '-'}</td>
                  <td className={tdClass}>{formatDate(nota.data_emissao)}</td>
                  <td className={`${tdClass} truncate`}>{nota.destinatario ?? nota.nome_pessoa_cli_for ?? '-'}</td>
                  <td className={tdClass}>
                    <select value={String(nota.id_servico ?? '')} disabled={blocked} onChange={(e) => onChange(nota.id_nfe, 'id_servico', e.target.value)} onBlur={(e) => onBlur(nota, 'id_servico', e.target.value)} className={smallInputClass}>
                      <option value="">Selecione</option>
                      {servicos.map((servico) => <option key={String(servico.id_servico)} value={String(servico.id_servico)}>{servico.ds_servico ?? servico.tx_descricao_servico ?? servico.id_servico}</option>)}
                    </select>
                  </td>
                  <td className={tdClass}>
                    <input value={String(nota.vl_servico_repetir ?? nota.vl_servico ?? nota.valor_total_nfe ?? '')} disabled={blocked} onChange={(e) => onChange(nota.id_nfe, 'vl_servico_repetir', e.target.value)} onBlur={(e) => onBlur(nota, 'vl_servico_repetir', e.target.value)} className={smallInputClass} />
                  </td>
                  <td className={tdClass}>
                    <input value={nota.ds_complemento ?? ''} disabled={blocked} onChange={(e) => onChange(nota.id_nfe, 'ds_complemento', e.target.value)} onBlur={(e) => onBlur(nota, 'ds_complemento', e.target.value)} className={smallInputClass} />
                  </td>
                </tr>
              )
            }) : <EmptyRow colSpan={7} title="Nenhuma nota do mes anterior encontrada" />}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function EmpresaNotasAtualTable({ notas, loading, onOpen }: { notas: NfeRepeticaoRecord[]; loading: boolean; onOpen: (nota: NfeRepeticaoRecord) => void }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white">
      <div className="border-b border-slate-100 px-3 py-2.5"><h3 className="text-sm font-semibold text-slate-900">Notas do periodo selecionado</h3></div>
      <div className="max-h-80 overflow-auto">
        <table className="w-full min-w-[760px] table-fixed border-separate border-spacing-0 text-xs">
          <colgroup><col className="w-28" /><col className="w-28" /><col /><col className="w-32" /><col className="w-40" /><col className="w-24" /></colgroup>
          <thead className="sticky top-0 bg-slate-50"><tr><th className={thClass}>Numero</th><th className={thClass}>Emissao</th><th className={thClass}>Destinatario</th><th className={thClass}>Valor</th><th className={thClass}>Status</th><th className={thClass}>Acoes</th></tr></thead>
          <tbody>
            {loading ? <LoadingRow colSpan={6} /> : notas.length > 0 ? notas.map((nota) => (
              <tr key={String(nota.id_nfe ?? nota.id_movimento)} className="hover:bg-slate-50">
                <td className={tdClass}>{nota.numero ?? nota.id_nfe ?? '-'}</td>
                <td className={tdClass}>{formatDate(nota.data_emissao)}</td>
                <td className={`${tdClass} truncate`}>{nota.destinatario ?? nota.nome_pessoa_cli_for ?? '-'}</td>
                <td className={tdClass}>{formatCurrency(Number(nota.valor_total_nfe ?? nota.vl_servico ?? 0))}</td>
                <td className={tdClass}><StatusBadge status={String(nota.ds_nfe_status ?? '-')} /></td>
                <td className={tdClass}><IconButton title="Abrir" icon="bi bi-box-arrow-up-right" tone="primary" onClick={() => onOpen(nota)} /></td>
              </tr>
            )) : <EmptyRow colSpan={6} title="Nenhuma nota encontrada no periodo" />}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function DFeTable({
  tab,
  loading,
  rowsData,
  selectedIds,
  onToggleAll,
  onToggle,
  onManifest,
  onReject,
  onPdf,
  onXml,
  orderBy,
  orderDirection,
  onSort,
}: {
  tab: HubTab
  loading: boolean
  rowsData: Array<DFeRecord | NfeRecord>
  selectedIds: Array<number | string>
  onToggleAll: () => void
  onToggle: (id: number | string) => void
  onManifest: (item: DFeRecord) => void
  onReject: (item: DFeRecord) => void
  onPdf: (item: DFeRecord | NfeRecord) => void
  onXml: (item: DFeRecord | NfeRecord) => void
  orderBy: string
  orderDirection: 'asc' | 'desc'
  onSort: (field: string) => void
}) {
  const isPending = tab === 'pendentes'
  return (
    <section className="rounded-lg border border-blue-100 bg-white shadow-sm shadow-blue-950/5">
      <div className="max-h-[calc(100vh-390px)] overflow-auto rounded-lg">
        <table className="w-full min-w-[1180px] table-fixed border-separate border-spacing-0 text-sm">
          <colgroup>{isPending && <col className="w-12" />}<col className="w-32" /><col className="w-64" /><col /><col className="w-32" /><col className="w-48" /><col className="w-44" /></colgroup>
          <thead className="sticky top-0 z-10 bg-slate-50">
            <tr>
              {isPending && <th className={thClass}><input type="checkbox" checked={selectedIds.length === rowsData.length && rowsData.length > 0} onChange={onToggleAll} /></th>}
              <SortTh field="dataEmissao" active={orderBy} direction={orderDirection} onSort={onSort}>Emissao</SortTh>
              <SortTh field="nomeEmitente" active={orderBy} direction={orderDirection} onSort={onSort}>Emitente</SortTh>
              <th className={thClass}>Chave</th>
              <th className={thClass}>Valor</th>
              <SortTh field="status" active={orderBy} direction={orderDirection} onSort={onSort}>Status</SortTh>
              <th className={thClass}>Acoes</th>
            </tr>
          </thead>
          <tbody>
            {loading ? <LoadingRow colSpan={isPending ? 7 : 6} /> : rowsData.length > 0 ? rowsData.map((item) => {
              const id = getDfeId(item)
              return (
                <tr key={id} className="hover:bg-slate-50">
                  {isPending && <td className={tdClass}><input type="checkbox" checked={selectedIds.includes(id)} onChange={() => onToggle(id)} /></td>}
                  <td className={tdClass}>{formatDate(getDfeDate(item))}</td>
                  <td className={`${tdClass} truncate`}>{getDfePerson(item)}</td>
                  <td className={`${tdClass} truncate font-mono text-xs`}>{getDfeKey(item) || '-'}</td>
                  <td className={tdClass}>{formatCurrency(getDfeValue(item))}</td>
                  <td className={tdClass}><StatusBadge status={getDfeStatus(item)} /></td>
                  <td className={tdClass}>
                    <div className="flex items-center gap-1">
                      {isPending && <IconButton title="Manifestar" icon="bi bi-check-circle" tone="success" onClick={() => onManifest(item as DFeRecord)} />}
                      <IconButton title="PDF" icon="bi bi-file-pdf" tone="danger" onClick={() => onPdf(item)} />
                      <IconButton title="XML" icon="bi bi-file-code" tone="primary" onClick={() => onXml(item)} />
                      {isPending && <IconButton title="Tratar manualmente" icon="bi bi-x-circle" tone="warning" onClick={() => onReject(item as DFeRecord)} />}
                    </div>
                  </td>
                </tr>
              )
            }) : <EmptyRow colSpan={isPending ? 7 : 6} title="Nenhum documento encontrado" />}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function formatDfeFilters(filters: { dataEmissaoInicio: string; dataEmissaoFim: string; chaveNfe: string; nomeEmitente: string }) {
  return {
    ...(filters.dataEmissaoInicio ? { dataEmissaoInicio: `${filters.dataEmissaoInicio}T00:00:00` } : {}),
    ...(filters.dataEmissaoFim ? { dataEmissaoFim: `${filters.dataEmissaoFim}T23:59:59` } : {}),
    ...(filters.chaveNfe ? { chaveNfe: filters.chaveNfe } : {}),
    ...(filters.nomeEmitente ? { nomeEmitente: filters.nomeEmitente } : {}),
  }
}

function getDfeId(item: DFeRecord | NfeRecord): string | number {
  const value = ('id' in item ? item.id : item.id_nfe) ?? getDfeKey(item)
  return typeof value === 'number' || typeof value === 'string' ? value : String(value)
}
function getDfeDate(item: DFeRecord | NfeRecord) { return ('dataEmissao' in item ? item.dataEmissao : item.data_emissao) as string | undefined }
function getDfePerson(item: DFeRecord | NfeRecord) { return (('nomeEmitente' in item ? item.nomeEmitente : item.nome_pessoa_cli_for) as string | undefined) ?? '-' }
function getDfeKey(item: DFeRecord | NfeRecord) { return (('chaveNfe' in item ? item.chaveNfe : item.chave_acesso) as string | undefined) ?? '' }
function getDfeValue(item: DFeRecord | NfeRecord) { return Number(('valorTotal' in item ? item.valorTotal : item.valor_total_nfe) ?? 0) }
function getDfeStatus(item: DFeRecord | NfeRecord) { return String(('status' in item ? item.status : item.ds_nfe_status) ?? '-') }
function formatDate(value?: string) { return value ? dayjs(value).format('DD/MM/YYYY') : '-' }
function formatCurrency(value: number) { return value ? value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '-' }
function formatPeriodoExtenso(mes: number, ano: number) { return `${mesesNome[Math.max(0, Math.min(11, mes - 1))]}/${ano}` }
function getTotalElements(payload: PageResponseLike | unknown) {
  const shaped = payload as PageResponseLike | null
  return typeof shaped?.totalElements === 'number' ? shaped.totalElements : rows(payload).length
}
function sameId(left: unknown, right: unknown) { return String(left ?? '') === String(right ?? '') }
function isEmpresaComEmissaoExecutada(empresa: EmpresaEmitentePeriodo) { return String(empresa.fl_emissao_executada ?? '').toLowerCase() === FLAG_SIM }
function isNotaMarcadaParaRepetir(nota: NfeRepeticaoRecord) { return String(nota.fl_marcada_repetir ?? '').toLowerCase() === FLAG_SIM || Boolean(nota.id_nfe_repetir) }
function isNotaJaGerada(nota: NfeRepeticaoRecord) { return Boolean(nota.id_nfe_gerada) || String(nota.fl_executado ?? '').toLowerCase() === FLAG_SIM }
function isNotaBloqueadaPorEmissao(empresa: EmpresaEmitentePeriodo, nota: NfeRepeticaoRecord) { return isEmpresaComEmissaoExecutada(empresa) || isNotaJaGerada(nota) }
function certColor(status: string | undefined, index: number) {
  const normalized = String(status ?? '').toLowerCase()
  if (normalized.includes('venc')) return '#dc2626'
  if (normalized.includes('30')) return '#f97316'
  if (normalized.includes('60')) return '#eab308'
  if (normalized.includes('prazo') || normalized.includes('valido')) return '#16a34a'
  return ['#2563eb', '#0891b2', '#7c3aed', '#64748b'][index % 4]
}

interface PageResponseLike {
  totalElements?: number
  data?: unknown[]
  table?: unknown[]
  entities?: Array<{ data?: unknown[] }>
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  URL.revokeObjectURL(url)
}

const inputClass = 'h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100'
const smallInputClass = 'h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-xs outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-100'
const primaryButtonClass = 'inline-flex h-9 items-center gap-2 rounded-md bg-blue-700 px-3 text-sm font-semibold text-white transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-70'
const secondaryButtonClass = 'inline-flex h-9 items-center gap-2 rounded-md border border-slate-200 px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-70'
const thClass = 'border-b border-slate-200 px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500'
const tdClass = 'border-b border-slate-100 px-3 py-2.5 text-slate-600'

function Field({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return <label className={['block space-y-1', className].filter(Boolean).join(' ')}><span className="text-sm font-medium text-slate-700">{label}</span>{children}</label>
}

function TabButton({ active, icon, label, onClick }: { active: boolean; icon: string; label: string; onClick: () => void }) {
  return <button type="button" onClick={onClick} className={`inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm font-semibold transition ${active ? 'border-blue-700 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}><i className={icon} aria-hidden />{label}</button>
}

function SortTh({ field, active, direction, onSort, children }: { field: string; active: string; direction: 'asc' | 'desc'; onSort: (field: string) => void; children: React.ReactNode }) {
  return <th className={thClass}><button type="button" onClick={() => onSort(field)} className="inline-flex items-center gap-1">{children}{active === field && <i className={`bi ${direction === 'asc' ? 'bi-arrow-up' : 'bi-arrow-down'}`} aria-hidden />}</button></th>
}

function StatusBadge({ status }: { status: string }) {
  const normalized = status.toLowerCase()
  const cls = normalized.includes('cancel') ? 'border-red-200 bg-red-50 text-red-700' : normalized.includes('pend') || normalized === '1' ? 'border-amber-200 bg-amber-50 text-amber-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'
  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${cls}`}>{status}</span>
}

function IconButton({ title, icon, tone, onClick }: { title: string; icon: string; tone: 'primary' | 'danger' | 'success' | 'warning'; onClick: () => void }) {
  const cls = {
    primary: 'border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100',
    danger: 'border-red-200 bg-red-50 text-red-700 hover:bg-red-100',
    success: 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100',
    warning: 'border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100',
  }[tone]
  return <button type="button" title={title} onClick={onClick} className={`inline-flex h-8 w-8 items-center justify-center rounded-md border transition ${cls}`}><i className={icon} aria-hidden /></button>
}

function LoadingRow({ colSpan }: { colSpan: number }) {
  return <tr><td colSpan={colSpan} className="px-3 py-10 text-center text-sm text-slate-500"><span className="mr-2 inline-block h-4 w-4 animate-spin rounded-full border-2 border-blue-700 border-t-transparent align-[-2px]" />Carregando...</td></tr>
}

function EmptyRow({ colSpan, title }: { colSpan: number; title: string }) {
  return <tr><td colSpan={colSpan} className="px-3 py-12 text-center"><div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-blue-700 ring-1 ring-blue-100"><i className="bi bi-inbox text-xl" aria-hidden /></div><p className="mt-3 text-sm font-semibold text-slate-800">{title}</p></td></tr>
}

function PaginationFooter({ page, totalPages, totalElements, pageSize, onPage, onPageSize }: { page: number; totalPages: number; totalElements: number; pageSize: number; onPage: (page: number) => void; onPageSize: (size: number) => void }) {
  return <div className="flex flex-col gap-3 border-t border-slate-100 bg-white px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between"><p className="text-sm text-slate-500">Registros: <span className="font-semibold text-slate-700">{totalElements}</span><span className="mx-2">|</span>Paginas: <span className="font-semibold text-slate-700">{totalPages}</span></p><div className="flex items-center gap-2"><button className={pagerButtonClass} onClick={() => onPage(1)} disabled={page <= 1}>Primeira</button><button className={pagerButtonClass} onClick={() => onPage(Math.max(1, page - 1))} disabled={page <= 1}>Anterior</button><span className="rounded-md border border-slate-200 px-3 py-1.5 text-sm text-slate-700">{page}</span><button className={pagerButtonClass} onClick={() => onPage(Math.min(totalPages, page + 1))} disabled={page >= totalPages}>Proxima</button><select value={pageSize} onChange={(e) => onPageSize(Number(e.target.value))} className="h-9 rounded-md border border-slate-200 bg-white px-2 text-sm outline-none">{pageSizes.map((size) => <option key={size} value={size}>{size}</option>)}</select></div></div>
}

const pagerButtonClass = 'rounded-md border border-slate-200 px-3 py-1.5 text-sm text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50'
