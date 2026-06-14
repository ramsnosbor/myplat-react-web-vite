declare module 'react-pivottable/PivotTableUI' {
  import { ComponentType } from 'react'

  export interface PivotTableUIProps {
    data: Record<string, unknown>[]
    onChange: (state: PivotTableUIProps) => void
    renderers?: Record<string, unknown>
    localeStrings?: Record<string, string>
    rows?: string[]
    cols?: string[]
    aggregatorName?: string
    rendererName?: string
    [key: string]: unknown
  }

  const PivotTableUI: ComponentType<PivotTableUIProps>
  export default PivotTableUI
}

declare module 'react-pivottable/TableRenderers' {
  const TableRenderers: Record<string, unknown>
  export default TableRenderers
}

declare module 'react-pivottable/Utilities' {
  export class PivotData {
    constructor(props: Record<string, unknown>)
    getRowKeys(): string[][]
    getColKeys(): string[][]
    getAggregator(rowKey: string[], colKey: string[]): { value(): number | null }
  }
}

