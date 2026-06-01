import { useState, useCallback, useEffect, useRef } from 'react'
import { useStore } from 'zustand'
import { useQueryClient, useMutation } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { useViewContext } from '../ViewContext'
import { useConnectionParams, useConnectionEnabled } from '../ObjectRenderer'
import { useEntityQuery } from '@/hooks/useEntityQuery'
import { entityApi } from '@/api/entity.api'
import { scriptApi } from '@/api/script.api'
import { useToast } from '@/components/ui/Toast'
import type { ObjectDefinition, ComponentDefinition, ComponentAction } from '@/types/view.types'
import { interpolate } from '@/utils/interpolate'
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

export function TableObject({ objectDef }: Props) {
  const { viewStore, connections, definition, initialParams, screenParams } = useViewContext()
  const objectState = useStore(viewStore, (s) => s.objects[objectDef.id])
  const setObjectState = useStore(viewStore, (s) => s.setObjectState)
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const toast = useToast()

  // Mapa id→entity: nos objetos/componentes "entity" guarda o entities[].id,
  // mas a API recebe o entities[].entity (que pode diferir do id).
  const entityMap: Record<string, string> = {}
  for (const e of definition.entities) {
    entityMap[e.id] = e.entity ?? e.id
  }
  const entityName = entityMap[objectDef.entity] ?? objectDef.entity

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

  // orderBy: sort do usuário tem prioridade; fallback para objectDef.orderBy
  const effectiveOrderBy = sortField
    ? `${sortField},${sortDir}`
    : (objectDef.orderBy ?? undefined)

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
    (action: ComponentAction, row: EntityRecord) => {
      try {
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
            // Objeto não existe na view ou está vazio + tem URL → navega para outra tela
            navigate(`/home/${action.url}`, { state: { searchParams, mode: targetMode } })
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
          const primaryKey = objectDef.primaryKey ?? 'id'
          const id = row[primaryKey] as string | number
          const confirmation = action.confirmation ?? 'Confirmar exclusão?'
          if (id && window.confirm(confirmation)) {
            deleteMutation.mutate(
              { entity: entityName, id },
              {
                onSuccess: () => toast.success('Registro excluído.'),
                onError: () => toast.error('Erro ao excluir.'),
              },
            )
          }
          break
        }
        case 'navigate': {
          // Navega para outra tela com searchParams da linha
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
          scriptApi.execute(scriptId, inputs).then((result) => {
            if (result.messageError) {
              toast.error(result.messageError)
            } else if (result.message) {
              toast.success(result.message)
            }
            if (result.reload) {
              queryClient.invalidateQueries({ queryKey: ['entity', entityName] })
            }
            if (result.affectedEntities) {
              for (const e of result.affectedEntities) {
                queryClient.invalidateQueries({ queryKey: ['entity', e] })
              }
            }
          }).catch((err) => {
            const msg = (err as { response?: { data?: { messageError?: string } } })
              ?.response?.data?.messageError ?? 'Erro ao executar ação.'
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
    [objectDef, connections, definition, setObjectState, deleteMutation, navigate],
  )

  // Handler de generalActions
  const handleGeneralAction = useCallback(
    (action: ComponentAction) => {
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
            navigate(`/home/${action.url}`)
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
          if (screen) navigate(`/home/${screen}`)
          break
        }
        case 'executeScript': {
          const scriptId = action.script ?? action.scriptId ?? ''
          if (!scriptId) break
          scriptApi.execute(scriptId, { entity: entityName, params: queryParams })
            .then((result) => {
              if (result.messageError) toast.error(result.messageError)
              else if (result.message) toast.success(result.message)
              if (result.reload) queryClient.invalidateQueries({ queryKey: ['entity', entityName] })
              for (const e of result.affectedEntities ?? []) {
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
    [objectDef, connections, setObjectState, navigate, queryParams, queryClient],
  )

  return (
    <div style={objectDef.style as React.CSSProperties}>
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
            />
          ))}
          <TableSettingsButton
            mode={heightMode}
            open={settingsOpen}
            onToggle={() => setSettingsOpen((open) => !open)}
            onSelect={(mode) => {
              setHeightMode(mode)
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
              'overflow-auto rounded-md border border-border',
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
                    return (
                      <th
                        key={i}
                        onClick={() => handleSort(col.name)}
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
                  {actionColumns.length > 0 && (
                    <th className="px-3 py-2 text-right text-xs font-semibold text-muted-foreground">
                      Ações
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={dataColumns.length + (actionColumns.length > 0 ? 1 : 0) || 1}
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
                          return (
                          <td key={ci} className={`px-3 py-2 ${isNumeric ? 'text-right tabular-nums' : ''}`}>
                            {col.type === 'template' || col.template
                              ? renderTemplate(col.template ?? '', row)
                              : formatCell(row[col.name], col)}
                          </td>
                          )
                        })}
                        {actionColumns.length > 0 && (
                          <td className="px-3 py-2">
                            <div className="flex justify-end gap-1">
                              {actionColumns.flatMap((col) =>
                                (col.actions ?? []).map((action, ai) => (
                                  <ActionButton
                                    key={`${col.idComponent}-${ai}`}
                                    action={action}
                                    row={row}
                                    onAction={handleRowAction}
                                  />
                                )),
                              )}
                            </div>
                          </td>
                        )}
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Paginação — sempre visível quando há dados */}
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

interface TableSettingsButtonProps {
  mode: TableHeightMode
  open: boolean
  onToggle: () => void
  onSelect: (mode: TableHeightMode) => void
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

function TableSettingsButton({ mode, open, onToggle, onSelect }: TableSettingsButtonProps) {
  const current = TABLE_HEIGHT_OPTIONS.find((option) => option.value === mode)

  return (
    <div className="relative">
      <button
        type="button"
        title={`Altura da tabela: ${current?.label ?? 'Normal'}`}
        onClick={onToggle}
        className={[
          'flex h-8 w-8 items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition-colors',
          open ? 'border-primary text-primary ring-2 ring-primary/15' : 'hover:bg-muted hover:text-foreground',
        ].join(' ')}
      >
        <i className="bi bi-gear text-sm" aria-hidden />
      </button>

      {open && (
        <div className="absolute right-0 top-9 z-30 w-56 overflow-hidden rounded-md border border-border bg-popover text-popover-foreground shadow-xl">
          <div className="border-b border-border px-3 py-2 text-xs font-semibold text-muted-foreground">
            Altura da tabela
          </div>
          {TABLE_HEIGHT_OPTIONS.map((option) => {
            const active = option.value === mode
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => onSelect(option.value)}
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
        </div>
      )}
    </div>
  )
}

interface GeneralActionButtonProps {
  action: ComponentAction
  onAction: (action: ComponentAction) => void
}

function GeneralActionButton({ action, onAction }: GeneralActionButtonProps) {
  const label = action.title ?? action.name ?? ''
  const variantClass = GA_VARIANT[action.variant ?? 'primary'] ?? GA_VARIANT['primary']

  return (
    <button
      type="button"
      title={action.tooltip ?? label}
      onClick={() => onAction(action)}
      className={[
        'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
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
