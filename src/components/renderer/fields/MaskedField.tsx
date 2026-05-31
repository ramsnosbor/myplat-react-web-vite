import { useRef } from 'react'
import { Controller } from 'react-hook-form'
import type { Control, UseFormSetValue } from 'react-hook-form'
import type { ComponentDefinition } from '@/types/view.types'

// ─── Utilitários de máscara ───────────────────────────────────────────────────

function onlyDigits(value: string): string {
  return value.replace(/\D/g, '')
}

// CPF: 999.999.999-99  /  CNPJ: 99.999.999/9999-99
function maskCpfCnpj(raw: string): string {
  const digits = onlyDigits(raw).slice(0, 14)
  if (digits.length <= 11) {
    return digits
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d{1,2})$/, '$1-$2')
  }
  return digits
    .replace(/(\d{2})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1/$2')
    .replace(/(\d{4})(\d{1,2})$/, '$1-$2')
}

// Fixo: 99 9999-9999  /  Celular: 99 99999-9999
function maskPhone(raw: string): string {
  const digits = onlyDigits(raw).slice(0, 11)
  if (digits.length <= 10) {
    return digits
      .replace(/(\d{2})(\d)/, '$1 $2')
      .replace(/(\d{4})(\d{1,4})$/, '$1-$2')
  }
  return digits
    .replace(/(\d{2})(\d)/, '$1 $2')
    .replace(/(\d{5})(\d{1,4})$/, '$1-$2')
}

// Validação de e-mail
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

// ─── Props compartilhadas ────────────────────────────────────────────────────

interface MaskedFieldProps {
  component: ComponentDefinition
  control: Control<Record<string, unknown>>
  setValue: UseFormSetValue<Record<string, unknown>>
  disabled?: boolean
  inputClass?: string
  error?: string
}

// ─── CpfCnpjField ─────────────────────────────────────────────────────────────

export function CpfCnpjField({ component: comp, control, disabled, inputClass, error }: MaskedFieldProps) {
  const fieldName = comp.nameForm ?? comp.name
  const label = comp.label ?? comp.name
  const inputRef = useRef<HTMLInputElement | null>(null)

  return (
    <div className="space-y-1">
      {label && (
        <label className="text-sm font-medium">
          {label}
          {comp.required && <span className="ml-0.5 text-destructive" aria-hidden>*</span>}
        </label>
      )}
      <Controller
        name={fieldName}
        control={control}
        rules={{
          required: comp.required ? `${label} é obrigatório` : false,
          validate: (val) => {
            if (!val) return true
            const digits = onlyDigits(String(val))
            if (digits.length !== 11 && digits.length !== 14) {
              return 'CPF deve ter 11 dígitos ou CNPJ deve ter 14 dígitos'
            }
            return true
          },
        }}
        render={({ field }) => (
          <input
            ref={(el) => {
              inputRef.current = el
              field.ref(el)
            }}
            type="text"
            inputMode="numeric"
            disabled={disabled}
            placeholder={comp.placeholder ?? '000.000.000-00 ou 00.000.000/0000-00'}
            className={inputClass}
            value={field.value != null ? maskCpfCnpj(String(field.value)) : ''}
            onChange={(e) => {
              const masked = maskCpfCnpj(e.target.value)
              field.onChange(masked)
            }}
          />
        )}
      />
      {error && <p className="text-xs text-destructive" role="alert">{error}</p>}
    </div>
  )
}

// ─── PhoneNumberField ─────────────────────────────────────────────────────────

export function PhoneNumberField({ component: comp, control, disabled, inputClass, error }: MaskedFieldProps) {
  const fieldName = comp.nameForm ?? comp.name
  const label = comp.label ?? comp.name

  return (
    <div className="space-y-1">
      {label && (
        <label className="text-sm font-medium">
          {label}
          {comp.required && <span className="ml-0.5 text-destructive" aria-hidden>*</span>}
        </label>
      )}
      <Controller
        name={fieldName}
        control={control}
        rules={{
          required: comp.required ? `${label} é obrigatório` : false,
          validate: (val) => {
            if (!val) return true
            const digits = onlyDigits(String(val))
            if (digits.length < 10 || digits.length > 11) {
              return 'Telefone inválido. Use DDD + número (10 ou 11 dígitos)'
            }
            return true
          },
        }}
        render={({ field }) => (
          <input
            type="text"
            inputMode="numeric"
            disabled={disabled}
            placeholder={comp.placeholder ?? '99 99999-9999'}
            className={inputClass}
            value={field.value != null ? maskPhone(String(field.value)) : ''}
            onChange={(e) => {
              const masked = maskPhone(e.target.value)
              field.onChange(masked)
            }}
          />
        )}
      />
      {error && <p className="text-xs text-destructive" role="alert">{error}</p>}
    </div>
  )
}

// ─── EmailField ───────────────────────────────────────────────────────────────

export function EmailField({ component: comp, control, disabled, inputClass, error }: MaskedFieldProps) {
  const fieldName = comp.nameForm ?? comp.name
  const label = comp.label ?? comp.name

  return (
    <div className="space-y-1">
      {label && (
        <label className="text-sm font-medium">
          {label}
          {comp.required && <span className="ml-0.5 text-destructive" aria-hidden>*</span>}
        </label>
      )}
      <Controller
        name={fieldName}
        control={control}
        rules={{
          required: comp.required ? `${label} é obrigatório` : false,
          validate: (val) => {
            if (!val) return true
            return EMAIL_REGEX.test(String(val)) || 'E-mail inválido'
          },
        }}
        render={({ field }) => (
          <input
            type="email"
            inputMode="email"
            autoComplete="email"
            disabled={disabled}
            placeholder={comp.placeholder ?? 'email@exemplo.com'}
            className={inputClass}
            value={field.value != null ? String(field.value) : ''}
            onChange={(e) => field.onChange(e.target.value.trim())}
          />
        )}
      />
      {error && <p className="text-xs text-destructive" role="alert">{error}</p>}
    </div>
  )
}
