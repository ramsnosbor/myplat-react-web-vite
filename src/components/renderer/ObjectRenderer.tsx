import { useMemo } from 'react'
import { useStore } from 'zustand'
import { useViewContext } from './ViewContext'
import type { ObjectDefinition, Connection } from '@/types/view.types'
import { TableObject } from './objects/TableObject'
import { FilterObject } from './objects/FilterObject'
import { CrudObject } from './objects/CrudObject'
import { PanelObject } from './objects/PanelObject'
import { ChartObject } from './objects/ChartObject'
import { GridObject } from './objects/GridObject'
import { BulkEditTableObject } from './objects/BulkEditTableObject'

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

    const params: Record<string, unknown> = {}
    for (const [childKey, parentKey] of Object.entries(connection.keys)) {
      const fieldValue =
        parentState.selectedRow?.[parentKey] ??
        parentState.formData?.[parentKey] ??
        parentState.queryParams?.[parentKey]

      if (fieldValue !== undefined && fieldValue !== null && fieldValue !== '') {
        // Valor encontrado no estado do pai → usa
        params[childKey] = fieldValue
      } else if (!parentFieldNames.has(parentKey)) {
        // parentKey NÃO é campo do pai → valor literal estático
        // Ex: { "origem": "Financeiro" } → params.origem = "Financeiro"
        params[childKey] = parentKey
      }
      // parentKey É campo do pai mas sem valor → omite (pai ainda não tem o ID)
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

  // Campos declarados nos componentes do pai
  const parentObj = definition.objects.find((o) => o.id === connection.parent)
  const parentFieldNames = new Set(
    (parentObj?.components ?? []).flatMap((c) =>
      [c.nameForm, c.name].filter(Boolean) as string[],
    ),
  )

  // Chaves que são referências a campos do pai (não literais)
  const fieldRefKeys = Object.entries(connection.keys).filter(([, parentKey]) =>
    parentFieldNames.has(parentKey),
  )

  if (fieldRefKeys.length === 0) {
    // Todas as chaves são literais → sempre habilitado
    return true
  }

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

// ─── ObjectRenderer ───────────────────────────────────────────────────────────

interface ObjectRendererProps {
  objectDef: ObjectDefinition
}

export function ObjectRenderer({ objectDef }: ObjectRendererProps) {
  const { viewStore } = useViewContext()

  // Lê o mode do viewStore para controlar visibilidade de objetos dinâmicos.
  // O hook deve ser chamado antes de qualquer early return (regra dos hooks).
  const objectMode = useStore(viewStore, (s) => s.objects[objectDef.id]?.mode ?? null)

  // Sempre oculto: hidden=true no JSON
  if (objectDef.hidden) return null

  // Objetos dinâmicos: o ObjectSlot (no ViewRenderer) já não renderiza o wrapper.
  // Esta guarda cobre o caso de ObjectRenderer ser chamado diretamente (ex: dentro de ModalWrapper).
  if (objectDef.dynamic && !objectMode) return null

  switch (objectDef.type) {
    case 'table':
      return <TableObject objectDef={objectDef} />
    case 'filter':
      return <FilterObject objectDef={objectDef} />
    case 'crud':
      return <CrudObject objectDef={objectDef} />
    case 'panel':
      return <PanelObject objectDef={objectDef} />
    case 'chart':
      return <ChartObject objectDef={objectDef} />
    case 'grid':
      return <GridObject objectDef={objectDef} />
    case 'bulkEditTable':
      return <BulkEditTableObject objectDef={objectDef} />
    default:
      return (
        <div className="rounded-md border border-border p-4 text-sm text-muted-foreground">
          Object type <code className="font-mono">{objectDef.type}</code> ainda não implementado.
        </div>
      )
  }
}

