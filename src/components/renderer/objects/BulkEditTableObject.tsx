import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from 'zustand'
import { useQueryClient } from '@tanstack/react-query'
import { useEntityQuery } from '@/hooks/useEntityQuery'
import { useViewContext } from '../ViewContext'
import { useConnectionParams, useConnectionEnabled } from '../ObjectRenderer'
import { entityApi } from '@/api/entity.api'
import { scriptApi } from '@/api/script.api'
import { useToast } from '@/components/ui/Toast'
import { evalExpr } from '@/utils/evalExpr'
import { resolveColClass } from '@/utils/colClass'
import type { ObjectDefinition, ComponentDefinition, SubmitAction, ComponentAction } from '@/types/view.types'
import type { EntityRecord } from '@/types/entity.types'

interface Props { objectDef: ObjectDefinition }

type RowRecord = Record<string, unknown>

// ─── EditableCell ─────────────────────────────────────────────────────────────
// Estado local por célula — só propaga no blur para evitar re-render da tabela inteira.

interface EditableCellProps {
  col: ComponentDefinition
  initialValue: unknown
  rowIndex: number
  fieldName: string
  disabled?: boolean
  onCommit: (rowIndex: number, field: string, value: unknown) => void
}

function EditableCell({ col, initialValue, rowIndex, fieldName, disabled, onCommit }: EditableCellProps) {
  const [local, setLocal] = useState<unknown>(initialValue ?? '')
  const [focused, setFocused] = useState(false)

  useEffect(() => { setLocal(initialValue ?? '') }, [initialValue])

  const commit = useCallback(
    (val: unknown) => onCommit(rowIndex, fieldName, val),
    [rowIndex, fieldName, onCommit],
  )

  const cls = 'w-full rounded border border-input bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50'

  if (!col.editable || col.disabled) {
    return <span className="text-xs">{formatStatic(initialValue, col)}</span>
  }

  if (col.type === 'date') {
    const toIso = (v: unknown) => {
      if (!v) return ''
      const s = String(v)
      if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
      if (/^\d{2}\/\d{2}\/\d{4}/.test(s)) {
        const [d, m, y] = s.split('/')
        return `${y}-${m}-${d}`
      }
      return s
    }
    return (
      <input type="date" disabled={disabled} className={cls}
        value={toIso(local)}
        onChange={e => { setLocal(e.target.value); commit(e.target.value || null) }} />
    )
  }

  if (col.type === 'select' && col.options?.length) {
    return (
      <select disabled={disabled} className={cls}
        value={local !== null && local !== undefined ? String(local) : ''}
        onChange={e => { setLocal(e.target.value); commit(e.target.value) }}>
        <option value="">--</option>
        {col.options.map((o, i) => <option key={i} value={o.value}>{o.text}</option>)}
      </select>
    )
  }

  if (col.type === 'number' || col.type === 'decimal' || col.type === 'currency') {
    const fmt = (v: unknown) => {
      if (v === null || v === undefined || v === '') return ''
      const n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'))
      if (isNaN(n)) return ''
      if (col.type === 'currency') return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      const dec = col.decimalPlaces ?? col.decimal ?? (col.type === 'decimal' ? 2 : 0)
      return n.toLocaleString('pt-BR', { minimumFractionDigits: dec, maximumFractionDigits: dec })
    }
    const parse = (s: string) => {
      const raw = s.replace(/\./g, '').replace(',', '.')
      return raw === '' ? null : parseFloat(raw)
    }
    return (
      <input type="text" inputMode="decimal" disabled={disabled} className={cls + ' text-right'}
        value={focused ? String(local) : fmt(local)}
        onFocus={() => {
          setFocused(true)
          const n = typeof local === 'number' ? local : parseFloat(String(local).replace(',', '.'))
          setLocal(isNaN(n) ? '' : String(n).replace('.', ','))
        }}
        onChange={e => setLocal(e.target.value)}
        onBlur={e => {
          setFocused(false)
          const val = parse(e.target.value)
          setLocal(fmt(val))
          commit(val)
        }} />
    )
  }

  return (
    <input type="text" disabled={disabled} className={cls}
      placeholder={col.placeholder ?? ''}
      value={local !== null && local !== undefined ? String(local) : ''}
      onChange={e => setLocal(e.target.value)}
      onBlur={e => commit(e.target.value)} />
  )
}

function formatStatic(value: unknown, col: ComponentDefinition): string {
  if (value === null || value === undefined || value === '') return '—'
  if (col.type === 'date') {
    const s = String(value)
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
    if (m) return `${m[3]}/${m[2]}/${m[1]}`
  }
  if (col.type === 'currency') {
    const n = parseFloat(String(value).replace(',', '.'))
    if (!isNaN(n)) return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  }
  if (col.type === 'decimal' || col.type === 'number') {
    const n = parseFloat(String(value).replace(',', '.'))
    const dec = col.decimalPlaces ?? col.decimal ?? (col.type === 'decimal' ? 2 : 0)
    if (!isNaN(n)) return n.toLocaleString('pt-BR', { minimumFractionDigits: dec, maximumFractionDigits: dec })
  }
  return String(value)
}


// ─── BulkEditTableObject ──────────────────────────────────────────────────────

export function BulkEditTableObject({ objectDef }: Props) {
  const { viewStore, initialParams = {}, connections, definition, screenParams } = useViewContext()
  const objectState = useStore(viewStore, (s) => s.objects[objectDef.id])
  const setObjectState = useStore(viewStore, (s) => s.setObjectState)
  const queryClient = useQueryClient()
  const toast = useToast()
  const navigate = useNavigate()
  const connectionParams = useConnectionParams(objectDef.id)
  const enabled = useConnectionEnabled(objectDef.id)

  const ctx: Record<string, unknown> = { ...initialParams, ...connectionParams, ...(objectState?.queryParams ?? {}) }
  const queryParams = { ...connectionParams, ...(objectState?.queryParams ?? {}) }

  const { data, isLoading } = useEntityQuery({
    entity: objectDef.entity,
    params: { ...queryParams, pageSize: 500 },
    enabled: enabled && !!objectDef.entity,
  })

  const serverRows: EntityRecord[] = (data as { data?: EntityRecord[] })?.data
    ?? (Array.isArray(data) ? (data as EntityRecord[]) : [])

  // ─── Estado ────────────────────────────────────────────────────────────────
  const [editedData, setEditedData] = useState<Record<number, Record<string, unknown>>>({})
  const [newRows, setNewRows] = useState<RowRecord[]>([])
  const [deletedRows, setDeletedRows] = useState<Set<number>>(new Set())
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set())
  const [isSaving, setIsSaving] = useState(false)
  const [confirmDeleteIdx, setConfirmDeleteIdx] = useState<{ idx: number; isNew: boolean; newOffset?: number } | null>(null)

  // Seleciona todos por padrão
  useEffect(() => {
    if (objectDef.selectAllDefault !== false && serverRows.length > 0) {
      setSelectedRows(new Set(serverRows.map((_, i) => i)))
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(serverRows)])

  // Limpa edições quando os dados mudam
  useEffect(() => {
    setEditedData({})
    setNewRows([])
    setDeletedRows(new Set())
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(serverRows)])

  // ─── Seleção ───────────────────────────────────────────────────────────────
  const multiSelect = objectDef.singleSelect !== true

  function toggleRow(idx: number) {
    setSelectedRows(prev => {
      if (!multiSelect) return prev.has(idx) ? new Set() : new Set([idx])
      const next = new Set(prev)
      next.has(idx) ? next.delete(idx) : next.add(idx)
      return next
    })
  }

  function toggleAll() {
    const selectable = serverRows.map((_, i) => i).filter(i => !deletedRows.has(i))
    setSelectedRows(prev => prev.size === selectable.length ? new Set() : new Set(selectable))
  }

  // ─── Edição ────────────────────────────────────────────────────────────────
  const handleCommit = useCallback((rowIdx: number, field: string, value: unknown) => {
    setEditedData(prev => ({
      ...prev,
      [rowIdx]: { ...(prev[rowIdx] ?? {}), [field]: value },
    }))
  }, [])

  // ─── Add row ───────────────────────────────────────────────────────────────
  const addRowCfg = typeof objectDef.addRowButton === 'object' && objectDef.addRowButton !== null
    ? objectDef.addRowButton as { label?: string; icon?: string; variant?: string; defaults?: Record<string, unknown> }
    : null

  function handleAddRow() {
    const defaults: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(addRowCfg?.defaults ?? {})) {
      defaults[k] = typeof v === 'string' && v.includes('{{') ? evalExpr(v, ctx) ?? v : v
    }
    const newIdx = serverRows.length + newRows.length
    setNewRows(prev => [...prev, { ...defaults, _isNew: true }])
    setSelectedRows(prev => new Set([...prev, newIdx]))
  }

  // ─── Delete ────────────────────────────────────────────────────────────────
  function confirmDelete(idx: number, isNew: boolean, newOffset?: number) {
    setConfirmDeleteIdx({ idx, isNew, newOffset })
  }

  function doDelete() {
    if (!confirmDeleteIdx) return
    const { idx, isNew, newOffset } = confirmDeleteIdx
    if (isNew && newOffset !== undefined) {
      setNewRows(prev => prev.filter((_, i) => i !== newOffset))
      setSelectedRows(prev => {
        const next = new Set<number>()
        prev.forEach(i => { if (i < idx) next.add(i); else if (i > idx) next.add(i - 1) })
        return next
      })
    } else {
      setDeletedRows(prev => new Set([...prev, idx]))
      setSelectedRows(prev => { const next = new Set(prev); next.delete(idx); return next })
    }
    setConfirmDeleteIdx(null)
  }

  function restoreRow(idx: number) {
    setDeletedRows(prev => { const next = new Set(prev); next.delete(idx); return next })
  }

  // ─── Submit ────────────────────────────────────────────────────────────────
  function buildSubmitRows() {
    const existing = Array.from(selectedRows)
      .filter(i => i < serverRows.length && !deletedRows.has(i))
      .map(i => ({ ...serverRows[i], ...(editedData[i] ?? {}) }))

    const added = newRows.map((row, offset) => ({
      ...row,
      ...(editedData[serverRows.length + offset] ?? {}),
    }))

    const deleted = Array.from(deletedRows).map(i => ({
      ...serverRows[i],
      ...(editedData[i] ?? {}),
      _deleted: true,
    }))

    return [...existing, ...added, ...deleted]
  }

  async function handleSubmit() {
    const rows = buildSubmitRows()
    setIsSaving(true)
    try {
      for (const action of objectDef.submitActions ?? []) {
        await runAction(action, rows)
      }
    } catch (err) {
      const msg = (err as any)?.response?.data?.messageError ?? 'Erro ao processar.'
      toast.error(msg)
    } finally {
      setIsSaving(false)
    }
  }

  async function runAction(action: SubmitAction, rows: RowRecord[]) {
    switch (action.action) {
      case 'saveMany': {
        const entity = action.entity ?? objectDef.entity
        const pk = action.primaryKey ?? 'id'
        await Promise.all(rows.map(row => {
          const { _isNew, _deleted, ...rest } = row as any
          if (_deleted) {
            const id = rest[pk]
            return id ? entityApi.remove(entity, id as string | number) : Promise.resolve()
          }
          const id = rest[pk]
          return (id && String(id) !== '0')
            ? entityApi.update(entity, rest)
            : entityApi.create(entity, rest)
        }))
        queryClient.invalidateQueries({ queryKey: ['entity', entity] })
        toast.success('Salvo com sucesso.')
        break
      }
      case 'executeScript': {
        const scriptId = action.script ?? action.scriptId ?? ''
        if (!scriptId) break
        // Payload espelhado do app antigo: selectedData (não rows), entity, inputs, entities
        const result = await scriptApi.execute(scriptId, {
          ...(action.params ?? {}),
          selectedData: rows,
          selectedCount: rows.length,
          entity: objectDef.entity,
          inputs: ctx,
          entities: {},
          screenParams,
        })
        if (result.messageError) throw new Error(result.messageError)
        if (result.message) toast.success(result.message)
        if (result.reload) queryClient.invalidateQueries({ queryKey: ['entity', objectDef.entity] })
        for (const e of result.affectedEntities ?? []) queryClient.invalidateQueries({ queryKey: ['entity', e] })
        break
      }
      case 'reload':
        queryClient.invalidateQueries({ queryKey: ['entity', objectDef.entity] })
        break
      case 'closeObject': {
        const targetId = action.object ?? objectDef.id
        setObjectState(targetId, { mode: null, formData: null, selectedRow: null })
        if (action.reloadParent) {
          for (const conn of connections.filter(c => c.child === objectDef.id)) {
            queryClient.invalidateQueries({ queryKey: ['entity', conn.parent] })
          }
        }
        break
      }
      case 'showObject':
        if (action.object) {
          const mode = (action.objectAction ?? 'create') as 'create' | 'edit' | 'detail'
          setObjectState(action.object, { mode, selectedRow: null, formData: null })
        }
        break
    }
  }

  // ─── Handler de ações por linha (alinhado com TableObject) ───────────────────
  const handleRowAction = useCallback((action: ComponentAction, row: RowRecord) => {
    try {
      // Monta searchParams a partir dos params declarados na action
      const searchParams: Record<string, unknown> = {}
      for (const p of action.params ?? []) {
        const val = row[p.sourceKey ?? p.key]
        if (val !== undefined && val !== null) searchParams[p.key] = val
      }

      switch (action.action) {
        case 'edit':
        case 'showObject':
        case 'detail': {
          // Atualiza o próprio selectedRow (igual ao TableObject)
          setObjectState(objectDef.id, { selectedRow: row as Record<string, unknown> })

          const targetId = action.object ?? ''
          const rawMode = action.objectAction ?? (action.action === 'detail' ? 'detail' : 'edit')
          const targetMode = (rawMode === 'edit' || rawMode === 'detail' || rawMode === 'create' || rawMode === 'list')
            ? rawMode as 'edit' | 'detail' | 'create' | 'list'
            : 'edit'

          // Verifica se o objeto alvo existe na view atual (igual ao TableObject)
          const existsInView = !!targetId && definition.objects.some((o) => o.id === targetId)

          if (existsInView) {
            setObjectState(targetId, {
              mode: targetMode,
              selectedRow: { ...row, ...searchParams } as Record<string, unknown>,
              queryParams: searchParams,
            })
          } else if (action.url) {
            navigate(`/home/${action.url}`, { state: { searchParams, mode: targetMode } })
          } else if (!targetId) {
            for (const conn of connections.filter(c => c.parent === objectDef.id)) {
              setObjectState(conn.child, { mode: targetMode, selectedRow: row as Record<string, unknown> })
            }
          }
          break
        }

        case 'delete': {
          const entity = action.params?.[0]?.entity ?? objectDef.entity
          const idKey  = action.params?.[0]?.sourceKey ?? action.params?.[0]?.key ?? 'id'
          const id     = row[idKey] as string | number | undefined
          if (!id) break
          const msg = action.confirmation ?? 'Confirmar exclusão?'
          if (!window.confirm(msg)) break
          entityApi.remove(entity, id)
            .then(() => {
              toast.success('Excluído com sucesso.')
              queryClient.invalidateQueries({ queryKey: ['entity', entity] })
            })
            .catch(() => toast.error('Erro ao excluir.'))
          break
        }

        case 'navigate': {
          const params: Record<string, unknown> = {}
          for (const p of action.params ?? []) {
            params[p.key] = row[p.sourceKey ?? p.key]
          }
          const screen = action.object ?? action.url ?? ''
          if (screen) navigate(`/home/${screen}`, { state: { searchParams: params } })
          break
        }

        case 'executeScript': {
          const scriptId = action.script ?? action.scriptId ?? ''
          if (!scriptId) break
          // Payload alinhado com CRUD: inputs = dados da linha, entity, action, etc.
          scriptApi.execute(scriptId, {
            data: [],
            inputs: { ...row, ...searchParams },
            formData: { ...row, ...searchParams },
            objectId: objectDef.id,
            entity: objectDef.entity,
            action: 'edit',
            bulkSelectedData: [row],
            entities: {},
            screenParams,
            customParams: searchParams,
          })
            .then(r => {
              if (r.messageError) toast.error(r.messageError)
              else if (r.message) toast.success(r.message)
              if (r.reload) queryClient.invalidateQueries({ queryKey: ['entity', objectDef.entity] })
              for (const e of r.affectedEntities ?? []) queryClient.invalidateQueries({ queryKey: ['entity', e] })
            })
            .catch(() => toast.error('Erro ao executar ação.'))
          break
        }

        default:
          console.warn('[BulkEditTable] Ação não suportada:', action.action)
      }
    } catch (err) {
      console.error('[BulkEditTable] Erro em handleRowAction:', err)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [objectDef, definition, connections, setObjectState, navigate, queryClient, toast, JSON.stringify(ctx)])

  // ─── Colunas ───────────────────────────────────────────────────────────────
  const allCols = (objectDef.components ?? []).filter(c => c.idObject === objectDef.id)
  const generalActions = allCols.filter(c => c.type === 'generalActions')
  // 'actions' é componente normal — aparece no corpo do card na posição do grid
  const cols = allCols.filter(c => c.type !== 'generalActions')

  // Modo panel: usa panelColClass (ex: "col-md-6") para cards em grid
  const isPanelMode = !!objectDef.panelColClass
  const selectable = objectDef.selectable !== false
  const showDeleteButtons = objectDef.deleteShow !== false
  const hasChanges = selectedRows.size > 0 || deletedRows.size > 0 || newRows.length > 0

  const allRows: Array<{ row: RowRecord; idx: number; isNew: boolean; newOffset?: number }> = [
    ...serverRows.map((row, idx) => ({ row: { ...row, ...(editedData[idx] ?? {}) }, idx, isNew: false })),
    ...newRows.map((row, newOffset) => {
      const idx = serverRows.length + newOffset
      return { row: { ...row, ...(editedData[idx] ?? {}) }, idx, isNew: true, newOffset }
    }),
  ]

  if (isLoading) return (
    <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
      <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent mr-2" />
      Carregando...
    </div>
  )

  return (
    <div style={objectDef.style as React.CSSProperties}>
      {/* Header */}
      <div className="mb-2 flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          {objectDef.title && <h3 className="text-sm font-semibold text-foreground">{objectDef.title}</h3>}
          {selectable && (
            <span className="text-xs text-muted-foreground">
              {selectedRows.size} de {allRows.filter(r => !deletedRows.has(r.idx)).length} selecionados
            </span>
          )}
          {deletedRows.size > 0 && (
            <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-xs text-destructive">
              {deletedRows.size} para excluir
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* generalActions */}
          {generalActions.flatMap(ga => ga.actions ?? []).map((action, i) => (
            <button key={i} type="button"
              className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
              style={action.style as React.CSSProperties}
              onClick={() => {
                if ((action.action === 'showObject' || action.action === 'create') && action.object) {
                  const mode = (action.objectAction ?? 'create') as 'create' | 'edit' | 'detail'
                  setObjectState(action.object, { mode, selectedRow: null, formData: null })
                }
              }}>
              {action.icon && <i className={action.icon} />}
              {action.title ?? action.name}
            </button>
          ))}
          {/* Add row */}
          {addRowCfg && (
            <button type="button" onClick={handleAddRow}
              className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted transition-colors">
              {addRowCfg.icon && <i className={addRowCfg.icon} />}
              {addRowCfg.label ?? 'Adicionar'}
            </button>
          )}
          {/* Submit */}
          {(objectDef.submitActions?.length ?? 0) > 0 && (
            <button type="button" onClick={handleSubmit} disabled={isSaving || !hasChanges}
              className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors">
              {isSaving ? <><div className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" /> Processando...</> : objectDef.submitLabel ?? 'Salvar'}
            </button>
          )}
        </div>
      </div>

      {/* ── PANEL MODE ──────────────────────────────────────────────────────── */}
      {isPanelMode ? (
        <div className="grid grid-cols-12 gap-3">
          {allRows.map(({ row, idx, isNew, newOffset }) => {
            const isDeleted = deletedRows.has(idx)
            const isSelected = selectedRows.has(idx)
            return (
              <div key={idx} className={resolveColClass(objectDef.panelColClass ?? 'col-md-12')}>
                <div
                  className={[
                    'rounded-lg border transition-colors',
                    isDeleted ? 'border-destructive opacity-60' : isSelected ? 'border-primary' : 'border-border',
                  ].join(' ')}
                  style={objectDef.panelCardStyle as React.CSSProperties}
                >
                  {/* Card header — só renderiza se houver algo para mostrar */}
                  {(selectable || objectDef.panelShowLabel !== false || showDeleteButtons) && (
                    <div className="flex items-center gap-2 border-b border-border px-3 py-1.5 bg-muted/40">
                      {selectable && (
                        <input type={multiSelect ? 'checkbox' : 'radio'} disabled={isDeleted}
                          checked={isSelected} onChange={() => toggleRow(idx)}
                          className="h-3.5 w-3.5 cursor-pointer" />
                      )}
                      {/* panelShowLabel: false oculta apenas o "Registro X", não o header inteiro */}
                      {objectDef.panelShowLabel !== false && (
                        <span className="flex-1 text-xs text-muted-foreground">
                          {isNew ? 'Nova linha' : `Registro ${idx + 1}`}
                        </span>
                      )}
                      {!objectDef.panelShowLabel && <span className="flex-1" />}
                      {showDeleteButtons && (
                        isDeleted
                          ? <button type="button" onClick={() => restoreRow(idx)} className="text-xs text-muted-foreground hover:text-foreground"><i className="bi bi-arrow-counterclockwise" /></button>
                          : <button type="button" onClick={() => confirmDelete(idx, isNew, newOffset)} className="text-xs text-destructive hover:text-destructive/80"><i className="bi bi-trash" /></button>
                      )}
                    </div>
                  )}
                  {/* Card body — labels dos campos sempre visíveis */}
                  <div className="grid grid-cols-12 gap-2 p-2"
                    style={objectDef.panelBodyStyle as React.CSSProperties}>
                    {cols.map((col, ci) => {
                      const field = col.nameForm ?? col.name
                      const val = editedData[idx]?.[field] ?? row[field]
                      return (
                        <div key={ci}
                          className={resolveColClass(col.class ?? col.className ?? 'col-md-12')}
                          style={col.style as React.CSSProperties}>
                          {col.type === 'actions' ? (
                            // Botões de ação por linha — mesmo padrão do table mode
                            <div className="flex flex-wrap gap-1" style={col.valueStyle as React.CSSProperties}>
                              {(col.actions ?? []).map((act, ai) => (
                                <button
                                  key={ai}
                                  type="button"
                                  title={act.tooltip ?? act.title ?? act.name ?? act.action}
                                  onClick={(e) => { e.stopPropagation(); handleRowAction(act, row) }}
                                  disabled={isDeleted}
                                  className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs transition-colors cursor-pointer text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
                                  style={act.style as React.CSSProperties}
                                >
                                  {act.icon && <i className={act.icon.startsWith('bi') ? act.icon : `bi bi-${act.icon}`} />}
                                  {act.title ?? act.name}
                                </button>
                              ))}
                            </div>
                          ) : (
                            <>
                              {col.title && (
                                <label className="text-xs text-muted-foreground mb-0.5 block"
                                  style={(col.titleStyle ?? col.labelStyle) as React.CSSProperties}>
                                  {col.title ?? col.name}
                                </label>
                              )}
                              <div style={col.valueStyle as React.CSSProperties}>
                                <EditableCell col={col} initialValue={val} rowIndex={idx}
                                  fieldName={field} disabled={isDeleted || !isSelected}
                                  onCommit={handleCommit} />
                              </div>
                            </>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            )
          })}
          {allRows.length === 0 && (
            <div className="col-span-12 py-8 text-center text-sm text-muted-foreground">
              Nenhum registro encontrado.
            </div>
          )}
        </div>
      ) : (
        /* ── TABLE MODE ───────────────────────────────────────────────────── */
        <div className="overflow-auto rounded-md border border-border">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-muted/95 backdrop-blur">
              <tr>
                {selectable && (
                  <th className="px-3 py-2 text-center w-10">
                    {multiSelect && (
                      <input type="checkbox" className="h-3.5 w-3.5 cursor-pointer"
                        checked={selectedRows.size === serverRows.filter((_, i) => !deletedRows.has(i)).length && serverRows.length > 0}
                        onChange={toggleAll} />
                    )}
                  </th>
                )}
                {cols.map((col, i) => (
                  <th key={i}
                    className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground whitespace-nowrap"
                    style={(col.titleStyle ?? col.labelStyle) as React.CSSProperties}>
                    {col.title ?? col.label ?? col.name}
                    {col.required && <span className="ml-0.5 text-destructive">*</span>}
                  </th>
                ))}
                {showDeleteButtons && <th className="w-10" />}
              </tr>
            </thead>
            <tbody>
              {allRows.length === 0 ? (
                <tr><td colSpan={cols.length + (selectable ? 1 : 0) + (showDeleteButtons ? 1 : 0)}
                  className="px-3 py-8 text-center text-sm text-muted-foreground">
                  Nenhum registro encontrado.
                </td></tr>
              ) : allRows.map(({ row, idx, isNew, newOffset }) => {
                const isDeleted = deletedRows.has(idx)
                const isSelected = selectedRows.has(idx)
                return (
                  <tr key={idx}
                    className={[
                      'border-t border-border transition-colors',
                      isDeleted ? 'bg-destructive/5 opacity-60 line-through' : isNew ? 'bg-amber-50' : isSelected ? 'bg-primary/5' : 'hover:bg-muted/20',
                    ].join(' ')}>
                    {selectable && (
                      <td className="px-3 py-1 text-center">
                        <input type={multiSelect ? 'checkbox' : 'radio'} disabled={isDeleted}
                          checked={isSelected} onChange={() => toggleRow(idx)}
                          className="h-3.5 w-3.5 cursor-pointer" />
                      </td>
                    )}
                    {cols.map((col, ci) => {
                      const field = col.nameForm ?? col.name
                      const val = editedData[idx]?.[field] ?? row[field]
                      return (
                        <td key={ci} className="px-2 py-1"
                          style={col.style as React.CSSProperties}>
                          {col.type === 'actions' ? (
                            <div className="flex items-center gap-1" style={col.valueStyle as React.CSSProperties}>
                              {(col.actions ?? []).map((act, ai) => (
                                <button key={ai} type="button"
                                  title={act.tooltip ?? act.title ?? act.name ?? act.action}
                                  onClick={() => handleRowAction(act, row)}
                                  disabled={isDeleted}
                                  className="inline-flex items-center gap-1 rounded px-1.5 py-1 text-xs transition-colors cursor-pointer text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
                                  style={act.style as React.CSSProperties}>
                                  {act.icon && <i className={act.icon.startsWith('bi') ? act.icon : `bi bi-${act.icon}`} />}
                                  {act.title ?? act.name}
                                </button>
                              ))}
                            </div>
                          ) : (
                            <div style={col.valueStyle as React.CSSProperties}>
                              <EditableCell col={col} initialValue={val} rowIndex={idx}
                                fieldName={field} disabled={isDeleted || !isSelected}
                                onCommit={handleCommit} />
                            </div>
                          )}
                        </td>
                      )
                    })}
                    {showDeleteButtons && (
                      <td className="px-2 py-1 text-center">
                        {isDeleted
                          ? <button type="button" onClick={() => restoreRow(idx)} className="text-xs text-muted-foreground hover:text-foreground transition-colors" title="Restaurar"><i className="bi bi-arrow-counterclockwise" /></button>
                          : <button type="button" onClick={() => confirmDelete(idx, isNew, newOffset)} className="text-xs text-destructive hover:text-destructive/80 transition-colors" title="Excluir"><i className="bi bi-trash" /></button>
                        }
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal de confirmação de exclusão */}
      {confirmDeleteIdx && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-80 rounded-lg bg-background p-4 shadow-xl">
            <p className="text-sm font-medium text-foreground mb-4">
              {confirmDeleteIdx.isNew ? 'Remover a linha adicionada?' : 'Confirmar exclusão do registro?'}
            </p>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setConfirmDeleteIdx(null)}
                className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-muted transition-colors">
                Cancelar
              </button>
              <button type="button" onClick={doDelete}
                className="rounded-md bg-destructive px-3 py-1.5 text-xs text-destructive-foreground hover:bg-destructive/90 transition-colors">
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
