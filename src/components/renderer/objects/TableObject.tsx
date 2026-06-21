import { useState, useCallback, useEffect, useRef } from 'react'
import { useStore } from 'zustand'
import { useQueryClient, useMutation } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { useViewContext } from '../ViewContext'
import { useConnectionParams, useConnectionEnabled } from '../ObjectRenderer'
import { useAuthStore } from '@/store/authStore'
import { useEntityQuery } from '@/hooks/useEntityQuery'
import { entityApi } from '@/api/entity.api'
import { scriptApi } from '@/api/script.api'
import { apiClient, nfeClient } from '@/api/client'
import { resolveTemplate, interpolateExpr } from '@/utils/evalExpr'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import type { ObjectDefinition, ComponentDefinition, ComponentAction } from '@/types/view.types'
import { interpolate } from '@/utils/interpolate'
import { evalExpr } from '@/utils/evalExpr'
import { storePendingUpload } from '@/utils/pendingUpload'
import type { EntityListResponse, EntityRecord } from '@/types/entity.types'

interface Props {
  objectDef: ObjectDefinition
}

// Objeto vazio estável — evita nova referência a cada render no selector do Zustand
// (useSyncExternalStore exige que getSnapshot retorne a mesma referência quando não há mudança)
const EMPTY_PARAMS: Record<string, unknown> = {}

// Tipos de coluna que devem ficar alinhados à direita e usar fonte tabular
const NUMERIC_TYPES = new Set(['currency', 'decimal', 'number'])

type TableHeightMode = 'infinite' | 'minimum' | 'normal' | 'expanded'

const TABLE_HEIGHT_OPTIONS: Array<{
  value: TableHeightMode
  label: string
  description: string
  maxHeight?: number | string
}> = [
  { value: 'infinite', label: 'Infinito', description: 'Sem limite interno' },
  { value: 'minimum', label: 'Minimo', description: 'Mais compacto', maxHeight: 260 },
  { value: 'normal', label: 'Normal', description: 'Aproximadamente 10 linhas', maxHeight: 430 },
  { value: 'expanded', label: 'Expandido', description: 'Ocupa mais area', maxHeight: '70vh' },
]

function resolveActionRoute(path: string) {
  return path.startsWith('/') ? path : `/home/${path}`
}

export function TableObject({ objectDef }: Props) {
  const { viewStore, connections, definition, initialParams, screenParams } = useViewContext()
  const objectState = useStore(viewStore, (s) => s.objects[objectDef.id])
  const setObjectState = useStore(viewStore, (s) => s.setObjectState)
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const toast = useToast()
  const { confirm, confirmDialog } = useConfirm()
  const tenantCode = useAuthStore((s) => s.tenant?.code ?? '')
  const uploadInputRef = useRef<HTMLInputElement | null>(null)
  const [uploadAction, setUploadAction] = useState<ComponentAction | null>(null)

  // Mapa id→entity: nos objetos/componentes "entity" guarda o entities[].id,
  // mas a API recebe o entities[].entity (que pode diferir do id).
  const entityMap: Record<string, string> = {}
  for (const e of definition.entities) {
    entityMap[e.id] = e.entity ?? e.id
  }
  const entityName = entityMap[objectDef.entity] ?? objectDef.entity

  // orderBy declarado na EntityNode (fallback quando o objeto não tem orderBy próprio)
  const entityNode = definition.entities.find((e) => e.id === objectDef.entity)
  const entityOrderBy = entityNode?.orderBy

  const connectionParams = useConnectionParams(objectDef.id)
  const enabled = useConnectionEnabled(objectDef.id)

  // Params do filtro vinculado via filterObjectId (FilterObject grava em seu próprio estado)
  // Usa EMPTY_PARAMS como fallback estável — {} inline criaria nova referência a cada render
  // e causaria loop infinito no useSyncExternalStore do Zustand
  const filterParams = useStore(viewStore, (s) =>
    objectDef.filterObjectId
      ? (s.objects[objectDef.filterObjectId]?.queryParams ?? EMPTY_PARAMS)
      : EMPTY_PARAMS,
  )

  // Opções de tamanho de página — lê pageSizes da raiz ou do objeto pagination
  const pageSizeOptions: number[] =
    (objectDef.pageSizes ?? objectDef.pagination?.pageSizes ?? []).length > 0
      ? (objectDef.pageSizes ?? objectDef.pagination?.pageSizes!)
      : []

  // pageSize: controlado por estado local; default = primeiro da lista ou 10
  const defaultPageSize = pageSizeOptions[0] ?? objectDef.pagination?.pageSize ?? 10
  const [pageSize, setPageSize] = useState(defaultPageSize)

  // Paginação local — volta para página 1 quando o filtro muda
  const [pageNumber, setPageNumber] = useState(1)

  function handlePageSizeChange(size: number) {
    setPageSize(size)
    setPageNumber(1)
  }

  // Ordenação local — 3 estados por coluna: asc → desc → null (remove)
  const [sortField, setSortField] = useState<string | null>(null)
  const [sortDir, setSortDir]   = useState<'asc' | 'desc'>('asc')
  const [heightMode, setHeightMode] = useState<TableHeightMode>('normal')
  const [settingsOpen, setSettingsOpen] = useState(false)

  function handleSort(field: string) {
    setPageNumber(1)
    if (sortField === field) {
      if (sortDir === 'asc') {
        setSortDir('desc')
      } else {
        setSortField(null) // 3.º clique: remove ordenação
      }
    } else {
      setSortField(field)
      setSortDir('asc')
    }
  }

  // orderBy: sort do usuário > objectDef.orderBy > entity.orderBy
  const effectiveOrderBy = sortField
    ? `${sortField},${sortDir}`
    : (objectDef.orderBy ?? entityOrderBy ?? undefined)

  const tableHeight = TABLE_HEIGHT_OPTIONS.find((option) => option.value === heightMode)
  const tableScrollStyle: React.CSSProperties = tableHeight?.maxHeight
    ? { maxHeight: tableHeight.maxHeight }
    : {}

  // Params finais: connection (selectedRow pai) + filterObjectId + queryParams próprio + paginação
  const queryParams = {
    ...connectionParams,
    ...filterParams,
    ...(objectState?.queryParams ?? {}),
    pageNumber,
    pageSize,
    ...(effectiveOrderBy ? { orderBy: effectiveOrderBy } : {}),
  }

  const { data, isLoading, isFetching, isError } = useEntityQuery({
    entity: entityName,
    params: queryParams,
    enabled,
  })

  const api    = data as EntityListResponse<EntityRecord>
  const rows: EntityRecord[] = api?.data ?? (Array.isArray(data) ? data as EntityRecord[] : [])

  // Lê os campos de paginação que a API sempre retorna
  const total      = api?.totalElements ?? api?.total ?? api?.totalRecords ?? api?.count ?? rows.length
  const totalPages = api?.totalPages    ?? (Math.ceil(total / pageSize) || 1)

  // isFirst/isLast baseados no estado LOCAL — não nos booleans da API.
  // Com keepPreviousData, api.first/api.last pertencem à página ANTERIOR
  // enquanto a nova carrega, o que desabilitaria botões incorretamente.
  const isFirst = pageNumber <= 1
  const isLast  = pageNumber >= totalPages

  // Reseta para pág 1 quando filtro ou conexão mudam
  const filterSignature = JSON.stringify({ f: filterParams, q: objectState?.queryParams, c: connectionParams })
  const prevSig = useRef(filterSignature)
  useEffect(() => {
    if (prevSig.current !== filterSignature) {
      prevSig.current = filterSignature
      setPageNumber(1)
    }
  }, [filterSignature])

  // Colunas: components que não são generalActions e pertencem a este objeto
  const columns = (objectDef.components ?? []).filter(
    (c) => c.type !== 'generalActions' && c.idObject === objectDef.id,
  )

  const generalActions = (objectDef.components ?? []).filter(
    (c) => c.type === 'generalActions' && c.idObject === objectDef.id,
  )

  // Verifica se há colunas de ações
  const actionColumns = columns.filter((c) => c.actions && c.actions.length > 0)
  const dataColumns = columns.filter((c) => !c.actions || c.actions.length === 0)

  // Mutação de exclusão
  const deleteMutation = useMutation({
    mutationFn: ({ entity, id }: { entity: string; id: string | number }) =>
      entityApi.remove(entity, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['entity', entityName] })
    },
  })

  // Handler de ação por linha
  const handleRowAction = useCallback(
    async (action: ComponentAction, row: EntityRecord) => {
      try {
      // Confirmação genérica: qualquer action com "confirmation" exibe modal antes de executar.
      // delete já trata internamente (usa action.confirmation dentro do case).
      if (action.action !== 'delete' && action.confirmation) {
        if (!(await confirm(action.confirmation))) return
      }
      switch (action.action) {
        case 'edit':
        case 'showObject':
        case 'detail': {
          setObjectState(objectDef.id, { selectedRow: row })

          // Monta searchParams a partir de action.params
          const searchParams: Record<string, unknown> = {}
          for (const p of action.params ?? []) {
            const val = row[p.sourceKey ?? p.key]
            if (val !== undefined && val !== null) searchParams[p.key] = val
          }

          const targetId = action.object || ''
          const rawMode = action.objectAction ?? (action.action === 'detail' ? 'detail' : 'edit')
          const targetMode = (rawMode === 'edit' || rawMode === 'detail' || rawMode === 'create' || rawMode === 'list') ? rawMode : 'edit'

          // Verifica se o objeto alvo existe na view atual
          const existsInView = !!targetId && definition.objects.some((o) => o.id === targetId)

          if (existsInView) {
            // Objeto existe na view → abre inline/modal
            setObjectState(targetId, {
              mode: targetMode,
              selectedRow: { ...row, ...searchParams },
              queryParams: searchParams,
            })
          } else if (action.url) {
            // Interpola {{campo}} no URL usando initialParams + dados da linha
            const interpolatedUrl = interpolate(action.url, { ...initialParams, ...row })
            navigate(`/home/${interpolatedUrl}`, { state: { searchParams, mode: targetMode } })
          } else if (!targetId) {
            // Sem objeto e sem URL → aciona filhos via connections
            const childConnections = connections.filter((c) => c.parent === objectDef.id)
            for (const conn of childConnections) {
              setObjectState(conn.child, { mode: targetMode, selectedRow: row })
            }
          }
          break
        }
        case 'delete': {
          // Entidade real pode diferir da view usada na tabela (ex: tabela exibe v_lancamento_gerencial
          // mas o DELETE vai para lancamento_gerencial). Usa action.params[0].entity como override.
          const deleteEntity = action.params?.[0]?.entity ?? entityName
          // ID vem do campo indicado em params.sourceKey (ou params.key), não do objectDef.primaryKey
          const pkField = action.params?.[0]?.sourceKey ?? action.params?.[0]?.key ?? objectDef.primaryKey ?? 'id'
          const id = row[pkField] as string | number
          const confirmation = action.confirmation ?? 'Deseja realmente excluir este registro?'
          if (id && await confirm(confirmation)) {
            entityApi.remove(deleteEntity, id)
              .then(() => {
                toast.success('Registro excluído.')
                // Invalida a entidade da tabela (view)
                queryClient.invalidateQueries({ queryKey: ['entity', entityName] })
                // Invalida entidades declaradas na action
                for (const e of action.affectedEntities ?? []) {
                  queryClient.invalidateQueries({ queryKey: ['entity', e] })
                }
                // Executa actions pós-delete (ex: confirmarTesouraria, verificarStatusFinanceiro)
                for (const postAction of action.actions ?? []) {
                  if (postAction.action !== 'executeScript') continue
                  const scriptId = postAction.script ?? postAction.scriptId ?? ''
                  if (!scriptId) continue
                  const resolvedCustomParams: Record<string, unknown> = {}
                  for (const [key, val] of Object.entries(postAction.customParams ?? {})) {
                    resolvedCustomParams[key] = typeof val === 'string' && val.includes('{{')
                      ? interpolateExpr(val, { ...screenParams, ...(initialParams ?? {}) })
                      : val
                  }
                  // inputs: chaves mapeadas pelos params + rowData: linha completa excluída
                  const scriptInputs: Record<string, unknown> = {}
                  for (const p of action.params ?? []) {
                    scriptInputs[p.key] = row[p.sourceKey ?? p.key]
                  }
                  scriptApi.execute(scriptId, {
                    inputs: scriptInputs,
                    rowData: row,
                    customParams: resolvedCustomParams,
                  }).then((result) => {
                    if (result.messageError) toast.error(result.messageError)
                    else if (result.message) toast.success(result.message)
                    for (const e of result.affectedEntities ?? []) {
                      queryClient.invalidateQueries({ queryKey: ['entity', e] })
                    }
                    for (const e of postAction.affectedEntities ?? []) {
                      queryClient.invalidateQueries({ queryKey: ['entity', e] })
                    }
                    if (result.reload || postAction.reloadAfterAction) {
                      queryClient.invalidateQueries({ queryKey: ['entity', entityName] })
                    }
                  }).catch(() => {})
                }
              })
              .catch(() => toast.error('Erro ao excluir.'))
          }
          break
        }
        case 'navigate': {
          // Navega para outra tela com searchParams da linha
          for (const entity of action.reloadEntities ?? []) {
            queryClient.removeQueries({ queryKey: ['entity', entity] })
            queryClient.removeQueries({ queryKey: ['entity-single', entity] })
          }
          const params: Record<string, unknown> = {}
          for (const p of action.params ?? []) {
            params[p.key] = row[p.sourceKey ?? p.key]
          }
          const screen = action.object ?? ''
          if (screen) {
            navigate(`/home/${screen}`, { state: { searchParams: params } })
          }
          break
        }
        case 'executeScript': {
          const scriptId = action.script ?? action.scriptId ?? ''
          if (!scriptId) break
          // Monta inputs a partir dos params da action e da linha
          const inputs: Record<string, unknown> = {}
          for (const p of action.params ?? []) {
            inputs[p.key] = row[p.sourceKey ?? p.key]
          }
          // Resolve customParams estáticos contra screenParams + initialParams (suporta {{PARAM}})
          const resolvedCustomParams: Record<string, unknown> = {}
          for (const [key, val] of Object.entries(action.customParams ?? {})) {
            resolvedCustomParams[key] = val.includes('{{')
              ? interpolateExpr(val, { ...screenParams, ...(initialParams ?? {}) })
              : val
          }
          scriptApi.execute(scriptId, { inputs, customParams: resolvedCustomParams }).then((result) => {
            if (result.messageError) {
              toast.error(result.messageError)
            } else if (result.message) {
              toast.success(result.message)
            }
            // Recarrega entidade atual se o script pediu OU se a action configurou
            if (result.reload || action.reloadAfterAction) {
              queryClient.invalidateQueries({ queryKey: ['entity', entityName] })
            }
            // Invalida entidades retornadas pelo script
            for (const e of result.affectedEntities ?? []) {
              queryClient.invalidateQueries({ queryKey: ['entity', e] })
            }
            // Invalida entidades declaradas na action do JSON
            for (const e of action.affectedEntities ?? []) {
              queryClient.invalidateQueries({ queryKey: ['entity', e] })
            }
          }).catch((err) => {
            const msg = (err as { response?: { data?: { messageError?: string } } })
              ?.response?.data?.messageError ?? 'Erro ao executar ação.'
            toast.error(msg)
          })
          break
        }
        case 'downloadNfe':
        case 'generateNfe': {
          const template = action.actionParams?.fileName
          if (!template) { toast.error('downloadNfe: actionParams.fileName não definido'); break }
          const fileName = resolveTemplate(template, row as Record<string, unknown>)
          if (!fileName) { toast.error('Não foi possível resolver o nome do arquivo'); break }
          const dlParams: Record<string, string> = {}
          for (const [key, val] of Object.entries(action.actionParams ?? {})) {
            if (key === 'fileName' || typeof val !== 'string') continue
            const resolved = resolveTemplate(val, row as Record<string, unknown>)
            if (resolved) dlParams[key] = resolved
          }
          nfeClient
            .get(`/danfe/download/${encodeURIComponent(fileName)}`, {
              params: dlParams,
              responseType: 'blob',
              headers: { 'X-Tenant-Id': tenantCode },
            })
            .then((resp) => {
              const blob = new Blob([resp.data as BlobPart])
              const url = window.URL.createObjectURL(blob)
              const a = document.createElement('a')
              a.href = url; a.download = fileName
              document.body.appendChild(a); a.click(); a.remove()
              window.URL.revokeObjectURL(url)
            })
            .catch((err: unknown) => toast.error((err as { message?: string })?.message ?? 'Erro ao baixar arquivo'))
          break
        }

        case 'generateReport': {
          const reportName = action.actionParams?.reportName
          if (!reportName) { toast.error('generateReport: actionParams.reportName não definido'); break }
          const docType = action.actionParams?.docType ?? 'pdf'
          const filters: Record<string, unknown> = {}
          const rawFilters = action.actionParams?.filters
          if (rawFilters && typeof rawFilters === 'object') {
            for (const [key, val] of Object.entries(rawFilters)) {
              if (typeof val === 'string') {
                const resolved = resolveTemplate(val, row as Record<string, unknown>)
                if (resolved !== '') filters[key] = resolved
              } else { filters[key] = val }
            }
          }
          apiClient
            .post('/api/reports/generate', { reportName, docType, filters })
            .then((resp) => {
              const data = resp.data as string | Record<string, unknown>
              const generatedFileName = typeof data === 'string' ? data : (data?.name ?? data?.fileName ?? data?.filename ?? null)
              if (!generatedFileName) { toast.error('Nome do arquivo gerado não retornado'); return }
              navigate('/report-viewer', { state: { fileName: generatedFileName, reportName, docType } })
            })
            .catch((err: unknown) => {
              const msg = (err as { response?: { data?: { message?: string } }; message?: string })?.response?.data?.message
                ?? (err as { message?: string })?.message ?? 'Erro ao gerar relatório'
              toast.error(msg)
            })
          break
        }

        default:
          console.warn('[TableObject] Ação não suportada:', action.action)
      }
      } catch (err) {
        console.error('[TableObject] Erro em handleRowAction:', err)
      }
    },
    [objectDef, connections, definition, setObjectState, deleteMutation, navigate, toast, tenantCode],
  )

  // Handler de generalActions
  const handleGeneralAction = useCallback(
    async (action: ComponentAction) => {
      // Confirmação genérica: qualquer generalAction com "confirmation" exibe modal antes de executar.
      if (action.confirmation && !(await confirm(action.confirmation))) return
      switch (action.action) {
        case 'showObject': {
          if (!action.object) break
          const mode = (action.objectAction === 'edit' || action.objectAction === 'detail' || action.objectAction === 'create')
            ? action.objectAction : 'create'
          setObjectState(action.object, { mode, selectedRow: null, formData: null })
          break
        }
        case 'new':
        case 'create': {
          const target = action.object
          if (target) {
            setObjectState(target, { mode: 'create', selectedRow: null, formData: null })
          } else if (action.url) {
            navigate(resolveActionRoute(action.url))
          } else {
            const childConnections = connections.filter((c) => c.parent === objectDef.id)
            for (const conn of childConnections) {
              setObjectState(conn.child, { mode: 'create', selectedRow: null, formData: null })
            }
          }
          break
        }
        case 'navigate': {
          const screen = action.object ?? action.url ?? ''
          if (!screen) break
          for (const entity of action.reloadEntities ?? []) {
            queryClient.removeQueries({ queryKey: ['entity', entity] })
            queryClient.removeQueries({ queryKey: ['entity-single', entity] })
          }
          // Resolve searchParams com interpolação {{campo}} usando initialParams + screenParams
          const ctx = { ...screenParams, ...initialParams } as Record<string, unknown>
          const navParams: Record<string, unknown> = {}
          for (const [key, val] of Object.entries(action.searchParams ?? {})) {
            navParams[key] = typeof val === 'string' && val.includes('{{')
              ? interpolate(val, ctx)
              : val
          }
          navigate(
            resolveActionRoute(screen),
            Object.keys(navParams).length > 0 ? { state: { searchParams: navParams } } : undefined,
          )
          break
        }
        case 'uploadNavigate':
        case 'openUpload': {
          if (!action.url) {
            toast.error('Informe a rota de destino para a acao de upload.')
            break
          }
          setUploadAction(action)
          requestAnimationFrame(() => uploadInputRef.current?.click())
          break
        }
        case 'executeScript': {
          const scriptId = action.script ?? action.scriptId ?? ''
          if (!scriptId) break
          const gaCustomParams: Record<string, unknown> = {}
          for (const [key, val] of Object.entries(action.customParams ?? {})) {
            gaCustomParams[key] = val.includes('{{')
              ? interpolateExpr(val, { ...screenParams, ...(initialParams ?? {}) })
              : val
          }
          scriptApi.execute(scriptId, { entity: entityName, params: queryParams, customParams: gaCustomParams })
            .then((result) => {
              if (result.messageError) toast.error(result.messageError)
              else if (result.message) toast.success(result.message)
              if (result.reload || action.reloadAfterAction) {
                queryClient.invalidateQueries({ queryKey: ['entity', entityName] })
              }
              for (const e of result.affectedEntities ?? []) {
                queryClient.invalidateQueries({ queryKey: ['entity', e] })
              }
              for (const e of action.affectedEntities ?? []) {
                queryClient.invalidateQueries({ queryKey: ['entity', e] })
              }
            })
            .catch((err) => {
              const msg = (err as { response?: { data?: { messageError?: string } } })
                ?.response?.data?.messageError ?? 'Erro ao executar.'
              toast.error(msg)
            })
          break
        }
        case 'export': {
          const exportType = action.type ?? 'PDF'
          entityApi.download(entityName, exportType, queryParams)
            .catch(() => toast.error(`Erro ao exportar ${exportType}.`))
          break
        }
        case 'updateConnections': {
          queryClient.invalidateQueries({ queryKey: ['entity', entityName] })
          break
        }
        default:
          console.warn('[TableObject] generalAction não suportada:', action.action)
      }
    },
    [objectDef, connections, setObjectState, navigate, queryParams, queryClient, toast],
  )

  function handleUploadNavigate(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    const action = uploadAction
    event.target.value = ''
    setUploadAction(null)
    if (!file || !action?.url) return

    const uploadToken = storePendingUpload(file)
    navigate(resolveActionRoute(action.url), {
      state: {
        uploadToken,
        uploadFileName: file.name,
        uploadAction: action.title ?? action.name ?? 'Importar arquivo',
      },
    })
  }

  return (
    <div style={objectDef.style as React.CSSProperties}>
      {confirmDialog}
      <input
        ref={uploadInputRef}
        type="file"
        className="hidden"
        accept={uploadAction?.accept ?? '.xml,application/xml,text/xml'}
        onChange={handleUploadNavigate}
      />
      {/* Header: título + generalActions */}
      {false && (objectDef.title || generalActions.length > 0) && (
        <div className="mb-2 flex items-center justify-between gap-2">
          {objectDef.title && (
            <h3 className="text-sm font-semibold text-foreground">{interpolate(objectDef.title, initialParams)}</h3>
          )}
          {generalActions.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {generalActions.flatMap((ga) => ga.actions ?? []).map((action, i) => (
                <GeneralActionButton
                  key={i}
                  action={action}
                  onAction={handleGeneralAction}
                />
              ))}
            </div>
          )}
        </div>
      )}

      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="min-w-0">
          {objectDef.title && (
            <h3 className="truncate text-sm font-semibold text-foreground">{interpolate(objectDef.title, initialParams)}</h3>
          )}
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
          {generalActions.flatMap((ga) => ga.actions ?? []).map((action, i) => (
            <GeneralActionButton
              key={i}
              action={action}
              onAction={handleGeneralAction}
              disabled={!enabled}
            />
          ))}
          <TableSettingsButton
            mode={heightMode}
            open={settingsOpen}
            columns={dataColumns}
            sortField={sortField}
            sortDir={sortDir}
            onToggle={() => setSettingsOpen((open) => !open)}
            onHeightSelect={(mode) => {
              setHeightMode(mode)
              setSettingsOpen(false)
            }}
            onSortSelect={(field, dir) => {
              setPageNumber(1)
              setSortField(field)
              setSortDir(dir)
              setSettingsOpen(false)
            }}
            onSortClear={() => {
              setPageNumber(1)
              setSortField(null)
              setSettingsOpen(false)
            }}
          />
        </div>
      </div>

      {/* Loading */}
      {(isLoading || isFetching) && (
        <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          Carregando...
        </div>
      )}

      {isError && (
        <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          Erro ao carregar dados.
        </div>
      )}

      {/* Tabela */}
      {!isLoading && !isError && (
        <>
          <div
            className={[
              'hidden overflow-auto rounded-md border border-border md:block',
              heightMode === 'infinite' ? '' : 'overscroll-contain',
            ].join(' ')}
            style={tableScrollStyle}
          >
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-muted/95 backdrop-blur">
                <tr>
                  {dataColumns.map((col, i) => {
                    const isNumeric = NUMERIC_TYPES.has(col.type)
                    const isSorted  = sortField === col.name
                    // width pode vir como "col.width" (shorthand) ou dentro de col.style
                    const colStyle: React.CSSProperties = {
                      ...(col.width ? { width: col.width, maxWidth: col.width } : {}),
                      ...(col.style as React.CSSProperties ?? {}),
                    }
                    return (
                      <th
                        key={i}
                        onClick={() => handleSort(col.name)}
                        style={Object.keys(colStyle).length ? colStyle : undefined}
                        className={[
                          'px-3 py-2 text-xs font-semibold cursor-pointer select-none transition-colors group',
                          isNumeric ? 'text-right' : 'text-left',
                          isSorted
                            ? 'bg-primary/10 text-primary'
                            : 'text-muted-foreground hover:text-foreground hover:bg-muted/80',
                        ].join(' ')}
                      >
                        <span className={`inline-flex items-center gap-1 ${isNumeric ? 'flex-row-reverse' : ''}`}>
                          <span>{col.title ?? col.label ?? col.name}</span>
                          <SortIcon sorted={isSorted} dir={sortDir} />
                        </span>
                      </th>
                    )
                  })}
                  {actionColumns.map((col, i) => (
                    <th key={`act-${i}`} className="px-3 py-2 text-right text-xs font-semibold text-muted-foreground">
                      {col.title ?? ''}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={dataColumns.length + actionColumns.length || 1}
                      className="px-3 py-12 text-center"
                    >
                      <TableEmptyState message={typeof objectDef.emptyState === 'string' ? objectDef.emptyState : 'Nenhum registro encontrado.'} />
                    </td>
                  </tr>
                ) : (
                  rows.map((row, ri) => {
                    const isSelected = objectState?.selectedRow === row
                    const rowStyle = getStatusColor(row, objectDef.statusColors)
                    return (
                      <tr
                        key={ri}
                        style={rowStyle}
                        className={[
                          'border-t border-border transition-colors',
                          isSelected ? 'bg-primary/10' : 'hover:bg-muted/30',
                          actionColumns.length === 0 ? 'cursor-pointer' : '',
                        ].join(' ')}
                        onClick={
                          actionColumns.length === 0
                            ? () => setObjectState(objectDef.id, { selectedRow: row })
                            : undefined
                        }
                      >
                        {dataColumns.map((col, ci) => {
                          const isNumeric = NUMERIC_TYPES.has(col.type)
                          const colStyle: React.CSSProperties = {
                            ...(col.width ? { width: col.width, maxWidth: col.width, overflow: 'hidden' } : {}),
                            ...(col.style as React.CSSProperties ?? {}),
                          }
                          return (
                          <td
                            key={ci}
                            style={Object.keys(colStyle).length ? colStyle : undefined}
                            className={`px-3 py-2 ${isNumeric ? 'text-right tabular-nums' : ''}`}
                          >
                            {col.type === 'template' || col.template || col.templates
                              ? (col.templates?.length
                                  ? renderTemplates(col.templates, row)
                                  : renderTemplate(col.template ?? '', row))
                              : formatCell(row[col.name], col)}
                          </td>
                          )
                        })}
                        {actionColumns.map((col, ci) => (
                          <td key={`act-${ci}`} className="px-3 py-2">
                            <div className="flex flex-col items-end gap-1">
                              {(col.actions ?? []).map((action, ai) => (
                                <ActionButton
                                  key={`${col.idComponent}-${ai}`}
                                  action={action}
                                  row={row}
                                  onAction={handleRowAction}
                                />
                              ))}
                            </div>
                          </td>
                        ))}
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Paginação — sempre visível quando há dados */}
          <div className="space-y-2 md:hidden">
            {rows.length === 0 ? (
              <div className="rounded-md border border-border bg-card px-3 py-8 text-center">
                <TableEmptyState message={typeof objectDef.emptyState === 'string' ? objectDef.emptyState : 'Nenhum registro encontrado.'} />
              </div>
            ) : (
              rows.map((row, ri) => {
                const isSelected = objectState?.selectedRow === row
                const rowStyle = getStatusColor(row, objectDef.statusColors)
                return (
                  <TableMobileCard
                    key={ri}
                    row={row}
                    dataColumns={dataColumns}
                    actionColumns={actionColumns}
                    selected={isSelected}
                    style={rowStyle}
                    onSelect={() => setObjectState(objectDef.id, { selectedRow: row })}
                    onAction={handleRowAction}
                  />
                )
              })
            )}
          </div>

          {rows.length > 0 && (
            <div className="mt-2 flex items-center justify-between gap-4 text-xs text-muted-foreground">
              {/* Esquerda: contador + seletor de itens por página */}
              <div className="flex items-center gap-2">
                <span>
                  {totalPages > 1
                    ? `${(pageNumber - 1) * pageSize + 1}–${Math.min(pageNumber * pageSize, total)} de ${total}`
                    : `${total} registro${total !== 1 ? 's' : ''}`}
                </span>
                {pageSizeOptions.length > 1 && (
                  <select
                    value={pageSize}
                    onChange={(e) => handlePageSizeChange(Number(e.target.value))}
                    className="rounded border border-border bg-background px-1.5 py-0.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring cursor-pointer"
                    title="Itens por página"
                  >
                    {pageSizeOptions.map((s) => (
                      <option key={s} value={s}>{s} / pág.</option>
                    ))}
                  </select>
                )}
              </div>

              {/* Direita: navegação de páginas */}
              {totalPages > 1 && (
                <div className="flex items-center gap-0.5">
                  <PagBtn onClick={() => setPageNumber(1)} disabled={isFirst} title="Primeira página">«</PagBtn>
                  <PagBtn onClick={() => setPageNumber((p) => Math.max(1, p - 1))} disabled={isFirst} title="Anterior">‹</PagBtn>
                  <span className="px-2 tabular-nums">{pageNumber} / {totalPages}</span>
                  <PagBtn onClick={() => setPageNumber((p) => p + 1)} disabled={isLast} title="Próxima">›</PagBtn>
                  <PagBtn onClick={() => setPageNumber(totalPages)} disabled={isLast} title="Última página">»</PagBtn>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ─── GeneralActionButton ──────────────────────────────────────────────────────
// Botão de ação global da tabela. Suporta variant Bootstrap-like + style inline.

const GA_VARIANT: Record<string, string> = {
  'primary':         'bg-primary text-primary-foreground hover:bg-primary/90',
  'secondary':       'bg-secondary text-secondary-foreground hover:bg-secondary/90',
  'success':         'bg-green-600 text-white hover:bg-green-700',
  'danger':          'bg-destructive text-destructive-foreground hover:bg-destructive/90',
  'warning':         'bg-yellow-500 text-white hover:bg-yellow-600',
  'info':            'bg-sky-500 text-white hover:bg-sky-600',
  'outline-primary': 'border border-primary text-primary hover:bg-primary/10',
  'outline-secondary':'border border-border text-muted-foreground hover:bg-muted',
  'outline-danger':  'border border-destructive text-destructive hover:bg-destructive/10',
}

interface TableMobileCardProps {
  row: EntityRecord
  dataColumns: ComponentDefinition[]
  actionColumns: ComponentDefinition[]
  selected: boolean
  style?: React.CSSProperties
  onSelect: () => void
  onAction: (action: ComponentAction, row: EntityRecord) => void
}

function TableMobileCard({
  row,
  dataColumns,
  actionColumns,
  selected,
  style,
  onSelect,
  onAction,
}: TableMobileCardProps) {
  const titleColumn = dataColumns[0]
  const detailColumns = dataColumns.slice(1)
  const title = titleColumn ? renderMobileCell(titleColumn, row) : null

  return (
    <article
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') onSelect()
      }}
      style={style}
      className={[
        'rounded-lg border bg-card p-3 shadow-sm transition-colors',
        selected ? 'border-primary ring-2 ring-primary/15' : 'border-border',
        style ? '' : 'hover:border-primary/30',
      ].join(' ')}
    >
      {titleColumn && (
        <div className="mb-2 min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {titleColumn.title ?? titleColumn.label ?? titleColumn.name}
          </p>
          <div className="mt-0.5 truncate text-sm font-semibold text-foreground">
            {title}
          </div>
        </div>
      )}

      {detailColumns.length > 0 && (
        <dl className="grid grid-cols-1 gap-2">
          {detailColumns.map((col) => {
            const isNumeric = NUMERIC_TYPES.has(col.type)
            return (
              <div key={col.idComponent ?? col.name} className="grid grid-cols-[42%_1fr] gap-2 border-t border-border/70 pt-2">
                <dt className="min-w-0 truncate text-xs font-medium text-muted-foreground">
                  {col.title ?? col.label ?? col.name}
                </dt>
                <dd className={`min-w-0 text-xs text-foreground ${isNumeric ? 'text-right tabular-nums' : 'text-left'}`}>
                  <span className="break-words">{renderMobileCell(col, row)}</span>
                </dd>
              </div>
            )
          })}
        </dl>
      )}

      {actionColumns.length > 0 && (
        <div className="mt-3 flex flex-wrap justify-end gap-1.5 border-t border-border/70 pt-2">
          {actionColumns.flatMap((col) => col.actions ?? []).map((action, index) => (
            <ActionButton
              key={`${action.action}-${action.name ?? action.title ?? index}`}
              action={action}
              row={row}
              onAction={onAction}
            />
          ))}
        </div>
      )}
    </article>
  )
}

function renderMobileCell(col: ComponentDefinition, row: EntityRecord) {
  if (col.type === 'template' || col.template || col.templates) {
    if (col.templates?.length) return renderTemplates(col.templates, row)
    return renderTemplate(col.template ?? '', row)
  }
  return formatCell(row[col.name], col)
}

interface TableSettingsButtonProps {
  mode: TableHeightMode
  open: boolean
  columns: ComponentDefinition[]
  sortField: string | null
  sortDir: 'asc' | 'desc'
  onToggle: () => void
  onHeightSelect: (mode: TableHeightMode) => void
  onSortSelect: (field: string, dir: 'asc' | 'desc') => void
  onSortClear: () => void
}

function TableEmptyState({ message }: { message: string }) {
  return (
    <div className="mx-auto flex max-w-sm flex-col items-center justify-center py-3">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-blue-50 text-blue-600 ring-1 ring-blue-100">
        <i className="bi bi-inbox text-2xl" aria-hidden />
      </div>
      <p className="mt-4 text-sm font-semibold text-foreground">{message}</p>
      <p className="mt-1 text-xs text-muted-foreground">
        Tente ajustar os filtros ou criar um novo registro.
      </p>
    </div>
  )
}

function TableSettingsButton({
  mode,
  open,
  columns,
  sortField,
  sortDir,
  onToggle,
  onHeightSelect,
  onSortSelect,
  onSortClear,
}: TableSettingsButtonProps) {
  const sortableColumns = columns.filter((column) => column.name)

  return (
    <div className="relative">
      <button
        type="button"
        title="Configuracoes da tabela"
        onClick={onToggle}
        className={[
          'flex h-8 w-8 items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition-colors',
          open ? 'border-primary text-primary ring-2 ring-primary/15' : 'hover:bg-muted hover:text-foreground',
        ].join(' ')}
      >
        <i className="bi bi-gear text-sm" aria-hidden />
      </button>

      {open && (
        <div className="absolute right-0 top-9 z-30 max-h-[70vh] w-72 overflow-y-auto rounded-md border border-border bg-popover text-popover-foreground shadow-xl">
          <div className="border-b border-border px-3 py-2 text-xs font-semibold text-muted-foreground">
            Altura da tabela
          </div>
          {TABLE_HEIGHT_OPTIONS.map((option) => {
            const active = option.value === mode
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => onHeightSelect(option.value)}
                className={[
                  'flex w-full items-center gap-2 px-3 py-2 text-left transition-colors',
                  active ? 'bg-primary/10 text-primary' : 'hover:bg-muted',
                ].join(' ')}
              >
                <span className="flex h-5 w-5 shrink-0 items-center justify-center">
                  {active && <i className="bi bi-check2 text-sm" aria-hidden />}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{option.label}</span>
                  <span className="block text-xs text-muted-foreground">{option.description}</span>
                </span>
              </button>
            )
          })}

          <div className="border-y border-border px-3 py-2 text-xs font-semibold text-muted-foreground">
            Ordenar por
          </div>
          <button
            type="button"
            onClick={onSortClear}
            className={[
              'flex w-full items-center gap-2 px-3 py-2 text-left transition-colors',
              !sortField ? 'bg-primary/10 text-primary' : 'hover:bg-muted',
            ].join(' ')}
          >
            <span className="flex h-5 w-5 shrink-0 items-center justify-center">
              {!sortField && <i className="bi bi-check2 text-sm" aria-hidden />}
            </span>
            <span className="text-sm font-medium">Sem ordenacao</span>
          </button>

          {sortableColumns.map((column) => {
            const label = column.title ?? column.label ?? column.name
            const activeAsc = sortField === column.name && sortDir === 'asc'
            const activeDesc = sortField === column.name && sortDir === 'desc'
            return (
              <div key={column.idComponent ?? column.name} className="border-t border-border/60 px-3 py-2">
                <div className="mb-1 truncate text-xs font-medium text-foreground">{label}</div>
                <div className="grid grid-cols-2 gap-1">
                  <button
                    type="button"
                    onClick={() => onSortSelect(column.name, 'asc')}
                    className={[
                      'inline-flex h-8 items-center justify-center gap-1 rounded-md border px-2 text-xs font-medium transition-colors',
                      activeAsc ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:bg-muted',
                    ].join(' ')}
                  >
                    <i className="bi bi-arrow-up" aria-hidden />
                    Cresc.
                  </button>
                  <button
                    type="button"
                    onClick={() => onSortSelect(column.name, 'desc')}
                    className={[
                      'inline-flex h-8 items-center justify-center gap-1 rounded-md border px-2 text-xs font-medium transition-colors',
                      activeDesc ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:bg-muted',
                    ].join(' ')}
                  >
                    <i className="bi bi-arrow-down" aria-hidden />
                    Decresc.
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

interface GeneralActionButtonProps {
  action: ComponentAction
  onAction: (action: ComponentAction) => void
  disabled?: boolean
}

function GeneralActionButton({ action, onAction, disabled }: GeneralActionButtonProps) {
  const label = action.title ?? action.name ?? ''
  const variantClass = GA_VARIANT[action.variant ?? 'primary'] ?? GA_VARIANT['primary']
  const title = disabled
    ? 'Selecione ou salve o registro principal para habilitar esta ação'
    : (action.tooltip ?? label)

  return (
    <button
      type="button"
      title={title}
      onClick={() => !disabled && onAction(action)}
      disabled={disabled}
      className={[
        'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
        'disabled:cursor-not-allowed disabled:opacity-40',
        variantClass,
      ].join(' ')}
      style={action.style as React.CSSProperties}
    >
      {action.icon && <i className={`${action.icon} text-xs`} aria-hidden />}
      {label && <span>{label}</span>}
    </button>
  )
}

// ─── PagBtn ──────────────────────────────────────────────────────────────────
// Botão de paginação com caractere Unicode — sempre visível, sem dependência de ícone-fonte.

function PagBtn({
  onClick, disabled, title, children,
}: {
  onClick: () => void
  disabled: boolean
  title: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="flex h-7 w-7 items-center justify-center rounded text-base leading-none hover:bg-muted disabled:cursor-not-allowed disabled:opacity-30 transition-colors"
    >
      {children}
    </button>
  )
}

// ─── SortIcon ────────────────────────────────────────────────────────────────
// SVG inline — independente do Bootstrap Icons, sempre visível.

function SortIcon({ sorted, dir }: { sorted: boolean; dir: 'asc' | 'desc' }) {
  if (!sorted) {
    return (
      <svg
        className="h-2.5 w-2.5 shrink-0 opacity-0 group-hover:opacity-35 transition-opacity"
        viewBox="0 0 8 10" fill="currentColor" aria-hidden
      >
        <path d="M4 0 L7.5 4 H0.5 Z" />
        <path d="M4 10 L0.5 6 H7.5 Z" />
      </svg>
    )
  }

  return (
    <svg
      className="h-2.5 w-2.5 shrink-0"
      viewBox="0 0 8 5" fill="currentColor" aria-hidden
    >
      {dir === 'asc'
        ? <path d="M4 0 L8 5 H0 Z" />      /* ▲ caret pequeno */
        : <path d="M4 5 L0 0 H8 Z" />      /* ▼ caret pequeno */
      }
    </svg>
  )
}

// ─── ActionButton ─────────────────────────────────────────────────────────────

/**
 * Avalia a propriedade `visible` de uma action contra os dados da linha.
 *
 * Suporta três formatos:
 *   "id_status=0"          → legado sem {{}}, = simples (converte para ==)
 *   "{{id_status}}=0"      → com {{}} e = simples (converte para ==)
 *   "{{id_status}}===0"    → expressão JS completa via evalExpr
 */
function isActionVisible(visible: string | boolean | undefined, row: EntityRecord): boolean {
  if (visible === undefined || visible === null) return true
  if (typeof visible === 'boolean') return visible

  let expr = String(visible).trim()

  // Sem {{}} → formato legado "campo=valor": envolve o campo com {{}}
  if (!expr.includes('{{')) {
    expr = expr.replace(/^([a-zA-Z_]\w*)\s*=([^=<>!].*)$/, '{{$1}}==$2')
  } else {
    // Com {{}} mas = simples isolado (não parte de ==, !=, <=, >=) → normaliza para ==
    expr = expr.replace(/\}\}\s*=(?![=])/g, '}}==')
  }

  const result = evalExpr(expr, row as Record<string, unknown>)
  return result !== false && result !== 0 && result !== '' && result !== null && result !== undefined
}

interface ActionButtonProps {
  action: ComponentAction
  row: EntityRecord
  onAction: (action: ComponentAction, row: EntityRecord) => void
}

/** Fallbacks de ícone por tipo de ação (classe Bootstrap Icons completa) */
const ACTION_ICON_FALLBACK: Record<string, string> = {
  edit:          'bi bi-pencil',
  showObject:    'bi bi-pencil',
  detail:        'bi bi-eye',
  delete:        'bi bi-trash',
  navigate:      'bi bi-arrow-right',
  executeScript: 'bi bi-play-circle',
}

/**
 * Resolve a classe CSS final do ícone.
 * Aceita tanto o nome do ícone ("pencil") quanto a classe completa ("bi bi-pencil").
 * Evita o bug de double-prefix "bi bi-bi bi-pencil".
 */
function resolveIconClass(icon: string | undefined, actionType: string): string {
  if (icon) {
    // Já é uma classe completa: "bi bi-pencil-fill" ou "bi-pencil"
    if (icon.startsWith('bi ') || icon.startsWith('bi-')) return icon
    // Apenas o nome do ícone: "pencil-fill"
    return `bi bi-${icon}`
  }
  return ACTION_ICON_FALLBACK[actionType] ?? ''
}

/** Variante Bootstrap-like → classes Tailwind para botões de ação por linha */
function actionVariantClass(variant: string | undefined, actionType: string): string {
  const v = variant ?? (actionType === 'delete' ? 'danger' : 'default')
  switch (v) {
    case 'primary':   return 'text-primary hover:bg-primary/10'
    case 'success':   return 'text-green-600 hover:bg-green-50'
    case 'warning':   return 'text-yellow-600 hover:bg-yellow-50'
    case 'danger':    return 'text-destructive hover:bg-destructive/10'
    case 'info':      return 'text-sky-600 hover:bg-sky-50'
    case 'secondary': return 'text-muted-foreground hover:bg-muted hover:text-foreground'
    default:          return 'text-muted-foreground hover:bg-muted hover:text-foreground'
  }
}

function ActionButton({ action, row, onAction }: ActionButtonProps) {
  if (!isActionVisible(action.visible, row)) return null

  const iconClass    = resolveIconClass(action.icon, action.action)
  const variantClass = actionVariantClass(action.variant, action.action)
  const label        = action.title ?? action.name ?? ''
  const tipText      = action.tooltip ?? label ?? action.action

  return (
    <button
      type="button"
      title={tipText}
      onClick={(e) => {
        e.stopPropagation()
        onAction(action, row)
      }}
      className={`inline-flex items-center gap-1 rounded px-1.5 py-1 text-xs transition-colors cursor-pointer disabled:cursor-not-allowed ${variantClass}`}
      style={action.style as React.CSSProperties}
    >
      {iconClass && <i className={iconClass} aria-hidden="true" />}
      {label && <span>{label}</span>}
      {!iconClass && !label && <span>{action.action}</span>}
    </button>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatCell(value: unknown, col: ComponentDefinition): string {
  if (value === null || value === undefined) return ''
  if (col.type === 'currency' || col.type === 'decimal') {
    const n = Number(value)
    if (isNaN(n)) return String(value)
    return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  }
  if (col.type === 'date' && typeof value === 'string') {
    return value.substring(0, 10).split('-').reverse().join('/')
  }
  if (col.type === 'switch' || col.type === 'checkbox') {
    return value === true || value === 'Sim' || value === '1' || value === 1 ? '✓' : '✗'
  }
  return String(value)
}

function getStatusColor(
  row: EntityRecord,
  statusColors?: Record<string, string>,
): React.CSSProperties | undefined {
  if (!statusColors) return undefined
  for (const [fieldValue, color] of Object.entries(statusColors)) {
    // Formato: "campo:valor" → color
    const [field, val] = fieldValue.split(':')
    if (field && val && String(row[field]) === val) {
      return { backgroundColor: color, color: '#fff' }
    }
  }
  return undefined
}

/**
 * Renderiza um template com valores da row.
 * Ex: "{{nome}} / {{cpf}}" com row = { nome: "João", cpf: "123" }
 *     → "João / 123"
 */
function renderTemplate(template: string, row: EntityRecord): React.ReactNode {
  if (!template) return null
  const rendered = template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    const val = row[key]
    return val !== null && val !== undefined ? String(val) : ''
  })
  // Permite HTML simples como <b>, <br>, <span>
  return <span dangerouslySetInnerHTML={{ __html: rendered }} />
}

/**
 * Renderiza um array de templates com suporte a visibilidade condicional.
 *
 * Cada item pode ter:
 *   - template: string com interpolação {{campo}}
 *   - visible?: "campo=valor"  → só exibe se row[campo] === valor
 *   - placeHolder?: string exibido abaixo em tom secundário quando visível
 *
 * Itens visíveis são renderizados empilhados (flex-col).
 */
function renderTemplates(
  templates: Array<{ template: string; visible?: string; placeHolder?: string }>,
  row: EntityRecord,
): React.ReactNode {
  const interpolate = (str: string) =>
    str.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
      const val = row[key]
      return val !== null && val !== undefined ? String(val) : ''
    })

  const isVisible = (visible?: string): boolean => {
    if (!visible) return true
    const eqIdx = visible.indexOf('=')
    if (eqIdx === -1) return true
    const field = visible.slice(0, eqIdx).trim()
    const expected = visible.slice(eqIdx + 1).trim()
    return String(row[field] ?? '') === expected
  }

  const visible = templates.filter((t) => isVisible(t.visible))
  if (visible.length === 0) return null

  return (
    <div className="flex flex-col gap-0.5">
      {visible.map((t, i) => {
        const main = interpolate(t.template)
        const sub = t.placeHolder ? interpolate(t.placeHolder) : null
        return (
          <span key={i}>
            <span dangerouslySetInnerHTML={{ __html: main }} />
            {sub && (
              <span className="block text-xs text-gray-400" dangerouslySetInnerHTML={{ __html: sub }} />
            )}
          </span>
        )
      })}
    </div>
  )
}
