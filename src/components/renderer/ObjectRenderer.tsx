import { useMemo } from 'react'
import { useStore } from 'zustand'
import { useViewContext } from './ViewRenderer'
import type { ObjectDefinition, Connection } from '@/types/view.types'

// Importações dos tipos de object (serão criados progressivamente)
// import { TableObject } from './objects/TableObject'
// import { FilterObject } from './objects/FilterObject'
// import { CrudObject } from './objects/CrudObject'

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
  const { connections, viewStore } = useViewContext()

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

    const params: Record<string, unknown> = {}
    for (const [childKey, parentKey] of Object.entries(connection.keys)) {
      const value =
        parentState.selectedRow?.[parentKey] ??
        parentState.formData?.[parentKey] ??
        parentState.queryParams?.[parentKey]

      if (value !== undefined && value !== null && value !== '') {
        params[childKey] = value
      }
    }
    return params
  }, [connection, parentState])
}

/**
 * Verifica se o filho tem todos os params obrigatórios para fazer a query.
 * Se a connection exige dados do pai mas não há pai ou o pai não tem dados,
 * retorna false e o TanStack Query não executa a query (enabled: false).
 */
export function useConnectionEnabled(objectId: string): boolean {
  const { connections } = useViewContext()
  const connection = connections.find((c) => c.child === objectId)
  const params = useConnectionParams(objectId)

  if (!connection) return true // sem connection → sempre habilitado

  // Deve ter ao menos um dos campos do connection preenchido
  const requiredKeys = Object.keys(connection.keys)
  return requiredKeys.some((k) => params[k] !== undefined)
}

// ─── ObjectRenderer ───────────────────────────────────────────────────────────

interface ObjectRendererProps {
  objectDef: ObjectDefinition
}

export function ObjectRenderer({ objectDef }: ObjectRendererProps) {
  if (objectDef.hidden) return null

  switch (objectDef.type) {
    case 'table':
      return <TableObjectPlaceholder objectDef={objectDef} />
    case 'filter':
      return <FilterObjectPlaceholder objectDef={objectDef} />
    case 'crud':
      return <CrudObjectPlaceholder objectDef={objectDef} />
    case 'panel':
      return <PanelObjectPlaceholder objectDef={objectDef} />
    default:
      return (
        <div className="rounded-md border border-border p-4 text-sm text-muted-foreground">
          Object type <code className="font-mono">{objectDef.type}</code> ainda não implementado.
        </div>
      )
  }
}

// ─── Placeholders (serão substituídos pelas implementações reais) ─────────────

function TableObjectPlaceholder({ objectDef }: { objectDef: ObjectDefinition }) {
  const connectionParams = useConnectionParams(objectDef.id)
  const enabled = useConnectionEnabled(objectDef.id)

  return (
    <div className="rounded-md border border-border p-4">
      <p className="text-sm font-medium">{objectDef.title ?? objectDef.id}</p>
      <p className="text-xs text-muted-foreground mt-1">
        Tabela | entity: <code className="font-mono">{objectDef.entity}</code>
        {!enabled && ' | aguardando pai...'}
      </p>
      {Object.keys(connectionParams).length > 0 && (
        <pre className="mt-2 rounded bg-muted px-2 py-1 text-xs">
          {JSON.stringify(connectionParams, null, 2)}
        </pre>
      )}
    </div>
  )
}

function FilterObjectPlaceholder({ objectDef }: { objectDef: ObjectDefinition }) {
  return (
    <div className="rounded-md border border-border p-4">
      <p className="text-sm font-medium">{objectDef.title ?? objectDef.id}</p>
      <p className="text-xs text-muted-foreground mt-1">
        Filtro | entity: <code className="font-mono">{objectDef.entity}</code>
      </p>
    </div>
  )
}

function CrudObjectPlaceholder({ objectDef }: { objectDef: ObjectDefinition }) {
  const connectionParams = useConnectionParams(objectDef.id)

  return (
    <div className="rounded-md border border-border p-4">
      <p className="text-sm font-medium">{objectDef.title ?? objectDef.id}</p>
      <p className="text-xs text-muted-foreground mt-1">
        CRUD | entity: <code className="font-mono">{objectDef.entity}</code>
      </p>
      {Object.keys(connectionParams).length > 0 && (
        <pre className="mt-2 rounded bg-muted px-2 py-1 text-xs">
          {JSON.stringify(connectionParams, null, 2)}
        </pre>
      )}
    </div>
  )
}

function PanelObjectPlaceholder({ objectDef }: { objectDef: ObjectDefinition }) {
  return (
    <div className="rounded-md border border-border p-4">
      <p className="text-sm font-medium">{objectDef.title ?? objectDef.id}</p>
      <p className="text-xs text-muted-foreground mt-1">
        Painel | entity: <code className="font-mono">{objectDef.entity}</code>
      </p>
    </div>
  )
}
