import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { AppShell } from '@/components/layout/AppShell'
import { reportsApi } from '@/api/reports.api'

interface ReportViewerState {
  fileName?: string
  reportName?: string
  docType?: string
}

export default function ReportViewerPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const state = (location.state ?? {}) as ReportViewerState

  const fileName = state.fileName ?? searchParams.get('fileName') ?? searchParams.get('name') ?? ''
  const reportName = state.reportName ?? searchParams.get('reportName') ?? ''
  const docType = state.docType ?? searchParams.get('docType') ?? 'pdf'

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [fileUrl, setFileUrl] = useState<string | null>(null)
  const [downloadFileName, setDownloadFileName] = useState(fileName || 'relatorio.pdf')

  const title = useMemo(() => reportName ? `Relatorio - ${reportName}` : 'Visualizar Relatorio', [reportName])
  const isPdf = docType.toLowerCase() === 'pdf' || downloadFileName.toLowerCase().endsWith('.pdf')

  useEffect(() => {
    let objectUrl: string | null = null

    async function loadReport() {
      if (!fileName) {
        setError('Nome do arquivo nao fornecido.')
        setLoading(false)
        return
      }

      setLoading(true)
      setError(null)
      try {
        const response = await reportsApi.getGeneratedDownload(fileName)
        objectUrl = URL.createObjectURL(response.blob)
        setFileUrl(objectUrl)
        setDownloadFileName(response.fileName ?? fileName)
      } catch (err) {
        console.error('[ReportViewer] loadReport', err)
        setError(getErrorMessage(err))
      } finally {
        setLoading(false)
      }
    }

    loadReport()

    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [fileName])

  function handleBack() {
    if (fileUrl) URL.revokeObjectURL(fileUrl)
    navigate(-1)
  }

  function handleDownload() {
    if (!fileUrl) return
    const anchor = document.createElement('a')
    anchor.href = fileUrl
    anchor.download = downloadFileName
    document.body.appendChild(anchor)
    anchor.click()
    document.body.removeChild(anchor)
  }

  return (
    <AppShell title="Visualizar Relatorio" subtitle={reportName || downloadFileName}>
      <div className="flex min-h-full flex-col bg-background p-2 sm:p-3">
        <section className="mb-2 flex shrink-0 flex-col gap-3 rounded-lg border border-blue-100 bg-white px-3 py-2 shadow-sm shadow-blue-950/5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <button type="button" onClick={handleBack} className={secondaryButtonClass}>
              <i className="bi bi-arrow-left" aria-hidden />
              Voltar
            </button>
            <div className="min-w-0">
              <h1 className="truncate text-base font-semibold text-slate-900">{title}</h1>
              <p className="truncate text-xs text-slate-500">{downloadFileName}</p>
            </div>
          </div>
          {fileUrl && (
            <button type="button" onClick={handleDownload} className={primaryButtonClass}>
              <i className="bi bi-download" aria-hidden />
              Baixar
            </button>
          )}
        </section>

        <section className="min-h-[calc(100vh-132px)] flex-1 overflow-hidden rounded-lg border border-blue-100 bg-white shadow-sm shadow-blue-950/5">
          {loading && (
            <div className="flex h-full min-h-[420px] flex-col items-center justify-center text-sm text-slate-500">
              <span className="mb-3 h-8 w-8 animate-spin rounded-full border-4 border-blue-700 border-t-transparent" />
              Carregando relatorio...
            </div>
          )}

          {error && !loading && (
            <div className="m-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
              <h2 className="font-semibold">Erro ao carregar relatorio</h2>
              <p className="mt-1">{error}</p>
              <button type="button" onClick={handleBack} className="mt-4 inline-flex h-9 items-center gap-2 rounded-md border border-red-200 bg-white px-3 text-sm font-semibold text-red-700 transition hover:bg-red-100">
                <i className="bi bi-arrow-left" aria-hidden />
                Voltar
              </button>
            </div>
          )}

          {fileUrl && !loading && !error && isPdf && (
            <iframe src={fileUrl} title="Visualizador de Relatorio" className="h-[calc(100vh-132px)] w-full border-0" />
          )}

          {fileUrl && !loading && !error && !isPdf && (
            <div className="flex min-h-[420px] flex-col items-center justify-center px-4 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-blue-700 ring-1 ring-blue-100">
                <i className="bi bi-file-earmark-arrow-down text-xl" aria-hidden />
              </div>
              <p className="mt-3 text-sm font-semibold text-slate-800">Arquivo pronto para download</p>
              <p className="mt-1 text-xs text-slate-500">Este tipo de relatorio nao pode ser exibido no navegador.</p>
              <button type="button" onClick={handleDownload} className={`${primaryButtonClass} mt-4`}>
                <i className="bi bi-download" aria-hidden />
                Baixar arquivo
              </button>
            </div>
          )}
        </section>
      </div>
    </AppShell>
  )
}

function getErrorMessage(err: unknown) {
  const shaped = err as { response?: { data?: { message?: string } | Blob }; message?: string }
  if (shaped.response?.data && typeof shaped.response.data === 'object' && 'message' in shaped.response.data) {
    return shaped.response.data.message ?? 'Erro ao carregar relatorio.'
  }
  return shaped.message ?? 'Erro ao carregar relatorio.'
}

const primaryButtonClass = 'inline-flex h-9 items-center gap-2 rounded-md bg-blue-700 px-3 text-sm font-semibold text-white transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-70'
const secondaryButtonClass = 'inline-flex h-9 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-70'
