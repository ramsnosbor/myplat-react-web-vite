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
 * Com `range: true`: renderiza dois campos (início e fim).
 * O campo fim é nomeado por `rangeParam` (ou nameForm + "_fim").
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
  if (comp.range) {
    const endFieldName = comp.rangeParam ?? `${fieldName}_fim`
    return (
      <RangeDateField
        fieldName={fieldName}
        endFieldName={endFieldName}
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

interface RangeDateFieldProps {
  fieldName: string
  endFieldName: string
  label: string
  inputType: string
  control: Control<Record<string, unknown>>
  disabled?: boolean
  inputClass: string
  required?: boolean
  error?: string
}

function RangeDateField({
  fieldName, endFieldName, label, inputType, control, disabled, inputClass, required, error,
}: RangeDateFieldProps) {
  const { field: startField } = useController({ name: fieldName, control })
  const { field: endField } = useController({ name: endFieldName, control })

  const startValue = startField.value !== undefined && startField.value !== null ? String(startField.value) : ''
  const endValue = endField.value !== undefined && endField.value !== null ? String(endField.value) : ''

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
          onChange={(e) => startField.onChange(e.target.value)}
          onBlur={startField.onBlur}
          ref={startField.ref}
          disabled={disabled}
          className={inputClass}
          placeholder="Início"
        />
        <span className="shrink-0 text-sm text-muted-foreground">até</span>
        <input
          type={inputType}
          value={endValue}
          onChange={(e) => endField.onChange(e.target.value)}
          onBlur={endField.onBlur}
          ref={endField.ref}
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
