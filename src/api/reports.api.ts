import { apiClient } from './client'

export const reportsApi = {
  generateReport(payload: { reportName: string; docType?: string; filters?: Record<string, unknown> }) {
    return apiClient.post('/api/reports/generate', payload).then((r) => r.data)
  },

  getGeneratedDownload(fileName: string): Promise<{ blob: Blob; fileName?: string }> {
    return apiClient.get('/api/reports/generated/downloads', {
      params: { name: fileName },
      responseType: 'blob',
    }).then((response) => ({
      blob: response.data,
      fileName: extractFileName(response.headers?.['content-disposition'] ?? response.headers?.['Content-Disposition']),
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
