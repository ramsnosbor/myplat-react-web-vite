import { useState, useEffect, useRef, useCallback } from 'react'
import { useWatch } from 'react-hook-form'
import type { Control } from 'react-hook-form'
import { useQuery, useMutation } from '@tanstack/react-query'
import { entityApi } from '@/api/entity.api'
import type { EntityRecord } from '@/types/entity.types'
import type { ComponentDefinition } from '@/types/view.types'
import { useViewContext } from '../ViewContext'
import type { Question, QuestionOption, ScaleConfig } from '../objects/QuestionarioBuilderObject'

// ─── Tipos ────────────────────────────────────────────────────────────────────

type AnswerValue = string | number | string[] | null

interface SharedProps {
  entidadeRef: string
  idRefField: string
  perguntaEntity: string
  respostaEntity: string
  respostaItemEntity: string
  control: Control<Record<string, unknown>>
  mode: 'create' | 'edit' | 'detail'
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const parseJson = (val: unknown) => {
  if (!val) return null
  if (typeof val === 'string') { try { return JSON.parse(val) } catch { return null } }
  return val
}

function toItemPayload(q: Question, value: AnswerValue): Record<string, unknown> {
  const empty = { vl_texto: null, vl_numero: null, vl_data: null, vl_datetime: null, vl_json: null }
  if (value === null || value === '' || (Array.isArray(value) && value.length === 0)) return empty
  switch (q.tp_resposta) {
    case 'number': case 'money': case 'scale':
      return { ...empty, vl_numero: Number(value) }
    case 'date':
      return { ...empty, vl_data: String(value) }
    case 'datetime':
      return { ...empty, vl_datetime: String(value) }
    case 'multiselect':
      return { ...empty, vl_json: value as string[] }
    default:
      return { ...empty, vl_texto: String(value) }
  }
}

function fromItemPayload(q: Question, item: EntityRecord): AnswerValue {
  switch (q.tp_resposta) {
    case 'number': case 'money': case 'scale':
      return item['vl_numero'] != null ? Number(item['vl_numero']) : null
    case 'date':
      return item['vl_data'] ? String(item['vl_data']) : null
    case 'datetime':
      return item['vl_datetime'] ? String(item['vl_datetime']) : null
    case 'multiselect': {
      const raw = item['vl_json']
      if (Array.isArray(raw)) return raw as string[]
      if (typeof raw === 'string') { try { return JSON.parse(raw) as string[] } catch { return null } }
      return null
    }
    default:
      return item['vl_texto'] ? String(item['vl_texto']) : null
  }
}

// ─── QuestionarioInlineComponent — roteador de prioridade ────────────────────
// Prioridade: idQuestionario (fixo) → idQuestionarioParam (screenParam) → contexto (ds_contexto)

export function QuestionarioInlineComponent({ component: comp, control, mode = 'create' }: {
  component: ComponentDefinition
  control: Control<Record<string, unknown>>
  mode?: 'create' | 'edit' | 'detail'
}) {
  const def = comp as ComponentDefinition & Record<string, unknown>
  const { screenParams } = useViewContext()

  const sharedProps: SharedProps = {
    entidadeRef:       String(def.entidadeRef        ?? ''),
    idRefField:        String(def.idRefField         ?? ''),
    perguntaEntity:    String(def.perguntaEntity     ?? 'questionarioPergunta'),
    respostaEntity:    String(def.respostaEntity     ?? 'questionarioResposta'),
    respostaItemEntity: String(def.respostaItemEntity ?? 'questionarioRespostaItem'),
    control,
    mode,
  }

  // Prioridade 1: ID fixo no JSON
  const idFixed = def.idQuestionario ? Number(def.idQuestionario) : null

  // Prioridade 2: parâmetro de sistema
  const paramName = def.idQuestionarioParam ? String(def.idQuestionarioParam) : null
  const idFromParam = paramName && screenParams[paramName] ? Number(screenParams[paramName]) : null

  // Prioridade 3: contexto (busca automática pelo ds_contexto)
  const contexto = def.contexto ? String(def.contexto) : null

  const singleId = idFixed ?? idFromParam

  if (singleId) {
    return (
      <QuestionarioSection
        idQuestionario={singleId}
        sectionTitle={def.sectionTitle ? String(def.sectionTitle) : undefined}
        {...sharedProps}
      />
    )
  }

  if (contexto) {
    return (
      <ContextoQuestionarios
        contexto={contexto}
        questionarioEntity={String(def.questionarioEntity ?? 'questionario')}
        {...sharedProps}
      />
    )
  }

  return null
}

// ─── ContextoQuestionarios — busca todos os questionários do contexto ─────────

function ContextoQuestionarios({ contexto, questionarioEntity, ...sharedProps }: SharedProps & {
  contexto: string
  questionarioEntity: string
}) {
  const { data: questionarios = [], isLoading } = useQuery<EntityRecord[]>({
    queryKey: ['questionarioInline', 'by-contexto', contexto],
    queryFn: async () => {
      const res = await entityApi.getList<EntityRecord>(questionarioEntity, {
        ds_contexto: contexto,
        fl_ativo: 'SIM',
        pageSize: 50,
        orderBy: 'titulo',
      })
      return (res as { data?: EntityRecord[] }).data ?? (Array.isArray(res) ? (res as EntityRecord[]) : [])
    },
    staleTime: 300_000,
  })

  if (isLoading) {
    return (
      <div className="col-span-12 flex items-center gap-2 py-3 text-xs text-muted-foreground">
        <div className="h-3 w-3 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        Carregando questionários…
      </div>
    )
  }

  if (!questionarios.length) return null

  return (
    <>
      {questionarios.map(q => (
        <QuestionarioSection
          key={String(q['id_questionario'])}
          idQuestionario={Number(q['id_questionario'])}
          sectionTitle={String(q['titulo'] ?? '')}
          {...sharedProps}
        />
      ))}
    </>
  )
}

// ─── QuestionarioSection — renderiza um questionário inline ──────────────────

function QuestionarioSection({
  idQuestionario,
  sectionTitle,
  entidadeRef,
  idRefField,
  perguntaEntity,
  respostaEntity,
  respostaItemEntity,
  control,
  mode,
}: SharedProps & { idQuestionario: number; sectionTitle?: string }) {
  const isDetail = mode === 'detail'

  // PK da entidade pai — vem do formulário do CrudObject
  const idRefRaw = useWatch({ control, name: idRefField }) as unknown
  const idRef    = idRefRaw != null && idRefRaw !== '' ? Number(idRefRaw) : null

  // ── Perguntas ──────────────────────────────────────────────────────────────
  const { data: questions = [], isLoading: loadingQ } = useQuery<Question[]>({
    queryKey: ['questionarioInline', 'perguntas', idQuestionario],
    queryFn: async () => {
      const res = await entityApi.getList<EntityRecord>(perguntaEntity, {
        id_questionario: idQuestionario, pageSize: 999, orderBy: 'nr_ordem',
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
        ds_condicional:  parseJson(item['ds_condicional']) as Question['ds_condicional'],
        ds_placeholder:  item['ds_placeholder'] ? String(item['ds_placeholder']) : null,
        fl_inline:       String(item['fl_inline'] ?? 'NAO') as 'SIM' | 'NAO',
        nr_colunas:      item['nr_colunas'] ? Number(item['nr_colunas']) : 12,
        nm_campo_auto:   item['nm_campo_auto'] ? String(item['nm_campo_auto']) : null,
      }))
    },
    enabled: true,
    staleTime: 300_000,
  })

  // ── Resposta existente ────────────────────────────────────────────────────
  const { data: existingResposta } = useQuery<EntityRecord | null>({
    queryKey: ['questionarioInline', 'resposta', idQuestionario, entidadeRef, idRef],
    queryFn: async () => {
      if (!idRef || !entidadeRef) return null
      const res = await entityApi.getList<EntityRecord>(respostaEntity, {
        id_questionario: idQuestionario, ds_entidade_ref: entidadeRef, id_ref: idRef,
        pageSize: 1, orderBy: 'id_resposta,desc',
      })
      const items = (res as { data?: EntityRecord[] }).data ?? (Array.isArray(res) ? (res as EntityRecord[]) : [])
      return items[0] ?? null
    },
    enabled: idRef !== null && entidadeRef !== '',
    staleTime: 0,
  })

  const [respostaId, setRespostaId]   = useState<number | null>(null)
  const [itemMap, setItemMap]         = useState<Map<number, number>>(new Map())
  const [answers, setAnswers]         = useState<Record<number, AnswerValue>>({})
  const [saveStatus, setSaveStatus]   = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const saveTimer                     = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingRef                    = useRef<Record<number, AnswerValue>>({})
  const savedPendingRef               = useRef(false)

  // Carrega itens da resposta
  const { data: existingItems = [] } = useQuery<EntityRecord[]>({
    queryKey: ['questionarioInline', 'items', respostaId],
    queryFn: async () => {
      if (!respostaId) return []
      const res = await entityApi.getList<EntityRecord>(respostaItemEntity, {
        id_resposta: respostaId, pageSize: 999,
      })
      return (res as { data?: EntityRecord[] }).data ?? (Array.isArray(res) ? (res as EntityRecord[]) : [])
    },
    enabled: respostaId !== null,
    staleTime: 0,
  })

  useEffect(() => {
    if (existingResposta) setRespostaId(existingResposta['id_resposta'] as number)
  }, [existingResposta])

  useEffect(() => {
    if (!existingItems.length || !questions.length) return
    const newAnswers: Record<number, AnswerValue> = {}
    const newMap = new Map<number, number>()
    for (const item of existingItems) {
      const pergId = item['id_pergunta'] as number
      const q = questions.find(q => q.id_pergunta === pergId)
      if (q) {
        newAnswers[pergId] = fromItemPayload(q, item)
        newMap.set(pergId, item['id_item'] as number)
      }
    }
    setAnswers(newAnswers)
    setItemMap(newMap)
  }, [existingItems, questions])

  // ── Mutations ─────────────────────────────────────────────────────────────
  const createResposta = useMutation({
    mutationFn: (idR: number) =>
      entityApi.create(respostaEntity, {
        id_questionario: idQuestionario,
        ds_entidade_ref: entidadeRef,
        id_ref: idR,
        fl_finalizado: 'NAO',
      }),
    onSuccess: (res) => {
      const saved = (res as { data?: EntityRecord }).data ?? (res as unknown as EntityRecord)
      const id = saved?.['id_resposta'] as number | undefined
      if (id) setRespostaId(id)
    },
  })

  const upsertItem = useMutation({
    mutationFn: async ({ q, value, resId }: { q: Question; value: AnswerValue; resId: number }) => {
      const payload = toItemPayload(q, value)
      const existingItemId = itemMap.get(q.id_pergunta)
      if (existingItemId) {
        return entityApi.update(respostaItemEntity, { id_item: existingItemId, ...payload })
      }
      return entityApi.create(respostaItemEntity, { id_resposta: resId, id_pergunta: q.id_pergunta, ...payload })
    },
    onSuccess: (res, variables) => {
      const saved = (res as { data?: EntityRecord }).data ?? (res as unknown as EntityRecord)
      const newItemId = saved?.['id_item'] as number | undefined
      if (newItemId && !itemMap.has(variables.q.id_pergunta)) {
        setItemMap(prev => new Map(prev).set(variables.q.id_pergunta, newItemId))
      }
      setSaveStatus('saved')
      setTimeout(() => setSaveStatus('idle'), 2000)
    },
    onError: () => setSaveStatus('error'),
  })

  const ensureResposta = useCallback(async (idR: number): Promise<number | null> => {
    if (respostaId) return respostaId
    const res = await createResposta.mutateAsync(idR)
    const saved = (res as { data?: EntityRecord }).data ?? (res as unknown as EntityRecord)
    return (saved?.['id_resposta'] as number) ?? null
  }, [respostaId, createResposta])

  function scheduleSave(q: Question, value: AnswerValue) {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    setSaveStatus('saving')
    saveTimer.current = setTimeout(async () => {
      if (!idRef) {
        pendingRef.current[q.id_pergunta] = value
        setSaveStatus('idle')
        return
      }
      const rId = await ensureResposta(idRef)
      if (rId) upsertItem.mutate({ q, value, resId: rId })
    }, 800)
  }

  // Salva pendentes quando idRef aparece (após create do registro pai)
  useEffect(() => {
    if (!idRef || savedPendingRef.current) return
    const pending = pendingRef.current
    if (!Object.keys(pending).length) return
    savedPendingRef.current = true
    const run = async () => {
      const rId = await ensureResposta(idRef)
      if (!rId) return
      for (const pergIdStr of Object.keys(pending)) {
        const q = questions.find(q => q.id_pergunta === Number(pergIdStr))
        if (q) upsertItem.mutate({ q, value: pending[Number(pergIdStr)], resId: rId })
      }
    }
    run()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idRef])

  function setAnswer(q: Question, value: AnswerValue) {
    setAnswers(prev => ({ ...prev, [q.id_pergunta]: value }))
    scheduleSave(q, value)
  }

  // ── Render de cada pergunta ────────────────────────────────────────────────
  function renderInput(q: Question) {
    const value = answers[q.id_pergunta] ?? null
    const cls = 'w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60 disabled:cursor-not-allowed'

    switch (q.tp_resposta) {
      case 'textarea':
        return <textarea rows={3} disabled={isDetail} placeholder={q.ds_placeholder ?? ''}
          value={String(value ?? '')} onChange={e => setAnswer(q, e.target.value)}
          className={cls + ' resize-none'} />

      case 'number':
        return <input type="number" disabled={isDetail} placeholder={q.ds_placeholder ?? ''}
          value={value !== null ? String(value) : ''}
          onChange={e => setAnswer(q, e.target.value !== '' ? Number(e.target.value) : null)}
          className={cls} />

      case 'money':
        return (
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">R$</span>
            <input type="number" step="0.01" disabled={isDetail} placeholder="0,00"
              value={value !== null ? String(value) : ''}
              onChange={e => setAnswer(q, e.target.value !== '' ? Number(e.target.value) : null)}
              className={cls + ' pl-9'} />
          </div>
        )

      case 'date':
        return <input type="date" disabled={isDetail} value={String(value ?? '')}
          onChange={e => setAnswer(q, e.target.value || null)} className={cls} />

      case 'datetime':
        return <input type="datetime-local" disabled={isDetail} value={String(value ?? '')}
          onChange={e => setAnswer(q, e.target.value || null)} className={cls} />

      case 'boolean':
        return (
          <div className="flex gap-4 pt-1">
            {(['SIM', 'NAO'] as const).map(opt => (
              <label key={opt} className="flex items-center gap-1.5 cursor-pointer text-sm">
                <input type="radio" disabled={isDetail} checked={value === opt}
                  onChange={() => setAnswer(q, opt)} className="accent-primary" />
                {opt === 'SIM' ? 'Sim' : 'Não'}
              </label>
            ))}
          </div>
        )

      case 'select': {
        const opts = (q.ds_opcoes as QuestionOption[] | null) ?? []
        return (
          <select disabled={isDetail} value={String(value ?? '')}
            onChange={e => setAnswer(q, e.target.value || null)}
            className={cls + ' bg-background'}>
            <option value="">Selecione…</option>
            {opts.map(o => <option key={o.valor} value={o.valor}>{o.label}</option>)}
          </select>
        )
      }

      case 'multiselect': {
        const opts = (q.ds_opcoes as QuestionOption[] | null) ?? []
        const selected = (value as string[] | null) ?? []
        return (
          <div className="flex flex-wrap gap-x-4 gap-y-1 pt-1">
            {opts.map(o => (
              <label key={o.valor} className="flex items-center gap-1.5 cursor-pointer text-sm">
                <input type="checkbox" disabled={isDetail} checked={selected.includes(o.valor)}
                  onChange={e => {
                    const next = e.target.checked ? [...selected, o.valor] : selected.filter(v => v !== o.valor)
                    setAnswer(q, next.length ? next : null)
                  }} className="accent-primary" />
                {o.label}
              </label>
            ))}
          </div>
        )
      }

      case 'scale': {
        const cfg = q.ds_opcoes as ScaleConfig | null
        const min = cfg?.min ?? 1
        const max = cfg?.max ?? 5
        return (
          <div className="flex gap-3 pt-1 flex-wrap">
            {Array.from({ length: max - min + 1 }, (_, i) => min + i).map(n => (
              <label key={n} className="flex flex-col items-center gap-0.5 cursor-pointer">
                <input type="radio" disabled={isDetail} checked={Number(value) === n}
                  onChange={() => setAnswer(q, n)} className="accent-primary" />
                <span className="text-xs text-muted-foreground">{n}</span>
              </label>
            ))}
          </div>
        )
      }

      default:
        return <input type="text" disabled={isDetail} placeholder={q.ds_placeholder ?? ''}
          value={String(value ?? '')} onChange={e => setAnswer(q, e.target.value || null)}
          className={cls} />
    }
  }

  // ── Render principal ──────────────────────────────────────────────────────
  if (loadingQ) {
    return (
      <div className="col-span-12 flex items-center gap-2 py-3 text-xs text-muted-foreground">
        <div className="h-3 w-3 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        Carregando perguntas…
      </div>
    )
  }

  if (!questions.length) return null

  return (
    <div className="col-span-12 space-y-2">
      {/* Separador de seção */}
      {sectionTitle && (
        <div className="flex items-center gap-3 pt-1 pb-0.5">
          <div className="flex-1 border-t border-border" />
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground whitespace-nowrap">
            {sectionTitle}
          </span>
          <div className="flex-1 border-t border-border" />
        </div>
      )}

      {/* Indicador de save + aviso create mode */}
      <div className="flex items-center justify-between min-h-[16px]">
        {!idRef && mode === 'create' ? (
          <p className="text-xs text-muted-foreground italic">
            As respostas serão salvas automaticamente após gravar o registro.
          </p>
        ) : <span />}
        {saveStatus !== 'idle' && (
          <span className={[
            'text-xs',
            saveStatus === 'saving' ? 'text-muted-foreground' :
            saveStatus === 'saved'  ? 'text-green-600' : 'text-destructive',
          ].join(' ')}>
            {saveStatus === 'saving' ? 'Salvando…' : saveStatus === 'saved' ? 'Salvo' : 'Erro ao salvar'}
          </span>
        )}
      </div>

      {/* Perguntas */}
      <div className="grid grid-cols-12 gap-3">
        {questions.map(q => {
          if (q.tp_resposta === 'section') {
            return (
              <div key={q.id_pergunta} className="col-span-12 flex items-center gap-3 py-1">
                <div className="flex-1 border-t border-border" />
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground whitespace-nowrap">
                  {q.ds_texto}
                </span>
                <div className="flex-1 border-t border-border" />
              </div>
            )
          }
          const span = q.nr_colunas === 3 ? 3 : q.nr_colunas === 4 ? 4 : q.nr_colunas === 6 ? 6 : 12
          return (
            <div key={q.id_pergunta} className={`col-span-${span} space-y-1`}>
              <label className="text-sm font-medium leading-none">
                {q.ds_texto}
                {q.fl_obrigatorio === 'SIM' && <span className="ml-0.5 text-destructive">*</span>}
              </label>
              {q.ds_ajuda && <p className="text-xs text-muted-foreground">{q.ds_ajuda}</p>}
              {renderInput(q)}
            </div>
          )
        })}
      </div>
    </div>
  )
}
