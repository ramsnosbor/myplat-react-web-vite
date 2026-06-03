import { useController } from 'react-hook-form'
import { useQuery } from '@tanstack/react-query'
import type { Control, UseFormSetValue } from 'react-hook-form'
import { entityApi } from '@/api/entity.api'
import type { ComponentDefinition } from '@/types/view.types'
import type { EntityRecord } from '@/types/entity.types'

interface SelectFieldProps {
  component: ComponentDefinition
  control: Control<Record<string, unknown>>
  setValue: UseFormSetValue<Record<string, unknown>>
  disabled?: boolean
  inputClass: string
  error?: string
  /** formValues calculado no CrudObject — inclui computedFrom já resolvido */
  formValues?: Record<string, unknown>
}

export function SelectField({ component: comp, control, setValue: _setValue, disabled, inputClass, error, formValues = {} }: SelectFieldProps) {
  const fieldName = comp.nameForm ?? comp.name
  const label = comp.label ?? comp.name

  const { field } = useController({
    name: fieldName,
    control,
    rules: { required: comp.required ? `${label} é obrigatório` : false },
  })

  // O computedFrom já foi resolvido pelo CrudObject e está em formValues
  // Usa diretamente como valor de display (sem useEffect local)
  const computedValue = formValues[fieldName]
  const rawValue = computedValue !== undefined && computedValue !== null
    ? computedValue
    : field.value
  const currentValue = rawValue !== undefined && rawValue !== null ? String(rawValue) : ''

  const { data: dynamicOptions } = useQuery({
    queryKey: ['select-options', comp.dataOptions],
    queryFn: () =>
      entityApi
        .getList<EntityRecord>(comp.dataOptions!, { pageSize: 200 })
        .then((res) => {
          const items =
            (res as { data?: EntityRecord[] }).data ??
            (Array.isArray(res) ? (res as EntityRecord[]) : [])
          return items.map((item) => ({
            text: String(item['text'] ?? item['label'] ?? item['nome'] ?? item['name'] ?? ''),
            value: String(item['value'] ?? item['id'] ?? ''),
          }))
        }),
    enabled: !!comp.dataOptions,
    staleTime: 5 * 60 * 1000,
  })

  const options = dynamicOptions ?? comp.options ?? []
  const hasBlankOption = options.some((o) => String(o.value) === '')

  return (
    <div className="space-y-1">
      {label && (
        <label className="text-sm font-medium">
          {label}
          {comp.required && <span className="ml-0.5 text-destructive" aria-hidden>*</span>}
        </label>
      )}
      <select
        name={field.name}
        ref={field.ref}
        value={currentValue}
        onChange={(e) => field.onChange(e.target.value)}
        onBlur={field.onBlur}
        disabled={disabled}
        className={inputClass}
      >
        {comp.clearable !== false && !hasBlankOption && <option value="">Selecione...</option>}
        {options.map((opt) => (
          <option key={String(opt.value)} value={String(opt.value)}>
            {opt.text}
          </option>
        ))}
      </select>
      {error && (
        <p className="text-xs text-destructive" role="alert">{error}</p>
      )}
    </div>
  )
}
