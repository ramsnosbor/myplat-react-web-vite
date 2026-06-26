import { useMemo, lazy, Suspense, type ReactNode } from 'react'
import { useStore } from 'zustand'
import { useViewContext } from './ViewContext'
import type { ObjectDefinition, Connection } from '@/types/view.types'
import { TableObject } from './objects/TableObject'
import { FilterObject } from './objects/FilterObject'
import { CrudObject } from './objects/CrudObject'
import { PanelObject } from './objects/PanelObject'
import { GridObject } from './objects/GridObject'
import { BulkEditTableObject } from './objects/BulkEditTableObject'
import { IframeObject } from './objects/IframeObject'
import { TreeObject } from './objects/TreeObject'
import { QuestionarioBuilderObject } from './objects/QuestionarioBuilderObject'
import { QuestionarioResponderObject } from './objects/QuestionarioResponderObject'
import { QuestionarioModeloObject } from './objects/QuestionarioModeloObject'
import { AttachmentsObject } from './objects/AttachmentsObject'
import { ApprovalListObject } from './objects/ApprovalListObject'

// Lazy: isola recharts num chunk separado, evitando o bug de bundling em prod
const ChartObject = lazy(() => import('./objects/ChartObject').then((m) => ({ default: m.ChartObject })))

// ─── Hook: calcula params do filho a partir do estado do pai ─────────────────

/**
 * Dado um objectId (filho), encontra a connection onde ele é filho,
 * lê o estado do pai no viewStore e retorna os params de filtro.
 *
 * Exemplo: connection = { parent: "filtroFinanceiro", child: "tabelaFinanceiro",
 *                          keys: { id_financeiro: "id_financeiro" } }
 *
 * Se o pai tem selectedRow.id_financeiro = 1249, retorna { id_financeiro: 1249 }.
 * Quando o pai muda → useMemo recalcula → queryKey do filho muda → TanStack refaz a query.
 */
export function useConnectionParams(objectId: string): Record<string, unknown> {
  const { connections, viewStore, definition } = useViewContext()

  // Encontra a connection onde este object é filho
  const connection: Connection | undefined = connections.find(
    (c) => c.child === objectId,
  )

  // Lê estado atual do pai (reativo via Zustand)
  const parentState = useStore(viewStore, (s) =>
    connection ? s.objects[connection.parent] : null,
  )

  return useMemo(() => {
    if (!connection || !parentState) return {}

    // Campos declarados nos componentes do pai — distingue referências de literais.
    // Se parentKey é um campo real do pai → referência dinâmica.
    // Se não existe nos componentes → valor literal estático (ex: "Financeiro").
    const parentObj = definition.objects.find((o) => o.id === connection.parent)
    const parentFieldNames = new Set(
      (parentObj?.components ?? []).flatMap((c) =>
        [c.nameForm, c.name].filter(Boolean) as string[],
      ),
    )

    // Considera qualquer valor definido (inclusive 0) como válido para propagar ao filho.
    // O valor 0 pode ser um ID legítimo (ex: nfe_status com id_nfe_status=0).
    // Quando o pai está em create mode e o ID ainda não existe, useConnectionEnabled
    // já bloqueia a query do filho — aqui não precisamos filtrar 0.
    const hasValue = (v: unknown) =>
      v !== undefined && v !== null && v !== ''

    // Heurística: parentKey que começa com "id_" é sempre referência de campo,
    // mesmo que não esteja declarado nos componentes (ex: PK gerada pelo backend).
    // Valores literais estáticos (ex: "Financeiro", "Ativo") nunca começam com "id_".
    const isFieldRef = (parentKey: string) =>
      parentFieldNames.has(parentKey) || parentKey.startsWith('id_')

    const params: Record<string, unknown> = {}
    for (const [childKey, parentKey] of Object.entries(connection.keys)) {
      // Prioridade: selectedRow (click na tabela) > queryParams (ação explícita) > formData
      const fromSelectedRow = parentState.selectedRow?.[parentKey]
      const fromQueryParams = parentState.queryParams?.[parentKey]
      const fromFormData = hasValue(parentState.formData?.[parentKey])
        ? parentState.formData?.[parentKey]
        : undefined

      const fieldValue = fromSelectedRow ?? fromQueryParams ?? fromFormData

      if (fieldValue !== undefined && fieldValue !== null && fieldValue !== '') {
        // Valor encontrado no estado do pai → usa
        params[childKey] = fieldValue
      } else if (!isFieldRef(parentKey)) {
        // parentKey NÃO é referência de campo → valor literal estático
        // Ex: { "origem": "Financeiro" } → params.origem = "Financeiro"
        params[childKey] = parentKey
      }
      // parentKey é referência de campo mas sem valor no pai → omite
    }
    return params
  }, [connection, parentState, definition])
}

/**
 * Verifica se o filho tem todos os params obrigatórios para fazer a query.
 * Distingue referências de campos (parentKey existe nos componentes do pai)
 * de valores literais (não existe nos componentes → sempre habilitado).
 */
export function useConnectionEnabled(objectId: string): boolean {
  const { connections, viewStore, definition } = useViewContext()
  const connection = connections.find((c) => c.child === objectId)
  const parentState = useStore(viewStore, (s) =>
    connection ? s.objects[connection.parent] : null,
  )

  if (!connection) return true // sem connection → sempre habilitado
  // Conexão soft (declarada dentro do objeto) → não bloqueia, existe só para invalidação
  if (connection.blocking === false) return true

  // Campos declarados nos componentes do pai
  const parentObj = definition.objects.find((o) => o.id === connection.parent)
  const parentFieldNames = new Set(
    (parentObj?.components ?? []).flatMap((c) =>
      [c.nameForm, c.name].filter(Boolean) as string[],
    ),
  )

  // Heurística: parentKey que começa com "id_" é sempre referência de campo,
  // mesmo que não esteja declarado nos componentes (ex: PK gerada pelo backend).
  const isFieldRef = (parentKey: string) =>
    parentFieldNames.has(parentKey) || parentKey.startsWith('id_')

  // Chaves que são referências a campos do pai (não literais)
  const fieldRefKeys = Object.entries(connection.keys).filter(([, parentKey]) =>
    isFieldRef(parentKey),
  )

  if (fieldRefKeys.length === 0) {
    // Todas as chaves são literais → sempre habilitado
    return true
  }

  // Se o pai está em create mode, o registro ainda não foi salvo —
  // não há FK real para filtrar o filho. Bloqueia a query para evitar
  // retornar todos os registros do banco sem filtro.
  if (parentState?.mode === 'create') return false

  // Tem referências de campo → habilita somente quando ao menos uma tem valor no pai
  const dynamicEntries = fieldRefKeys.filter(([, parentKey]) => {
    const v =
      parentState?.selectedRow?.[parentKey] ??
      parentState?.formData?.[parentKey] ??
      parentState?.queryParams?.[parentKey]
    return v !== undefined && v !== null && v !== ''
  })

  return dynamicEntries.length > 0
}

/**
 * Retorna true se o pai direto deste objeto está em modo 'create'.
 * Usado para desabilitar ações de filhos enquanto o registro pai não foi salvo.
 */
export function useParentIsCreating(objectId: string): boolean {
  const { connections, viewStore } = useViewContext()
  const connection = connections.find(
    (c) => c.child === objectId && c.blocking !== false,
  )
  return useStore(viewStore, (s) =>
    connection ? s.objects[connection.parent]?.mode === 'create' : false,
  )
}

// ─── ObjectRenderer ───────────────────────────────────────────────────────────

interface ObjectRendererProps {
  objectDef: ObjectDefinition
}

const CHILD_LAYOUT_CLASS: Record<string, string> = {
  horizontal: 'flex flex-row flex-wrap gap-3',
  vertical:   'flex flex-col gap-3',
  grid:       'grid grid-cols-12 gap-4',
}

export function ObjectRenderer({ objectDef }: ObjectRendererProps) {
  const { viewStore, definition } = useViewContext()

  // Lê o mode do viewStore para controlar visibilidade de objetos dinâmicos.
  // O hook deve ser chamado antes de qualquer early return (regra dos hooks).
  const objectMode = useStore(viewStore, (s) => s.objects[objectDef.id]?.mode ?? null)

  // Sempre oculto: hidden=true no JSON
  if (objectDef.hidden) return null

  // Objetos dinâmicos: o ObjectSlot (no ViewRenderer) já não renderiza o wrapper.
  // Esta guarda cobre o caso de ObjectRenderer ser chamado diretamente (ex: dentro de ModalWrapper).
  if (objectDef.dynamic && !objectMode) return null

  let content: ReactNode

  switch (objectDef.type) {
    case 'table':
      content = <TableObject objectDef={objectDef} />
      break
    case 'filter':
      content = <FilterObject objectDef={objectDef} />
      break
    case 'crud':
      content = <CrudObject objectDef={objectDef} />
      break
    case 'panel':
      content = <PanelObject objectDef={objectDef} />
      break
    case 'chart':
      content = (
        <Suspense fallback={<div className="flex items-center justify-center py-8"><div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div>}>
          <ChartObject objectDef={objectDef} />
        </Suspense>
      )
      break
    case 'grid':
      content = <GridObject objectDef={objectDef} />
      break
    case 'bulkEditTable':
      content = <BulkEditTableObject objectDef={objectDef} />
      break
    case 'iframe':
      content = <IframeObject objectDef={objectDef} />
      break
    case 'tree':
      content = <TreeObject objectDef={objectDef} />
      break
    case 'questionarioBuilder':
      content = <QuestionarioBuilderObject objectDef={objectDef} />
      break
    case 'questionarioResponder':
      content = <QuestionarioResponderObject objectDef={objectDef} />
      break
    case 'questionarioModelo':
      content = <QuestionarioModeloObject objectDef={objectDef} />
      break
    case 'attachments':
      content = <AttachmentsObject objectDef={objectDef} />
      break
    case 'approvalList':
      content = <ApprovalListObject objectDef={objectDef} />
      break
    default:
      content = (
        <div className="rounded-md border border-border p-4 text-sm text-muted-foreground">
          Object type <code className="font-mono">{objectDef.type}</code> ainda não implementado.
        </div>
      )
  }

  // Renderiza objetos filhos embutidos (childs) logo abaixo do conteúdo principal
  if (objectDef.childs && objectDef.childs.length > 0) {
    const layoutClass = CHILD_LAYOUT_CLASS[objectDef.childLayout ?? 'vertical'] ?? 'flex flex-col gap-3'
    const childObjects = objectDef.childs
      .map((childId) => definition.objects.find((o) => o.id === childId))
      .filter((o): o is ObjectDefinition => o !== undefined)

    return (
      <>
        {content}
        <div className={`mt-3 ${layoutClass}`}>
          {childObjects.map((child) => {
            // Objetos modal são forçados a renderizar inline (sem overlay)
            const inlineDef: ObjectDefinition =
              child.variant === 'modal'
                ? { ...child, variant: undefined, dynamic: false }
                : child
            return <ObjectRenderer key={child.id} objectDef={inlineDef} />
          })}
        </div>
      </>
    )
  }

  return content
}

