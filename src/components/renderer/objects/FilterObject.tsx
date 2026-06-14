import { useEffect, useLayoutEffect, useState, useRef } from 'react'
import { useForm } from 'react-hook-form'
import { useStore } from 'zustand'
import { useNavigate } from 'react-router-dom'
import { useViewContext } from '../ViewContext'
import { FieldRenderer } from '../fields/FieldRenderer'
import { resolveColClass } from '@/utils/colClass'
import type { ObjectDefinition, ComponentType } from '@/types/view.types'
import { interpolate } from '@/utils/interpolate'

interface Props {
  objectDef: ObjectDefinition
}

// ─── Operadores de filtro ─────────────────────────────────────────────────────

type FilterOperator = 'containing' | 'equal' | 'startsWith' | 'endsWith'

const OPERATORS: { key: FilterOperator; label: string; hint: string; wrap: (v: string) => string }[] = [
  { key: 'containing', label: 'Contendo',     hint: '%a%', wrap: (v) => `%${v}%` },
  { key: 'equal',      label: 'Igual',         hint: '= a', wrap: (v) => v         },
  { key: 'startsWith', label: 'Inicia com',    hint: 'a%',  wrap: (v) => `${v}%`  },
  { key: 'endsWith',   label: 'Termina com',   hint: '%a',  wrap: (v) => `%${v}`  },
]

// Tipos de campo onde o seletor de operador faz sentido
const TEXT_FIELD_TYPES = new Set<ComponentType>(['text', 'mask'])

// ─── FilterObject ─────────────────────────────────────────────────────────────

export function FilterObject({ objectDef }: Props) {
  const { viewStore, connections, definition, initialParams } = useViewContext()
  const setObjectState = useStore(viewStore, (s) => s.setObjectState)
  const navigate = useNavigate()

  const ctx = (initialParams ?? {}) as Record<string, unknown>

  const form = useForm<Record<string, unknown>>({
    defaultValues: buildDefaultValues(objectDef, ctx),
  })

  // Operador por campo — default: 'containing'
  const [operators, setOperators] = useState<Record<string, FilterOperator>>({})

  // Painel colapsável
  const [collapsed, setCollapsed] = useState(objectDef.collapsedByDefault ?? false)

  function getOperator(fieldName: string): FilterOperator {
    return operators[fieldName] ?? 'containing'
  }

  function setFieldOperator(fieldName: string, op: FilterOperator) {
    setOperators((prev) => ({ ...prev, [fieldName]: op }))
  }

  // initialSubmit: dispara a busca ao montar.
  // useLayoutEffect roda ANTES dos useEffect dos filhos (onde o TanStack Query
  // agenda a primeira query). Assim os queryParams do filtro já estão no store
  // quando a tabela faz sua primeira requisição — evitando o "flash" de dados
  // sem filtro seguido de uma segunda carga com filtro.
  useLayoutEffect(() => {
    if (objectDef.initialSubmit) {
      applyFilter(form.getValues())
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function applyFilter(values: Record<string, unknown>) {
    const cleanParams: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(values)) {
      if (v === '' || v === null || v === undefined) continue
      // Campos __label são apenas display (label do autocomplete) — nunca vão como filtro
      if (k.endsWith('__label')) continue

      if (typeof v === 'string') {
        // Range de datas: valor "inicio,fim" — descarta se ambos os lados estão vazios
        const comp = objectDef.components?.find((c) => (c.nameForm ?? c.name) === k)
        if (comp?.range && comp.type === 'date') {
          const [start, end] = v.split(',')
          if (!start && !end) continue  // "," ou "" → ignora
          cleanParams[k] = v
          continue
        }
        if (comp && TEXT_FIELD_TYPES.has(comp.type)) {
          const op = getOperator(k)
          const opDef = OPERATORS.find((o) => o.key === op) ?? OPERATORS[0]
          cleanParams[k] = opDef.wrap(v)
        } else {
          cleanParams[k] = v
        }
      } else {
        cleanParams[k] = v
      }
    }

    // 1. Próprio estado do filtro
    setObjectState(objectDef.id, { queryParams: cleanParams })

    // 2. Connections declaradas (parent → child)
    for (const conn of connections.filter((c) => c.parent === objectDef.id)) {
      setObjectState(conn.child, { queryParams: cleanParams })
    }

    // 3. Tabelas que declaram filterObjectId apontando para este filtro
    for (const obj of definition.objects.filter((o) => o.filterObjectId === objectDef.id)) {
      setObjectState(obj.id, { queryParams: cleanParams })
    }

    // 4. Objetos da mesma entidade (mecanismo padrão do sistema)
    if (objectDef.entity) {
      for (const obj of definition.objects.filter(
        (o) => o.entity === objectDef.entity && o.id !== objectDef.id,
      )) {
        setObjectState(obj.id, { queryParams: cleanParams })
      }
    }
  }

  function handleClear() {
    const defaults = buildDefaultValues(objectDef, ctx)
    form.reset(defaults)
    setOperators({})
    applyFilter(defaults)
  }

  function handleCreate(e: React.MouseEvent) {
    e.stopPropagation() // não abre/fecha o collapse ao clicar em Novo
    if (objectDef.createUrl) {
      // Interpola {{campo}} usando os valores do formulário + initialParams (querystring)
      const values = { ...ctx, ...form.getValues() } as Record<string, unknown>
      const resolvedUrl = interpolate(objectDef.createUrl, values)
      navigate(`/home/${resolvedUrl}`)
    }
    // createObject (modal) → implementar quando houver suporte a modais
  }

  const components = (objectDef.components ?? []).filter((c) => c.type !== 'generalActions')

  // ── Ícones dos botões ──────────────────────────────────────────────────────
  const filterIcon = objectDef.filterButtonIcon
  const filterIconClass = filterIcon === false ? null : (typeof filterIcon === 'string' ? filterIcon : 'bi bi-search')

  const createIcon = objectDef.createButtonIcon
  const createIconClass = createIcon === false ? null : (typeof createIcon === 'string' ? createIcon : 'bi bi-plus-circle')

  const hasCreateButton = !!(objectDef.createUrl || objectDef.createObject)
  const showClearButton = objectDef.clearFilter !== false // default: mostra

  // Variante do botão Novo
  const createVariant = objectDef.createButtonVariant ?? 'primary'
  const createBtnClass = variantClass(createVariant)

  return (
    <div style={objectDef.style as React.CSSProperties}>
      {/* ── Cabeçalho (título + botão Novo quando collapsible) ─────────────── */}
      {objectDef.title && (
        <div
          className={[
            'mb-3 flex items-center justify-between',
            objectDef.collapsible ? 'cursor-pointer select-none' : '',
          ].join(' ')}
          onClick={objectDef.collapsible ? () => setCollapsed((c) => !c) : undefined}
        >
          <div className="flex items-center gap-2">
            {objectDef.collapsible && (
              <i
                className={[
                  'bi text-xs text-muted-foreground transition-transform',
                  objectDef.collapsibleIcon ?? (collapsed ? 'bi-chevron-right' : 'bi-chevron-down'),
                ].join(' ')}
              />
            )}
            <h3 className="text-sm font-semibold text-foreground">{interpolate(objectDef.title, initialParams)}</h3>
          </div>

          {/* Botão Novo no cabeçalho (quando collapsible) */}
          {hasCreateButton && objectDef.collapsible && (
            <button
              type="button"
              onClick={handleCreate}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition-colors ${createBtnClass}`}
            >
              {createIconClass && <i className={`${createIconClass} text-xs`} />}
              {objectDef.createButtonName ?? 'Novo'}
            </button>
          )}
        </div>
      )}

      {/* ── Corpo colapsável ──────────────────────────────────────────────── */}
      {!collapsed && (
        <form onSubmit={(e) => { e.preventDefault(); applyFilter(form.getValues()) }} noValidate>
          <div className="grid grid-cols-12 gap-3">
            {components.map((comp, i) => {
              const fieldName = comp.nameForm ?? comp.name
              const showOperator = TEXT_FIELD_TYPES.has(comp.type)

              return (
                <div key={`${comp.idComponent}-${i}`} className={resolveColClass(comp.class)}>
                  {showOperator ? (
                    <div className="flex items-end gap-1">
                      <div className="min-w-0 flex-1">
                        <FieldRenderer
                          component={comp}
                          register={form.register}
                          control={form.control}
                          watch={form.watch}
                          setValue={form.setValue}
                          getValues={form.getValues}
                          disabled={false}
                          mode="create"
                        />
                      </div>
                      <OperatorButton
                        operator={getOperator(fieldName)}
                        onSelect={(op) => setFieldOperator(fieldName, op)}
                      />
                    </div>
                  ) : (
                    <FieldRenderer
                      component={comp}
                      register={form.register}
                      control={form.control}
                      watch={form.watch}
                      setValue={form.setValue}
                      getValues={form.getValues}
                      disabled={false}
                      mode="create"
                    />
                  )}
                </div>
              )
            })}
          </div>

          {!objectDef.hideButtons && (
            <div className="mt-3 flex flex-wrap gap-2">
              {/* Botão Filtrar */}
              <button
                type="button"
                onClick={() => applyFilter(form.getValues())}
                className="flex items-center gap-1.5 rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                {filterIconClass && <i className={`${filterIconClass} text-xs`} />}
                {objectDef.filterButtonName ?? 'Pesquisar'}
              </button>

              {/* Botão Limpar */}
              {showClearButton && (
                <button
                  type="button"
                  onClick={handleClear}
                  className="rounded-md border border-border px-4 py-1.5 text-sm text-muted-foreground hover:bg-accent transition-colors"
                >
                  Limpar
                </button>
              )}

              {/* Botão Novo (quando não é collapsible — aparece na barra de ações) */}
              {hasCreateButton && !objectDef.collapsible && (
                <button
                  type="button"
                  onClick={handleCreate}
                  className={`flex items-center gap-1.5 rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${createBtnClass}`}
                >
                  {createIconClass && <i className={`${createIconClass} text-xs`} />}
                  {objectDef.createButtonName ?? 'Novo'}
                </button>
              )}
            </div>
          )}
        </form>
      )}
    </div>
  )
}

// ─── OperatorButton ───────────────────────────────────────────────────────────

interface OperatorButtonProps {
  operator: FilterOperator
  onSelect: (op: FilterOperator) => void
}

function OperatorButton({ operator, onSelect }: OperatorButtonProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  const current = OPERATORS.find((o) => o.key === operator) ?? OPERATORS[0]
  const isDefault = operator === 'containing'

  return (
    <div className="relative shrink-0" ref={ref}>
      <button
        type="button"
        title={current.label}
        onClick={() => setOpen((o) => !o)}
        className={[
          'h-9 rounded-md border px-2 font-mono text-xs transition-colors',
          isDefault
            ? 'border-input bg-background text-muted-foreground hover:border-ring hover:text-foreground'
            : 'border-primary bg-primary/10 text-primary hover:bg-primary/20',
        ].join(' ')}
      >
        {current.hint}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 w-40 overflow-hidden rounded-md border border-border bg-background shadow-lg">
          {OPERATORS.map((op) => (
            <button
              key={op.key}
              type="button"
              onClick={() => { onSelect(op.key); setOpen(false) }}
              className={[
                'flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-muted',
                operator === op.key ? 'font-medium text-primary' : 'text-foreground',
              ].join(' ')}
            >
              <span className="w-7 shrink-0 font-mono text-xs text-muted-foreground">{op.hint}</span>
              <span>{op.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function variantClass(variant: string): string {
  switch (variant) {
    case 'primary':         return 'bg-primary text-primary-foreground hover:bg-primary/90'
    case 'outline-primary': return 'border border-primary text-primary hover:bg-primary/10'
    case 'secondary':       return 'bg-secondary text-secondary-foreground hover:bg-secondary/90'
    case 'success':         return 'bg-green-600 text-white hover:bg-green-700'
    case 'danger':          return 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
    case 'outline':         return 'border border-border text-foreground hover:bg-muted'
    default:                return 'bg-primary text-primary-foreground hover:bg-primary/90'
  }
}

function buildDefaultValues(
  objectDef: ObjectDefinition,
  ctx: Record<string, unknown> = {},
): Record<string, unknown> {
  const values: Record<string, unknown> = {}
  for (const comp of objectDef.components ?? []) {
    // GroupCheckbox / ChipSelect: cada opção tem seu próprio nameForm
    if (comp.type === 'groupcheckbox' || comp.type === 'chipselect') {
      const unchecked = comp.uncheckedValue ?? ''
      for (const opt of comp.options ?? []) {
        const key = opt.nameForm ?? opt.value
        if (key) values[key] = unchecked
      }
      continue
    }
    if (!comp.nameForm && !comp.name) continue
    const key = comp.nameForm ?? comp.name
    values[key] = resolveDynamic(comp.defaultValue, ctx)
  }
  return values
}

function resolveDynamic(value: unknown, ctx: Record<string, unknown> = {}): unknown {
  if (typeof value !== 'string') return value ?? ''
  // {{now,format}}
  const nowMatch = value.match(/^\{\{now,\s*(.+?)\}\}$/)
  if (nowMatch) return formatDate(new Date(), nowMatch[1].trim())
  // {{campo}} → resolve contra initialParams (queryString, etc.)
  if (value.includes('{{')) {
    return value.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
      const val = ctx[key]
      return val !== undefined && val !== null ? String(val) : ''
    })
  }
  return value
}

function formatDate(date: Date, fmt: string): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return fmt
    .replace('YYYY', String(date.getFullYear()))
    .replace('MM', pad(date.getMonth() + 1))
    .replace('DD', pad(date.getDate()))
}
