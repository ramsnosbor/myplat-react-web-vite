import { useStore } from 'zustand'
import { useQuery } from '@tanstack/react-query'
import { entityApi } from '@/api/entity.api'
import { useViewContext } from '../ViewContext'
import { useConnectionParams, useConnectionEnabled } from '../ObjectRenderer'
import type { ObjectDefinition } from '@/types/view.types'
import { interpolate } from '@/utils/interpolate'
import type { EntityRecord } from '@/types/entity.types'

interface Props {
  objectDef: ObjectDefinition
}

/**
 * PanelObject — exibe campos de um registro em modo leitura (label: valor).
 *
 * Prioridade de dados:
 * 1. objectState.formData do viewStore (pai já preencheu via connection)
 * 2. entityApi.getById  quando há entityId nas connections
 * 3. entityApi.getList  com connectionParams (primeiro resultado)
 */
export function PanelObject({ objectDef }: Props) {
  const { viewStore, initialParams } = useViewContext()
  const objectState = useStore(viewStore, (s) => s.objects[objectDef.id])
  const connectionParams = useConnectionParams(objectDef.id)
  const enabled = useConnectionEnabled(objectDef.id)

  const entity = objectDef.entity
  const primaryKey = objectDef.primaryKey ?? 'id'

  // ID prioritário: connection → selectedRow → formData
  const entityId =
    (connectionParams[primaryKey] as string | number | undefined) ??
    (objectState?.selectedRow?.[primaryKey] as string | number | undefined) ??
    (objectState?.formData?.[primaryKey] as string | number | undefined)

  // Dados já disponíveis no viewStore (evita chamada desnecessária à API)
  const storedRecord =
    (objectState?.formData ?? objectState?.selectedRow) as EntityRecord | null | undefined

  // Query 1: busca individual por ID
  const { data: singleData, isLoading: isLoadingSingle, isError: isErrorSingle } = useQuery({
    queryKey: ['entity-single', entity, entityId],
    queryFn: () => entityApi.getById<EntityRecord>(entity, entityId!),
    enabled: !!entityId && !!entity && !storedRecord,
    staleTime: 30_000,
  })

  // Query 2: busca com connection params (quando não há ID específico)
  const { data: listData, isLoading: isLoadingList, isError: isErrorList } = useQuery({
    queryKey: ['entity', entity, connectionParams],
    queryFn: () => entityApi.getList<EntityRecord>(entity, { pageSize: 1, ...connectionParams }),
    enabled: !entityId && !!entity && enabled && !storedRecord,
    staleTime: 30_000,
  })

  const isLoading = isLoadingSingle || isLoadingList
  const isError = isErrorSingle || isErrorList

  // Resolve o record final
  const record: EntityRecord | null =
    storedRecord ??
    (singleData as EntityRecord | null) ??
    ((listData as { data?: EntityRecord[] })?.data?.[0] ?? null)

  // Filtra componentes exibíveis
  const components = (objectDef.components ?? []).filter(
    (c) => c.type !== 'generalActions' && c.type !== 'hidden' && !c.hidden,
  )

  const showLabel = objectDef.panelShowLabel !== false
  const colClass = objectDef.panelColClass ?? 'w-full sm:w-1/2 md:w-1/3'

  return (
    <div style={objectDef.panelCardStyle as React.CSSProperties}>
      {objectDef.title && (
        <h3 className="mb-3 text-sm font-semibold text-foreground">{interpolate(objectDef.title, initialParams)}</h3>
      )}

      {isLoading && (
        <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          Carregando...
        </div>
      )}

      {isError && (
        <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          Erro ao carregar dados do painel.
        </div>
      )}

      {!isLoading && !isError && !record && enabled && (
        <p className="text-sm text-muted-foreground py-2">
          {objectDef.emptyState ?? 'Nenhum dado disponível.'}
        </p>
      )}

      {!isLoading && record && (
        <div
          className="flex flex-wrap gap-x-6 gap-y-3"
          style={objectDef.panelBodyStyle as React.CSSProperties}
        >
          {components.map((comp, i) => {
            const fieldName = comp.nameForm ?? comp.name
            const value = record[fieldName]
            const label = comp.label ?? comp.name

            return (
              <div key={`${comp.idComponent}-${i}`} className={comp.class ?? colClass}>
                {showLabel && (
                  <p
                    className="text-xs font-medium text-muted-foreground uppercase tracking-wide"
                    style={comp.labelStyle as React.CSSProperties}
                  >
                    {label}
                  </p>
                )}
                <p
                  className="text-sm text-foreground mt-0.5"
                  style={comp.valueStyle as React.CSSProperties}
                >
                  {formatPanelValue(value, comp.type)}
                </p>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Formatação de valores ─────────────────────────────────────────────────────

function formatPanelValue(value: unknown, type: string): string {
  if (value === null || value === undefined || value === '') return '—'

  switch (type) {
    case 'currency':
    case 'decimal': {
      const n = Number(value)
      if (isNaN(n)) return String(value)
      return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
    }
    case 'number': {
      const n = Number(value)
      if (isNaN(n)) return String(value)
      return n.toLocaleString('pt-BR')
    }
    case 'date': {
      if (typeof value === 'string') {
        return value.substring(0, 10).split('-').reverse().join('/')
      }
      return String(value)
    }
    case 'switch':
    case 'checkbox':
      return value === true || value === 'Sim' || value === '1' || value === 1 ? 'Sim' : 'Não'
    default:
      return String(value)
  }
}
