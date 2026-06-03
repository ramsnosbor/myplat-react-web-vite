import { useStore } from 'zustand'
import { useEffect, useState } from 'react'
import { useEntityQuery } from '@/hooks/useEntityQuery'
import { useViewContext } from '../ViewContext'
import { useConnectionParams, useConnectionEnabled } from '../ObjectRenderer'
import type { ObjectDefinition, ComponentDefinition } from '@/types/view.types'
import type { EntityRecord } from '@/types/entity.types'

interface Props {
  objectDef: ObjectDefinition
}

// ─── GridObject ───────────────────────────────────────────────────────────────
// Renderiza cada linha do entity como um card em um grid responsivo.
// Os components definem os campos exibidos em cada card com labelStyle/valueStyle.

export function GridObject({ objectDef }: Props) {
  const { viewStore, initialParams } = useViewContext()
  const objectState = useStore(viewStore, (s) => s.objects[objectDef.id])
  const connectionParams = useConnectionParams(objectDef.id)
  const enabled = useConnectionEnabled(objectDef.id)

  const queryParams = {
    ...connectionParams,
    ...(objectState?.queryParams ?? {}),
  }

  const { data, isLoading, isError } = useEntityQuery({
    entity: objectDef.entity,
    params: { ...queryParams, pageSize: 500 },
    enabled: enabled && !!objectDef.entity,
  })

  const rows: EntityRecord[] = (data as { data?: EntityRecord[] })?.data
    ?? (Array.isArray(data) ? (data as EntityRecord[]) : [])

  // Componentes deste objeto (campos de cada card)
  const comps = (objectDef.components ?? []).filter(
    (c) => c.idObject === objectDef.id,
  )

  // CSS grid responsivo baseado em columns
  const cols = objectDef.columns ?? { xs: 2, sm: 3, md: 4 }
  const gap  = objectDef.gap ?? 3
  const viewport = useViewportBucket()
  const activeColumns = getResponsiveColumns(cols, viewport)

  const gridStyle: React.CSSProperties = {
    display: 'grid',
    gap: `${gap * 4}px`,
    gridTemplateColumns: `repeat(${activeColumns}, minmax(0, 1fr))`,
  }

  if (isLoading) {
    return (
      <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent mr-2" />
        Carregando...
      </div>
    )
  }

  if (isError) {
    return (
      <div className="flex h-32 items-center justify-center text-sm text-destructive">
        Erro ao carregar dados.
      </div>
    )
  }

  return (
    <div style={{ ...(objectDef.style as React.CSSProperties) }}>
      {objectDef.title && (
        <h3 className="mb-3 text-sm font-semibold text-foreground">{objectDef.title}</h3>
      )}
      <div style={gridStyle} className="items-stretch">
        {rows.map((row, i) => (
          <GridCard
            key={i}
            row={row}
            comps={comps}
            itemStyle={objectDef.itemStyle as React.CSSProperties | undefined}
            initialParams={initialParams}
          />
        ))}
      </div>
    </div>
  )
}

// ─── GridCard ─────────────────────────────────────────────────────────────────

interface GridCardProps {
  row: EntityRecord
  comps: ComponentDefinition[]
  itemStyle?: React.CSSProperties
  initialParams?: Record<string, unknown>
}

function GridCard({ row, comps, itemStyle }: GridCardProps) {
  return (
    <div
      className="min-w-0 rounded-lg border border-blue-100 bg-card p-3 shadow-sm shadow-blue-950/5"
      style={itemStyle}
    >
      {comps.map((comp, i) => {
        const raw = row[comp.name]
        const value = formatValue(raw, comp)
        const showLabel = comp.labelStyle?.display !== 'none' && !!comp.label

        return (
          <div key={i} className="min-w-0">
            {showLabel && (
              <div className="truncate text-xs font-medium text-muted-foreground" style={comp.labelStyle as React.CSSProperties}>
                {comp.label ?? comp.name}
              </div>
            )}
            <div className="min-w-0 break-words text-sm font-semibold text-foreground" style={comp.valueStyle as React.CSSProperties}>
              {value}
            </div>
          </div>
        )
      })}
    </div>
  )
}

type ViewportBucket = 'xs' | 'sm' | 'md' | 'lg'

function useViewportBucket(): ViewportBucket {
  const [bucket, setBucket] = useState<ViewportBucket>(() => getViewportBucket())

  useEffect(() => {
    function handleResize() {
      setBucket(getViewportBucket())
    }

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  return bucket
}

function getViewportBucket(): ViewportBucket {
  if (typeof window === 'undefined') return 'md'
  const width = window.innerWidth
  if (width < 640) return 'xs'
  if (width < 768) return 'sm'
  if (width < 1024) return 'md'
  return 'lg'
}

function getResponsiveColumns(columns: { xs?: number; sm?: number; md?: number; lg?: number }, bucket: ViewportBucket) {
  const value = {
    xs: columns.xs,
    sm: columns.sm ?? columns.xs,
    md: columns.md ?? columns.sm ?? columns.xs,
    lg: columns.lg ?? columns.md ?? columns.sm ?? columns.xs,
  }[bucket]
  return Math.max(1, Math.min(6, value ?? 1))
}

// ─── formatValue ──────────────────────────────────────────────────────────────

function formatValue(raw: unknown, comp: ComponentDefinition): string {
  if (raw === null || raw === undefined) return '—'

  if (comp.type === 'currency') {
    const n = Number(raw)
    if (isNaN(n)) return String(raw)
    return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  }

  if (comp.type === 'decimal' || comp.type === 'number') {
    const n = Number(raw)
    if (isNaN(n)) return String(raw)
    const dec = comp.decimalPlaces ?? comp.decimal ?? 0
    return n.toLocaleString('pt-BR', {
      minimumFractionDigits: dec,
      maximumFractionDigits: dec,
    })
  }

  return String(raw)
}
