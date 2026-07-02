import { apiClient } from './client'

export interface ReportFilterDefinition {
  field: string
  label: string
  type?: 'TEXT' | 'DATE' | 'NUMBER' | 'DATE_RANGE' | 'NUMBER_RANGE' | 'SELECT' | string
  predefinedValues?: string[]
  options?: string[]
  active?: boolean
  sequence?: number
}

export interface ReportDefinition {
  name: string
  title?: string
  description?: string
  default?: boolean
  filterDefinitions?: ReportFilterDefinition[]
  filters?: ReportFilterDefinition[]
}

export interface ReportGroup {
  group?: string
  title?: string
  name?: string
  label?: string
  reports?: ReportDefinition[]
  items?: ReportDefinition[]
}

export const reportsApi = {
  /** Lista grupos de relatórios: GET /api/reports/group/list */
  getGroupList(): Promise<ReportGroup[]> {
    return apiClient.get<ReportGroup[]>('/api/reports/group/list').then((r) => r.data)
  },

  /** Carrega definição de um relatório (filtros): GET /api/reports/:name */
  getReport(name: string): Promise<ReportDefinition> {
    return apiClient.get<ReportDefinition>(`/api/reports/${encodeURIComponent(name)}`).then((r) => r.data)
  },

  /** Gera o relatório: POST /api/reports/generate */
  generateReport(payload: {
    reportName: string
    docType?: string
    filters?: Record<string, unknown>
  }): Promise<{ blob: Blob; fileName?: string } | string> {
    return apiClient
      .post('/api/reports/generate', payload, { responseType: 'blob' })
      .then((response) => {
        const contentType = (response.headers?.['content-type'] ?? '') as string
        if (contentType.includes('application/json') || contentType.includes('text/')) {
          return (response.data as Blob).text().then((t) => {
            try {
              const parsed = JSON.parse(t) as { name?: string; fileName?: string }
              return parsed.name ?? parsed.fileName ?? t
            } catch { return t }
          })
        }
        return {
          blob: response.data as Blob,
          fileName: extractFileName(response.headers?.['content-disposition'] as string | undefined ?? response.headers?.['Content-Disposition'] as string | undefined),
        }
      })
  },

  /** Baixa relatório gerado: GET /api/reports/generated/downloads */
  getGeneratedDownload(fileName: string): Promise<{ blob: Blob; fileName?: string }> {
    return apiClient
      .get('/api/reports/generated/downloads', { params: { name: fileName }, responseType: 'blob' })
      .then((response) => ({
        blob: response.data as Blob,
        fileName: extractFileName(response.headers?.['content-disposition'] as string | undefined ?? response.headers?.['Content-Disposition'] as string | undefined),
      }))
  },
}

function extractFileName(contentDisposition?: string) {
  if (!contentDisposition) return undefined
  const utfMatch = /filename\*=UTF-8''([^;\n]+)/i.exec(contentDisposition)
  const plainMatch = /filename="?([^";\n]+)"?/i.exec(contentDisposition)
  const raw = utfMatch?.[1] ?? plainMatch?.[1]
  return raw ? decodeURIComponent(raw.replace(/\s+$/, '')) : undefined
}
