import { useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm, useWatch } from 'react-hook-form'
import { useStore } from 'zustand'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useViewContext } from '../ViewContext'
import { useConnectionParams } from '../ObjectRenderer'
import { FieldRenderer } from '../fields/FieldRenderer'
import { entityApi } from '@/api/entity.api'
import { scriptApi } from '@/api/script.api'
import { apiClient } from '@/api/client'
import { useToast } from '@/components/ui/Toast'
import { evalExpr, interpolateExpr } from '@/utils/evalExpr' // interpolateExpr usado no título
import type { ObjectDefinition, CrudAction } from '@/types/view.types'
import type { EntityRecord } from '@/types/entity.types'
import type { ObjectState } from '@/store/viewStore'

interface Props {
  objectDef: ObjectDefinition
}

type CrudMode = 'create' | 'edit' | 'detail'

// ─── CrudObject ───────────────────────────────────────────────────────────────

export function CrudObject({ objectDef }: Props) {
  const navigate = useNavigate()
  const { viewStore, initialParams = {}, connections, definition } = useViewContext()
  const objectState = useStore(viewStore, (s) => s.objects[objectDef.id])
  const setObjectState = useStore(viewStore, (s) => s.setObjectState)
  const queryClient = useQueryClient()
  const toast = useToast()

  const connectionParams = useConnectionParams(objectDef.id)

  const qp = objectState?.queryParams

  // ─── Filtro para carregar o registro ─────────────────────────────────────────
  // Prioridade: queryParams (setados pela action) > initialParams > selectedRow
  // Nunca usa connectionParams — esses são filtros de listagem, não de registro único.
  const isValid = (v: unknown) => v !== undefined && v !== null && v !== ''

  const loadFilter: Record<string, unknown> = (() => {
    // 1. queryParams vindos da action (ex: { id_lancamento_gerencial: 5 })
    if (qp && Object.keys(qp).length > 0) {
      const entries = Object.entries(qp).filter(([, v]) => isValid(v))
      if (entries.length > 0) return Object.fromEntries(entries)
    }

    // 2. initialParams de navegação (ex: URL ?id_financeiro=8)
    const ip = initialParams as Record<string, unknown>
    const ipEntries = Object.entries(ip).filter(
      ([k, v]) => k !== '_mode' && isValid(v)
    )
    if (ipEntries.length > 0) return Object.fromEntries(ipEntries)

    // 3. selectedRow como último recurso (ex: connection pai→filho sem queryParams explícito)
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
  const { data: record, isLoading: isLoadingRecord } = useQuery({
    queryKey: ['entity-single', objectDef.entity, JSON.stringify(loadFilter)],
    queryFn: async () => {
      const res = await entityApi.getList<EntityRecord>(objectDef.entity, {
        ...loadFilter,
        pageSize: 1,
      })
      const rows = (res as { data?: EntityRecord[] }).data ?? (Array.isArray(res) ? res as EntityRecord[] : [])
      return rows[0] as EntityRecord | undefined
    },
    enabled: !!entityId && !!objectDef.entity && !isCreate,
    staleTime: 30_000,
  })

  const form = useForm<Record<string, unknown>>({
    defaultValues: { ...initialParams, ...buildDefaultValues(objectDef, initialParams) },
  })

  const watchedValues = useWatch({ control: form.control }) as Record<string, unknown>

  // Calcula computedFrom SINCRONAMENTE durante o render — assim formValues já tem
  // os valores corretos antes dos filhos renderizarem (resolve visible dependente de computedFrom)
  const rawFormValues = { ...initialParams, ...watchedValues }
  const computedOverrides: Record<string, unknown> = {}
  for (const comp of objectDef.components ?? []) {
    if (!comp.computedFrom) continue
    const targetField = comp.computedName ?? comp.nameForm ?? comp.name
    if (!targetField) continue
    const result = evalExpr(comp.computedFrom, rawFormValues)
    if (result !== undefined) computedOverrides[targetField] = result
  }
  const formValues = { ...rawFormValues, ...computedOverrides }

  // Efeito: sincroniza os valores computados com o form (para submissão)
  // Em modo edit, só aplica computedFrom em campos sem valor carregado do banco
  const allComputedComponents = (objectDef.components ?? []).filter((c) => c.computedFrom)
  useEffect(() => {
    for (const comp of allComputedComponents) {
      const targetField = comp.computedName ?? comp.nameForm ?? comp.name
      if (!targetField) continue
      const result = evalExpr(comp.computedFrom!, formValues)
      if (result === undefined) continue
      const current = form.getValues(targetField)
      // Em modo edit com registro carregado, não sobrescreve valores existentes do banco
      if (!isCreate && record && current !== undefined && current !== '' && current !== null) continue
      if (String(result) !== String(current ?? '')) {
        form.setValue(targetField, result, { shouldDirty: true })
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(rawFormValues)])


  const baseDefaults = () => ({ ...initialParams, ...buildDefaultValues(objectDef, initialParams) })

  // Preenche o form quando o registro carrega ou o ID muda
  useEffect(() => {
    if (record) {
      form.reset({ ...baseDefaults(), ...(record as Record<string, unknown>) })
      setObjectState(objectDef.id, { formData: record as Record<string, unknown> })
    } else if (isCreate) {
      form.reset(baseDefaults())
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
        return entityApi.create(objectDef.entity, values)
      } else {
        // A chave primária vai sempre no body — a URL não leva ID
        return entityApi.update(objectDef.entity, {
          [entityIdField]: entityId,
          ...values,
        })
      }
    },
    onSuccess: (result) => {
      // Invalida queries da entidade para forçar reload em tabelas filhas
      queryClient.invalidateQueries({ queryKey: ['entity', objectDef.entity] })

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
          if (sibObj?.entity && sibObj.entity !== objectDef.entity) {
            queryClient.invalidateQueries({ queryKey: ['entity', sibObj.entity] })
          }
        }
      }

      // Normaliza o resultado: EntityMutationResponse tem .data, ou pode vir diretamente
      const newRecord: Record<string, unknown> =
        result.data ?? (result as unknown as Record<string, unknown>)

      toast.success('Salvo com sucesso.')

      // Executa hooks afterCreate / afterUpdate
      const hooks = isCreate
        ? (objectDef.afterCreate ?? [])
        : (objectDef.afterUpdate ?? [])
      for (const hook of hooks) {
        if (hook.type === 'script') {
          scriptApi.execute(hook.name, { ...newRecord })
            .then((res) => {
              if (res.messageError) toast.error(res.messageError)
              if (res.reload) queryClient.invalidateQueries({ queryKey: ['entity', objectDef.entity] })
              for (const e of res.affectedEntities ?? []) {
                queryClient.invalidateQueries({ queryKey: ['entity', e] })
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
        setObjectState(objectDef.id, { mode: 'edit' })
      } else if (after === 'detail') {
        setObjectState(objectDef.id, { mode: 'detail' })
      } else if (after === 'create') {
        form.reset(buildDefaultValues(objectDef, initialParams))
        setObjectState(objectDef.id, { mode: 'create', formData: null, selectedRow: null })
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

  const transientKeys = new Set([
    // Params de navegação da URL — exceto os que têm componente de input explícito
    ...Object.keys(initialParams).filter((k) => !explicitInputKeys.has(k)),
    ...(objectDef.components ?? []).flatMap((c) => {
      const keys: string[] = []
      const fieldKey = c.nameForm ?? c.name
      // Explicitamente marcado como transient
      if (c.transient) keys.push(fieldKey)
      // Tipos display-only (não são inputs de dados)
      if (DISPLAY_TYPES.has(c.type)) keys.push(fieldKey)
      // Campo com computedName: o nameForm é display, o computedName é helper calculado
      if (c.computedName) keys.push(c.computedName)
      // Campo sem nameForm em tipo display (usa name como key)
      if (!c.nameForm && DISPLAY_TYPES.has(c.type)) keys.push(c.name)
      // Autocomplete com params.key: nameForm é só display — apenas params.key vai no body
      if (c.type === 'autocomplete' && c.params?.key && c.nameForm) {
        keys.push(c.nameForm)
      }
      // ChipSelect: o name do componente é só label — os campos reais estão em cada opt.nameForm
      if (c.type === 'chipselect') {
        keys.push(c.name)           // ex: "Papéis" — nunca vai ao banco
        if (c.nameForm) keys.push(c.nameForm)
      }
      return keys
    }),
  ])

  function onSubmit(values: Record<string, unknown>) {
    const body = Object.fromEntries(
      Object.entries(values).filter(([key]) => !transientKeys.has(key))
    )
    // Garante FKs da connection pai→filho no body.
    // Cobre o caso em que o modal abre antes de connectionParams estar populado
    // e o defaultValue "{{campo}}" não resolve (fica como string literal ou vazio).
    for (const [key, value] of Object.entries(connectionParams)) {
      if (transientKeys.has(key)) continue
      const current = body[key]
      const isUnresolved =
        typeof current === 'string' && /\{\{/.test(current)
      if (current === undefined || current === null || current === '' || isUnresolved) {
        body[key] = value
      }
    }
    mutation.mutate(body)
  }

  // Componentes do objeto (excluindo generalActions — vão pro header)
  const components = (objectDef.components ?? []).filter(
    (c) => c.type !== 'generalActions',
  )

  // Helper: executa um script com interpolação de params e feedback visual
  const runScript = useCallback(
    (scriptId: string, action: CrudAction) => {
      const values = form.getValues()
      const inputs: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(action.params ?? {})) {
        inputs[k] = String(v).replace(/\{\{(\w+)\}\}/g, (_, f) =>
          values[f] !== undefined ? String(values[f]) : '',
        )
      }
      scriptApi.execute(scriptId, inputs)
        .then((result) => {
          if (result.messageError) toast.error(result.messageError)
          else if (result.message) toast.success(result.message)
          // Recarrega se o script pediu OU se a action tem reloadAfterAction
          if (result.reload || action.reloadAfterAction) {
            queryClient.invalidateQueries({ queryKey: ['entity', objectDef.entity] })
            queryClient.invalidateQueries({ queryKey: ['entity-single', objectDef.entity] })
          }
          for (const e of result.affectedEntities ?? []) {
            queryClient.invalidateQueries({ queryKey: ['entity', e] })
          }
          if (result.formUpdates) {
            for (const [k, v] of Object.entries(result.formUpdates)) {
              form.setValue(k, v)
            }
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
    [objectDef.entity],
  )

  // Handler de ação customizada
  const handleCrudAction = useCallback(
    (action: CrudAction) => {
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
          form.reset(buildDefaultValues(objectDef, initialParams))
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
            if (record) form.reset({ ...buildDefaultValues(objectDef, initialParams), ...(record as Record<string, unknown>) })
          } else {
            form.reset(buildDefaultValues(objectDef, initialParams))
          }
          break
        case 'save':
        case 'submit':
          form.handleSubmit(onSubmit)()
          break
        case 'delete':
          if (entityId && window.confirm(action.confirmation ?? 'Confirmar exclusão?')) {
            entityApi.remove(objectDef.entity, entityId).then(() => {
              queryClient.invalidateQueries({ queryKey: ['entity', objectDef.entity] })
              form.reset(buildDefaultValues(objectDef, initialParams))
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
                queryClient.invalidateQueries({ queryKey: ['entity', objectDef.entity] })
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
        case 'navigate':
        case 'navigation': {
          const screen = action.url ?? action.object ?? ''
          if (!screen) break
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
          navigate(`/home/${screen}`, params ? { state: { searchParams: params } } : undefined)
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
          queryClient.invalidateQueries({ queryKey: ['entity', objectDef.entity] })
          queryClient.invalidateQueries({ queryKey: ['entity-single', objectDef.entity] })
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
          const scriptId = action.script ?? action.scriptId ?? action.action
          console.warn('[CrudObject] Action não mapeada, executando como script:', scriptId)
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

  const showStandardButtons =
    objectDef.showSaveButtons !== false &&
    objectDef.hideButtons !== true &&
    !isDetail

  return (
    <div style={objectDef.style as React.CSSProperties}>
      {/* Header */}
      {objectDef.title && (
        <h3 className="mb-3 text-sm font-semibold text-foreground">
          {interpolateExpr(objectDef.title, { ...initialParams, ...formValues })}
        </h3>
      )}

      {/* Loading do registro */}
      {isLoadingRecord && (
        <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          Carregando...
        </div>
      )}

      {!isLoadingRecord && (
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
          {(showStandardButtons || visibleActions.length > 0) && (
            <ButtonArea
              position={objectDef.crudActionsPosition}
              formButtons={showStandardButtons ? (
                <>
                  {objectDef.showBackButton && (
                    <button
                      type="button"
                      onClick={() => navigate(-1)}
                      className="rounded-md border border-border px-4 py-1.5 text-sm text-muted-foreground hover:bg-accent transition-colors"
                    >
                      {objectDef.backButtonName ?? 'Voltar'}
                    </button>
                  )}
                  <button
                    type="submit"
                    disabled={mutation.isPending}
                    className="rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
                  >
                    {mutation.isPending
                      ? 'Salvando...'
                      : isCreate
                        ? (objectDef.createButtonName ?? 'Criar')
                        : (objectDef.updateButtonName ?? 'Salvar')}
                  </button>
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
}

function CrudActionButton({ action, isPending, isSubmitAction, onClick }: CrudActionButtonProps) {
  const rawVariant = action.variant ?? 'primary'
  // normaliza "btn-primary" → "primary"
  const variant = rawVariant.replace(/^btn-/, '')

  const baseClass = 'rounded-md px-4 py-1.5 text-sm font-medium transition-colors disabled:opacity-50'
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
      disabled={isPending && isSubmitAction}
      title={action.tooltip ?? action.name}
      className={`${baseClass} ${variantClass}`}
      onClick={isSubmitAction ? undefined : onClick}
    >
      {action.icon && <i className={`${action.icon} mr-1`} />}
      {isPending && isSubmitAction ? 'Salvando...' : action.name}
    </button>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildDefaultValues(objectDef: ObjectDefinition, params: Record<string, unknown> = {}): Record<string, unknown> {
  const values: Record<string, unknown> = {}
  for (const comp of objectDef.components ?? []) {
    // ChipSelect: cada opção tem seu próprio nameForm com valor padrão = opt.value
    if (comp.type === 'chipselect') {
      for (const opt of comp.options ?? []) {
        const key = opt.nameForm ?? opt.value
        if (key) values[key] = opt.value  // valor inicial da opção (ex: "Não")
      }
      continue
    }
    if (!comp.nameForm && !comp.name) continue
    const key = comp.nameForm ?? comp.name
    values[key] = resolveDynamic(comp.defaultValue, params)
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

function formatDate(date: Date, fmt: string): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return fmt
    .replace('YYYY', String(date.getFullYear()))
    .replace('MM', pad(date.getMonth() + 1))
    .replace('DD', pad(date.getDate()))
}
