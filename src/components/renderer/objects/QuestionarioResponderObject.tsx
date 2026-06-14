import { useState, useMemo, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { entityApi } from '@/api/entity.api'
import type { EntityRecord } from '@/types/entity.types'
import type { ObjectDefinition } from '@/types/view.types'
import { useViewContext } from '../ViewContext'
import { useConnectionParams } from '../ObjectRenderer'
import { useToast } from '@/components/ui/Toast'
import type { Question, QuestionOption, ScaleConfig, Conditional } from './QuestionarioBuilderObject'

// ─── Tipos locais ─────────────────────────────────────────────────────────────

type AnswerValue = string | number | string[] | null

interface RespostaItem {
  id_item?: number
  id_pergunta: number
  vl_texto?: string | null
  vl_numero?: number | null
  vl_data?: string | null
  vl_datetime?: string | null
  vl_json?: string[] | null
}

interface QuestionnaireInfo {
  id_questionario: number
  titulo: string
  descricao?: string
  versao: number
}

interface Props {
  objectDef: ObjectDefinition
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const parseJson = (val: unknown) => {
  if (!val) return null
  if (typeof val === 'string') {
    try { return JSON.parse(val) } catch { return null }
  }
  return val
}

/** Verifica se a condição da pergunta é satisfeita pelo mapa de respostas atual */
function isVisible(q: Question, answers: Record<number, AnswerValue>): boolean {
  if (!q.ds_condicional) return true
  const c = q.ds_condicional as Conditional
  if (!c.id_pergunta) return true

  const val = answers[c.id_pergunta]
  const strVal = Array.isArray(val) ? val.join(',') : String(val ?? '')

  switch (c.operador) {
    case 'eq':       return strVal === c.valor
    case 'neq':      return strVal !== c.valor
    case 'contains': return strVal.toLowerCase().includes(c.valor.toLowerCase())
    default:         return true
  }
}

/** Converte o valor da resposta para os campos da API */
function toItemPayload(q: Question, value: AnswerValue): Partial<RespostaItem> {
  if (value === null || value === '' || (Array.isArray(value) && value.length === 0)) {
    return { vl_texto: null, vl_numero: null, vl_data: null, vl_datetime: null, vl_json: null }
  }
  switch (q.tp_resposta) {
    case 'number':
    case 'money':
    case 'scale':
      return { vl_numero: value !== '' ? Number(value) : null }
    case 'date':
      return { vl_data: value as string }
    case 'datetime':
      return { vl_datetime: String(value) }
    case 'multiselect':
      return { vl_json: value as string[] }
    default:
      return { vl_texto: String(value) }
  }
}

/** Extrai o valor de exibição do item de resposta salvo */
function fromItemPayload(q: Question, item: EntityRecord): AnswerValue {
  switch (q.tp_resposta) {
    case 'number':
    case 'money':
    case 'scale':
      return item['vl_numero'] !== null && item['vl_numero'] !== undefined
        ? Number(item['vl_numero'])
        : null
    case 'date':
      return item['vl_data'] ? String(item['vl_data']) : null
    case 'datetime':
      return item['vl_datetime'] ? String(item['vl_datetime']) : null
    case 'multiselect': {
      const raw = item['vl_json']
      if (Array.isArray(raw)) return raw as string[]
      if (typeof raw === 'string') {
        try { return JSON.parse(raw) as string[] } catch { return null }
      }
      return null
    }
    default:
      return item['vl_texto'] ? String(item['vl_texto']) : null
  }
}

// ─── Resolução do(s) ID(s) do questionário ────────────────────────────────────

interface ResolvedIds {
  /** ID único já determinado → vai direto para o responder */
  direct: number | null
  /** Lista de IDs para mostrar o picker (null = todos os ativos) */
  pickerFilter: number[] | null
  /** true quando há alguma fonte de IDs configurada (param, fixo…) */
  hasConfig: boolean
}

function resolveQuestionarioIds(
  def: ObjectDefinition & Record<string, unknown>,
  screenParams: Record<string, unknown>,
): ResolvedIds {
  // 1. Parâmetro de sistema (idQuestionarioParam)
  const paramName = def.idQuestionarioParam ? String(def.idQuestionarioParam) : null
  if (paramName && screenParams[paramName]) {
    const raw = String(screenParams[paramName])
    const ids = raw.split(',').map((s) => Number(s.trim())).filter((n) => !isNaN(n) && n > 0)
    if (ids.length === 1) return { direct: ids[0], pickerFilter: null, hasConfig: true }
    if (ids.length > 1)  return { direct: null, pickerFilter: ids, hasConfig: true }
  }

  // 2. ID fixo único (idQuestionario)
  if (def.idQuestionario) {
    const id = Number(def.idQuestionario)
    if (!isNaN(id) && id > 0) return { direct: id, pickerFilter: null, hasConfig: true }
  }

  // 3. IDs fixos múltiplos (idQuestionarios — array ou string "1,2,3")
  if (def.idQuestionarios) {
    let ids: number[] = []
    if (Array.isArray(def.idQuestionarios)) {
      ids = (def.idQuestionarios as unknown[]).map(Number).filter((n) => !isNaN(n) && n > 0)
    } else {
      ids = String(def.idQuestionarios).split(',').map((s) => Number(s.trim())).filter((n) => !isNaN(n) && n > 0)
    }
    if (ids.length === 1) return { direct: ids[0], pickerFilter: null, hasConfig: true }
    if (ids.length > 1)  return { direct: null, pickerFilter: ids, hasConfig: true }
  }

  // 4. Nenhuma configuração → abre picker com todos os questionários ativos
  return { direct: null, pickerFilter: null, hasConfig: false }
}

// ─── QuestionarioResponderObject ──────────────────────────────────────────────

export function QuestionarioResponderObject({ objectDef }: Props) {
  const { screenParams, initialParams = {} } = useViewContext()
  const navigate = useNavigate()
  const location = useLocation()
  const queryClient = useQueryClient()
  const toast = useToast()

  const def = objectDef as ObjectDefinition & Record<string, unknown>

  // Configuração via JSON
  const questionarioEntity  = String(def.questionarioEntity  ?? 'questionario')
  const perguntaEntity      = String(def.perguntaEntity      ?? 'questionarioPergunta')
  const respostaEntity      = String(def.entity              ?? 'questionarioResposta')
  const respostaItemEntity  = String(def.respostaItemEntity  ?? 'questionarioRespostaItem')
  const entidadeRef         = String(def.entidadeRef         ?? '')
  const idRefParam          = String(def.idRefParam          ?? 'id_ref')
  const reportName          = def.reportName ? String(def.reportName) : null
  // View consultada para auto-preencher perguntas com nm_campo_auto.
  // Default: "vw_" + entidadeRef  (ex: entidadeRef="residente" → "vw_residente")
  const entidadeRefView     = def.entidadeRefView
    ? String(def.entidadeRefView)
    : entidadeRef ? `vw_${entidadeRef}` : ''

  // connectionParams: permite que este objeto seja filho de um CRUD/tabela via connection
  const connectionParams = useConnectionParams(objectDef.id)

  // ID da entidade vinculada — prioridade: connectionParams > initialParams > screenParams
  const idRefRaw = connectionParams[idRefParam] ?? initialParams[idRefParam] ?? screenParams[idRefParam]
  const idRef    = idRefRaw ? Number(idRefRaw) : null

  // ID de resposta já conhecido (vindo do histórico) — pula a query de busca
  const idRespostaInicial = initialParams['id_resposta'] ? Number(initialParams['id_resposta']) : null

  // Resolução do questionário
  const { direct, pickerFilter } = useMemo(
    () => resolveQuestionarioIds(def, screenParams as Record<string, unknown>),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  // id_questionario — prioridade: connectionParams > initialParams > resolveQuestionarioIds
  const idFromConnectionParams = connectionParams['id_questionario']
    ? Number(connectionParams['id_questionario'])
    : null
  const idFromInitialParams = initialParams['id_questionario']
    ? Number(initialParams['id_questionario'])
    : null

  // Estado do picker — prioridade: connectionParams > initialParams > resolução da view def
  const [selectedQuestionario, setSelectedQuestionario] = useState<number | null>(
    idFromConnectionParams ?? idFromInitialParams ?? direct,
  )

  // Reage quando o pai muda a linha selecionada (ex: tabela conectada ao responder)
  useEffect(() => {
    if (idFromConnectionParams !== null && idFromConnectionParams !== selectedQuestionario) {
      setSelectedQuestionario(idFromConnectionParams)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idFromConnectionParams])

  const idQuestionario = selectedQuestionario

  // ── Queries ───────────────────────────────────────────────────────────────

  // Picker: carrega questionários disponíveis (apenas quando necessário)
  const showPicker = selectedQuestionario === null
  const { data: questionnaireList = [], isLoading: loadingList } = useQuery<QuestionnaireInfo[]>({
    queryKey: ['entity', questionarioEntity, 'picker', pickerFilter],
    queryFn: async () => {
      const res = await entityApi.getList<EntityRecord>(questionarioEntity, {
        fl_ativo: 'SIM',
        pageSize: 200,
        orderBy: 'titulo',
      })
      const items = (res as { data?: EntityRecord[] }).data ?? (Array.isArray(res) ? (res as EntityRecord[]) : [])
      const mapped = items.map((item) => ({
        id_questionario: item['id_questionario'] as number,
        titulo:          String(item['titulo'] ?? ''),
        descricao:       item['descricao'] ? String(item['descricao']) : undefined,
        versao:          Number(item['versao'] ?? 1),
      }))
      // Filtra pelos IDs especificados, se houver
      if (pickerFilter && pickerFilter.length > 0) {
        return mapped.filter((q) => pickerFilter.includes(q.id_questionario))
      }
      return mapped
    },
    enabled: showPicker,
    staleTime: 60_000,
  })

  // Metadados do questionário (título/descrição) — para o header do PDF
  const { data: questionnaireInfo } = useQuery<QuestionnaireInfo | null>({
    queryKey: ['entity', questionarioEntity, 'info', idQuestionario],
    queryFn: async () => {
      if (!idQuestionario) return null
      const res = await entityApi.getList<EntityRecord>(questionarioEntity, {
        id_questionario: idQuestionario,
        pageSize: 1,
      })
      const items = (res as { data?: EntityRecord[] }).data ?? (Array.isArray(res) ? (res as EntityRecord[]) : [])
      if (!items.length) return null
      return {
        id_questionario: items[0]['id_questionario'] as number,
        titulo:   String(items[0]['titulo'] ?? ''),
        descricao: items[0]['descricao'] ? String(items[0]['descricao']) : undefined,
        versao:   Number(items[0]['versao'] ?? 1),
      }
    },
    enabled: idQuestionario !== null && !showPicker,
    staleTime: 300_000,
  })

  // Carrega perguntas do questionário selecionado
  const { data: questions = [], isLoading: loadingQuestions, isError: questionsError } = useQuery<Question[]>({
    queryKey: ['entity', perguntaEntity, 'list', idQuestionario],
    queryFn: async () => {
      if (!idQuestionario) return []
      const res = await entityApi.getList<EntityRecord>(perguntaEntity, {
        id_questionario: idQuestionario,
        pageSize: 999,
        orderBy: 'nr_ordem',
      })
      const items = (res as { data?: EntityRecord[] }).data ?? (Array.isArray(res) ? (res as EntityRecord[]) : [])
      return items.map((item): Question => ({
        id_pergunta:     item['id_pergunta'] as number,
        id_questionario: item['id_questionario'] as number,
        nr_ordem:        Number(item['nr_ordem'] ?? 0),
        ds_texto:        String(item['ds_texto'] ?? ''),
        ds_ajuda:        item['ds_ajuda'] ? String(item['ds_ajuda']) : undefined,
        tp_resposta:     String(item['tp_resposta'] ?? 'text') as Question['tp_resposta'],
        fl_obrigatorio:  String(item['fl_obrigatorio'] ?? 'NAO') as 'SIM' | 'NAO',
        ds_opcoes:       parseJson(item['ds_opcoes']) as QuestionOption[] | ScaleConfig | null,
        ds_condicional:  parseJson(item['ds_condicional']) as Conditional | null,
        ds_placeholder:  item['ds_placeholder'] ? String(item['ds_placeholder']) : null,
        fl_inline:       String(item['fl_inline'] ?? 'NAO') as 'SIM' | 'NAO',
        nr_colunas:      item['nr_colunas'] ? Number(item['nr_colunas']) : 12,
        nm_campo_auto:   item['nm_campo_auto'] ? String(item['nm_campo_auto']) : null,
      }))
    },
    enabled: idQuestionario !== null && !isNaN(idQuestionario),
    staleTime: 60_000,
  })

  // Carrega resposta existente pelo par (questionario + entidade + id_ref)
  // Desabilitado quando id_resposta já foi recebido via initialParams (vindo do histórico)
  const { data: existingResposta } = useQuery<EntityRecord | null>({
    queryKey: ['entity', respostaEntity, 'existing', idQuestionario, entidadeRef, idRef],
    queryFn: async () => {
      if (!idQuestionario || !idRef || !entidadeRef) return null
      const res = await entityApi.getList<EntityRecord>(respostaEntity, {
        id_questionario: idQuestionario,
        ds_entidade_ref: entidadeRef,
        id_ref:          idRef,
        pageSize: 1,
        orderBy:         'id_resposta,desc',
      })
      const items = (res as { data?: EntityRecord[] }).data ?? (Array.isArray(res) ? (res as EntityRecord[]) : [])
      return items[0] ?? null
    },
    // Pula se já temos o id_resposta direto
    enabled: idRespostaInicial === null && idQuestionario !== null && idRef !== null && entidadeRef !== '',
  })

  // ── State de resposta ─────────────────────────────────────────────────────
  const [answers,         setAnswers]         = useState<Record<number, AnswerValue>>({})
  // Se veio do histórico, já temos o id_resposta — não precisa buscar
  const [respostaId,      setRespostaId]      = useState<number | null>(idRespostaInicial)
  const [itemMap,         setItemMap]         = useState<Map<number, number>>(new Map())
  const [finalizado,      setFinalizado]      = useState(false)
  // Incrementado a cada navegação para forçar o effect de popular respostas mesmo
  // quando existingItems/questions não mudam de referência (cache do TanStack)
  const [populateTrigger, setPopulateTrigger] = useState(0)

  // Carrega itens da resposta existente
  const { data: existingItems = [] } = useQuery<EntityRecord[]>({
    queryKey: ['entity', respostaItemEntity, 'list', respostaId],
    queryFn: async () => {
      if (!respostaId) return []
      const res = await entityApi.getList<EntityRecord>(respostaItemEntity, {
        id_resposta: respostaId,
        pageSize: 999,
      })
      return (res as { data?: EntityRecord[] }).data ?? (Array.isArray(res) ? (res as EntityRecord[]) : [])
    },
    enabled: respostaId !== null,
  })

  // Carrega status da resposta quando o id_resposta veio direto (do histórico)
  const { data: respostaById } = useQuery<EntityRecord | null>({
    queryKey: ['entity', respostaEntity, 'byId', idRespostaInicial],
    queryFn: async () => {
      if (!idRespostaInicial) return null
      const res = await entityApi.getList<EntityRecord>(respostaEntity, {
        id_resposta: idRespostaInicial,
        pageSize: 1,
      })
      const items = (res as { data?: EntityRecord[] }).data ?? (Array.isArray(res) ? (res as EntityRecord[]) : [])
      return items[0] ?? null
    },
    enabled: idRespostaInicial !== null,
  })

  // Carrega dados da entidade vinculada para auto-preencher perguntas com nm_campo_auto
  const hasAutoFields = questions.some((q) => q.nm_campo_auto)
  const { data: entidadeRefData } = useQuery<EntityRecord | null>({
    queryKey: ['entity', entidadeRefView, 'autoFill', idRef],
    queryFn: async () => {
      if (!entidadeRefView || !idRef || !idRefParam) return null
      const res = await entityApi.getList<EntityRecord>(entidadeRefView, {
        [idRefParam]: idRef,
        pageSize: 1,
      })
      const items = (res as { data?: EntityRecord[] }).data ?? (Array.isArray(res) ? (res as EntityRecord[]) : [])
      return items[0] ?? null
    },
    enabled: hasAutoFields && entidadeRefView !== '' && idRef !== null,
    staleTime: 60_000,
  })

  // Popula answers quando os dados chegam
  useEffect(() => {
    const resposta = respostaById ?? existingResposta
    if (resposta) {
      setRespostaId(resposta['id_resposta'] as number)
      setFinalizado(resposta['ds_status'] === 'finalizado')
    }
  }, [existingResposta, respostaById])

  useEffect(() => {
    if (questions.length === 0) return
    const newAnswers: Record<number, AnswerValue> = {}
    const newItemMap = new Map<number, number>()

    // 1. Popula a partir dos itens de resposta salvos
    for (const item of existingItems) {
      const pid = item['id_pergunta'] as number
      const q   = questions.find((q) => q.id_pergunta === pid)
      if (!q) continue
      newAnswers[pid] = fromItemPayload(q, item)
      newItemMap.set(pid, item['id_item'] as number)
    }

    // 2. Sobrescreve com dados da entidade vinculada para campos com nm_campo_auto
    //    (garante que o valor atual da entidade sempre apareça, mesmo em edições)
    if (entidadeRefData) {
      for (const q of questions) {
        if (!q.nm_campo_auto) continue
        const rawVal = entidadeRefData[q.nm_campo_auto]
        if (rawVal === undefined || rawVal === null) continue
        newAnswers[q.id_pergunta] = String(rawVal)
      }
    }

    setAnswers(newAnswers)
    setItemMap(newItemMap)
  }, [existingItems, questions, populateTrigger, entidadeRefData]) // eslint-disable-line react-hooks/exhaustive-deps

  // Sincroniza estado a cada nova navegação para esta tela (location.key muda a cada navigate())
  // Garante reset mesmo quando React Router reutiliza o componente montado (mesma key de ViewRenderer)
  useEffect(() => {
    const newIdResposta     = initialParams['id_resposta']     ? Number(initialParams['id_resposta'])     : null
    const newIdQuestionario = initialParams['id_questionario'] ? Number(initialParams['id_questionario']) : null

    setSelectedQuestionario(newIdQuestionario ?? direct)
    setRespostaId(newIdResposta)
    setAnswers({})
    setItemMap(new Map())
    setFinalizado(false)
    // Incrementa trigger para forçar o effect de popular mesmo com existingItems cacheado
    setPopulateTrigger((n) => n + 1)
  }, [location.key]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Perguntas visíveis (respeita condicionais) ────────────────────────────
  const visibleQuestions = useMemo(
    () => questions.filter((q) => isVisible(q, answers)),
    [questions, answers],
  )

  // ── Mutations ─────────────────────────────────────────────────────────────

  const saveMutation = useMutation({
    mutationFn: async (status: 'rascunho' | 'finalizado') => {
      const missing = visibleQuestions.filter(
        (q) =>
          q.tp_resposta !== 'section' &&
          q.fl_obrigatorio === 'SIM' &&
          (answers[q.id_pergunta] === null ||
            answers[q.id_pergunta] === undefined ||
            answers[q.id_pergunta] === '' ||
            (Array.isArray(answers[q.id_pergunta]) &&
              (answers[q.id_pergunta] as string[]).length === 0)),
      )
      if (status === 'finalizado' && missing.length > 0) {
        throw new Error(
          `Preencha os campos obrigatórios: ${missing.map((q) => q.ds_texto).join(', ')}`,
        )
      }

      let currentRespostaId = respostaId
      if (currentRespostaId) {
        await entityApi.update(respostaEntity, {
          id_resposta:   currentRespostaId,
          ds_status:     status,
          finalizado_em: status === 'finalizado' ? new Date().toISOString() : null,
        })
      } else {
        const result = await entityApi.create(respostaEntity, {
          id_questionario:     idQuestionario,
          versao_questionario: 1,
          ds_entidade_ref:     entidadeRef,
          id_ref:              idRef,
          ds_status:           status,
          finalizado_em:       status === 'finalizado' ? new Date().toISOString() : null,
        })
        const saved = (result as { data?: EntityRecord }).data ?? (result as unknown as EntityRecord)
        currentRespostaId = saved?.['id_resposta'] as number
        setRespostaId(currentRespostaId)
      }

      await Promise.all(
        visibleQuestions
          .filter((q) => q.tp_resposta !== 'section')
          .map((q) => {
            const value          = answers[q.id_pergunta] ?? null
            const payload        = toItemPayload(q, value)
            const existingItemId = itemMap.get(q.id_pergunta)
            if (existingItemId) {
              return entityApi.update(respostaItemEntity, { id_item: existingItemId, ...payload })
            }
            return entityApi.create(respostaItemEntity, {
              id_resposta: currentRespostaId,
              id_pergunta: q.id_pergunta,
              ...payload,
            }).then((result) => {
              const saved = (result as { data?: EntityRecord }).data ?? (result as unknown as EntityRecord)
              const newItemId = saved?.['id_item'] as number | undefined
              if (newItemId) setItemMap((prev) => new Map(prev).set(q.id_pergunta, newItemId))
            })
          }),
      )

      return status
    },
    onSuccess: (status) => {
      queryClient.invalidateQueries({ queryKey: ['entity', respostaEntity] })
      queryClient.invalidateQueries({ queryKey: ['entity', respostaItemEntity] })
      if (status === 'finalizado') {
        setFinalizado(true)
        toast.success('Questionário finalizado com sucesso.')
      } else {
        toast.success('Rascunho salvo.')
      }
    },
    onError: (err: unknown) => {
      const msg =
        (err as Error)?.message ??
        (err as { response?: { data?: { messageError?: string } } })?.response?.data?.messageError ??
        'Erro ao salvar.'
      toast.error(msg)
    },
  })

  // ── Exportar / Imprimir ───────────────────────────────────────────────────

  const [exportando, setExportando] = useState(false)

  function handlePrintPdf() {
    if (!respostaId) return
    setExportando(true)

    const titulo    = questionnaireInfo?.titulo   ?? `Questionário #${idQuestionario}`
    const descricao = questionnaireInfo?.descricao ?? ''
    const versao    = questionnaireInfo?.versao    ?? 1
    const dataHoje  = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
    const statusLabel = finalizado ? 'Finalizado' : 'Rascunho'

    // Resolve o texto de exibição de uma resposta
    function resolveAnswer(q: Question): string {
      const val = answers[q.id_pergunta]
      if (val === null || val === undefined || val === '') return '—'
      switch (q.tp_resposta) {
        case 'boolean': return val === 'SIM' ? 'Sim' : 'Não'
        case 'money':   return `R$ ${Number(val).toFixed(2).replace('.', ',')}`
        case 'date':    return new Date(String(val) + 'T00:00:00').toLocaleDateString('pt-BR')
        case 'datetime':return new Date(String(val)).toLocaleString('pt-BR')
        case 'select': {
          const opts = (q.ds_opcoes as QuestionOption[] | null) ?? []
          return opts.find((o) => o.valor === String(val))?.label ?? String(val)
        }
        case 'multiselect': {
          const opts  = (q.ds_opcoes as QuestionOption[] | null) ?? []
          const selected = (val as string[]).map((v) => opts.find((o) => o.valor === v)?.label ?? v)
          return selected.join(', ') || '—'
        }
        case 'scale': return `${val} / ${(q.ds_opcoes as ScaleConfig | null)?.max ?? 5}`
        default: return String(val)
      }
    }

    // Gera o bloco de resposta de cada pergunta
    function renderAnswerBlock(q: Question): string {
      const val = answers[q.id_pergunta]
      const answered = val !== null && val !== undefined && val !== ''
        && !(Array.isArray(val) && (val as string[]).length === 0)

      if (q.tp_resposta === 'select' || q.tp_resposta === 'multiselect') {
        const opts  = (q.ds_opcoes as QuestionOption[] | null) ?? []
        const isMulti = q.tp_resposta === 'multiselect'
        const selectedVals = isMulti
          ? ((val as string[] | null) ?? [])
          : (val ? [String(val)] : [])
        const selectedLabels = selectedVals
          .map((v) => opts.find((o) => o.valor === v)?.label ?? v)
        const inline = q.fl_inline === 'SIM'
        const sep = inline ? ' · ' : '<br>'
        const text = selectedLabels.length > 0
          ? selectedLabels.join(sep)
          : '—'
        return `<div style="margin-top:7px;padding:6px 10px;background:#f8fafc;border-radius:4px;font-size:12px;color:${answered ? '#1e293b' : '#9ca3af'};border-left:3px solid ${answered ? '#1d4ed8' : '#d1d5db'};font-style:${answered ? 'normal' : 'italic'};">${text}</div>`
      }

      const text = answered ? resolveAnswer(q) : '—'
      return `<div style="margin-top:7px;padding:6px 10px;background:#f8fafc;border-radius:4px;font-size:12px;color:${answered ? '#1e293b' : '#9ca3af'};border-left:3px solid ${answered ? '#1d4ed8' : '#d1d5db'};min-height:26px;font-style:${answered ? 'normal' : 'italic'};">${text}</div>`
    }

    let questionsHtml = '<div class="questions-grid">'
    let qNum = 0
    for (const q of visibleQuestions) {
      if (q.tp_resposta === 'section') {
        questionsHtml += `
          <div style="grid-column:span 12;display:flex;align-items:center;gap:10px;margin:14px 0 6px;">
            <div style="flex:1;height:1px;background:#d1d5db;"></div>
            <span style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#6b7280;white-space:nowrap;">${q.ds_texto}</span>
            <div style="flex:1;height:1px;background:#d1d5db;"></div>
          </div>`
        continue
      }
      qNum++
      const span = q.nr_colunas === 3 ? 3 : q.nr_colunas === 4 ? 4 : q.nr_colunas === 6 ? 6 : 12
      questionsHtml += `
        <div style="grid-column:span ${span};padding:10px 12px;border:1px solid #e5e7eb;border-radius:6px;break-inside:avoid;">
          <div style="font-size:12px;font-weight:600;color:#111;line-height:1.4;">
            <span style="color:#6b7280;font-weight:400;margin-right:4px;">${qNum}.</span>${q.ds_texto}${q.fl_obrigatorio === 'SIM' ? '<span style="color:#dc2626;margin-left:2px;">*</span>' : ''}
          </div>
          ${renderAnswerBlock(q)}
        </div>`
    }
    questionsHtml += '</div>'

    const totalPerguntas = visibleQuestions.filter(q => q.tp_resposta !== 'section').length

    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <title>${titulo}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, sans-serif; font-size: 12px; color: #1a1a1a; background: #f3f4f6; }
    .page { max-width: 800px; margin: 0 auto; background: #fff; padding: 32px 40px; }
    .toolbar { position: sticky; top: 0; z-index: 10; background: #1d4ed8; color: #fff; padding: 10px 20px; display: flex; align-items: center; justify-content: space-between; font-size: 13px; }
    .toolbar strong { font-size: 14px; }
    .toolbar button { background: #fff; color: #1d4ed8; border: none; border-radius: 6px; padding: 7px 18px; font-size: 13px; font-weight: 700; cursor: pointer; }
    .toolbar button:hover { background: #e0e7ff; }
    .header { border-bottom: 2px solid #1d4ed8; padding-bottom: 14px; margin-bottom: 20px; }
    .header h1 { font-size: 18px; font-weight: 700; color: #1d4ed8; margin-bottom: 4px; }
    .header p.desc { font-size: 12px; color: #555; margin-top: 4px; }
    .header-meta { display: flex; flex-wrap: wrap; gap: 20px; margin-top: 10px; font-size: 11px; color: #666; }
    .header-meta span strong { color: #333; }
    .status-badge { display: inline-block; padding: 2px 8px; border-radius: 20px; font-size: 10px; font-weight: 700; }
    .status-finalizado { background: #dcfce7; color: #166534; }
    .status-rascunho   { background: #fef9c3; color: #854d0e; }
    .questions-grid { display: grid; grid-template-columns: repeat(12, 1fr); gap: 10px; }
    .footer { margin-top: 28px; padding-top: 10px; border-top: 1px solid #e5e7eb; font-size: 10px; color: #9ca3af; display: flex; justify-content: space-between; }
    @media print {
      body { background: #fff; }
      .toolbar { display: none; }
      .page { padding: 0; max-width: 100%; }
      @page { margin: 1.5cm 1.8cm; }
    }
  </style>
</head>
<body>
  <div class="toolbar">
    <strong>📄 ${titulo}</strong>
    <button onclick="window.print()">🖨️ Imprimir / Salvar PDF</button>
  </div>
  <div class="page">
    <div class="header">
      <h1>${titulo}</h1>
      ${descricao ? `<p class="desc">${descricao}</p>` : ''}
      <div class="header-meta">
        <span><strong>Versão:</strong> ${versao}</span>
        <span><strong>Data:</strong> ${dataHoje}</span>
        <span><strong>Status:</strong>
          <span class="status-badge status-${finalizado ? 'finalizado' : 'rascunho'}">${statusLabel}</span>
        </span>
        <span><strong>Respondido:</strong> ${qNum} de ${totalPerguntas} perguntas</span>
      </div>
    </div>

    ${questionsHtml}

    <div class="footer">
      <span>Gerado em ${new Date().toLocaleString('pt-BR')}</span>
      <span>Ref. #${respostaId}</span>
    </div>
  </div>
</body>
</html>`

    const win = window.open('', '_blank', 'width=860,height=960')
    if (!win) {
      toast.error('Pop-up bloqueado. Permita pop-ups para visualizar.')
      setExportando(false)
      return
    }
    win.document.write(html)
    win.document.close()
    win.focus()
    setExportando(false)
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  function setAnswer(idPergunta: number, value: AnswerValue) {
    setAnswers((prev) => ({ ...prev, [idPergunta]: value }))
  }

  function toggleMultiSelect(idPergunta: number, valor: string) {
    setAnswers((prev) => {
      const current = (prev[idPergunta] as string[] | null) ?? []
      const next = current.includes(valor)
        ? current.filter((v) => v !== valor)
        : [...current, valor]
      return { ...prev, [idPergunta]: next }
    })
  }

  // ── Render: Picker ────────────────────────────────────────────────────────

  if (showPicker) {
    return (
      <div style={objectDef.style as React.CSSProperties}>
        {/* Voltar */}
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="mb-4 flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <i className="bi bi-arrow-left text-sm" />
          Voltar
        </button>

        <div className="mb-4">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <i className="bi bi-ui-checks text-primary" />
            Selecione o Questionário
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Escolha qual questionário deseja preencher.
          </p>
        </div>

        {loadingList ? (
          <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            Carregando questionários…
          </div>
        ) : questionnaireList.length === 0 ? (
          <div className="rounded-md border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            <i className="bi bi-ui-checks block text-2xl mb-2 opacity-30" />
            Nenhum questionário disponível.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {questionnaireList.map((q) => (
              <button
                key={q.id_questionario}
                type="button"
                onClick={() => setSelectedQuestionario(q.id_questionario)}
                className="group text-left rounded-lg border border-border bg-background p-4 hover:border-primary hover:bg-primary/5 transition-all cursor-pointer"
              >
                <div className="flex items-start gap-3">
                  <i className="bi bi-ui-checks-grid text-xl text-muted-foreground group-hover:text-primary transition-colors mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors truncate">
                      {q.titulo}
                    </p>
                    {q.descricao && (
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                        {q.descricao}
                      </p>
                    )}
                    <span className="inline-block mt-2 text-[11px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                      v{q.versao}
                    </span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    )
  }

  // ── Render: estados de carregamento / erro ────────────────────────────────

  if (loadingQuestions) {
    return (
      <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        Carregando questionário…
      </div>
    )
  }

  if (questionsError) {
    return (
      <div className="rounded-md border border-destructive/30 bg-destructive/5 p-6 text-center text-sm text-destructive">
        <i className="bi bi-exclamation-triangle block text-2xl mb-2 opacity-60" />
        Erro ao carregar as perguntas.
        {direct === null && (
          <button
            type="button"
            onClick={() => setSelectedQuestionario(null)}
            className="mt-3 block mx-auto text-xs text-muted-foreground hover:underline"
          >
            ← Voltar à seleção
          </button>
        )}
      </div>
    )
  }

  if (questions.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
        <i className="bi bi-ui-checks block text-2xl mb-2 opacity-40" />
        Questionário sem perguntas cadastradas.
        {direct === null && (
          <button
            type="button"
            onClick={() => setSelectedQuestionario(null)}
            className="mt-3 block mx-auto text-xs text-primary hover:underline"
          >
            ← Escolher outro questionário
          </button>
        )}
      </div>
    )
  }

  // ── Render: formulário de resposta ────────────────────────────────────────

  return (
    <div style={objectDef.style as React.CSSProperties}>
      {/* Barra de navegação superior */}
      <div className="mb-4 flex items-center gap-3">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <i className="bi bi-arrow-left text-sm" />
          Voltar
        </button>
        {direct === null && (
          <>
            <span className="text-muted-foreground/40 text-xs">|</span>
            <button
              type="button"
              onClick={() => setSelectedQuestionario(null)}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <i className="bi bi-grid text-[11px]" />
              Escolher outro questionário
            </button>
          </>
        )}
      </div>

      {/* Badge de finalizado */}
      {finalizado && (
        <div className="mb-4 flex items-center gap-2 rounded-md bg-green-50 border border-green-200 px-4 py-2 text-sm text-green-800">
          <i className="bi bi-check-circle-fill" />
          Questionário finalizado.
          <button
            type="button"
            onClick={() => setFinalizado(false)}
            className="ml-auto text-xs text-green-700 hover:underline"
          >
            Reabrir para edição
          </button>
        </div>
      )}

      {/* Perguntas — grid de 12 colunas */}
      <div className="grid grid-cols-12 gap-x-4 gap-y-5">
        {visibleQuestions.map((q) => {
          if (q.tp_resposta === 'section') {
            return (
              <div key={q.id_pergunta} className="col-span-12 pt-2">
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-px bg-border" />
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-2">
                    {q.ds_texto}
                  </span>
                  <div className="flex-1 h-px bg-border" />
                </div>
              </div>
            )
          }

          const colSpan = q.nr_colunas === 3 ? 'col-span-12 sm:col-span-3'
            : q.nr_colunas === 4             ? 'col-span-12 sm:col-span-4'
            : q.nr_colunas === 6             ? 'col-span-12 sm:col-span-6'
            : 'col-span-12'

          return (
            <div key={q.id_pergunta} className={colSpan}>
              <QuestionField
                question={q}
                value={answers[q.id_pergunta] ?? null}
                disabled={finalizado || !!q.nm_campo_auto}
                autoFilled={!!q.nm_campo_auto}
                onChange={(v) => setAnswer(q.id_pergunta, v)}
                onToggleMulti={(v) => toggleMultiSelect(q.id_pergunta, v)}
              />
            </div>
          )
        })}
      </div>

      {/* Botões de ação */}
      <div className="mt-6 flex flex-wrap gap-3 pt-4 border-t border-border">
        {!finalizado && (
          <>
            <button
              type="button"
              disabled={saveMutation.isPending}
              onClick={() => saveMutation.mutate('finalizado')}
              className="rounded-md bg-primary px-5 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors cursor-pointer"
            >
              {saveMutation.isPending ? 'Salvando…' : 'Finalizar'}
            </button>
            <button
              type="button"
              disabled={saveMutation.isPending}
              onClick={() => saveMutation.mutate('rascunho')}
              className="rounded-md border border-border px-5 py-2 text-sm text-muted-foreground hover:bg-accent disabled:opacity-50 transition-colors cursor-pointer"
            >
              Salvar rascunho
            </button>
          </>
        )}

        {/* Exportar PDF — visível quando há resposta salva */}
        {respostaId && (
          <button
            type="button"
            disabled={exportando}
            onClick={handlePrintPdf}
            className="flex items-center gap-1.5 rounded-md border border-border px-5 py-2 text-sm text-muted-foreground hover:bg-accent disabled:opacity-50 transition-colors cursor-pointer ml-auto"
          >
            <i className="bi bi-file-earmark-pdf text-red-500" />
            {exportando ? 'Preparando…' : 'Visualizar / Imprimir'}
          </button>
        )}
      </div>
    </div>
  )
}

// ─── QuestionField — renderiza um campo de resposta conforme o tipo ───────────

interface QuestionFieldProps {
  question: Question
  value: AnswerValue
  disabled: boolean
  autoFilled?: boolean
  onChange: (v: AnswerValue) => void
  onToggleMulti: (v: string) => void
}

function QuestionField({ question: q, value, disabled, autoFilled, onChange, onToggleMulti }: QuestionFieldProps) {
  const inputClass =
    'w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60 disabled:cursor-not-allowed'

  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-foreground flex items-center gap-1.5">
        {q.ds_texto}
        {q.fl_obrigatorio === 'SIM' && <span className="text-destructive ml-0.5">*</span>}
        {autoFilled && (
          <span className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-medium bg-blue-50 text-blue-600 border border-blue-200">
            <i className="bi bi-link-45deg" />
            automático
          </span>
        )}
      </label>

      {q.ds_ajuda && (
        <p className="text-xs text-muted-foreground">{q.ds_ajuda}</p>
      )}

      {q.tp_resposta === 'text' && (
        <input
          type="text"
          value={String(value ?? '')}
          onChange={(e) => onChange(e.target.value)}
          placeholder={q.ds_placeholder ?? ''}
          disabled={disabled}
          className={inputClass}
        />
      )}

      {q.tp_resposta === 'textarea' && (
        <textarea
          value={String(value ?? '')}
          onChange={(e) => onChange(e.target.value)}
          placeholder={q.ds_placeholder ?? ''}
          disabled={disabled}
          rows={4}
          className={`${inputClass} resize-y`}
        />
      )}

      {q.tp_resposta === 'number' && (
        <input
          type="number"
          value={value !== null && value !== undefined ? String(value) : ''}
          onChange={(e) => onChange(e.target.value !== '' ? Number(e.target.value) : null)}
          placeholder={q.ds_placeholder ?? '0'}
          disabled={disabled}
          className={inputClass}
        />
      )}

      {q.tp_resposta === 'money' && (
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">R$</span>
          <input
            type="number"
            step="0.01"
            value={value !== null && value !== undefined ? String(value) : ''}
            onChange={(e) => onChange(e.target.value !== '' ? Number(e.target.value) : null)}
            placeholder="0,00"
            disabled={disabled}
            className={`${inputClass} pl-9`}
          />
        </div>
      )}

      {q.tp_resposta === 'date' && (
        <input
          type="date"
          value={String(value ?? '')}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className={inputClass}
        />
      )}

      {q.tp_resposta === 'datetime' && (
        <input
          type="datetime-local"
          value={String(value ?? '')}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className={inputClass}
        />
      )}

      {q.tp_resposta === 'boolean' && (
        <div className="flex gap-3">
          {['SIM', 'NAO'].map((opt) => (
            <label key={opt} className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name={`q_${q.id_pergunta}`}
                value={opt}
                checked={value === opt}
                onChange={() => onChange(opt)}
                disabled={disabled}
                className="accent-primary"
              />
              <span className="text-sm">{opt === 'SIM' ? 'Sim' : 'Não'}</span>
            </label>
          ))}
        </div>
      )}

      {q.tp_resposta === 'select' && (
        <div className={q.fl_inline === 'SIM' ? 'flex flex-wrap gap-x-5 gap-y-1.5' : 'space-y-1.5'}>
          {((q.ds_opcoes as QuestionOption[]) ?? []).map((opt) => (
            <label key={opt.valor} className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name={`q_${q.id_pergunta}`}
                value={opt.valor}
                checked={value === opt.valor}
                onChange={() => onChange(opt.valor)}
                disabled={disabled}
                className="accent-primary"
              />
              <span className="text-sm">{opt.label}</span>
            </label>
          ))}
        </div>
      )}

      {q.tp_resposta === 'multiselect' && (
        <div className={q.fl_inline === 'SIM' ? 'flex flex-wrap gap-x-5 gap-y-1.5' : 'space-y-1.5'}>
          {((q.ds_opcoes as QuestionOption[]) ?? []).map((opt) => {
            const selected = ((value as string[] | null) ?? []).includes(opt.valor)
            return (
              <label key={opt.valor} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selected}
                  onChange={() => onToggleMulti(opt.valor)}
                  disabled={disabled}
                  className="accent-primary rounded"
                />
                <span className="text-sm">{opt.label}</span>
              </label>
            )
          })}
        </div>
      )}

      {q.tp_resposta === 'scale' && (() => {
        const cfg = (q.ds_opcoes as ScaleConfig | null) ?? { min: 1, max: 5 }
        const numbers = Array.from({ length: cfg.max - cfg.min + 1 }, (_, i) => cfg.min + i)
        return (
          <div className="space-y-2">
            <div className="flex gap-2 flex-wrap">
              {numbers.map((n) => (
                <button
                  key={n}
                  type="button"
                  disabled={disabled}
                  onClick={() => onChange(n)}
                  className={[
                    'h-10 w-10 rounded-md border text-sm font-medium transition-colors cursor-pointer',
                    value === n
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'border-input hover:bg-muted text-foreground',
                    disabled ? 'opacity-60 cursor-not-allowed' : '',
                  ].join(' ')}
                >
                  {n}
                </button>
              ))}
            </div>
            {(cfg.labelMin || cfg.labelMax) && (
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{cfg.labelMin}</span>
                <span>{cfg.labelMax}</span>
              </div>
            )}
          </div>
        )
      })()}

      {q.tp_resposta === 'file' && (
        <div className="rounded-md border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
          <i className="bi bi-paperclip block text-xl mb-1 opacity-40" />
          Upload de arquivo — implemente conforme o módulo de arquivos do projeto.
        </div>
      )}
    </div>
  )
}
