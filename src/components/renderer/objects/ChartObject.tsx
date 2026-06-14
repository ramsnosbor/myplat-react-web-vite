import { useStore } from 'zustand'
import { useEntityQuery } from '@/hooks/useEntityQuery'
import { useViewContext } from '../ViewContext'
import { useConnectionParams, useConnectionEnabled } from '../ObjectRenderer'
import type { ObjectDefinition, ComponentDefinition } from '@/types/view.types'
import type { EntityRecord } from '@/types/entity.types'
import { PivotTableRenderer } from '../PivotTableRenderer'
import {
  ResponsiveContainer,
  BarChart, Bar,
  LineChart, Line,
  PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts'

interface Props {
  objectDef: ObjectDefinition
}

// Cores padrão para séries sem cor definida
const DEFAULT_COLORS = [
  '#0d6efd', '#198754', '#dc3545', '#fd7e14',
  '#6f42c1', '#20c997', '#0dcaf0', '#ffc107',
]

// ─── YAxis item (aceita array de objetos no JSON) ─────────────────────────────
interface YAxisItem {
  key: string
  label?: string
  color?: string
  innerRadius?: number
  outerRadius?: number
  cx?: string
  cy?: string
}

function resolveYAxis(raw: unknown): YAxisItem[] {
  if (!raw) return []
  if (Array.isArray(raw)) return raw as YAxisItem[]
  if (typeof raw === 'string') return [{ key: raw }]
  return []
}

// ─── ChartObject ──────────────────────────────────────────────────────────────

export function ChartObject({ objectDef }: Props) {
  const { viewStore, initialParams } = useViewContext()
  const objectState = useStore(viewStore, (s) => s.objects[objectDef.id])
  const connectionParams = useConnectionParams(objectDef.id)
  const enabled = useConnectionEnabled(objectDef.id)

  // Componente que define o tipo de chart e os eixos
  const chartComp: ComponentDefinition | undefined = (objectDef.components ?? []).find(
    (c) => c.idObject === objectDef.id
  )

  const chartType = (chartComp?.type ?? 'bar') as 'bar' | 'line' | 'pie' | 'pivot'
  const xAxisKey = chartComp?.XAxis ?? ''
  const yAxisItems = resolveYAxis(chartComp?.YAxis)

  // Params para a query
  const queryParams = {
    ...connectionParams,
    ...(objectState?.queryParams ?? {}),
    ...(initialParams ?? {}),
  }

  const { data, isLoading, isError } = useEntityQuery({
    entity: objectDef.entity,
    params: { ...queryParams, pageSize: 500 },
    enabled: enabled && !!objectDef.entity,
  })

  const rows: EntityRecord[] = (data as { data?: EntityRecord[] })?.data
    ?? (Array.isArray(data) ? (data as EntityRecord[]) : [])

  if (isLoading) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent mr-2" />
        Carregando...
      </div>
    )
  }

  if (isError) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-destructive">
        Erro ao carregar dados do gráfico.
      </div>
    )
  }

  if (rows.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
        Sem dados para exibir.
      </div>
    )
  }

  if (chartType === 'pivot') {
    return (
      <div style={objectDef.style as React.CSSProperties}>
        {objectDef.title && (
          <h3 className="mb-3 text-sm font-semibold text-foreground">{objectDef.title}</h3>
        )}
        <PivotTableRenderer data={rows as Record<string, unknown>[]} />
      </div>
    )
  }

  return (
    <div style={objectDef.style as React.CSSProperties}>
      {objectDef.title && (
        <h3 className="mb-3 text-sm font-semibold text-foreground">{objectDef.title}</h3>
      )}
      <ResponsiveContainer width="100%" height={300}>
        {chartType === 'pie'
          ? <PieChartRenderer rows={rows} xAxisKey={xAxisKey} yAxisItems={yAxisItems} />
          : chartType === 'line'
            ? <LineChartRenderer rows={rows} xAxisKey={xAxisKey} yAxisItems={yAxisItems} />
            : <BarChartRenderer rows={rows} xAxisKey={xAxisKey} yAxisItems={yAxisItems} />
        }
      </ResponsiveContainer>
    </div>
  )
}

// ─── Bar ─────────────────────────────────────────────────────────────────────

interface ChartRendererProps {
  rows: EntityRecord[]
  xAxisKey: string
  yAxisItems: YAxisItem[]
}

function BarChartRenderer({ rows, xAxisKey, yAxisItems }: ChartRendererProps) {
  return (
    <BarChart data={rows} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
      <XAxis dataKey={xAxisKey} tick={{ fontSize: 11 }} />
      <YAxis tick={{ fontSize: 11 }} />
      <Tooltip />
      {yAxisItems.length > 1 && <Legend />}
      {yAxisItems.map((y, i) => (
        <Bar
          key={y.key}
          dataKey={y.key}
          name={y.label ?? y.key}
          fill={y.color ?? DEFAULT_COLORS[i % DEFAULT_COLORS.length]}
          radius={[3, 3, 0, 0]}
        />
      ))}
    </BarChart>
  )
}

// ─── Line ─────────────────────────────────────────────────────────────────────

function LineChartRenderer({ rows, xAxisKey, yAxisItems }: ChartRendererProps) {
  return (
    <LineChart data={rows} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
      <XAxis dataKey={xAxisKey} tick={{ fontSize: 11 }} />
      <YAxis tick={{ fontSize: 11 }} />
      <Tooltip />
      {yAxisItems.length > 1 && <Legend />}
      {yAxisItems.map((y, i) => (
        <Line
          key={y.key}
          type="monotone"
          dataKey={y.key}
          name={y.label ?? y.key}
          stroke={y.color ?? DEFAULT_COLORS[i % DEFAULT_COLORS.length]}
          strokeWidth={2}
          dot={false}
        />
      ))}
    </LineChart>
  )
}

// ─── Pie ──────────────────────────────────────────────────────────────────────

function PieChartRenderer({ rows, xAxisKey, yAxisItems }: ChartRendererProps) {
  const y = yAxisItems[0]
  if (!y) return null

  const innerRadius = y.innerRadius ?? 0
  const outerRadius = y.outerRadius ?? 110
  const cx = y.cx ?? '50%'
  const cy = y.cy ?? '50%'

  return (
    <PieChart>
      <Pie
        data={rows}
        dataKey={y.key}
        nameKey={xAxisKey}
        cx={cx}
        cy={cy}
        innerRadius={innerRadius}
        outerRadius={outerRadius}
        paddingAngle={2}
        label={({ name, percent }) =>
          `${name} ${((percent ?? 0) * 100).toFixed(0)}%`
        }
        labelLine={false}
      >
        {rows.map((_, i) => (
          <Cell key={i} fill={DEFAULT_COLORS[i % DEFAULT_COLORS.length]} />
        ))}
      </Pie>
      <Tooltip formatter={(value) => [value, y.label ?? y.key]} />
      <Legend />
    </PieChart>
  )
}
