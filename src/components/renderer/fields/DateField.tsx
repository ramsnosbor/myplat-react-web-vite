import { useController } from 'react-hook-form'
import type { Control, UseFormSetValue } from 'react-hook-form'
import type { ComponentDefinition } from '@/types/view.types'

interface DateFieldProps {
  component: ComponentDefinition
  control: Control<Record<string, unknown>>
  setValue: UseFormSetValue<Record<string, unknown>>
  disabled?: boolean
  inputClass: string
  error?: string
  mode?: 'create' | 'edit' | 'detail'
}

/**
 * Campo de data com suporte a variantes:
 * - (padrão)  → date picker
 * - datetime  → data + hora
 * - time      → apenas hora
 * - month     → mês/ano
 * - year      → apenas ano
 *
 * Com `range: true`: renderiza dois inputs (início e fim) num único campo.
 * O valor é armazenado como "início,fim" (ex: "2024-01-01,2024-12-31").
 * O sistema de filtro interpreta esse formato como BETWEEN.
 * Se apenas um dos lados estiver preenchido, envia "início," ou ",fim" (range aberto).
 * Se ambos estiverem vazios, o campo fica "" e é ignorado pelo filtro.
 */
export function DateField({ component: comp, control, setValue: _setValue, disabled, inputClass, error, mode: _mode }: DateFieldProps) {
  const fieldName = comp.nameForm ?? comp.name
  const label = comp.label ?? comp.name
  const variant = comp.variant as string | undefined

  const { field } = useController({
    name: fieldName,
    control,
    rules: { required: comp.required ? `${label} é obrigatório` : false },
  })

  const inputType = resolveInputType(variant)

  // ─── Range ──────────────────────────────────────────────────────────────────
  // Armazena tudo em UM único campo: "inicio,fim"
  // Exemplos: "2024-01-01,2024-12-31" | "2024-01-01," | ",2024-12-31" | ""
  if (comp.range) {
    return (
      <RangeDateField
        fieldName={fieldName}
        label={label}
        inputType={inputType}
        control={control}
        disabled={disabled}
        inputClass={inputClass}
        required={comp.required}
        error={error}
      />
    )
  }

  // ─── Year picker ────────────────────────────────────────────────────────────
  if (variant === 'year') {
    const currentYear = new Date().getFullYear()
    const years = Array.from({ length: 30 }, (_, i) => currentYear - 10 + i)
    const currentValue = field.value !== undefined && field.value !== null ? String(field.value) : ''
    return (
      <div className="space-y-1">
        {label && (
          <label className="text-sm font-medium">
            {label}
            {comp.required && <span className="ml-0.5 text-destructive" aria-hidden>*</span>}
          </label>
        )}
        <select
          value={currentValue}
          onChange={(e) => field.onChange(e.target.value)}
          onBlur={field.onBlur}
          ref={field.ref}
          disabled={disabled}
          className={inputClass}
        >
          <option value="">Selecione o ano...</option>
          {years.map((y) => (
            <option key={y} value={String(y)}>{y}</option>
          ))}
        </select>
        {error && <p className="text-xs text-destructive" role="alert">{error}</p>}
      </div>
    )
  }

  // ─── Campos simples (date, datetime, time, month) ────────────────────────────
  const rawValue = field.value !== undefined && field.value !== null ? String(field.value) : ''

  return (
    <div className="space-y-1">
      {label && (
        <label className="text-sm font-medium">
          {label}
          {comp.required && <span className="ml-0.5 text-destructive" aria-hidden>*</span>}
        </label>
      )}
      <input
        type={inputType}
        value={rawValue}
        onChange={(e) => field.onChange(e.target.value)}
        onBlur={field.onBlur}
        ref={field.ref}
        disabled={disabled}
        className={inputClass}
      />
      {error && <p className="text-xs text-destructive" role="alert">{error}</p>}
    </div>
  )
}

// ─── Sub-componente para range ────────────────────────────────────────────────
// Campo único no form com valor "inicio,fim".
// Dois inputs visuais que lêem/escrevem nesse campo ao mesmo tempo.

interface RangeDateFieldProps {
  fieldName: string
  label: string
  inputType: string
  control: Control<Record<string, unknown>>
  disabled?: boolean
  inputClass: string
  required?: boolean
  error?: string
}

function RangeDateField({
  fieldName, label, inputType, control, disabled, inputClass, required, error,
}: RangeDateFieldProps) {
  const { field } = useController({ name: fieldName, control })

  // Parseia "inicio,fim" — primeiro vírgula separa os dois lados
  const rawValue = field.value !== undefined && field.value !== null ? String(field.value) : ''
  const commaIdx = rawValue.indexOf(',')
  const startValue = commaIdx >= 0 ? rawValue.slice(0, commaIdx) : rawValue
  const endValue   = commaIdx >= 0 ? rawValue.slice(commaIdx + 1) : ''

  function handleStartChange(newStart: string) {
    // Ambos vazios → campo vazio (filtrado pelo applyFilter)
    if (!newStart && !endValue) { field.onChange(''); return }
    field.onChange(`${newStart},${endValue}`)
  }

  function handleEndChange(newEnd: string) {
    if (!startValue && !newEnd) { field.onChange(''); return }
    field.onChange(`${startValue},${newEnd}`)
  }

  return (
    <div className="space-y-1">
      {label && (
        <label className="text-sm font-medium">
          {label}
          {required && <span className="ml-0.5 text-destructive" aria-hidden>*</span>}
        </label>
      )}
      <div className="flex items-center gap-2">
        <input
          type={inputType}
          value={startValue}
          onChange={(e) => handleStartChange(e.target.value)}
          onBlur={field.onBlur}
          ref={field.ref}
          disabled={disabled}
          className={inputClass}
          placeholder="Início"
        />
        <span className="shrink-0 text-sm text-muted-foreground">até</span>
        <input
          type={inputType}
          value={endValue}
          onChange={(e) => handleEndChange(e.target.value)}
          onBlur={field.onBlur}
          disabled={disabled}
          className={inputClass}
          placeholder="Fim"
          min={startValue || undefined}
        />
      </div>
      {error && <p className="text-xs text-destructive" role="alert">{error}</p>}
    </div>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function resolveInputType(variant?: string): string {
  switch (variant) {
    case 'datetime': return 'datetime-local'
    case 'time':     return 'time'
    case 'month':    return 'month'
    case 'year':     return 'number' // handled separately above
    default:         return 'date'
  }
}
