import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { entityApi } from '@/api/entity.api'
import type { EntityRecord } from '@/types/entity.types'
import type { ObjectDefinition } from '@/types/view.types'
import { useViewContext } from '../ViewContext'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/ui/ConfirmDialog'

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type QuestionType =
  | 'text' | 'textarea' | 'number' | 'money' | 'date' | 'datetime'
  | 'boolean' | 'select' | 'multiselect' | 'scale' | 'file' | 'section'

export interface QuestionOption {
  valor: string
  label: string
  peso?: number
}

export interface ScaleConfig {
  min: number
  max: number
  labelMin?: string
  labelMax?: string
}

export interface Conditional {
  id_pergunta: number
  operador: 'eq' | 'neq' | 'contains'
  valor: string
}

export interface Question {
  id_pergunta: number
  id_questionario: number
  nr_ordem: number
  ds_texto: string
  ds_ajuda?: string
  tp_resposta: QuestionType
  fl_obrigatorio: 'SIM' | 'NAO'
  ds_opcoes?: QuestionOption[] | ScaleConfig | null
  ds_condicional?: Conditional | null
  ds_placeholder?: string | null
  /** Exibir opções em linha (select / multiselect) */
  fl_inline?: 'SIM' | 'NAO'
  /** Largura em colunas do grid (3 | 4 | 6 | 12) */
  nr_colunas?: number
  /** Campo da entidade vinculada para preenchimento automático (ex: "nome_pessoa") */
  nm_campo_auto?: string | null
}

interface Questionnaire {
  id_questionario?: number
  titulo: string
  descricao?: string
  versao: number
  fl_ativo: 'SIM' | 'NAO'
  ds_contexto?: string
}

interface Props {
  objectDef: ObjectDefinition
}

// ─── Catálogo de tipos ────────────────────────────────────────────────────────

const QUESTION_TYPES: { value: QuestionType; label: string; icon: string }[] = [
  { value: 'section',     label: 'Seção / Separador',   icon: 'bi-layout-text-sidebar' },
  { value: 'text',        label: 'Texto curto',          icon: 'bi-input-cursor-text' },
  { value: 'textarea',    label: 'Texto longo',          icon: 'bi-textarea-t' },
  { value: 'number',      label: 'Número',               icon: 'bi-123' },
  { value: 'money',       label: 'Valor monetário',      icon: 'bi-cash-coin' },
  { value: 'date',        label: 'Data',                 icon: 'bi-calendar-date' },
  { value: 'datetime',    label: 'Data e Hora',          icon: 'bi-calendar-event' },
  { value: 'boolean',     label: 'Sim / Não',            icon: 'bi-toggle-on' },
  { value: 'select',      label: 'Seleção simples',      icon: 'bi-ui-radios' },
  { value: 'multiselect', label: 'Multi-seleção',        icon: 'bi-ui-checks-grid' },
  { value: 'scale',       label: 'Escala / Likert',      icon: 'bi-sliders' },
  { value: 'file',        label: 'Anexo / Arquivo',      icon: 'bi-paperclip' },
]

function getTypeInfo(type: QuestionType) {
  return QUESTION_TYPES.find((t) => t.value === type) ?? QUESTION_TYPES[1]
}

// ─── QuestionarioBuilderObject ────────────────────────────────────────────────

export function QuestionarioBuilderObject({ objectDef }: Props) {
  const { screenParams, initialParams = {} } = useViewContext()
  const queryClient = useQueryClient()
  const toast = useToast()
  const { confirm, confirmDialog } = useConfirm()

  const def = objectDef as ObjectDefinition & Record<string, unknown>
  const questionarioEntity = String(def.questionarioEntity ?? 'questionario')
  const perguntaEntity     = String(def.perguntaEntity ?? 'questionarioPergunta')

  // ID do questionário — vem de initialParams (navegação via action "edit")
  // ou de screenParams (parâmetro SSO) como fallback
  const idFromParams = initialParams['id_questionario'] ?? screenParams['id_questionario']
  const [currentId, setCurrentId] = useState<number | null>(
    idFromParams ? Number(idFromParams) : null,
  )

  // ── Metadata state ────────────────────────────────────────────────────────
  const [editingMeta, setEditingMeta]   = useState(false)
  const [metaTitulo,    setMetaTitulo]    = useState('')
  const [metaDescricao, setMetaDescricao] = useState('')
  const [metaAtivo,     setMetaAtivo]     = useState<'SIM' | 'NAO'>('SIM')
  const [metaContexto,  setMetaContexto]  = useState('')

  // ── Question editor state ─────────────────────────────────────────────────
  type FormMode = 'idle' | 'create' | 'edit'
  const [formMode,    setFormMode]    = useState<FormMode>('idle')
  const [selectedId,  setSelectedId]  = useState<number | null>(null)
  const [fTexto,      setFTexto]      = useState('')
  const [fAjuda,      setFAjuda]      = useState('')
  const [fTipo,       setFTipo]       = useState<QuestionType>('text')
  const [fObrigatorio, setFObrigatorio] = useState(false)
  const [fPlaceholder, setFPlaceholder] = useState('')
  const [fOpcoes,     setFOpcoes]     = useState<QuestionOption[]>([])
  const [fScale,      setFScale]      = useState<ScaleConfig>({ min: 1, max: 5 })
  const [fCondicional, setFCondicional] = useState<Conditional | null>(null)
  const [fInline,     setFInline]     = useState(false)
  const [fColunas,    setFColunas]    = useState<3 | 4 | 6 | 12>(12)
  const [fCampoAuto,  setFCampoAuto]  = useState('')
  const [fError,      setFError]      = useState<string | null>(null)

  // ── Queries ───────────────────────────────────────────────────────────────

  const { data: questionnaireData } = useQuery<Questionnaire | null>({
    queryKey: ['entity', questionarioEntity, 'single', currentId],
    queryFn: async () => {
      if (!currentId) return null
      const res = await entityApi.getList<EntityRecord>(questionarioEntity, {
        id_questionario: currentId, pageSize: 1,
      })
      const items = (res as { data?: EntityRecord[] }).data ?? (Array.isArray(res) ? (res as EntityRecord[]) : [])
      if (!items.length) return null
      const item = items[0]
      return {
        id_questionario: item['id_questionario'] as number,
        titulo:      String(item['titulo'] ?? ''),
        descricao:   item['descricao'] ? String(item['descricao']) : '',
        versao:      Number(item['versao'] ?? 1),
        fl_ativo:    (String(item['fl_ativo'] ?? 'SIM')) as 'SIM' | 'NAO',
        ds_contexto: item['ds_contexto'] ? String(item['ds_contexto']) : undefined,
      }
    },
    enabled: currentId !== null,
  })

  const { data: questions = [], isLoading: loadingQuestions, isError: questionsError } = useQuery<Question[]>({
    queryKey: ['entity', perguntaEntity, 'list', currentId],
    queryFn: async () => {
      if (!currentId) return []
      const res = await entityApi.getList<EntityRecord>(perguntaEntity, {
        id_questionario: currentId,
        pageSize: 999,
        orderBy: 'nr_ordem',
      })
      const items = (res as { data?: EntityRecord[] }).data ?? (Array.isArray(res) ? (res as EntityRecord[]) : [])

      return items.map((item): Question => {
        // ds_opcoes e ds_condicional são armazenados como STRING no banco — faz parse seguro
        const parseJson = (val: unknown) => {
          if (!val) return null
          if (typeof val === 'string') {
            try { return JSON.parse(val) } catch { return null }
          }
          return val
        }

        return {
          id_pergunta:     item['id_pergunta'] as number,
          id_questionario: item['id_questionario'] as number,
          nr_ordem:        Number(item['nr_ordem'] ?? 0),
          ds_texto:        String(item['ds_texto'] ?? ''),
          ds_ajuda:        item['ds_ajuda'] ? String(item['ds_ajuda']) : undefined,
          tp_resposta:     String(item['tp_resposta'] ?? 'text') as QuestionType,
          fl_obrigatorio:  String(item['fl_obrigatorio'] ?? 'NAO') as 'SIM' | 'NAO',
          ds_opcoes:       parseJson(item['ds_opcoes']) as QuestionOption[] | ScaleConfig | null,
          ds_condicional:  parseJson(item['ds_condicional']) as Conditional | null,
          ds_placeholder:  item['ds_placeholder'] ? String(item['ds_placeholder']) : null,
          fl_inline:       String(item['fl_inline'] ?? 'NAO') as 'SIM' | 'NAO',
          nr_colunas:      item['nr_colunas'] ? Number(item['nr_colunas']) : 12,
          nm_campo_auto:   item['nm_campo_auto'] ? String(item['nm_campo_auto']) : null,
        }
      })
    },
    enabled: currentId !== null && !isNaN(currentId),
  })

  // Sincroniza metadados para o form de edição
  useEffect(() => {
    if (questionnaireData) {
      setMetaTitulo(questionnaireData.titulo)
      setMetaDescricao(questionnaireData.descricao ?? '')
      setMetaAtivo(questionnaireData.fl_ativo)
      setMetaContexto(questionnaireData.ds_contexto ?? '')
    }
  }, [questionnaireData])

  const selectedQuestion = questions.find((q) => q.id_pergunta === selectedId) ?? null

  // ── Mutations ─────────────────────────────────────────────────────────────

  const saveMetaMutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      if (currentId) {
        return entityApi.update(questionarioEntity, { id_questionario: currentId, ...data })
      }
      return entityApi.create(questionarioEntity, data)
    },
    onSuccess: (result) => {
      const saved = (result as { data?: EntityRecord }).data ?? (result as unknown as EntityRecord)
      const savedId = saved?.['id_questionario'] as number | undefined
      if (savedId) setCurrentId(savedId)
      queryClient.invalidateQueries({ queryKey: ['entity', questionarioEntity] })
      setEditingMeta(false)
      toast.success('Questionário salvo.')
    },
    onError: () => toast.error('Erro ao salvar questionário.'),
  })

  const saveQuestionMutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      if (formMode === 'create') return entityApi.create(perguntaEntity, data)
      return entityApi.update(perguntaEntity, { id_pergunta: selectedId, ...data })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['entity', perguntaEntity, 'list', currentId] })
      toast.success(formMode === 'create' ? 'Pergunta adicionada.' : 'Pergunta atualizada.')
      resetQuestionForm()
    },
    onError: () => toast.error('Erro ao salvar pergunta.'),
  })

  const deleteQuestionMutation = useMutation({
    mutationFn: (id: number) => entityApi.remove(perguntaEntity, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['entity', perguntaEntity, 'list', currentId] })
      toast.success('Pergunta excluída.')
      resetQuestionForm()
    },
    onError: () => toast.error('Erro ao excluir pergunta.'),
  })

  const reorderMutation = useMutation({
    mutationFn: ({ id, ordem }: { id: number; ordem: number }) =>
      entityApi.update(perguntaEntity, { id_pergunta: id, nr_ordem: ordem }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['entity', perguntaEntity, 'list', currentId] })
    },
  })

  // ── Helpers ───────────────────────────────────────────────────────────────

  function resetQuestionForm() {
    setFormMode('idle')
    setSelectedId(null)
    setFTexto('')
    setFAjuda('')
    setFTipo('text')
    setFObrigatorio(false)
    setFPlaceholder('')
    setFOpcoes([])
    setFScale({ min: 1, max: 5 })
    setFCondicional(null)
    setFInline(false)
    setFColunas(12)
    setFCampoAuto('')
    setFError(null)
  }

  function handleSelectQuestion(q: Question) {
    setSelectedId(q.id_pergunta)
    setFormMode('edit')
    setFTexto(q.ds_texto)
    setFAjuda(q.ds_ajuda ?? '')
    setFTipo(q.tp_resposta)
    setFObrigatorio(q.fl_obrigatorio === 'SIM')
    setFPlaceholder(q.ds_placeholder ?? '')
    setFCondicional(q.ds_condicional ?? null)
    setFInline(q.fl_inline === 'SIM')
    setFColunas((q.nr_colunas as 3 | 4 | 6 | 12) ?? 12)
    setFCampoAuto(q.nm_campo_auto ?? '')
    if (q.tp_resposta === 'scale' && q.ds_opcoes && !Array.isArray(q.ds_opcoes)) {
      setFScale(q.ds_opcoes as ScaleConfig)
      setFOpcoes([])
    } else if (Array.isArray(q.ds_opcoes)) {
      setFOpcoes(q.ds_opcoes as QuestionOption[])
      setFScale({ min: 1, max: 5 })
    } else {
      setFOpcoes([])
      setFScale({ min: 1, max: 5 })
    }
    setFError(null)
  }

  function handleNewQuestion() {
    resetQuestionForm()
    setFormMode('create')
    setFTipo('text')
  }

  async function handleMoveUp(q: Question) {
    const idx = questions.indexOf(q)
    if (idx <= 0) return
    const above = questions[idx - 1]
    await Promise.all([
      reorderMutation.mutateAsync({ id: q.id_pergunta,     ordem: above.nr_ordem }),
      reorderMutation.mutateAsync({ id: above.id_pergunta, ordem: q.nr_ordem }),
    ])
  }

  async function handleMoveDown(q: Question) {
    const idx = questions.indexOf(q)
    if (idx >= questions.length - 1) return
    const below = questions[idx + 1]
    await Promise.all([
      reorderMutation.mutateAsync({ id: q.id_pergunta,     ordem: below.nr_ordem }),
      reorderMutation.mutateAsync({ id: below.id_pergunta, ordem: q.nr_ordem }),
    ])
  }

  async function handleDeleteQuestion(q: Question) {
    if (await confirm(`Excluir a pergunta "${q.ds_texto}"?`)) {
      deleteQuestionMutation.mutate(q.id_pergunta)
    }
  }

  function handleSubmitQuestion(e: React.FormEvent) {
    e.preventDefault()
    setFError(null)

    if (!fTexto.trim()) {
      setFError(fTipo === 'section' ? 'O título da seção é obrigatório.' : 'O texto da pergunta é obrigatório.')
      return
    }
    if ((fTipo === 'select' || fTipo === 'multiselect') && fOpcoes.length === 0) {
      setFError('Adicione ao menos uma opção.')
      return
    }
    if ((fTipo === 'select' || fTipo === 'multiselect') && fOpcoes.some((o) => !o.label.trim())) {
      setFError('Todas as opções precisam ter uma descrição.')
      return
    }

    const nextOrder =
      formMode === 'create'
        ? (questions.length > 0 ? Math.max(...questions.map((q) => q.nr_ordem)) + 10 : 10)
        : selectedQuestion?.nr_ordem ?? 10

    let opcoes: QuestionOption[] | ScaleConfig | null = null
    if (fTipo === 'scale')                                     opcoes = fScale
    else if (fTipo === 'select' || fTipo === 'multiselect')    opcoes = fOpcoes
    // outros tipos não têm opções

    saveQuestionMutation.mutate({
      id_questionario: currentId,
      nr_ordem:        nextOrder,
      ds_texto:        fTexto.trim(),
      ds_ajuda:        fAjuda.trim() || null,
      tp_resposta:     fTipo,
      fl_obrigatorio:  fObrigatorio ? 'SIM' : 'NAO',
      // ds_opcoes e ds_condicional são STRING no banco — serializar antes de enviar
      ds_opcoes:       opcoes !== null ? JSON.stringify(opcoes) : null,
      ds_condicional:  fCondicional?.id_pergunta ? JSON.stringify(fCondicional) : null,
      ds_placeholder:  fPlaceholder.trim() || null,
      fl_inline:       (fTipo === 'select' || fTipo === 'multiselect') ? (fInline ? 'SIM' : 'NAO') : 'NAO',
      nr_colunas:      fColunas,
      nm_campo_auto:   fTipo !== 'section' ? (fCampoAuto.trim() || null) : null,
    })
  }

  // ── Options helpers ───────────────────────────────────────────────────────

  function addOption() {
    setFOpcoes((prev) => [...prev, { valor: String(prev.length + 1), label: '' }])
  }

  function updateOption(idx: number, field: keyof QuestionOption, value: string | number) {
    setFOpcoes((prev) => prev.map((opt, i) => (i === idx ? { ...opt, [field]: value } : opt)))
  }

  function removeOption(idx: number) {
    setFOpcoes((prev) => prev.filter((_, i) => i !== idx))
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  // Sem questionário carregado → form de criação
  if (!currentId && !questionnaireData) {
    return (
      <div style={objectDef.style as React.CSSProperties}>
        {confirmDialog}
        <div className="max-w-lg mx-auto rounded-md border border-border bg-background p-6 space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <i className="bi bi-ui-checks text-xl text-primary" />
            <h3 className="text-sm font-semibold">Novo Questionário</h3>
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">
              Título <span className="text-destructive">*</span>
            </label>
            <input
              type="text"
              value={metaTitulo}
              onChange={(e) => setMetaTitulo(e.target.value)}
              placeholder="Ex: Ficha de Avaliação do Residente"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              autoFocus
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium text-muted-foreground">Descrição</label>
            <textarea
              value={metaDescricao}
              onChange={(e) => setMetaDescricao(e.target.value)}
              rows={3}
              placeholder="Instruções gerais para o preenchimento (opcional)"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium text-muted-foreground">Contexto</label>
            <input
              type="text"
              value={metaContexto}
              onChange={(e) => setMetaContexto(e.target.value)}
              placeholder="Ex: paciente, financeiro, consulta"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <p className="text-xs text-muted-foreground">Identifica em qual tela/seção este questionário deve aparecer automaticamente.</p>
          </div>
          <button
            type="button"
            disabled={!metaTitulo.trim() || saveMetaMutation.isPending}
            onClick={() =>
              saveMetaMutation.mutate({
                titulo:      metaTitulo.trim(),
                descricao:   metaDescricao.trim() || null,
                ds_contexto: metaContexto.trim() || null,
                fl_ativo: 'SIM',
                versao: 1,
              })
            }
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors cursor-pointer"
          >
            {saveMetaMutation.isPending ? 'Criando...' : 'Criar Questionário'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={objectDef.style as React.CSSProperties}>
      {confirmDialog}

      {/* ── Cabeçalho do questionário ─────────────────────────────────────── */}
      <div className="mb-4 rounded-md border border-border bg-background p-4">
        {editingMeta ? (
          <div className="space-y-3">
            <div className="flex gap-3 flex-wrap">
              <div className="flex-1 min-w-0 space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Título *</label>
                <input
                  type="text"
                  value={metaTitulo}
                  onChange={(e) => setMetaTitulo(e.target.value)}
                  autoFocus
                  className="w-full rounded border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <label className="flex items-center gap-1.5 self-end mb-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={metaAtivo === 'SIM'}
                  onChange={(e) => setMetaAtivo(e.target.checked ? 'SIM' : 'NAO')}
                  className="rounded"
                />
                <span className="text-sm">Ativo</span>
              </label>
            </div>
            <textarea
              value={metaDescricao}
              onChange={(e) => setMetaDescricao(e.target.value)}
              rows={2}
              placeholder="Descrição (opcional)"
              className="w-full rounded border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
            />
            <input
              type="text"
              value={metaContexto}
              onChange={(e) => setMetaContexto(e.target.value)}
              placeholder="Contexto (ex: paciente, financeiro)"
              className="w-full rounded border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <div className="flex gap-2">
              <button
                type="button"
                disabled={saveMetaMutation.isPending}
                onClick={() =>
                  saveMetaMutation.mutate({
                    titulo:      metaTitulo.trim(),
                    descricao:   metaDescricao.trim() || null,
                    ds_contexto: metaContexto.trim() || null,
                    fl_ativo:    metaAtivo,
                  })
                }
                className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors cursor-pointer"
              >
                {saveMetaMutation.isPending ? 'Salvando...' : 'Salvar'}
              </button>
              <button
                type="button"
                onClick={() => setEditingMeta(false)}
                className="rounded-md border border-border px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent transition-colors cursor-pointer"
              >
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-start gap-3">
            <i className="bi bi-ui-checks text-xl text-primary mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm font-semibold text-foreground">
                  {questionnaireData?.titulo ?? '…'}
                </h3>
                <span className="text-xs text-muted-foreground">
                  v{questionnaireData?.versao ?? 1}
                </span>
                <span
                  className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${
                    questionnaireData?.fl_ativo === 'SIM'
                      ? 'bg-green-100 text-green-700'
                      : 'bg-gray-100 text-gray-600'
                  }`}
                >
                  {questionnaireData?.fl_ativo === 'SIM' ? 'Ativo' : 'Inativo'}
                </span>
              </div>
              {questionnaireData?.descricao && (
                <p className="text-xs text-muted-foreground mt-0.5 truncate">
                  {questionnaireData.descricao}
                </p>
              )}
              {questionnaireData?.ds_contexto && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  <span className="font-medium">Contexto:</span>{' '}
                  <code className="rounded bg-muted px-1 font-mono">{questionnaireData.ds_contexto}</code>
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => setEditingMeta(true)}
              className="shrink-0 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <i className="bi bi-pencil" /> Editar
            </button>
          </div>
        )}
      </div>

      {/* ── Two-panel layout ───────────────────────────────────────────────── */}
      <div className="grid grid-cols-12 gap-4">

        {/* ── Painel esquerdo: lista de perguntas ─────────────────────────── */}
        <div className="col-span-12 md:col-span-5 flex flex-col">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">
              {questions.length} pergunta{questions.length !== 1 ? 's' : ''}
            </span>
            <button
              type="button"
              disabled={!currentId}
              onClick={handleNewQuestion}
              className="flex items-center gap-1 rounded-md bg-primary px-2 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors cursor-pointer"
            >
              <i className="bi bi-plus" />
              Nova Pergunta
            </button>
          </div>

          <div
            className="overflow-y-auto rounded-md border border-border bg-background divide-y divide-border/40"
            style={{ maxHeight: 'calc(100vh - 280px)', minHeight: '300px' }}
          >
            {loadingQuestions ? (
              <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                Carregando…
              </div>
            ) : questionsError ? (
              <div className="flex flex-col items-center justify-center py-8 text-sm text-destructive gap-1">
                <i className="bi bi-exclamation-triangle text-2xl opacity-60" />
                Erro ao carregar perguntas.
                <span className="text-xs text-muted-foreground">Verifique se a entidade <code className="font-mono">{perguntaEntity}</code> existe no backend.</span>
              </div>
            ) : questions.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-sm text-muted-foreground select-none">
                <i className="bi bi-question-circle text-3xl mb-2 opacity-30" />
                Nenhuma pergunta ainda.
                <button
                  type="button"
                  onClick={handleNewQuestion}
                  className="mt-2 text-primary underline text-xs"
                >
                  Adicionar primeira pergunta
                </button>
              </div>
            ) : (
              questions.map((q, idx) => {
                const typeInfo = getTypeInfo(q.tp_resposta)
                const isSelected  = q.id_pergunta === selectedId
                const isSection   = q.tp_resposta === 'section'

                return (
                  <div
                    key={q.id_pergunta}
                    onClick={() => handleSelectQuestion(q)}
                    className={[
                      'group flex items-start gap-2 px-3 py-2.5 cursor-pointer transition-colors',
                      isSelected  ? 'bg-primary/10'   : 'hover:bg-muted/50',
                      isSection   ? 'bg-muted/30'     : '',
                    ].join(' ')}
                  >
                    {/* Reorder ↑↓ */}
                    <div className="flex flex-col shrink-0 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity gap-px">
                      <button
                        type="button"
                        disabled={idx === 0}
                        onClick={(e) => { e.stopPropagation(); void handleMoveUp(q) }}
                        className="h-4 w-4 flex items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"
                        tabIndex={-1}
                      >
                        <i className="bi bi-chevron-up text-[10px]" />
                      </button>
                      <button
                        type="button"
                        disabled={idx === questions.length - 1}
                        onClick={(e) => { e.stopPropagation(); void handleMoveDown(q) }}
                        className="h-4 w-4 flex items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"
                        tabIndex={-1}
                      >
                        <i className="bi bi-chevron-down text-[10px]" />
                      </button>
                    </div>

                    {/* Type icon */}
                    <i
                      className={`bi ${typeInfo.icon} text-sm shrink-0 mt-0.5 ${
                        isSelected ? 'text-primary' : 'text-muted-foreground'
                      }`}
                    />

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      {isSection ? (
                        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                          {q.ds_texto}
                        </span>
                      ) : (
                        <>
                          <span
                            className={`text-sm truncate block ${
                              isSelected ? 'text-primary font-medium' : 'text-foreground'
                            }`}
                          >
                            {q.ds_texto}
                            {q.fl_obrigatorio === 'SIM' && (
                              <span className="text-destructive ml-0.5">*</span>
                            )}
                          </span>
                          <span className="text-xs text-muted-foreground">{typeInfo.label}</span>
                        </>
                      )}
                    </div>

                    {/* Delete */}
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); void handleDeleteQuestion(q) }}
                      className="shrink-0 h-5 w-5 flex items-center justify-center opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all"
                      tabIndex={-1}
                    >
                      <i className="bi bi-trash text-xs" />
                    </button>
                  </div>
                )
              })
            )}
          </div>
        </div>

        {/* ── Painel direito: editor de pergunta ──────────────────────────── */}
        <div className="col-span-12 md:col-span-7 min-w-0">
          <div className="md:sticky md:top-4">
            {formMode === 'idle' ? (
              <div
                className="flex items-center justify-center rounded-md border border-dashed border-border text-sm text-muted-foreground select-none"
                style={{ minHeight: '340px' }}
              >
                <div className="text-center px-6 py-8">
                  <i className="bi bi-question-circle block text-5xl mb-3 opacity-20" />
                  <p className="font-medium text-foreground/70 mb-1">
                    Nenhuma pergunta selecionada
                  </p>
                  <p className="text-xs leading-relaxed">
                    Clique em uma pergunta para editar<br />
                    ou em <span className="font-medium">Nova Pergunta</span> para criar
                  </p>
                </div>
              </div>
            ) : (
              <form
                onSubmit={handleSubmitQuestion}
                className="rounded-md border border-border bg-background p-5 space-y-4 overflow-y-auto"
                style={{ maxHeight: 'calc(100vh - 220px)' }}
              >
                {/* Header */}
                <div className="flex items-center gap-2">
                  <i
                    className={`bi ${
                      formMode === 'create' ? 'bi-plus-circle text-primary' : 'bi-pencil text-muted-foreground'
                    } text-sm`}
                  />
                  <h4 className="text-sm font-semibold">
                    {formMode === 'create' ? 'Nova Pergunta' : 'Editar Pergunta'}
                  </h4>
                </div>

                {/* Tipo */}
                <div className="space-y-1">
                  <label className="text-sm font-medium">Tipo</label>
                  <select
                    value={fTipo}
                    onChange={(e) => {
                      setFTipo(e.target.value as QuestionType)
                      setFOpcoes([])
                      setFScale({ min: 1, max: 5 })
                    }}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    {QUESTION_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </div>

                {/* Texto da pergunta */}
                <div className="space-y-1">
                  <label className="text-sm font-medium">
                    {fTipo === 'section' ? 'Título da Seção' : 'Pergunta'}{' '}
                    <span className="text-destructive">*</span>
                  </label>
                  <input
                    type="text"
                    value={fTexto}
                    onChange={(e) => setFTexto(e.target.value)}
                    placeholder={
                      fTipo === 'section'
                        ? 'Ex: Dados de Saúde'
                        : 'Ex: Qual é o seu nome completo?'
                    }
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    autoFocus
                  />
                </div>

                {/* Campos apenas para não-seção */}
                {fTipo !== 'section' && (
                  <>
                    {/* Ajuda */}
                    <div className="space-y-1">
                      <label className="text-sm font-medium text-muted-foreground">
                        Texto de Ajuda
                      </label>
                      <input
                        type="text"
                        value={fAjuda}
                        onChange={(e) => setFAjuda(e.target.value)}
                        placeholder="Instrução adicional exibida abaixo da pergunta"
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                      />
                    </div>

                    {/* Placeholder (tipos de entrada livre) */}
                    {['text', 'textarea', 'number', 'money'].includes(fTipo) && (
                      <div className="space-y-1">
                        <label className="text-sm font-medium text-muted-foreground">
                          Placeholder
                        </label>
                        <input
                          type="text"
                          value={fPlaceholder}
                          onChange={(e) => setFPlaceholder(e.target.value)}
                          placeholder="Texto de exemplo exibido no campo vazio"
                          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                        />
                      </div>
                    )}

                    {/* Obrigatório */}
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={fObrigatorio}
                        onChange={(e) => setFObrigatorio(e.target.checked)}
                        className="rounded border-input"
                      />
                      <span className="text-sm font-medium">Resposta obrigatória</span>
                    </label>

                    {/* Campo automático — só para tipos que não sejam section */}
                    {fTipo !== 'section' && (
                      <div className="space-y-1">
                        <label className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
                          <i className="bi bi-link-45deg text-primary" />
                          Preenchimento automático
                        </label>
                        <input
                          type="text"
                          value={fCampoAuto}
                          onChange={(e) => setFCampoAuto(e.target.value)}
                          placeholder="Ex: nome_pessoa, logradouro, quarto…"
                          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring font-mono"
                        />
                        <p className="text-[11px] text-muted-foreground">
                          Nome do campo da entidade vinculada. Quando preenchido, a resposta é preenchida automaticamente e bloqueada para edição.
                        </p>
                      </div>
                    )}

                    {/* Largura em colunas */}
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium text-muted-foreground">Largura na tela</label>
                      <div className="flex gap-1.5">
                        {([3, 4, 6, 12] as const).map((col) => (
                          <button
                            key={col}
                            type="button"
                            onClick={() => setFColunas(col)}
                            className={[
                              'flex-1 rounded-md border py-1.5 text-xs font-medium transition-colors cursor-pointer',
                              fColunas === col
                                ? 'bg-primary text-primary-foreground border-primary'
                                : 'border-input text-muted-foreground hover:bg-muted',
                            ].join(' ')}
                          >
                            {col === 3 ? '1/4' : col === 4 ? '1/3' : col === 6 ? '1/2' : 'Inteiro'}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Editor de opções — select / multiselect */}
                    {(fTipo === 'select' || fTipo === 'multiselect') && (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <label className="text-sm font-medium">Opções</label>
                        </div>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={fInline}
                            onChange={(e) => setFInline(e.target.checked)}
                            className="rounded border-input"
                          />
                          <span className="text-sm text-muted-foreground">Exibir opções em linha</span>
                        </label>
                        <div className="flex items-center justify-between">
                          <span />
                          <button
                            type="button"
                            onClick={addOption}
                            className="text-xs text-primary hover:underline flex items-center gap-0.5"
                          >
                            <i className="bi bi-plus" /> Adicionar opção
                          </button>
                        </div>
                        {fOpcoes.length === 0 ? (
                          <div className="rounded-md border border-dashed border-border py-4 text-center text-xs text-muted-foreground">
                            Nenhuma opção. Clique em "Adicionar opção".
                          </div>
                        ) : (
                          <>
                            <div className="grid grid-cols-[5rem_1fr_4rem_1.5rem] gap-1 px-1">
                              <span className="text-[11px] text-muted-foreground">Valor</span>
                              <span className="text-[11px] text-muted-foreground">Descrição</span>
                              <span className="text-[11px] text-muted-foreground">Peso</span>
                              <span />
                            </div>
                            <div className="space-y-1.5 max-h-44 overflow-y-auto">
                              {fOpcoes.map((opt, idx) => (
                                <div key={idx} className="grid grid-cols-[5rem_1fr_4rem_1.5rem] items-center gap-1">
                                  <input
                                    type="text"
                                    value={opt.valor}
                                    onChange={(e) => updateOption(idx, 'valor', e.target.value)}
                                    placeholder="valor"
                                    className="rounded border border-input bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                                  />
                                  <input
                                    type="text"
                                    value={opt.label}
                                    onChange={(e) => updateOption(idx, 'label', e.target.value)}
                                    placeholder="Descrição"
                                    className="rounded border border-input bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                                  />
                                  <input
                                    type="number"
                                    value={opt.peso ?? ''}
                                    onChange={(e) =>
                                      updateOption(idx, 'peso', e.target.value !== '' ? Number(e.target.value) : ('' as unknown as number))
                                    }
                                    placeholder="—"
                                    className="rounded border border-input bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => removeOption(idx)}
                                    className="text-muted-foreground hover:text-destructive transition-colors"
                                    tabIndex={-1}
                                  >
                                    <i className="bi bi-x text-sm" />
                                  </button>
                                </div>
                              ))}
                            </div>
                            <p className="text-xs text-muted-foreground">
                              Peso é opcional — usado para pontuação automática.
                            </p>
                          </>
                        )}
                      </div>
                    )}

                    {/* Configuração de escala */}
                    {fTipo === 'scale' && (
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Configuração da Escala</label>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <label className="text-xs text-muted-foreground">Mínimo</label>
                            <input
                              type="number"
                              value={fScale.min}
                              onChange={(e) => setFScale((s) => ({ ...s, min: Number(e.target.value) }))}
                              className="w-full rounded border border-input bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-xs text-muted-foreground">Máximo</label>
                            <input
                              type="number"
                              value={fScale.max}
                              onChange={(e) => setFScale((s) => ({ ...s, max: Number(e.target.value) }))}
                              className="w-full rounded border border-input bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-xs text-muted-foreground">Rótulo mínimo</label>
                            <input
                              type="text"
                              value={fScale.labelMin ?? ''}
                              onChange={(e) => setFScale((s) => ({ ...s, labelMin: e.target.value }))}
                              placeholder="Ex: Péssimo"
                              className="w-full rounded border border-input bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-xs text-muted-foreground">Rótulo máximo</label>
                            <input
                              type="text"
                              value={fScale.labelMax ?? ''}
                              onChange={(e) => setFScale((s) => ({ ...s, labelMax: e.target.value }))}
                              placeholder="Ex: Excelente"
                              className="w-full rounded border border-input bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                            />
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Lógica condicional */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-sm font-medium text-muted-foreground">
                          Exibir somente se…
                        </label>
                        {fCondicional ? (
                          <button
                            type="button"
                            onClick={() => setFCondicional(null)}
                            className="text-xs text-destructive hover:underline"
                          >
                            Remover condição
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() =>
                              setFCondicional({ id_pergunta: 0, operador: 'eq', valor: '' })
                            }
                            className="text-xs text-primary hover:underline"
                          >
                            + Adicionar condição
                          </button>
                        )}
                      </div>
                      {fCondicional && (
                        <div className="rounded-md border border-primary/30 bg-primary/5 p-3 space-y-2">
                          <div className="space-y-1">
                            <label className="text-xs text-muted-foreground">Pergunta gatilho</label>
                            <select
                              value={fCondicional.id_pergunta}
                              onChange={(e) =>
                                setFCondicional((c) =>
                                  c ? { ...c, id_pergunta: Number(e.target.value) } : c,
                                )
                              }
                              className="w-full rounded border border-input bg-background px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                            >
                              <option value={0}>Selecione uma pergunta…</option>
                              {questions
                                .filter(
                                  (q) =>
                                    q.id_pergunta !== selectedId &&
                                    q.tp_resposta !== 'section',
                                )
                                .map((q) => (
                                  <option key={q.id_pergunta} value={q.id_pergunta}>
                                    {q.ds_texto}
                                  </option>
                                ))}
                            </select>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-1">
                              <label className="text-xs text-muted-foreground">Operador</label>
                              <select
                                value={fCondicional.operador}
                                onChange={(e) =>
                                  setFCondicional((c) =>
                                    c
                                      ? { ...c, operador: e.target.value as 'eq' | 'neq' | 'contains' }
                                      : c,
                                  )
                                }
                                className="w-full rounded border border-input bg-background px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                              >
                                <option value="eq">É igual a</option>
                                <option value="neq">É diferente de</option>
                                <option value="contains">Contém</option>
                              </select>
                            </div>
                            <div className="space-y-1">
                              <label className="text-xs text-muted-foreground">Valor esperado</label>
                              <input
                                type="text"
                                value={fCondicional.valor}
                                onChange={(e) =>
                                  setFCondicional((c) => (c ? { ...c, valor: e.target.value } : c))
                                }
                                placeholder="Ex: sim"
                                className="w-full rounded border border-input bg-background px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                              />
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </>
                )}

                {/* Erro */}
                {fError && (
                  <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
                    <i className="bi bi-exclamation-triangle mr-1" />
                    {fError}
                  </p>
                )}

                {/* Botões */}
                <div className="flex gap-2 pt-1 border-t border-border">
                  <button
                    type="submit"
                    disabled={saveQuestionMutation.isPending}
                    className="rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors cursor-pointer"
                  >
                    {saveQuestionMutation.isPending ? 'Salvando…' : 'Salvar'}
                  </button>
                  <button
                    type="button"
                    onClick={resetQuestionForm}
                    className="rounded-md border border-border px-4 py-1.5 text-sm text-muted-foreground hover:bg-accent transition-colors cursor-pointer"
                  >
                    Cancelar
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
