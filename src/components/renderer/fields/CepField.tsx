import { useState } from 'react'
import { Controller } from 'react-hook-form'
import type { Control, UseFormSetValue } from 'react-hook-form'
import type { ComponentDefinition } from '@/types/view.types'
import { cepApi } from '@/api/cep.api'

interface CepFieldProps {
  component: ComponentDefinition
  control: Control<Record<string, unknown>>
  setValue: UseFormSetValue<Record<string, unknown>>
  disabled?: boolean
  inputClass?: string
  error?: string
}

export function CepField({ component: comp, control, setValue, disabled, inputClass, error }: CepFieldProps) {
  const fieldName = comp.nameForm ?? comp.name
  const label = comp.label ?? comp.name

  const [loading, setLoading] = useState(false)
  const [cepError, setCepError] = useState<string | null>(null)

  async function fetchCep(cep: string) {
    setLoading(true)
    setCepError(null)
    try {
      const data = await cepApi.get(cep)
      const mapping = comp.cepFields ?? {}

      for (const [apiKey, formField] of Object.entries(mapping)) {
        if (apiKey === 'city') {
          // Para cidade: seta a FK — o AutocompleteField recarrega o label automaticamente
          setValue(formField, data.id, { shouldDirty: true })
        } else {
          const value = (data as Record<string, unknown>)[apiKey] ?? ''
          setValue(formField, value, { shouldDirty: true })
        }
      }
    } catch {
      setCepError('CEP não encontrado.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-1">
      {label && (
        <label className="text-sm font-medium">
          {label}
          {comp.required && <span className="ml-0.5 text-destructive" aria-hidden>*</span>}
        </label>
      )}

      <div className="relative">
        <Controller
          name={fieldName}
          control={control}
          rules={{ required: comp.required ? `${label} é obrigatório` : false }}
          render={({ field }) => (
            <input
              type="text"
              inputMode="numeric"
              placeholder={comp.placeholder ?? '00000-000'}
              disabled={disabled || loading}
              className={inputClass}
              value={field.value != null ? String(field.value) : ''}
              onChange={(e) => {
                const digits = e.target.value.replace(/\D/g, '').slice(0, 8)
                field.onChange(digits)
                if (digits.length === 8) fetchCep(digits)
              }}
            />
          )}
        />

        {loading && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2">
            <span className="block h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </span>
        )}
      </div>

      {(error || cepError) && (
        <p className="text-xs text-destructive" role="alert">{error ?? cepError}</p>
      )}
    </div>
  )
}
