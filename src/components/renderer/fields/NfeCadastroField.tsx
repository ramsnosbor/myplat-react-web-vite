import { useRef, useState } from 'react'
import { Controller } from 'react-hook-form'
import type { Control, UseFormSetValue } from 'react-hook-form'
import type { ComponentDefinition } from '@/types/view.types'
import { nfeCadastroApi, type NfeCadastroInfo, type TipoPessoaCadastro } from '@/api/nfe-cadastro.api'
import { useAuthStore } from '@/store/authStore'

interface NfeCadastroFieldProps {
  component: ComponentDefinition
  control: Control<Record<string, unknown>>
  setValue: UseFormSetValue<Record<string, unknown>>
  disabled?: boolean
  inputClass?: string
  error?: string
}

const UFS = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO',
  'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI',
  'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
]

function onlyDigits(value: string): string {
  return value.replace(/\D/g, '')
}

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

function getErrorMessage(error: unknown): string {
  const responseMessage = (
    error as {
      response?: {
        data?: {
          message?: string
          messageError?: string
          mensagem?: string
        }
      }
    }
  )?.response?.data

  return responseMessage?.messageError
    ?? responseMessage?.message
    ?? responseMessage?.mensagem
    ?? 'Não foi possível consultar o cadastro na SEFAZ.'
}

export function NfeCadastroField({
  component: comp,
  control,
  setValue,
  disabled,
  inputClass,
  error,
}: NfeCadastroFieldProps) {
  const fieldName = comp.nameForm ?? comp.name
  const label = comp.label ?? comp.name
  const cnpjEmitente = useAuthStore((state) => state.user?.tenant?.cnpjCpf ?? '')

  const [uf, setUf] = useState('')
  const [loading, setLoading] = useState(false)
  const [lookupError, setLookupError] = useState<string | null>(null)
  const [cadastros, setCadastros] = useState<NfeCadastroInfo[]>([])
  const lastLookupRef = useRef<string | null>(null)
  const inFlightLookupRef = useRef<string | null>(null)
  const requestIdRef = useRef(0)

  function applyCadastro(cadastro: NfeCadastroInfo) {
    const mapping = comp.nfeCadastroFields ?? {}
    const values = cadastro as unknown as Record<string, unknown>

    for (const [responseField, formField] of Object.entries(mapping)) {
      setValue(formField, values[responseField] ?? '', {
        shouldDirty: true,
        shouldValidate: true,
      })
    }

    setCadastros([])
    setLookupError(null)
  }

  async function consultar(documentoFormatado: string) {
    const documento = onlyDigits(documentoFormatado)
    if (!documento) return

    if (!uf) {
      setLookupError('Selecione a UF para consultar o cadastro.')
      return
    }

    if (documento.length !== 11 && documento.length !== 14) {
      setLookupError('Informe um CPF com 11 dígitos ou CNPJ com 14 dígitos.')
      return
    }

    const emitente = onlyDigits(cnpjEmitente)
    if (emitente.length !== 14) {
      setLookupError('CNPJ emitente não configurado para o tenant atual.')
      return
    }

    const lookupKey = `${uf}:${documento}`
    if (lastLookupRef.current === lookupKey || inFlightLookupRef.current === lookupKey) return

    const tipoPessoa: TipoPessoaCadastro = documento.length === 11 ? 'FISICA' : 'JURIDICA'
    const requestId = ++requestIdRef.current
    inFlightLookupRef.current = lookupKey
    setLoading(true)
    setLookupError(null)
    setCadastros([])

    try {
      const response = await nfeCadastroApi.consultar({
        cnpjEmitente: emitente,
        tipoPessoa,
        documento,
        uf,
      })

      if (requestId !== requestIdRef.current) return

      const encontrados = response.cadastros ?? []
      lastLookupRef.current = lookupKey

      if (encontrados.length === 0) {
        setLookupError(response.mensagem || 'Nenhum cadastro encontrado na SEFAZ.')
      } else if (encontrados.length === 1) {
        applyCadastro(encontrados[0])
      } else {
        setCadastros(encontrados)
      }
    } catch (requestError) {
      if (requestId !== requestIdRef.current) return
      setLookupError(getErrorMessage(requestError))
    } finally {
      if (inFlightLookupRef.current === lookupKey) inFlightLookupRef.current = null
      if (requestId === requestIdRef.current) setLoading(false)
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

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[6rem_minmax(0,1fr)]">
        <select
          aria-label="UF da consulta cadastral"
          value={uf}
          disabled={disabled || loading}
          className={inputClass}
          onChange={(event) => {
            setUf(event.target.value)
            lastLookupRef.current = null
            setLookupError(null)
            setCadastros([])
          }}
        >
          <option value="">UF</option>
          {UFS.map((item) => (
            <option key={item} value={item}>{item}</option>
          ))}
        </select>

        <div className="relative min-w-0">
          <Controller
            name={fieldName}
            control={control}
            rules={{
              required: comp.required ? `${label} é obrigatório` : false,
              validate: (value) => {
                if (!value) return true
                const digits = onlyDigits(String(value))
                return digits.length === 11 || digits.length === 14
                  || 'CPF deve ter 11 dígitos ou CNPJ deve ter 14 dígitos'
              },
            }}
            render={({ field }) => (
              <input
                ref={field.ref}
                type="text"
                inputMode="numeric"
                disabled={disabled || loading}
                placeholder={comp.placeholder ?? 'CPF ou CNPJ'}
                className={inputClass}
                value={field.value != null ? maskCpfCnpj(String(field.value)) : ''}
                onChange={(event) => {
                  field.onChange(maskCpfCnpj(event.target.value))
                  lastLookupRef.current = null
                  setLookupError(null)
                  setCadastros([])
                }}
                onBlur={(event) => {
                  field.onBlur()
                  void consultar(event.currentTarget.value)
                }}
              />
            )}
          />

          {loading && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2" aria-label="Consultando cadastro">
              <span className="block h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </span>
          )}
        </div>
      </div>

      {(error || lookupError) && (
        <p className="text-xs text-destructive" role="alert">{error ?? lookupError}</p>
      )}

      {cadastros.length > 1 && (
        <div className="overflow-hidden rounded-md border border-border bg-background">
          <p className="border-b border-border px-3 py-2 text-xs font-medium text-muted-foreground">
            Selecione o cadastro
          </p>
          <div className="max-h-52 overflow-y-auto">
            {cadastros.map((cadastro, index) => (
              <button
                key={`${cadastro.cnpj ?? cadastro.cpf ?? 'cadastro'}-${cadastro.inscricaoEstadual ?? index}`}
                type="button"
                className="flex w-full items-start justify-between gap-3 border-b border-border px-3 py-2 text-left text-sm last:border-b-0 hover:bg-muted/50"
                onClick={() => applyCadastro(cadastro)}
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium">{cadastro.razaoSocial || 'Sem razão social'}</span>
                  <span className="block text-xs text-muted-foreground">
                    IE: {cadastro.inscricaoEstadual || 'Não informada'}
                  </span>
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {cadastro.situacaoCadastral || 'Situação não informada'}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
