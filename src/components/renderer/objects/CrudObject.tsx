import { useEffect, useCallback, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm, useWatch } from 'react-hook-form'
import { useStore } from 'zustand'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useViewContext } from '../ViewContext'
import { useConnectionParams, useParentIsCreating } from '../ObjectRenderer'
import { FieldRenderer } from '../fields/FieldRenderer'
import { entityApi } from '@/api/entity.api'
import type { EntitySchemaResponse } from '@/api/entity.api'
import { scriptApi } from '@/api/script.api'
import { apiClient } from '@/api/client'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { evalExpr, evalArithmeticExpr, interpolateExpr } from '@/utils/evalExpr' // interpolateExpr usado no título
import type { ObjectDefinition, CrudAction } from '@/types/view.types'
import type { EntityRecord } from '@/types/entity.types'
import type { ObjectState } from '@/store/viewStore'
import { storePendingUpload } from '@/utils/pendingUpload'
import { usePopupNavigation } from '@/contexts/PopupNavigationContext'
import { useMonitorStore } from '@/store/monitorStore'

interface Props {
  objectDef: ObjectDefinition
}

type CrudMode = 'create' | 'edit' | 'detail'

// ─── CrudObject ───────────────────────────────────────────────────────────────

function resolveActionRoute(path: string) {
  return path.startsWith('/') ? path : `/home/${path}`
}

export function CrudObject({ objectDef }: Props) {
  const navigate = useNavigate()
  const popupNav = usePopupNavigation()
  const { viewStore, initialParams = {}, connections, definition, screenParams } = useViewContext()
  const objectState = useStore(viewStore, (s) => s.objects[objectDef.id])
  const setObjectState = useStore(viewStore, (s) => s.setObjectState)
  const queryClient = useQueryClient()
  const toast = useToast()
  const { confirm, confirmDialog } = useConfirm()
  const uploadInputRef = useRef<HTMLInputElement | null>(null)
  const [uploadAction, setUploadAction] = useState<CrudAction | null>(null)

  // Mapa id→entity: nos objetos/componentes "entity" guarda o entities[].id,
  // mas a API recebe o entities[].entity (que pode diferir do id).
  const entityMap: Record<string, string> = {}
  for (const e of definition.entities) {
    entityMap[e.id] = e.entity ?? e.id
  }
  const entityName = entityMap[objectDef.entity] ?? objectDef.entity

  // Schema da entidade — pré-carregado para que o config.primary esteja disponível
  // no onSuccess sem precisar de uma chamada extra assíncrona na hora do submit.
  // Habilitado apenas quando afterSubmit:'edit' (único caso que precisa da PK).
  const { data: entitySchema } = useQuery<EntitySchemaResponse>({
    queryKey: ['entity-schema', entityName],
    queryFn: () => entityApi.getSchema(entityName),
    enabled: !!entityName && objectDef.afterSubmit === 'edit',
    staleTime: Infinity,  // schema não muda durante a sessão
    gcTime: Infinity,
  })

  const connectionParams = useConnectionParams(objectDef.id)
  const parentIsCreating = useParentIsCreating(objectDef.id)
  const addMonitor = useMonitorStore((s) => s.add)

  // Este crud é filho de uma connection bloqueante? (ex: crudFichaEsperaPrincipal ← crudPessoa)
  // Filhos de conexão têm o seu entityId derivado dos params do pai, que chegam com atraso.
  // Enquanto não chegam, entityId é transitoriamente undefined — isso NÃO significa "create",
  // significa "carregando". Usado para evitar pinar o modo prematuramente.
  const isBlockingChild = connections.some(
    (c) => c.child === objectDef.id && c.blocking !== false,
  )

  const qp = objectState?.queryParams

  // Tipos que são apenas display — não são inputs, não vão no body
  const DISPLAY_TYPES = new Set(['label', 'title', 'html', 'template', 'generalActions'])

  // Keys que têm um componente de input explícito neste objeto → nunca são transient,
  // mesmo que estejam em initialParams (ex: id_pessoa passado pela URL mas também FK do filho)
  const explicitInputKeys = new Set(
    (objectDef.components ?? [])
      .filter((c) => !DISPLAY_TYPES.has(c.type) && !c.transient)
      .map((c) => c.nameForm ?? c.name)
      .filter(Boolean),
  )

  // ─── Filtro para carregar o registro ─────────────────────────────────────────
  // Prioridade:
  //   1. queryParams (setados por action explícita)
  //   2. connectionParams (derivados do estado do pai via connections)
  //   3. initialParams filtrados a id_* (navegação via URL)
  //   4. selectedRow (fallback de última instância)
  const isValid = (v: unknown) => v !== undefined && v !== null && v !== ''

  const loadFilter: Record<string, unknown> = (() => {
    // 1. queryParams vindos da action (ex: { id_lancamento_gerencial: 5 })
    if (qp && Object.keys(qp).length > 0) {
      const entries = Object.entries(qp).filter(([, v]) => isValid(v))
      if (entries.length > 0) return Object.fromEntries(entries)
    }

    // 2. connectionParams — pai propagou o ID via connection (tabela→crud, crud→crud)
    //    Cobre: cruds com mesma entidade do pai, cruds com entidade diferente (chave FK)
    const cpEntries = Object.entries(connectionParams).filter(([, v]) => isValid(v))
    if (cpEntries.length > 0) return Object.fromEntries(cpEntries)

    // 3. initialParams de navegação (ex: URL ?id_financeiro=8)
    // Usa APENAS chaves que começam com "id_" para evitar que params de contexto
    // como "tipo_nfe" entrem como filtro da API e causem inferência errada de modo.
    // Ex: /crudMovimento?tipo_nfe=Orcamento → não deve ser tratado como loadFilter.
    // Quando há múltiplos id_*, prefere os que pertencem explicitamente a este CRUD
    // (estão em explicitInputKeys) para evitar que IDs de entidades irmãs contaminem
    // a query. Ex: crudPessoa com initialParams { id_pessoa, id_residente } → usa só id_pessoa.
    const ip = initialParams as Record<string, unknown>
    const idIpEntries = Object.entries(ip).filter(([k, v]) => k.startsWith('id_') && isValid(v))
    if (idIpEntries.length > 0) {
      const ownedEntries = idIpEntries.filter(([k]) => explicitInputKeys.has(k))
      return Object.fromEntries(ownedEntries.length > 0 ? ownedEntries : idIpEntries)
    }

    // 4. selectedRow como último recurso (ex: connection pai→filho sem queryParams explícito)
    const sr = objectState?.selectedRow
    if (sr) {
      const srEntry = Object.entries(sr).find(([k, v]) => k.startsWith('id_') && isValid(v))
      if (srEntry) return { [srEntry[0]]: srEntry[1] }
    }

    return {}
  })()

  // entityId: primeiro valor do filtro — usado para inferir modo e habilitar a query
  const entityId = Object.values(loadFilter).find(v => isValid(v)) as string | number | undefined

  // Para o PATCH, precisamos do campo+valor da PK
  const entityIdField = Object.keys(loadFilter).find(k => isValid(loadFilter[k])) ?? 'id'

  // Mode: viewStore (dinâmico) > _mode de initialParams (navegação) > objectDef.mode > inferido
  const resolvedMode: CrudMode = (() => {
    const storeMode = objectState?.mode
    if (storeMode === 'create' || storeMode === 'edit' || storeMode === 'detail') return storeMode
    const navMode = initialParams._mode as string | undefined
    if (navMode === 'create' || navMode === 'edit' || navMode === 'detail') return navMode
    const defMode = objectDef.mode
    if (defMode === 'create' || defMode === 'edit' || defMode === 'detail') return defMode
    return entityId ? 'detail' : 'create'
  })()

  const isCreate = resolvedMode === 'create'
  const isDetail = resolvedMode === 'detail'

  // Carrega o registro usando os params da action como filtro:
  // GET /default/{entity}?{...loadFilter}&pageSize=1
  const { data: record, isLoading: isLoadingRecord, isFetching: isFetchingRecord } = useQuery({
    queryKey: ['entity-single', entityName, JSON.stringify(loadFilter)],
    queryFn: async () => {
      const res = await entityApi.getList<EntityRecord>(entityName, {
        ...loadFilter,
        pageSize: 1,
      })
      const rows = (res as { data?: EntityRecord[] }).data ?? (Array.isArray(res) ? res as EntityRecord[] : [])
      // IMPORTANTE: retorna null (não undefined) quando não há registro.
      // No React Query v5, retornar undefined do queryFn é rejeitado — a lib mantém os
      // dados anteriores em cache em vez de atualizar para "vazio". Isso fazia o crud
      // "navegar no histórico": ao recarregar um registro sem filho, mantinha os dados
      // do registro anterior e o modo nunca voltava para create.
      return (rows[0] ?? null) as EntityRecord | null
    },
    enabled: !!entityId && !!entityName && !isCreate,
    staleTime: 0,
  })

  const form = useForm<Record<string, unknown>>({
    // Em create: aplica defaultValue de cada componente, initialParams ganha.
    // Em edit/detail: campos iniciam vazios; os valores reais vêm do form.reset(record).
    defaultValues: { ...buildDefaultValues(objectDef, initialParams, isCreate), ...initialParams },
  })

  const watchedValues = useWatch({ control: form.control }) as Record<string, unknown>

  // Propaga os valores atuais do form para o formData do store em tempo real.
  // Permite que ObjectSlot avalie condições de visibilidade de filhos (ex: {{tipo_lancamento_acao}})
  // usando dados do form do pai antes mesmo de salvar o registro.
  //
  // MERGE em vez de substituição: useWatch não rastreia campos apenas setados via setValue
  // (ex: tipo_lancamento_acao copiado pelo autocomplete fields) — esses campos vêm do banco
  // via formData ao carregar em edit/detail. O merge preserva os campos do banco que
  // watchedValues não conhece, enquanto o watchedValues vence para campos registrados.
  useEffect(() => {
    if (Object.keys(watchedValues).length > 0) {
      const currentFormData = (viewStore.getState().objects[objectDef.id]?.formData ?? {}) as Record<string, unknown>
      // Merge order: computedOverrides < watchedValues
      //   - computedOverrides cobre campos virtuais (computedName sem nameForm, ex: destinoDaOperacao)
      //     que não chegam ao watchedValues por não serem registrados no form, mas precisam estar
      //     no globalFormData para que autocompletes filhos possam usar {{destinoDaOperacao}}.
      //   - watchedValues vence sobre computedOverrides: campos com nameForm (ex: id_tipo_nota)
      //     usam o valor do banco após form.reset(), não o valor recalculado no render.
      setObjectState(objectDef.id, { formData: { ...currentFormData, ...computedOverrides, ...watchedValues } })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(watchedValues)])

  // Calcula computedFrom SINCRONAMENTE durante o render — assim formValues já tem
  // os valores corretos antes dos filhos renderizarem (resolve visible dependente de computedFrom)
  // screenParams entra antes de initialParams/watchedValues para ter menor prioridade
  // (o form sempre vence; parâmetros SSO servem de fallback/contexto)
  const rawFormValues = { ...screenParams, ...initialParams, ...watchedValues }
  const computedOverrides: Record<string, unknown> = {}
  for (const comp of objectDef.components ?? []) {
    const targetField = comp.computedName ?? comp.nameForm ?? comp.name
    if (!targetField) continue
    let result: unknown
    if (comp.computedFrom) {
      // computedFrom: expressão JS com {{campo}} — avaliada pelo evalExpr
      result = evalExpr(comp.computedFrom, rawFormValues)
    } else if (comp.expression) {
      // expression: expressão aritmética com {campo} — coerção numérica para evitar concatenação de strings
      result = evalArithmeticExpr(comp.expression, rawFormValues)
    } else {
      continue
    }
    if (result !== undefined) computedOverrides[targetField] = result
  }
  const formValues = { ...rawFormValues, ...computedOverrides }

  // Efeito: sincroniza os valores computados com o form (para submissão)
  // Em modo edit, só aplica computedFrom em campos sem valor carregado do banco
  const allComputedComponents = (objectDef.components ?? []).filter((c) => c.computedFrom || c.expression)
  useEffect(() => {
    for (const comp of allComputedComponents) {
      const targetField = comp.computedName ?? comp.nameForm ?? comp.name
      if (!targetField) continue
      const result = comp.computedFrom
        ? evalExpr(comp.computedFrom, formValues)
        : comp.expression
          ? evalArithmeticExpr(comp.expression, formValues)
          : undefined
      if (result === undefined) continue
      const current = form.getValues(targetField)
      // computedFrom: campo virtual/derivado — em edit, só aplica se ainda não há valor salvo.
      // expression: cálculo aritmético (ex: qt * vl_unitario) — sempre recalcula,
      // pois o usuário pode ter alterado um campo dependente e o total deve atualizar.
      if (comp.computedFrom && !isCreate && record && current !== undefined && current !== '' && current !== null) continue
      if (String(result) !== String(current ?? '')) {
        // shouldDirty: false — campo computado não deve ser marcado como "alterado pelo usuário".
        // O cascade do AutocompleteField usa isDirty para distinguir alteração real do usuário
        // (deve limpar filho) de mudança sistêmica/init (não deve limpar).
        form.setValue(targetField, result, { shouldDirty: false })
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(rawFormValues)])


  // Defaults para CREATE: aplica defaultValue + initialParams (URL)
  const baseDefaults = () => ({ ...buildDefaultValues(objectDef, initialParams, true), ...initialParams })

  // Propaga mode: 'create' para o viewStore quando o CRUD raiz abre sem registro.
  // Necessário para que useConnectionEnabled dos filhos veja o mode correto e desabilite
  // seus botões. Sem isso, os filhos veem mode=null + formData.id_*="0" (defaultValue)
  // e consideram o pai "habilitado", mostrando botões incorretamente.
  useEffect(() => {
    if (!isCreate || objectState?.mode) return
    // Filho de conexão ainda aguardando os params do pai: entityId transitoriamente ausente
    // é "carregando", não "create". Pinar 'create' aqui trava o modo no store (storeMode tem
    // prioridade no resolvedMode) e impede o load do registro quando os params chegam — é a
    // causa do bug "mantém create mesmo tendo registro".
    // Exceção: se o pai está de fato criando (parentIsCreating), não há registro mesmo → pina create.
    if (isBlockingChild && !parentIsCreating && Object.keys(connectionParams).length === 0) return
    setObjectState(objectDef.id, { mode: 'create' })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCreate, parentIsCreating, JSON.stringify(connectionParams)])

  // Auto-detecta mode para objetos filhos conectados via connectionParams:
  // Se o pai propagou um ID mas a entidade filha não tem registro (ainda não foi criado),
  // muda automaticamente para 'create'. Assim o filho age como um "sub-formulário de criação"
  // vinculado ao pai, em vez de travar em detail/edit sem dados para exibir.
  //
  // Exemplo: CRUDMovimento (edit) → tab Transporte (movimento_transporte não existe ainda)
  //   → connectionParams = { id_movimento: 5 } → entityId = 5 → query retorna undefined
  //   → auto-muda para create (form limpo com id_movimento=5 nos defaults)
  //
  // Não interfere quando:
  //   - modo foi explicitamente definido pelo usuário (storeMode = 'edit' após salvar)
  //   - o registro existe (record !== undefined)
  //   - a query ainda está carregando
  useEffect(() => {
    // isFetchingRecord: com staleTime:0 o cache de uma visita anterior é servido
    // imediatamente enquanto refaz o fetch (isLoading=false, mas isFetching=true).
    // Sem este guard, agiríamos sobre dados desatualizados durante a re-busca.
    if (isCreate || isLoadingRecord || isFetchingRecord || !entityId || record != null) return
    const explicitMode = objectState?.mode
    // Só auto-muda se o modo não foi definido explicitamente (null/undefined = inferido)
    // ou se ainda está no modo inferido 'detail'/'edit' sem registro encontrado
    if (!explicitMode || explicitMode === 'detail' || explicitMode === 'edit') {
      setObjectState(objectDef.id, { mode: 'create' })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoadingRecord, isFetchingRecord, record, entityId])

  // Preenche o form quando o registro carrega ou o ID muda
  useEffect(() => {
    if (isCreate) {
      // isCreate tem prioridade — mesmo que a query anterior ainda tenha data em cache,
      // o form deve iniciar limpo com os defaults (evita herdar dados do último edit)
      form.reset(baseDefaults())
    } else if (record) {
      // Normaliza ISO 8601 → YYYY-MM-DDTHH:mm:ss para que datetime-local exiba o valor corretamente
      const normalizedRecord = Object.fromEntries(
        Object.entries(record as Record<string, unknown>).map(([k, v]) => [k, normalizeDatetimeForInput(v)])
      )
      // Edit/detail: campos iniciam vazios (sem defaultValue), initialParams preservados,
      // valores atuais do form preservados para campos que NÃO vêm da API principal
      // (ex: cd_modelo_documento vem da tabela série via autocomplete fields copy, não do movimento).
      // connectionParams injetados após form.getValues() para garantir contexto fresco do pai
      // (ex: fl_residente_exterior propagado via connection, não presente no DB do filho).
      // Os valores do registro (normalizedRecord) sempre ganham dos demais.
      form.reset({ ...buildDefaultValues(objectDef, initialParams, false), ...initialParams, ...form.getValues(), ...connectionParams, ...normalizedRecord })
      // Inclui computedOverrides para que campos virtuais (computedName sem nameForm, ex: destinoDaOperacao)
      // não sejam perdidos quando o record do banco sobrescreve o formData. Esses campos não entram
      // em watchedValues (não são registrados no form), então o effect de watchedValues não os restaura
      // se o record tiver os mesmos valores que o form já tinha (JSON.stringify igual → effect não roda).
      //
      // Filho de conexão com modo puramente inferido: ao achar registro, a inferência padrão é
      // 'detail' (entityId presente, sem modo no store/nav/def). Mas um sub-formulário vinculado ao
      // pai deve ser editável → transiciona para 'edit'. Sem isso, o filho com dados fica read-only.
      // Não toca em modos explícitos (storeMode/navMode/defMode) nem em cruds raiz.
      const modeIsInferred = !objectState?.mode && !initialParams._mode && !objectDef.mode
      setObjectState(objectDef.id, {
        formData: { ...(record as Record<string, unknown>), ...computedOverrides },
        ...(isBlockingChild && modeIsInferred ? { mode: 'edit' } : {}),
      })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [record, entityId, isCreate])

  // Preenche defaults de connectionParams no modo create
  useEffect(() => {
    if (isCreate && Object.keys(connectionParams).length > 0) {
      form.reset({ ...baseDefaults(), ...connectionParams })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCreate, JSON.stringify(connectionParams)])

  const mutation = useMutation({
    mutationFn: async (values: Record<string, unknown>) => {
      if (isCreate) {
        return entityApi.create(entityName, values)
      } else {
        // A chave primária vai sempre no body — a URL não leva ID
        return entityApi.update(entityName, {
          [entityIdField]: entityId,
          ...values,
        })
      }
    },
    onSuccess: (result) => {
      // Invalida queries da entidade para forçar reload em tabelas filhas e no próprio crud
      queryClient.invalidateQueries({ queryKey: ['entity', entityName] })
      queryClient.invalidateQueries({ queryKey: ['entity-single', entityName] })

      // Invalida entidades de objetos irmãos (filhos do mesmo pai na connection).
      // Ex: salvar CRUDPessoaEndereco (entity: pessoa_endereco) também invalida
      // tabelaPessoaEndereco (entity: vPessoaEndereco), que é irmão pelo pai CRUDPessoa.
      const myParentConns = connections.filter((c) => c.child === objectDef.id)
      for (const conn of myParentConns) {
        const siblings = connections.filter(
          (c) => c.parent === conn.parent && c.child !== objectDef.id,
        )
        for (const sib of siblings) {
          const sibObj = definition.objects.find((o) => o.id === sib.child)
          if (sibObj?.entity) {
            const sibEntityName = entityMap[sibObj.entity] ?? sibObj.entity
            if (sibEntityName !== entityName) {
              queryClient.invalidateQueries({ queryKey: ['entity', sibEntityName] })
            }
          }
        }
      }

      // Normaliza o resultado: EntityMutationResponse tem .data, ou pode vir diretamente
      const newRecord: Record<string, unknown> =
        result.data ?? (result as unknown as Record<string, unknown>)

      // Resolve a PK cedo — usada tanto na propagação para irmãos/filhos quanto no afterSubmit
      const primary =
        objectDef.primaryKey ??
        result.primary ??
        entitySchema?.config?.primary
      const pkValue = primary ? newRecord[primary] : undefined

      toast.success('Salvo com sucesso.')

      // ── Propaga estado para filhos/irmãos com a mesma entidade ──────────────
      // Quando crudPessoa salva, os demais CRUDs com entity: pessoa (ex: abas
      // crudPessoaJuridica, crudCertificado) devem exibir o mesmo registro.
      // TableObject já reage via connectionParams; CrudObject precisa de
      // queryParams explícito no seu objectState para atualizar o loadFilter.
      const sameEntityQP: Record<string, unknown> =
        primary && pkValue !== undefined ? { [primary]: pkValue } : {}

      // 1. Filhos diretos com a mesma entidade
      for (const conn of connections.filter((c) => c.parent === objectDef.id)) {
        const childObj = definition.objects.find((o) => o.id === conn.child)
        if (!childObj?.entity) continue
        const childEntityName = entityMap[childObj.entity] ?? childObj.entity
        if (childEntityName !== entityName) continue
        // Modais só abrem por ação explícita do usuário (showObject) — nunca auto-abrem ao salvar
        if (childObj.variant === 'modal') continue
        // Monta QP usando o mapeamento de keys da connection (childKey ← parentKey)
        const childQP: Record<string, unknown> = {}
        for (const [ck, pk] of Object.entries(conn.keys ?? {})) {
          if (newRecord[pk] !== undefined) childQP[ck] = newRecord[pk]
        }
        setObjectState(conn.child, {
          mode: 'edit',
          queryParams: Object.keys(childQP).length ? childQP : sameEntityQP,
          selectedRow: newRecord,
        })
      }

      // 2. Irmãos (filhos do mesmo pai) com a mesma entidade
      for (const conn of myParentConns) {
        for (const sib of connections.filter(
          (c) => c.parent === conn.parent && c.child !== objectDef.id,
        )) {
          const sibObj = definition.objects.find((o) => o.id === sib.child)
          if (!sibObj?.entity) continue
          const sibEntityName = entityMap[sibObj.entity] ?? sibObj.entity
          if (sibEntityName !== entityName) continue
          // Modais só abrem por ação explícita do usuário (showObject) — nunca auto-abrem ao salvar
          if (sibObj.variant === 'modal') continue
          setObjectState(sib.child, {
            mode: 'edit',
            queryParams: sameEntityQP,
            selectedRow: newRecord,
          })
        }
      }

      // Executa hooks afterCreate / afterUpdate
      const hooks = isCreate
        ? (objectDef.afterCreate ?? [])
        : (objectDef.afterUpdate ?? [])
      for (const hook of hooks) {
        if (hook.type === 'script') {
          // Resolve params estáticos do hook contra screenParams + initialParams + newRecord
          const hookCustomParams: Record<string, unknown> = {}
          for (const [key, val] of Object.entries(hook.params ?? {})) {
            hookCustomParams[key] = val.includes('{{')
              ? interpolateExpr(val, { ...screenParams, ...initialParams, ...newRecord })
              : val
          }
          scriptApi.execute(hook.name ?? hook.scriptId ?? hook.script, {
            data: [],
            inputs: newRecord,
            formData: newRecord,
            objectId: objectDef.id,
            entity: entityName,
            action: isCreate ? 'create' : 'edit',
            entities: {},
            customParams: hookCustomParams,
          })
            .then((res) => {
              if (res.messageError) toast.error(res.messageError)
              if (res.message) toast.success(res.message)
              if (res.reload) {
                queryClient.invalidateQueries({ queryKey: ['entity', entityName] })
                queryClient.invalidateQueries({ queryKey: ['entity-single', entityName] })
              }
              // Entidades retornadas pelo script
              for (const e of res.affectedEntities ?? []) {
                queryClient.invalidateQueries({ queryKey: ['entity', e] })
                queryClient.invalidateQueries({ queryKey: ['entity-single', e] })
              }
              // Entidades declaradas estaticamente no JSON do hook
              for (const e of hook.affectedEntities ?? []) {
                queryClient.invalidateQueries({ queryKey: ['entity', e] })
                queryClient.invalidateQueries({ queryKey: ['entity-single', e] })
              }
            })
            .catch(() => {/* silencioso — hook secundário */})
        }
      }

      // Atualiza o estado do objeto no viewStore
      setObjectState(objectDef.id, {
        formData: newRecord,
        selectedRow: newRecord,
      })

      // Transição de modo após submit
      const after = objectDef.afterSubmit
      if (after === 'edit') {
        if (isCreate) {
          // Após CREATE com afterSubmit:'edit' — usa primary/pkValue já resolvidos acima
          if (!primary) {
            toast.error(
              `Chave primária não encontrada para a entidade "${entityName}". ` +
              `Não é possível abrir o registro em modo de edição.`,
            )
            return
          }

          if (pkValue === undefined || pkValue === null) {
            toast.error(
              `Campo "${primary}" não encontrado no retorno do servidor. ` +
              `Não é possível abrir o registro em modo de edição.`,
            )
            return
          }

          const resetValues = { ...buildDefaultValues(objectDef, initialParams, false), ...initialParams, ...form.getValues(), ...newRecord }
          form.reset(resetValues)

          // Inclui todos os valores do form + computedOverrides no formData imediatamente,
          // evitando janela onde campos computados (tipo_nfe, destinoDaOperacao, etc.)
          // ficam ausentes do globalFormData antes do effect de watchedValues disparar.
          setObjectState(objectDef.id, {
            mode: 'edit',
            queryParams: { [primary]: pkValue },
            formData: { ...computedOverrides, ...resetValues },
            selectedRow: newRecord,
          })
        } else {
          // Após UPDATE: já está em modo edição com o ID correto nos queryParams
          setObjectState(objectDef.id, { mode: 'edit' })
        }
      } else if (after === 'detail') {
        setObjectState(objectDef.id, { mode: 'detail' })
      } else if (after === 'create') {
        form.reset({ ...buildDefaultValues(objectDef, initialParams, true), ...initialParams })
        // Limpa queryParams também para garantir que o próximo create não herde o ID anterior
        setObjectState(objectDef.id, { mode: 'create', formData: null, selectedRow: null, queryParams: {} })
      } else if (objectDef.variant === 'modal') {
        // Modal sem afterSubmit explícito → fecha após salvar
        setObjectState(objectDef.id, { mode: null, formData: null, selectedRow: null })
      }
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { message?: string; messageError?: string } } })
          ?.response?.data?.messageError ??
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Erro ao salvar. Verifique os dados e tente novamente.'
      toast.error(msg)
    },
  })

  const transientKeys = new Set([
    // Params de navegação da URL — exceto os que têm componente de input explícito
    ...Object.keys(initialParams).filter((k) => !explicitInputKeys.has(k)),
    ...(objectDef.components ?? []).flatMap((c) => {
      const keys: string[] = []
      const fieldKey = c.nameForm ?? c.name
      // Explicitamente marcado como transient
      if (c.transient) {
        // Só marca fieldKey como transient se nenhum outro componente real (não-transient,
        // não-display) usar o mesmo nameForm. Evita excluir campos reais cujo nameForm
        // coincide com o de um autocomplete transient (ex: ambos com nameForm "descricao").
        const fieldKeySharedWithReal = (objectDef.components ?? []).some(
          (other) =>
            other !== c &&
            (other.nameForm ?? other.name) === fieldKey &&
            !DISPLAY_TYPES.has(other.type) &&
            !other.transient,
        )
        if (!fieldKeySharedWithReal) keys.push(fieldKey)
        // Autocomplete com params.key: o valor real salvo no form é params.key (a FK),
        // não o nameForm (display). Ambos devem ser excluídos do body.
        if (c.type === 'autocomplete' && c.params?.key) keys.push(c.params.key)
      }
      // Tipos display-only (não são inputs de dados)
      if (DISPLAY_TYPES.has(c.type)) keys.push(fieldKey)
      // Campo com computedName: tanto o campo visual (nameForm ?? name) quanto o
      // computedName são virtuais — usados só como contexto/referência no form,
      // nunca enviados ao banco. Ambos são transient.
      if (c.computedName) {
        const displayKey = c.nameForm ?? c.name
        if (displayKey) keys.push(displayKey)
        keys.push(c.computedName)
      }
      // Campo sem nameForm em tipo display (usa name como key)
      if (!c.nameForm && DISPLAY_TYPES.has(c.type)) keys.push(c.name)
      // Autocomplete com params.key: nameForm é só display — apenas params.key vai no body.
      // Porém, só marca como transient se nenhum outro componente real (não-autocomplete,
      // não-display) usar o mesmo nameForm. Evita excluir campos reais que compartilham
      // o mesmo nameForm com um autocomplete (ex: nome_grupo usado em text + autocomplete).
      if (c.type === 'autocomplete' && c.params?.key && c.nameForm) {
        const sharedWithRealField = (objectDef.components ?? []).some(
          (other) =>
            other !== c &&
            (other.nameForm ?? other.name) === c.nameForm &&
            !DISPLAY_TYPES.has(other.type) &&
            other.type !== 'autocomplete' &&
            !other.transient,
        )
        if (!sharedWithRealField) keys.push(c.nameForm)
      }
      // ChipSelect: o name do componente é só label — os campos reais estão em cada opt.nameForm
      if (c.type === 'chipselect') {
        keys.push(c.name)           // ex: "Papéis" — nunca vai ao banco
        if (c.nameForm) keys.push(c.nameForm)
      }
      // Autocomplete: campo virtual {fkField}__label armazena o label do item selecionado
      // para ser usado em templates {{campo__label}}. É puramente display — nunca vai ao banco.
      if (c.type === 'autocomplete') {
        const fkField = c.params?.key ?? (c.nameForm ?? c.name)
        if (fkField) keys.push(`${fkField}__label`)
      }
      // Autocomplete fields copy: campos copiados via comp.fields (ex: tipo_lancamento_acao)
      // são dados auxiliares do item selecionado — não são colunas da entidade principal.
      // Só devem ir no body se houver um componente real (input/select/etc.) explícito para eles.
      // Normaliza formato legado: string[] → {field, as}[] (mesmo tratamento do AutocompleteField)
      if (c.type === 'autocomplete' && c.fields) {
        for (const rawF of c.fields) {
          const f = typeof rawF === 'string' ? { field: rawF as string, as: rawF as string } : rawF
          const fKey = f.as
          if (!fKey) continue
          const hasExplicitComponent = (objectDef.components ?? []).some(
            (other) =>
              other !== c &&
              (other.nameForm ?? other.name) === fKey &&
              !DISPLAY_TYPES.has(other.type) &&
              !other.transient,
          )
          if (!hasExplicitComponent) keys.push(fKey)
        }
      }
      return keys
    }),
  ])

  // Chaves de campos numéricos/FK que devem enviar null em vez de "" quando vazios.
  const numericFieldKeys = new Set(
    (objectDef.components ?? [])
      .filter((c) => ['number', 'decimal', 'autocomplete'].includes(c.type))
      .flatMap((c) => {
        const keys: string[] = []
        const k = c.nameForm ?? c.name
        if (k) keys.push(k)
        if (c.type === 'autocomplete' && c.params?.key && c.params.key !== k) keys.push(c.params.key)
        return keys
      }),
  )

  async function onSubmit(values: Record<string, unknown>) {
    const body = Object.fromEntries(
      Object.entries(values)
        .filter(([key]) => !transientKeys.has(key) && !key.endsWith('__label'))
        .map(([key, val]) => {
          const v = normalizeDatetimeForDb(val)
          return [key, v === '' && numericFieldKeys.has(key) ? null : v]
        })
    )
    // Garante FKs da connection pai→filho no body.
    // Nota: connectionParams NÃO respeita transientKeys — a connection declara explicitamente
    // que o pai deve passar este FK. Isso tem prioridade mesmo que a chave esteja em initialParams
    // e não tenha componente explícito no filho (ex: id_pessoa no CRUDPessoaEndereco).
    for (const [key, value] of Object.entries(connectionParams)) {
      const current = body[key]
      const isUnresolved =
        typeof current === 'string' && /\{\{/.test(current)
      if (current === undefined || current === null || current === '' || isUnresolved) {
        body[key] = value
      }
    }

    // Campos workflowStatus: injeta status inicial (se vazio) e prepara historico para create.
    type WfInjected = { entidadeHistorico: string; entityTarget: string; id_processo: number | undefined; id_status: number }
    const wfInjected: WfInjected[] = []
    const wfComponents = (objectDef.components ?? []).filter((c) => c.type === 'workflowStatus')
    for (const wfc of wfComponents) {
      const key = wfc.nameForm ?? wfc.name
      if (!key) continue
      const nomeProcesso = (wfc as any).nomeProcesso as string | undefined
      const entidadeProcesso = (wfc as any).entidadeProcesso as string | undefined
      const entityWf = (wfc as any).entityWorkflow ?? 'vw_workflow_status'
      if (!nomeProcesso || !entidadeProcesso) continue
      const alreadySet = body[key] != null && body[key] !== ''
      try {
        const res = await entityApi.getList<{ id_status: number; id_processo?: number }>(entityWf, {
          nm_processo: nomeProcesso,
          nm_entidade_processo: entidadeProcesso,
          fl_estado_inicial: 'Sim',
          pageSize: 1,
        })
        const initial = res.data?.[0]
        if (initial) {
          if (!alreadySet) body[key] = initial.id_status
          wfInjected.push({
            entidadeHistorico: (wfc as any).entidadeHistoricoEvento ?? 'historico_workflow',
            entityTarget: (wfc as any).entityTarget ?? entityName,
            id_processo: initial.id_processo,
            id_status: alreadySet ? (body[key] as number) : initial.id_status,
          })
        }
      } catch {
        // backend vai validar se necessário
      }
    }

    // Campos fileupload: faz upload do File e substitui pelo ID retornado pelo servidor.
    // O FileUploadField armazena o File object no form; aqui convertemos para o ID persistido.
    const fileComponents = (objectDef.components ?? []).filter(
      (c) => (c.type === 'fileupload' || c.type === 'file') && !transientKeys.has(c.nameForm ?? c.name),
    )
    for (const fc of fileComponents) {
      const key = fc.nameForm ?? fc.name
      const val = body[key]
      if (val instanceof File) {
        try {
          const formData = new FormData()
          formData.append('file', val)
          const res = await apiClient.post<{ id?: string | number; name?: string }>('/files/upload', formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
          })
          // Servidor retorna { id, name } — armazena o ID no body
          body[key] = res.data?.id ?? val.name
        } catch {
          toast.error(`Erro ao enviar o arquivo "${val.name}". Verifique e tente novamente.`)
          return
        }
      }
    }

    // Se houver status inicial de workflow injetado, usa mutateAsync para capturar o PK
    // do novo registro e criar o historico_workflow imediatamente após o save.
    if (wfInjected.length > 0) {
      try {
        const saveResult = await mutation.mutateAsync(body)
        const newRecord: Record<string, unknown> =
          (saveResult as any).data ?? (saveResult as unknown as Record<string, unknown>)
        const primary =
          objectDef.primaryKey ??
          (saveResult as any).primary ??
          entitySchema?.config?.primary
        const pkValue = primary ? newRecord[primary] : undefined
        for (const wf of wfInjected) {
          try {
            await entityApi.create(wf.entidadeHistorico, {
              id_processo: wf.id_processo,
              nm_entidade: wf.entityTarget,
              id_registro: pkValue,
              id_status_anterior: null,
              id_status_novo: wf.id_status,
              id_transicao: null,
              dt_transicao: new Date().toISOString().replace('T', ' ').slice(0, 19),
            })
          } catch {
            // historico é best-effort — não bloqueia o fluxo principal
          }
        }
      } catch {
        // onError da mutation já exibe o toast de erro
      }
    } else {
      mutation.mutate(body)
    }
  }

  // Componentes do objeto (excluindo generalActions — vão pro header)
  const components = (objectDef.components ?? []).filter(
    (c) => c.type !== 'generalActions',
  )

  // Helper: executa um script com payload completo (compatível com app legado)
  // Payload espelhado do myplat-App/Object/index.js → executeButtonAction
  const runScript = useCallback(
    (scriptId: string, action: CrudAction) => {
      const values = form.getValues()

      // Resolve customParams: interpola {{campo}} contra valores do form
      const customParams: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(action.params ?? {})) {
        customParams[k] = String(v).replace(/\{\{(\w+)\}\}/g, (_, f) =>
          values[f] !== undefined ? String(values[f]) : '',
        )
      }

      // Payload no mesmo formato do app antigo (fields no root do body)
      const payload: Record<string, unknown> = {
        data: [],
        inputs: values,
        formData: values,
        objectId: objectDef.id,
        entity: entityName,
        action: scriptId,          // nome do script/botão (ex: "nfeEnviar") — igual ao app legado
        crudMode: resolvedMode,    // modo do CRUD ('create' | 'edit' | 'detail') para contexto
        bulkSelectedData: [],
        entities: {},
        screenParams,
        customParams,
      }

      scriptApi.execute(scriptId, payload)
        .then((result) => {
          if (result.messageError) {
            toast.error(result.messageError)
            return
          }
          if (result.message) toast.success(result.message)

          // 1. Atualiza campos do form (formato objeto simples)
          if (result.formUpdates) {
            for (const [k, v] of Object.entries(result.formUpdates)) {
              form.setValue(k, v as any)
            }
          }

          // 2. Atualiza campos específicos (formato array — autocomplete etc.)
          if (result.fieldUpdates) {
            for (const upd of result.fieldUpdates) {
              form.setValue(upd.field, upd.value as any)
            }
          }

          // 3. Recarrega se o script pediu OU se a action tem reloadAfterAction
          if (result.reload || result.reloadAfterAction || action.reloadAfterAction) {
            queryClient.invalidateQueries({ queryKey: ['entity', entityName] })
            queryClient.invalidateQueries({ queryKey: ['entity-single', entityName] })
          }

          // 4. Invalida entidades específicas retornadas pelo script
          for (const e of result.affectedEntities ?? []) {
            queryClient.invalidateQueries({ queryKey: ['entity', e] })
            queryClient.invalidateQueries({ queryKey: ['entity-single', e] })
          }

          // 4b. Invalida entidades declaradas na action do JSON (affectedEntities estático)
          for (const e of action.affectedEntities ?? []) {
            queryClient.invalidateQueries({ queryKey: ['entity', e] })
          }

          // 5. Redireciona se pedido
          if (result.redirect) {
            const go = () => {
              if (result.redirect!.url) navigate(result.redirect!.url)
              else if (result.redirect!.action === 'back') navigate(-1)
            }
            result.redirect.delay ? setTimeout(go, result.redirect.delay) : go()
          }

          // 6. Abre um objeto (modal/inline) se pedido
          if (result.openModal) {
            const { objectId, action: modalAction, searchParams } = result.openModal
            setObjectState(objectId, {
              mode: (modalAction ?? 'edit') as 'create' | 'edit' | 'detail',
              queryParams: searchParams ?? {},
              selectedRow: searchParams ?? null,
            })
          }

          // 7. Inicia monitoramento de status se a action tiver monitor configurado
          if (action.monitor && entityId != null) {
            const currentValues = form.getValues()
            const resolvedLabel = action.monitor.label.replace(
              /\{\{(\w+)\}\}/g,
              (_, f) => currentValues[f] !== undefined ? String(currentValues[f]) : '',
            )
            addMonitor(action.monitor, entityId, resolvedLabel)
          }
        })
        .catch((err: unknown) => {
          const msg =
            (err as any)?.response?.data?.messageError ??
            (err as any)?.response?.data?.message ??
            'Erro ao executar o script.'
          toast.error(msg)
        })
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [objectDef.id, entityName, resolvedMode],
  )

  function handleUploadNavigate(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    const action = uploadAction
    event.target.value = ''
    setUploadAction(null)
    if (!file || !action?.url) return
    const uploadToken = storePendingUpload(file)
    navigate(resolveActionRoute(action.url), {
      state: { uploadToken, uploadFileName: file.name, uploadAction: action.title ?? action.action ?? 'Importar arquivo' },
    })
  }

  // Handler de ação customizada
  const handleCrudAction = useCallback(
    async (action: CrudAction) => {
      console.log('[CrudObject] handleCrudAction:', JSON.stringify(action))
      // Confirmação genérica: qualquer action com "confirmation" exibe modal antes de executar.
      // delete já trata internamente (usa action.confirmation dentro do case).
      if (action.action !== 'delete' && action.confirmation) {
        if (!(await confirm(action.confirmation))) return
      }
      switch (action.action) {
        case 'edit':
        case 'detail': {
          const targetMode = action.action as 'edit' | 'detail'
          if (action.object) {
            // Abre outro objeto (modal/inline) no modo especificado
            const values = form.getValues()
            const searchParams: Record<string, unknown> = {}
            for (const [k, v] of Object.entries(action.params ?? {})) {
              searchParams[k] = String(v).replace(/\{\{(\w+)\}\}/g, (_, f) =>
                values[f] !== undefined ? String(values[f]) : '',
              )
            }
            setObjectState(action.object, {
              mode: targetMode,
              selectedRow: { ...values, ...searchParams },
              queryParams: searchParams,
            })
          } else {
            // Muda o modo do próprio CRUD (ex: detail → edit)
            setObjectState(objectDef.id, { mode: targetMode })
          }
          break
        }
        case 'new':
        case 'create':
          form.reset({ ...buildDefaultValues(objectDef, initialParams, true), ...initialParams })
          setObjectState(objectDef.id, { mode: 'create', formData: null, selectedRow: null })
          break
        case 'cancel':
          if (objectDef.variant === 'modal') {
            // Modal: cancelar sempre fecha
            setObjectState(objectDef.id, { mode: null, formData: null, selectedRow: null })
          } else if (entityId) {
            // Inline: volta para detail com o último dado (ou o modo definido no objectDef)
            const defMode = objectDef.mode
            const prev: ObjectState['mode'] =
              (defMode === 'edit' || defMode === 'detail') ? defMode : 'detail'
            setObjectState(objectDef.id, { mode: prev })
            if (record) form.reset({ ...buildDefaultValues(objectDef, initialParams, false), ...initialParams, ...form.getValues(), ...(record as Record<string, unknown>) })
          } else {
            form.reset({ ...buildDefaultValues(objectDef, initialParams, true), ...initialParams })
          }
          break
        case 'save':
        case 'submit':
          form.handleSubmit(onSubmit)()
          break
        case 'delete':
          if (entityId && await confirm(action.confirmation ?? 'Deseja realmente excluir este registro?')) {
            entityApi.remove(entityName, entityId).then(() => {
              queryClient.invalidateQueries({ queryKey: ['entity', entityName] })
              form.reset({ ...buildDefaultValues(objectDef, initialParams, true), ...initialParams })
              setObjectState(objectDef.id, { mode: 'create', formData: null, selectedRow: null })
            })
          }
          break
        case 'api': {
          if (!action.url) break
          const values = form.getValues()
          const body: Record<string, unknown> = {}
          for (const [key, tpl] of Object.entries(action.data ?? {})) {
            body[key] = String(tpl).replace(/\{\{(\w+)\}\}/g, (_, f) =>
              values[f] !== undefined ? String(values[f]) : '',
            )
          }
          const method = (action.method ?? 'POST').toLowerCase()
          ;(apiClient as any)[method](action.url, body)
            .then(() => {
              toast.success('Ação executada com sucesso.')
              if (action.reloadAfterAction) {
                queryClient.invalidateQueries({ queryKey: ['entity', entityName] })
              }
            })
            .catch((err: unknown) => {
              const msg =
                (err as any)?.response?.data?.messageError ??
                (err as any)?.response?.data?.message ??
                'Erro ao executar a ação.'
              toast.error(msg)
            })
          break
        }
        case 'uploadNavigate':
        case 'openUpload': {
          if (!action.url) { toast.error('Informe a rota de destino para a ação de upload.'); break }
          setUploadAction(action)
          requestAnimationFrame(() => uploadInputRef.current?.click())
          break
        }
        case 'navigate':
        case 'navigation': {
          const screen = action.url ?? action.object ?? ''
          if (!screen) break
          for (const entity of action.reloadEntities ?? []) {
            queryClient.removeQueries({ queryKey: ['entity', entity] })
            queryClient.removeQueries({ queryKey: ['entity-single', entity] })
          }
          const params = action.params
            ? Object.fromEntries(
                Object.entries(action.params).map(([k, v]) => [
                  k,
                  String(v).replace(/\{\{(\w+)\}\}/g, (_, f) => {
                    const val = form.getValues(f)
                    return val !== undefined ? String(val) : ''
                  }),
                ]),
              )
            : undefined
          if (definition.newFormShowPopup && popupNav) {
            popupNav.openPopup(screen, params)
          } else {
            navigate(`/home/${screen}`, params ? { state: { searchParams: params } } : undefined)
          }
          break
        }
        case 'showObject': {
          const targetId = action.object ?? ''
          if (!targetId) break
          const mode = (action.objectAction ?? 'edit') as 'create' | 'edit' | 'detail'
          const values = form.getValues()
          const searchParams: Record<string, unknown> = {}
          for (const [k, v] of Object.entries(action.params ?? {})) {
            searchParams[k] = String(v).replace(/\{\{(\w+)\}\}/g, (_, f) =>
              values[f] !== undefined ? String(values[f]) : '',
            )
          }
          setObjectState(targetId, {
            mode,
            selectedRow: { ...values, ...searchParams },
            queryParams: searchParams,
          })
          break
        }
        case 'closeObject': {
          const targetId = action.object ?? objectDef.id
          setObjectState(targetId, { mode: null, formData: null, selectedRow: null })
          break
        }
        case 'reload': {
          queryClient.invalidateQueries({ queryKey: ['entity', entityName] })
          queryClient.invalidateQueries({ queryKey: ['entity-single', entityName] })
          break
        }
        case 'updateConnections': {
          // Propaga os valores atuais do form para os filhos via connections
          const values = form.getValues()
          for (const conn of connections.filter((c) => c.parent === objectDef.id)) {
            const childParams: Record<string, unknown> = {}
            for (const [childKey, parentKey] of Object.entries(conn.keys)) {
              if (values[parentKey] !== undefined) childParams[childKey] = values[parentKey]
            }
            setObjectState(conn.child, { queryParams: childParams })
          }
          break
        }
        case 'executeScript': {
          const scriptId = action.script ?? action.scriptId ?? ''
          if (!scriptId) break
          runScript(scriptId, action)
          break
        }
        default: {
          // Fallback: trata o nome da action como script ID
          // (suporta actions customizadas sem necessidade de trocar para "executeScript")
          // Ex: { action: "nfeEnviar" } → scriptId = "nfeEnviar"
          // Ex: { action: "executeScript", script: "nfeEnviar" } → cai no case acima
          const scriptId = action.script ?? action.scriptId ?? action.action
          if (!scriptId) {
            console.error('[CrudObject] crudAction sem script ID — adicione "script":"nomeDoScript" ou use "action":"nomeDoScript" no JSON:', action)
            break
          }
          runScript(scriptId, action)
          break
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [entityId, record, objectDef, connections, runScript],
  )

  // CrudActions filtradas por visibilidade no modo atual e por expressão visible
  const visibleActions = (objectDef.crudActions ?? []).filter((a) => {
    if (a.visibleOn && !a.visibleOn.includes(resolvedMode)) return false
    if (a.visible) {
      const result = evalExpr(a.visible as string, formValues)
      return result !== false && result !== 0 && result !== ''
    }
    return true
  })

  // Botões de salvar: só em create/edit, nunca em detail
  // showSaveButtons aceita boolean ou expressão string (avaliada contra formValues)
  const showSaveButtonsRaw = objectDef.showSaveButtons
  const showSaveButtonsOk = typeof showSaveButtonsRaw === 'string'
    ? evalExpr(showSaveButtonsRaw, formValues) !== false
    : showSaveButtonsRaw !== false
  const showStandardButtons =
    showSaveButtonsOk &&
    objectDef.hideButtons !== true &&
    !isDetail

  // Voltar: visível em qualquer modo (create, edit, detail)
  const showBackButton = objectDef.showBackButton !== false && objectDef.hideButtons !== true

  return (
    <div style={objectDef.style as React.CSSProperties}>
      {confirmDialog}
      <input
        ref={uploadInputRef}
        type="file"
        className="hidden"
        accept={uploadAction?.accept ?? '.xml,application/xml,text/xml'}
        onChange={handleUploadNavigate}
      />
      {/* Header — suprimido em modal (o ModalWrapper já exibe o título no header) */}
      {objectDef.title && objectDef.variant !== 'modal' && (
        <h3 className="mb-3 text-sm font-semibold text-foreground">
          {interpolateExpr(objectDef.title, { ...initialParams, ...formValues })}
        </h3>
      )}

      {/* Loading inicial — só exibe o spinner quando não há formData ainda (primeira carga) */}
      {isLoadingRecord && !objectState?.formData && (
        <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          Carregando...
        </div>
      )}

      {(!isLoadingRecord || !!objectState?.formData) && (
        <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
          {/* Campos */}
          <div className="grid grid-cols-12 gap-3">
            {components.map((comp, i) => (
              <FieldRenderer
                key={`${comp.idComponent}-${i}`}
                component={comp}
                register={form.register}
                control={form.control}
                watch={form.watch}
                setValue={form.setValue}
                getValues={form.getValues}
                errors={form.formState.errors}
                disabled={isDetail}
                mode={resolvedMode}
                formValues={formValues}
              />
            ))}
          </div>

          {/* Área de botões — form + crudActions juntos, posição via crudActionsPosition */}
          {(showStandardButtons || showBackButton || visibleActions.length > 0) && (
            <ButtonArea
              position={objectDef.crudActionsPosition}
              formButtons={(showStandardButtons || showBackButton) ? (
                <>
                  {/* Voltar: sempre visível (create, edit, detail) */}
                  {showBackButton && (
                    <button
                      type="button"
                      onClick={() => navigate(-1)}
                      className="rounded-md border border-border px-4 py-1.5 text-sm text-muted-foreground hover:bg-accent transition-colors cursor-pointer"
                    >
                      {objectDef.backButtonName ?? 'Voltar'}
                    </button>
                  )}
                  {/* Salvar/Criar: só em create e edit */}
                  {showStandardButtons && (
                    <button
                      type="submit"
                      disabled={mutation.isPending || parentIsCreating}
                      title={parentIsCreating ? 'Salve o registro principal antes de continuar' : undefined}
                      className="rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
                    >
                      {mutation.isPending
                        ? 'Salvando...'
                        : isCreate
                          ? (objectDef.createButtonName ?? 'Criar')
                          : (objectDef.updateButtonName ?? 'Salvar')}
                    </button>
                  )}
                </>
              ) : null}
              crudActions={visibleActions.length > 0 ? (
                <>
                  {visibleActions.map((action, i) => (
                    <CrudActionButton
                      key={i}
                      action={action}
                      isPending={mutation.isPending}
                      isSubmitAction={action.action === 'save' || action.action === 'submit'}
                      onClick={() => handleCrudAction(action)}
                      disabled={parentIsCreating}
                    />
                  ))}
                </>
              ) : null}
            />
          )}
        </form>
      )}
    </div>
  )
}

// ─── ButtonArea: layout de botões form + crudActions ─────────────────────────

interface ButtonAreaProps {
  position?: string        // 'left' | 'right' | 'top' | 'bottom' (padrão: 'left')
  formButtons: React.ReactNode
  crudActions: React.ReactNode
}

function ButtonArea({ position = 'left', formButtons, crudActions }: ButtonAreaProps) {
  if (position === 'top') {
    return (
      <div className="mt-4 flex flex-col gap-2">
        {crudActions && <div className="flex gap-2">{crudActions}</div>}
        {formButtons && <div className="flex gap-2">{formButtons}</div>}
      </div>
    )
  }
  if (position === 'bottom') {
    return (
      <div className="mt-4 flex flex-col gap-2">
        {formButtons && <div className="flex gap-2">{formButtons}</div>}
        {crudActions && <div className="flex gap-2">{crudActions}</div>}
      </div>
    )
  }
  if (position === 'right') {
    return (
      <div className="mt-4 flex items-center gap-2 justify-end">
        {formButtons}
        {crudActions}
      </div>
    )
  }
  // left (padrão)
  return (
    <div className="mt-4 flex items-center gap-2">
      {crudActions}
      {formButtons}
    </div>
  )
}

// ─── Botão de CrudAction ──────────────────────────────────────────────────────

interface CrudActionButtonProps {
  action: CrudAction
  isPending: boolean
  isSubmitAction: boolean
  onClick: () => void
  disabled?: boolean
}

function CrudActionButton({ action, isPending, isSubmitAction, onClick, disabled }: CrudActionButtonProps) {
  const rawVariant = action.variant ?? 'primary'
  // normaliza "btn-primary" → "primary"
  const variant = rawVariant.replace(/^btn-/, '')

  const baseClass = 'rounded-md px-4 py-1.5 text-sm font-medium transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed'
  const variantClass =
    variant === 'primary'
      ? 'bg-primary text-primary-foreground hover:bg-primary/90'
      : variant === 'secondary'
        ? 'bg-secondary text-secondary-foreground hover:bg-secondary/90'
        : variant === 'destructive' || variant === 'danger'
          ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
          : 'border border-border text-muted-foreground hover:bg-accent'

  return (
    <button
      type={isSubmitAction ? 'submit' : 'button'}
      disabled={disabled || (isPending && isSubmitAction)}
      title={disabled ? 'Salve o registro principal antes de continuar' : (action.tooltip ?? action.name)}
      className={`${baseClass} ${variantClass}`}
      onClick={isSubmitAction ? undefined : onClick}
    >
      {action.icon && <i className={`${action.icon} mr-1`} />}
      {isPending && isSubmitAction ? 'Salvando...' : action.name}
    </button>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Constrói os valores iniciais do formulário.
 *
 * @param applyDefaults
 *   true  → modo CREATE: aplica `defaultValue` de cada componente.
 *   false → modo EDIT/DETAIL: todos os campos iniciam como `''`.
 *           O valor real vem da API e é aplicado via form.reset(...record).
 *           Se não veio da API, o campo fica vazio — nunca usa defaultValue.
 */
function buildDefaultValues(
  objectDef: ObjectDefinition,
  params: Record<string, unknown> = {},
  applyDefaults = true,
): Record<string, unknown> {
  const values: Record<string, unknown> = {}
  for (const comp of objectDef.components ?? []) {
    // ChipSelect: cada opção tem seu próprio nameForm com valor padrão = opt.value
    if (comp.type === 'chipselect') {
      for (const opt of comp.options ?? []) {
        const key = opt.nameForm ?? opt.value
        if (key) values[key] = applyDefaults ? opt.value : ''
      }
      continue
    }
    if (!comp.nameForm && !comp.name) continue
    const key = comp.nameForm ?? comp.name
    values[key] = applyDefaults ? resolveDynamic(comp.defaultValue, params) : ''

    // Em CREATE (applyDefaults=true): autocomplete com params.key precisa ter o campo FK
    // inicializado para que useController receba o valor e a label seja exibida no mount.
    // Seguro com o novo cascade (anySourceDirty): buildDefaultValues não marca isDirty,
    // portanto mudanças durante o init nunca disparam o cascade no filho.
    //
    // Em EDIT/DETAIL (applyDefaults=false): omite — o valor vem da API via form.reset(record).
    if (applyDefaults && comp.type === 'autocomplete' && comp.params?.key && comp.params.key !== key) {
      values[comp.params.key] = resolveDynamic(comp.defaultValue, params)
    }
  }
  return values
}

function resolveDynamic(value: unknown, params: Record<string, unknown> = {}): unknown {
  if (typeof value !== 'string') return value ?? ''
  const nowMatch = value.match(/^\{\{now,\s*(.+?)\}\}$/)
  if (nowMatch) return formatDate(new Date(), nowMatch[1].trim())
  // Usa evalExpr: avalia expressões JS como "{{tipo_nfe}} === 'Entrada' ? 0 : 1"
  if (value.includes('{{')) return evalExpr(value, params) ?? value
  return value
}

/**
 * Normaliza ISO 8601 para o formato que datetime-local aceita (YYYY-MM-DDTHH:mm:ss).
 * Remove milissegundos e timezone — o input não os reconhece e mostra vazio.
 *   "2025-12-06T13:46:00.000+00:00" → "2025-12-06T13:46:00"
 *   "2025-12-06T13:46:00"           → "2025-12-06T13:46:00"  (sem alteração)
 *   outros                          → mantém
 */
function normalizeDatetimeForInput(value: unknown): unknown {
  if (typeof value !== 'string') return value
  const m = value.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})/)
  if (m) return `${m[1]}T${m[2]}`
  return value
}

/**
 * Normaliza para o formato MySQL (YYYY-MM-DD HH:mm:ss) antes de enviar ao servidor.
 *   "2025-12-06T13:46:00.000+00:00" → "2025-12-06 13:46:00"
 *   "2025-12-06T13:46:00"           → "2025-12-06 13:46:00"
 *   outros                          → mantém
 */
function normalizeDatetimeForDb(value: unknown): unknown {
  if (typeof value !== 'string') return value
  const m = value.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})/)
  if (m) return `${m[1]} ${m[2]}`
  return value
}

function formatDate(date: Date, fmt: string): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return fmt
    .replace('YYYY', String(date.getFullYear()))
    .replace('MM',   pad(date.getMonth() + 1))
    .replace('DD',   pad(date.getDate()))
    .replace('HH',   pad(date.getHours()))
    .replace('mm',   pad(date.getMinutes()))
    .replace('SS',   pad(date.getSeconds()))
    .replace('ss',   pad(date.getSeconds()))
}
