import { useState, useMemo, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { AppShell } from '@/components/layout/AppShell'
import { useToast } from '@/components/ui/Toast'
import { apiClient } from '@/api/client'
import { entityApi } from '@/api/entity.api'
import type { EntitySchemaResponse } from '@/api/entity.api'

// ─── Types ────────────────────────────────────────────────────────────────────

interface EntityListItem {
  entity: string
  description?: string
}

interface ColumnDef {
  name: string
  type: string
  description?: string
  required?: boolean
  autoIncrement?: boolean
  primary?: boolean
  length?: number
  decimal?: number
  defaultValue?: string | null
}

interface FilterRow {
  id: number
  field: string
  value: string
}

type FormData = Record<string, string | number | null>

// ─── Helpers ──────────────────────────────────────────────────────────────────

const AUDIT_COLS = new Set(['created_at', 'updated_at', 'created_by', 'updated_by'])

function isAudit(col: ColumnDef) {
  return AUDIT_COLS.has(col.name)
}

function formCols(cols: ColumnDef[], mode: 'create' | 'edit') {
  return cols.filter((c) => {
    if (isAudit(c)) return false
    if (mode === 'create' && c.autoIncrement && c.primary) return false
    return true
  })
}

function inputType(col: ColumnDef): string {
  if (col.type === 'DATE') return 'date'
  if (col.type === 'DATETIME') return 'datetime-local'
  if (col.type === 'NUMBER') return 'number'
  return 'text'
}

function formatCell(value: unknown): string {
  if (value === null || value === undefined) return '—'
  return String(value)
}

function coerceValue(col: ColumnDef, raw: string): string | number | null {
  if (raw === '' || raw === null) return null
  if (col.type === 'NUMBER') {
    const n = col.decimal ? parseFloat(raw) : parseInt(raw, 10)
    return isNaN(n) ? null : n
  }
  return raw
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function FilterBuilder({
  cols,
  filters,
  onAdd,
  onRemove,
  onChange,
  onSearch,
  loading,
}: {
  cols: ColumnDef[]
  filters: FilterRow[]
  onAdd: () => void
  onRemove: (id: number) => void
  onChange: (id: number, field: 'field' | 'value', val: string) => void
  onSearch: () => void
  loading: boolean
}) {
  const usableCols = cols.filter((c) => !isAudit(c))

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-muted/30 p-3">
      {filters.map((row) => (
        <div key={row.id} className="flex items-center gap-2">
          <select
            className="h-8 rounded-md border border-border bg-background px-2 text-xs"
            value={row.field}
            onChange={(e) => onChange(row.id, 'field', e.target.value)}
          >
            <option value="">Campo...</option>
            {usableCols.map((c) => (
              <option key={c.name} value={c.name}>
                {c.name}
              </option>
            ))}
          </select>
          <input
            className="h-8 flex-1 rounded-md border border-border bg-background px-2 text-xs"
            placeholder="Valor..."
            value={row.value}
            onChange={(e) => onChange(row.id, 'value', e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && onSearch()}
          />
          {filters.length > 1 && (
            <button
              className="h-8 w-8 rounded-md text-muted-foreground hover:text-destructive"
              onClick={() => onRemove(row.id)}
              title="Remover filtro"
            >
              <i className="bi bi-x" />
            </button>
          )}
        </div>
      ))}
      <div className="flex items-center gap-2">
        <button
          className="flex h-8 items-center gap-1 rounded-md border border-border px-3 text-xs text-muted-foreground hover:bg-muted"
          onClick={onAdd}
        >
          <i className="bi bi-plus" /> Filtro
        </button>
        <button
          className="flex h-8 items-center gap-1 rounded-md bg-primary px-4 text-xs text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          onClick={onSearch}
          disabled={loading}
        >
          {loading ? <i className="bi bi-hourglass-split animate-spin" /> : <i className="bi bi-search" />}
          Pesquisar
        </button>
      </div>
    </div>
  )
}

function DynamicForm({
  cols,
  data,
  onChange,
}: {
  cols: ColumnDef[]
  data: FormData
  onChange: (field: string, val: string | number | null) => void
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {cols.map((col) => (
        <div key={col.name} className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground">
            {col.name}
            {col.required && <span className="ml-1 text-destructive">*</span>}
          </label>
          <input
            type={inputType(col)}
            step={col.type === 'NUMBER' && col.decimal ? Math.pow(10, -(col.decimal)) : undefined}
            className="h-8 rounded-md border border-border bg-background px-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            value={data[col.name] !== null && data[col.name] !== undefined ? String(data[col.name]) : ''}
            placeholder={col.defaultValue ?? ''}
            onChange={(e) => onChange(col.name, coerceValue(col, e.target.value))}
          />
        </div>
      ))}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function TabelasPage() {
  const toast   = useToast()
  const qClient = useQueryClient()

  // ── Estado painel esquerdo ─────────────────────────────────────────────────
  const [search,          setSearch]          = useState('')
  const [selectedEntity,  setSelectedEntity]  = useState<string | null>(null)

  // ── Estado painel direito ──────────────────────────────────────────────────
  const [filters,   setFilters]   = useState<FilterRow[]>([{ id: 1, field: '', value: '' }])
  const [nextId,    setNextId]    = useState(2)
  const [queryParams, setQueryParams] = useState<Record<string, string>>({})

  // ── Modal ──────────────────────────────────────────────────────────────────
  const [modalMode,   setModalMode]   = useState<'create' | 'edit' | null>(null)
  const [formData,    setFormData]    = useState<FormData>({})
  const [editingPkVal, setEditingPkVal] = useState<string | number | null>(null)

  // ── Listagem de entidades ──────────────────────────────────────────────────
  const entitiesQuery = useQuery<EntityListItem[]>({
    queryKey: ['entities-list'],
    queryFn: () =>
      apiClient.get<EntityListItem[] | Record<string, unknown>>('/entities').then((r) => {
        const d = r.data
        if (Array.isArray(d)) return d as EntityListItem[]
        // Fallback: objeto chave→descrição
        return Object.entries(d as Record<string, string>).map(([entity, description]) => ({
          entity,
          description: typeof description === 'string' ? description : entity,
        }))
      }),
    staleTime: 60_000,
  })

  const filteredEntities = useMemo(() => {
    const list = entitiesQuery.data ?? []
    if (!search.trim()) return list
    const q = search.toLowerCase()
    return list.filter(
      (e) =>
        e.entity.toLowerCase().includes(q) ||
        (e.description ?? '').toLowerCase().includes(q),
    )
  }, [entitiesQuery.data, search])

  // ── Schema da entidade selecionada ─────────────────────────────────────────
  const schemaQuery = useQuery<EntitySchemaResponse>({
    queryKey: ['entity-schema', selectedEntity],
    queryFn:  () => entityApi.getSchema(selectedEntity!),
    enabled:  !!selectedEntity,
    staleTime: 120_000,
  })

  const schema = schemaQuery.data
  const cols: ColumnDef[] = (schema?.config?.columns ?? []) as ColumnDef[]
  const primaryKey = schema?.config?.primary ?? 'id'

  // ── Dados da tabela ────────────────────────────────────────────────────────
  const dataQuery = useQuery({
    queryKey: ['tabelas-data', selectedEntity, queryParams],
    queryFn:  () => entityApi.getList(selectedEntity!, queryParams),
    enabled:  !!selectedEntity && Object.keys(queryParams).length > 0 || false,
    staleTime: 0,
  })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows: Record<string, unknown>[] = (dataQuery.data as any)?.data ?? []
  const displayCols = cols.filter((c) => !isAudit(c)).slice(0, 12)

  // ── Filtros ────────────────────────────────────────────────────────────────
  const handleSearch = useCallback(() => {
    const params: Record<string, string> = {}
    for (const f of filters) {
      if (f.field && f.value) params[f.field] = f.value
    }
    // se nenhum filtro, busca sem params (até 100 registros)
    setQueryParams(Object.keys(params).length > 0 ? params : { pageSize: '100' })
  }, [filters])

  const addFilter = () => {
    setFilters((prev) => [...prev, { id: nextId, field: '', value: '' }])
    setNextId((n) => n + 1)
  }

  const removeFilter = (id: number) =>
    setFilters((prev) => prev.filter((f) => f.id !== id))

  const changeFilter = (id: number, key: 'field' | 'value', val: string) =>
    setFilters((prev) => prev.map((f) => (f.id === id ? { ...f, [key]: val } : f)))

  // ── Modal helpers ──────────────────────────────────────────────────────────
  const openCreate = () => {
    const init: FormData = {}
    for (const c of formCols(cols, 'create')) {
      init[c.name] = c.defaultValue ?? null
    }
    setFormData(init)
    setEditingPkVal(null)
    setModalMode('create')
  }

  const openEdit = (row: Record<string, unknown>) => {
    const init: FormData = {}
    for (const c of formCols(cols, 'edit')) {
      init[c.name] = row[c.name] !== undefined ? (row[c.name] as string | number | null) : null
    }
    setFormData(init)
    setEditingPkVal(row[primaryKey] as string | number)
    setModalMode('edit')
  }

  const closeModal = () => setModalMode(null)

  const handleFieldChange = (field: string, val: string | number | null) =>
    setFormData((prev) => ({ ...prev, [field]: val }))

  // ── Mutations ──────────────────────────────────────────────────────────────
  const saveMutation = useMutation({
    mutationFn: async () => {
      if (modalMode === 'create') {
        return entityApi.create(selectedEntity!, formData as Record<string, unknown>)
      }
      return entityApi.update(selectedEntity!, { ...formData, [primaryKey]: editingPkVal } as Record<string, unknown>)
    },
    onSuccess: async () => {
      await qClient.invalidateQueries({ queryKey: ['tabelas-data', selectedEntity] })
      toast.success(modalMode === 'create' ? 'Registro criado.' : 'Registro atualizado.')
      closeModal()
    },
    onError: () => toast.error('Não foi possível salvar o registro.'),
  })

  // ── Seleção de entidade ────────────────────────────────────────────────────
  const selectEntity = (entity: string) => {
    setSelectedEntity(entity)
    setFilters([{ id: 1, field: '', value: '' }])
    setQueryParams({})
    setNextId(2)
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <AppShell title="Tabelas" subtitle="Cadastro genérico de tabelas de domínio.">
      <div className="min-h-full w-full bg-background p-3 sm:p-4">
        <div className="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)]">

          {/* ── Painel esquerdo: lista de entidades ── */}
          <aside className="rounded-lg border border-border bg-white shadow-sm">
            <div className="border-b border-slate-100 px-4 py-3">
              <p className="text-sm font-semibold text-slate-900">Tabelas</p>
              <p className="text-xs text-slate-500">Selecione uma tabela para gerenciar.</p>
            </div>

            {/* Busca */}
            <div className="border-b border-slate-100 px-3 py-2">
              <div className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-2">
                <i className="bi bi-search text-xs text-muted-foreground" />
                <input
                  className="h-7 flex-1 bg-transparent text-xs focus:outline-none"
                  placeholder="Pesquisar tabela..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>

            {/* Lista */}
            <div className="max-h-[calc(100vh-220px)] overflow-y-auto">
              {entitiesQuery.isLoading && (
                <div className="flex justify-center py-8">
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                </div>
              )}
              {entitiesQuery.isError && (
                <p className="px-4 py-6 text-center text-xs text-destructive">
                  Erro ao carregar entidades.
                </p>
              )}
              {filteredEntities.map((e) => (
                <button
                  key={e.entity}
                  onClick={() => selectEntity(e.entity)}
                  className={[
                    'flex w-full flex-col px-4 py-2 text-left text-xs transition-colors hover:bg-muted/50',
                    selectedEntity === e.entity
                      ? 'border-l-2 border-primary bg-primary/5 font-semibold text-primary'
                      : 'border-l-2 border-transparent text-slate-700',
                  ].join(' ')}
                >
                  <span className="font-mono">{e.entity}</span>
                  {e.description && e.description !== e.entity && (
                    <span className="text-muted-foreground">{e.description}</span>
                  )}
                </button>
              ))}
              {!entitiesQuery.isLoading && filteredEntities.length === 0 && (
                <p className="px-4 py-6 text-center text-xs text-muted-foreground">
                  Nenhuma tabela encontrada.
                </p>
              )}
            </div>
          </aside>

          {/* ── Painel direito ── */}
          <main className="flex flex-col gap-4">
            {!selectedEntity ? (
              <div className="flex h-60 items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground">
                Selecione uma tabela para começar.
              </div>
            ) : (
              <>
                {/* Header */}
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="font-mono text-base font-semibold">{selectedEntity}</h2>
                    {schemaQuery.isLoading && (
                      <span className="text-xs text-muted-foreground">Carregando schema...</span>
                    )}
                  </div>
                  <button
                    onClick={openCreate}
                    disabled={cols.length === 0}
                    className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                  >
                    <i className="bi bi-plus-circle" /> Novo
                  </button>
                </div>

                {/* Filtros */}
                {cols.length > 0 && (
                  <FilterBuilder
                    cols={cols}
                    filters={filters}
                    onAdd={addFilter}
                    onRemove={removeFilter}
                    onChange={changeFilter}
                    onSearch={handleSearch}
                    loading={dataQuery.isFetching}
                  />
                )}

                {/* Tabela de dados */}
                {dataQuery.isFetching ? (
                  <div className="flex justify-center py-12">
                    <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                  </div>
                ) : rows.length > 0 ? (
                  <div className="overflow-auto rounded-lg border border-border">
                    <table className="w-full text-xs">
                      <thead className="bg-muted/50">
                        <tr>
                          {displayCols.map((c) => (
                            <th
                              key={c.name}
                              className="whitespace-nowrap border-b border-border px-3 py-2 text-left font-semibold text-muted-foreground"
                            >
                              {c.name}
                            </th>
                          ))}
                          <th className="border-b border-border px-3 py-2 text-right font-semibold text-muted-foreground">
                            Ações
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((row, i) => (
                          <tr
                            key={i}
                            className="border-b border-border last:border-0 hover:bg-muted/30"
                          >
                            {displayCols.map((c) => (
                              <td
                                key={c.name}
                                className="max-w-[200px] truncate whitespace-nowrap px-3 py-1.5"
                                title={formatCell(row[c.name])}
                              >
                                {formatCell(row[c.name])}
                              </td>
                            ))}
                            <td className="px-3 py-1.5 text-right">
                              <button
                                onClick={() => openEdit(row)}
                                className="rounded px-2 py-0.5 text-xs text-primary hover:bg-primary/10"
                              >
                                <i className="bi bi-pencil" /> Editar
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : Object.keys(queryParams).length > 0 ? (
                  <div className="flex h-40 items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground">
                    Nenhum registro encontrado.
                  </div>
                ) : (
                  <div className="flex h-40 items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground">
                    Use os filtros acima e clique em Pesquisar.
                  </div>
                )}
              </>
            )}
          </main>
        </div>
      </div>

      {/* ── Modal Novo / Editar ── */}
      {modalMode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-xl bg-background shadow-xl">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <h3 className="text-sm font-semibold">
                {modalMode === 'create' ? 'Novo Registro' : `Editar — ${selectedEntity}`}
              </h3>
              <button
                onClick={closeModal}
                className="rounded p-1 text-muted-foreground hover:text-foreground"
              >
                <i className="bi bi-x-lg" />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-5 py-4">
              <DynamicForm
                cols={formCols(cols, modalMode)}
                data={formData}
                onChange={handleFieldChange}
              />
            </div>

            {/* Footer */}
            <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
              <button
                onClick={closeModal}
                className="rounded-md border border-border px-4 py-1.5 text-sm hover:bg-muted"
              >
                Cancelar
              </button>
              <button
                onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending}
                className="rounded-md bg-primary px-4 py-1.5 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {saveMutation.isPending ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  )
}
