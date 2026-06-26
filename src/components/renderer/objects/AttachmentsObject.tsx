import { useState, useRef, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/api/client'
import { entityApi } from '@/api/entity.api'
import { useEntityQuery } from '@/hooks/useEntityQuery'
import { useConnectionParams } from '../ObjectRenderer'
import type { ObjectDefinition } from '@/types/view.types'

interface AttachmentRecord {
  id_cotacao_anexo: number
  id_arquivo: number
  nm_arquivo: string
  [key: string]: unknown
}

interface UploadResponse {
  id: number
  fileName: string
  originalFileName: string
  createdAt?: string
}

interface Props {
  objectDef: ObjectDefinition
}

/**
 * AttachmentsObject — área drag-and-drop para anexar arquivos a um registro.
 *
 * JSON:
 *   { "type": "attachments", "entity": "compra_cotacao_anexo",
 *     "uploadMapping": { "id_sol_fornecedor": "{{id_sol_fornecedor}}",
 *                        "id_arquivo": "{file.id}", "nm_arquivo": "{file.name}" } }
 *
 * Fluxo:
 *   1. POST /files/upload → { id, name }
 *   2. Resolve uploadMapping: {{campo}} = connectionParams, {file.*} = upload response
 *   3. POST /default/{entity} com o body resolvido
 *   4. Refresh da lista
 */
export function AttachmentsObject({ objectDef }: Props) {
  const entity        = objectDef.entity ?? ''
  const title         = objectDef.title ?? 'Anexos'
  const uploadMapping = (objectDef as Record<string, unknown>).uploadMapping as Record<string, string> | undefined

  const connectionParams = useConnectionParams(objectDef.id)
  const queryClient      = useQueryClient()

  const [dragOver,   setDragOver]   = useState(false)
  const [uploading,  setUploading]  = useState<string[]>([])   // nomes em progresso
  const [errorMsg,   setErrorMsg]   = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const { data, isLoading } = useEntityQuery<AttachmentRecord>({
    entity,
    params: connectionParams as Record<string, string | number>,
    enabled: !!entity && Object.keys(connectionParams).length > 0,
  })

  const records: AttachmentRecord[] = (data as unknown as { data?: AttachmentRecord[] })?.data ?? []

  // ── Upload ────────────────────────────────────────────────────────────────

  const resolveMapping = useCallback(
    (fileResp: UploadResponse): Record<string, unknown> => {
      if (!uploadMapping) return {}
      const result: Record<string, unknown> = {}
      for (const [field, tpl] of Object.entries(uploadMapping)) {
        let value: unknown = tpl
        // {file.id} / {file.fileName} / {file.originalFileName}
        value = (value as string).replace(/\{file\.id\}/g,               String(fileResp.id))
        value = (value as string).replace(/\{file\.fileName\}/g,         fileResp.fileName)
        value = (value as string).replace(/\{file\.originalFileName\}/g, fileResp.originalFileName)
        // {{campo}} → connection param
        value = (value as string).replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
          const v = connectionParams[key]
          return v !== undefined && v !== null ? String(v) : ''
        })
        // Coerce numbers back
        const num = Number(value)
        result[field] = isNaN(num) || value === '' ? value : num
      }
      return result
    },
    [uploadMapping, connectionParams],
  )

  const handleFiles = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return
      setErrorMsg(null)

      for (const file of Array.from(files)) {
        setUploading((prev) => [...prev, file.name])
        try {
          const form = new FormData()
          form.append('file', file)
          const uploadResp = await apiClient.post<UploadResponse>('/files/upload', form, {
            headers: { 'Content-Type': 'multipart/form-data' },
          })
          const body = resolveMapping(uploadResp.data)
          await entityApi.create(entity, body)
          await queryClient.invalidateQueries({ queryKey: ['entity', entity] })
        } catch {
          setErrorMsg(`Erro ao enviar "${file.name}". Tente novamente.`)
        } finally {
          setUploading((prev) => prev.filter((n) => n !== file.name))
        }
      }
    },
    [entity, resolveMapping, queryClient],
  )

  // ── Download ──────────────────────────────────────────────────────────────

  const handleDownload = useCallback(async (rec: AttachmentRecord) => {
    try {
      const resp = await apiClient.get(`/files/${rec.id_arquivo}/download`, {
        responseType: 'blob',
      })
      const url = URL.createObjectURL(new Blob([resp.data as BlobPart]))
      const a   = document.createElement('a')
      a.href     = url
      a.download = rec.nm_arquivo
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch {
      setErrorMsg(`Erro ao baixar "${rec.nm_arquivo}".`)
    }
  }, [])

  // ── Delete ────────────────────────────────────────────────────────────────

  const handleDelete = useCallback(
    async (rec: AttachmentRecord) => {
      if (!confirm(`Remover o arquivo "${rec.nm_arquivo}"?`)) return
      try {
        await entityApi.remove(entity, rec.id_cotacao_anexo)
        await queryClient.invalidateQueries({ queryKey: ['entity', entity] })
      } catch {
        setErrorMsg(`Erro ao remover "${rec.nm_arquivo}".`)
      }
    },
    [entity, queryClient],
  )

  // ── Drag events ───────────────────────────────────────────────────────────

  const onDragOver  = (e: React.DragEvent) => { e.preventDefault(); setDragOver(true) }
  const onDragLeave = ()                   => setDragOver(false)
  const onDrop      = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    void handleFiles(e.dataTransfer.files)
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const isDisabled = Object.keys(connectionParams).length === 0

  return (
    <div className="flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-center gap-2">
        <i className="bi bi-paperclip text-muted-foreground" />
        <span className="text-sm font-semibold">{title}</span>
        {isLoading && (
          <div className="h-3 w-3 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        )}
      </div>

      {/* Drop zone */}
      <div
        role="button"
        tabIndex={0}
        aria-disabled={isDisabled}
        onDragOver={isDisabled ? undefined : onDragOver}
        onDragLeave={isDisabled ? undefined : onDragLeave}
        onDrop={isDisabled ? undefined : onDrop}
        onClick={() => !isDisabled && inputRef.current?.click()}
        onKeyDown={(e) => e.key === 'Enter' && !isDisabled && inputRef.current?.click()}
        className={[
          'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-6 text-center transition-colors',
          dragOver
            ? 'border-primary bg-primary/5'
            : 'border-border hover:border-primary/50 hover:bg-muted/40',
          isDisabled ? 'cursor-not-allowed opacity-50' : '',
        ].join(' ')}
      >
        <i className="bi bi-cloud-upload text-2xl text-muted-foreground" />
        <span className="text-sm text-muted-foreground">
          Arraste arquivos aqui ou <span className="font-medium text-primary">clique para selecionar</span>
        </span>
        <span className="text-xs text-muted-foreground/70">Múltiplos arquivos suportados</span>
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => void handleFiles(e.target.files)}
        />
      </div>

      {/* Uploading indicators */}
      {uploading.length > 0 && (
        <div className="flex flex-col gap-1">
          {uploading.map((name) => (
            <div key={name} className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm">
              <div className="h-3 w-3 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              <span className="truncate text-muted-foreground">Enviando {name}…</span>
            </div>
          ))}
        </div>
      )}

      {/* Error */}
      {errorMsg && (
        <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <i className="bi bi-exclamation-circle" />
          {errorMsg}
          <button className="ml-auto" onClick={() => setErrorMsg(null)}><i className="bi bi-x" /></button>
        </div>
      )}

      {/* File list */}
      {records.length > 0 && (
        <div className="flex flex-col gap-1">
          {records.map((rec) => (
            <div
              key={rec.id_cotacao_anexo}
              className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm hover:bg-muted/30"
            >
              <i className="bi bi-file-earmark text-muted-foreground" />
              <span className="flex-1 truncate">{rec.nm_arquivo}</span>
              <button
                title="Download"
                className="rounded p-1 text-muted-foreground hover:text-primary"
                onClick={() => void handleDownload(rec)}
              >
                <i className="bi bi-download" />
              </button>
              <button
                title="Remover"
                className="rounded p-1 text-muted-foreground hover:text-destructive"
                onClick={() => void handleDelete(rec)}
              >
                <i className="bi bi-trash" />
              </button>
            </div>
          ))}
        </div>
      )}

      {!isLoading && records.length === 0 && uploading.length === 0 && (
        <p className="text-center text-xs text-muted-foreground">Nenhum arquivo anexado.</p>
      )}
    </div>
  )
}
