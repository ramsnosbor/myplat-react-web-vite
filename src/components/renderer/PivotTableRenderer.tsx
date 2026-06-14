import { useState, type ComponentType } from 'react'
import _PivotTableUI from 'react-pivottable/PivotTableUI'
import _TableRenderers from 'react-pivottable/TableRenderers'
import { PivotData as _PivotData } from 'react-pivottable/Utilities'
import {
  BarChart, Bar, LineChart, Line, AreaChart, Area,
  PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import 'react-pivottable/pivottable.css'

/* eslint-disable @typescript-eslint/no-explicit-any */
const PivotTableUI   = ((_PivotTableUI  as any).default ?? _PivotTableUI)  as ComponentType<any>
const TableRenderers = ((_TableRenderers as any).default ?? _TableRenderers) as Record<string, any>
const PivotData      = _PivotData as unknown as new (props: any) => any
/* eslint-enable @typescript-eslint/no-explicit-any */

const COLORS = ['#6366f1','#f59e0b','#10b981','#ef4444','#3b82f6','#8b5cf6','#ec4899','#14b8a6']

// Extrai dados do PivotData → formato recharts + lista de séries
function extractData(pivotData: any) {
  const rowKeys: string[][] = pivotData.getRowKeys()
  const colKeys: string[][] = pivotData.getColKeys()
  const series = colKeys.map((k: string[]) => k.join(' / ') || 'Total')

  const data = rowKeys.map((rowKey: string[]) => {
    const entry: Record<string, any> = { _label: rowKey.join(' / ') || 'Total' }
    colKeys.forEach((colKey: string[], i) => {
      entry[`_s${i}`] = pivotData.getAggregator(rowKey, colKey).value() ?? 0
    })
    return entry
  })

  return { data, series }
}

// Cada renderer recebe os props brutos do react-pivottable e constrói o PivotData internamente

function BarVertGrouped(props: any) {
  const { data, series } = extractData(new PivotData(props))
  return (
    <ResponsiveContainer width="100%" height={320}>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="_label" />
        <YAxis />
        <Tooltip />
        <Legend />
        {series.map((s, i) => (
          <Bar key={i} dataKey={`_s${i}`} name={s} fill={COLORS[i % COLORS.length]} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  )
}

function BarVertStacked(props: any) {
  const { data, series } = extractData(new PivotData(props))
  return (
    <ResponsiveContainer width="100%" height={320}>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="_label" />
        <YAxis />
        <Tooltip />
        <Legend />
        {series.map((s, i) => (
          <Bar key={i} dataKey={`_s${i}`} name={s} stackId="a" fill={COLORS[i % COLORS.length]} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  )
}

function BarHorizGrouped(props: any) {
  const { data, series } = extractData(new PivotData(props))
  return (
    <ResponsiveContainer width="100%" height={Math.max(320, data.length * 40)}>
      <BarChart data={data} layout="vertical">
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis type="number" />
        <YAxis type="category" dataKey="_label" width={140} />
        <Tooltip />
        <Legend />
        {series.map((s, i) => (
          <Bar key={i} dataKey={`_s${i}`} name={s} fill={COLORS[i % COLORS.length]} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  )
}

function BarHorizStacked(props: any) {
  const { data, series } = extractData(new PivotData(props))
  return (
    <ResponsiveContainer width="100%" height={Math.max(320, data.length * 40)}>
      <BarChart data={data} layout="vertical">
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis type="number" />
        <YAxis type="category" dataKey="_label" width={140} />
        <Tooltip />
        <Legend />
        {series.map((s, i) => (
          <Bar key={i} dataKey={`_s${i}`} name={s} stackId="a" fill={COLORS[i % COLORS.length]} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  )
}

function ChartLinhas(props: any) {
  const { data, series } = extractData(new PivotData(props))
  return (
    <ResponsiveContainer width="100%" height={320}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="_label" />
        <YAxis />
        <Tooltip />
        <Legend />
        {series.map((s, i) => (
          <Line key={i} type="monotone" dataKey={`_s${i}`} name={s} stroke={COLORS[i % COLORS.length]} dot />
        ))}
      </LineChart>
    </ResponsiveContainer>
  )
}

function ChartArea(props: any) {
  const { data, series } = extractData(new PivotData(props))
  return (
    <ResponsiveContainer width="100%" height={320}>
      <AreaChart data={data}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="_label" />
        <YAxis />
        <Tooltip />
        <Legend />
        {series.map((s, i) => (
          <Area key={i} type="monotone" dataKey={`_s${i}`} name={s}
            stroke={COLORS[i % COLORS.length]} fill={COLORS[i % COLORS.length]} fillOpacity={0.3} />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  )
}

function ChartPizza(props: any) {
  const pivotData = new PivotData(props)
  const rowKeys: string[][] = pivotData.getRowKeys()
  const colKey: string[] = pivotData.getColKeys()[0] ?? []
  const pieData = rowKeys.map((rowKey: string[]) => ({
    name: rowKey.join(' / ') || 'Total',
    value: pivotData.getAggregator(rowKey, colKey).value() ?? 0,
  }))
  return (
    <ResponsiveContainer width="100%" height={350}>
      <PieChart>
        <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={130} label>
          {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
        </Pie>
        <Tooltip />
        <Legend />
      </PieChart>
    </ResponsiveContainer>
  )
}

// ─── Mapa completo de renderers ───────────────────────────────────────────────

const renderers = {
  'Tabela':                            TableRenderers['Table'],
  'Tabela - Mapa de Calor':            TableRenderers['Table Heatmap'],
  'Tabela - Mapa de Calor por Coluna': TableRenderers['Table Col Heatmap'],
  'Tabela - Mapa de Calor por Linha':  TableRenderers['Table Row Heatmap'],
  'TSV Exportável':                    TableRenderers['Exportable TSV'],
  'Gráfico de Colunas Agrupadas':      BarVertGrouped,
  'Gráfico de Colunas Empilhadas':     BarVertStacked,
  'Gráfico de Barras Agrupadas':       BarHorizGrouped,
  'Gráfico de Barras Empilhadas':      BarHorizStacked,
  'Gráfico de Linhas':                 ChartLinhas,
  'Gráfico de Área':                   ChartArea,
  'Gráfico de Pizza':                  ChartPizza,
}

const localeStrings = {
  renderError:      'Ocorreu um erro ao renderizar a Tabela Dinâmica.',
  computeError:     'Ocorreu um erro ao calcular a Tabela Dinâmica.',
  uiRenderError:    'Ocorreu um erro ao renderizar a interface da Tabela Dinâmica.',
  selectRenderer:   'Selecione o tipo de renderização',
  selectAggregator: 'Selecione o agregador',
  selectField:      'Selecione o campo',
  rows:             'Linhas',
  cols:             'Colunas',
  apply:            'Aplicar',
  cancel:           'Cancelar',
}

// ─── Componente ───────────────────────────────────────────────────────────────

interface Props {
  data: Record<string, unknown>[]
}

export function PivotTableRenderer({ data }: Props) {
  const [state, setState] = useState<Record<string, unknown>>({})

  return (
    <div className="overflow-auto w-full">
      <PivotTableUI
        data={data}
        onChange={(s: Record<string, unknown>) => setState(s)}
        renderers={renderers}
        localeStrings={localeStrings}
        {...state}
      />
    </div>
  )
}
