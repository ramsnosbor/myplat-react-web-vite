import { useState } from 'react'
import { useController } from 'react-hook-form'
import type { Control } from 'react-hook-form'
import type { ComponentDefinition } from '@/types/view.types'

interface NumberFieldProps {
  component: ComponentDefinition
  control: Control<Record<string, unknown>>
  disabled?: boolean
  inputClass: string
  error?: string
  fieldType: 'number' | 'decimal' | 'currency'
}

export function NumberField({ component: comp, control, disabled, inputClass, fieldType, error }: NumberFieldProps) {
  const fieldName = comp.nameForm ?? comp.name
  const label = comp.label ?? comp.name

  const { field, fieldState } = useController({
    name: fieldName,
    control,
    rules: { required: comp.required ? `${label} é obrigatório` : false },
  })

  const decimalPlaces = fieldType === 'number'
    ? 0
    : (comp.decimal ?? comp.decimalPlaces ?? comp.precision ?? 2)

  const symbol = fieldType === 'currency'
    ? (comp.symbol !== undefined ? comp.symbol : 'R$')
    : ''

  // Texto bruto enquanto o usuário edita — null = campo não está focado
  const [editText, setEditText] = useState<string | null>(null)
  const isEditing = editText !== null

  function toNumber(val: unknown): number | null {
    if (val === '' || val === null || val === undefined) return null
    const n = typeof val === 'number' ? val : parseFloat(String(val).replace(',', '.'))
    return isNaN(n) ? null : n
  }

  function format(val: number | null): string {
    if (val === null || val === undefined) return ''
    return new Intl.NumberFormat('pt-BR', {
      minimumFractionDigits: decimalPlaces,
      maximumFractionDigits: decimalPlaces,
    }).format(val)
  }

  function toEditString(val: unknown): string {
    const n = toNumber(val)
    if (n === null) return ''
    if (decimalPlaces === 0) return String(Math.round(n))
    return n.toFixed(decimalPlaces).replace('.', ',')
  }

  function parseInput(raw: string): number | null {
    if (!raw || raw.trim() === '' || raw === '-') return null
    // Remove pontos de milhar, troca vírgula por ponto
    const cleaned = raw.replace(/\./g, '').replace(',', '.')
    const n = parseFloat(cleaned)
    return isNaN(n) ? null : n
  }

  function handleFocus() {
    // Ao focar: mostra o valor editável sem formatação de milhar
    setEditText(toEditString(field.value))
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    // Guarda o texto bruto — não parse, não re-render do form
    setEditText(e.target.value)
  }

  function handleBlur() {
    const parsed = parseInput(editText ?? '')
    field.onChange(parsed !== null ? parsed : '')
    field.onBlur()
    setEditText(null) // sai do modo de edição
  }

  // Valor exibido: texto bruto durante edição, formatado quando fora de foco
  const displayValue = isEditing ? editText! : format(toNumber(field.value))

  const hasError = !!fieldState.error || !!error
  const errorMsg = fieldState.error?.message ?? error

  return (
    <div className="space-y-1">
      {label && (
        <label className="text-sm font-medium">
          {label}
          {comp.required && <span className="ml-0.5 text-destructive" aria-hidden>*</span>}
        </label>
      )}
      <div className="relative flex items-center">
        {symbol && (
          <span className="absolute left-3 select-none text-sm text-muted-foreground pointer-events-none">
            {symbol}
          </span>
        )}
        <input
          ref={field.ref}
          type="text"
          inputMode={decimalPlaces === 0 ? 'numeric' : 'decimal'}
          value={displayValue}
          onChange={handleChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          disabled={disabled}
          placeholder={comp.placeholder ?? ''}
          className={[inputClass, symbol ? 'pl-8' : '', 'text-right'].filter(Boolean).join(' ')}
        />
      </div>
      {hasError && <p className="text-xs text-destructive" role="alert">{errorMsg}</p>}
    </div>
  )
}
