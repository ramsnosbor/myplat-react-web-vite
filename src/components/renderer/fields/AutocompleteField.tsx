import { useState, useRef, useEffect, useCallback } from 'react'
import { useController, useWatch } from 'react-hook-form'
import type { Control, UseFormSetValue } from 'react-hook-form'
import { entityApi } from '@/api/entity.api'
import type { ComponentDefinition } from '@/types/view.types'
import type { EntityRecord } from '@/types/entity.types'
import { evalExpr } from '@/utils/evalExpr'
import { useViewContext } from '../ViewContext'

interface AutocompleteFieldProps {
  component: ComponentDefinition
  control: Control<Record<string, unknown>>
  setValue: UseFormSetValue<Record<string, unknown>>
  disabled?: boolean
}

/**
 * Substitui {{campo}} e {{campo,formato}} no label usando os valores atuais do form.
 * Compatível com o app legado (myplat-App → formatLabel em useTableHelpers).
 *
 * Exemplos (campos vêm do form, não do item da API):
 *   "Mensalidade {{data_vencimento,MM/YYYY}}"  →  "Mensalidade 01/2025"
 *   "NF {{nr_nota}} - {{emitente}}"            →  "NF 42 - Empresa X"
 *
 * Formatos de data suportados: MM/YYYY · DD/MM/YYYY · YYYY-MM-DD · HH:mm
 */
function applyLabelTemplate(template: string, formValues: Record<string, unknown>): string {
  if (!template.includes('{{')) return template
  return template.replace(/\{\{([^}]+)\}\}/g, (_, expr: string) => {
    const [rawField, fmt] = expr.split(',').map((s) => s.trim())
    // inputs do app legado guardavam { value, label } para autocompletes — pega .label ou o valor direto
    const raw = formValues[rawField]
    const val = (raw as Record<string, unknown>)?.label ?? raw
    if (val === undefined || val === null || val === '') return ''
    if (fmt) {
      const d = new Date(String(val))
      if (!isNaN(d.getTime())) {
        const pad = (n: number) => String(n).padStart(2, '0')
        return fmt
          .replace('YYYY', String(d.getFullYear()))
          .replace('MM',   pad(d.getMonth() + 1))
          .replace('DD',   pad(d.getDate()))
          .replace('HH',   pad(d.getHours()))
          .replace('mm',   pad(d.getMinutes()))
      }
    }
    return String(val)
  })
}

/**
 * Autocomplete — separação clara de responsabilidades:
 *
 * - `nameForm`         → campo de display e de busca (ex: "nome_pessoa")
 * - `params.key`       → campo do form que é salvo/enviado na requisição (ex: "id_pessoa_emitente")
 * - `params.sourceKey` → campo do item selecionado que fornece o valor para params.key (ex: "id_pessoa")
 * - `labelField`       → campo exibido na lista (padrão: nameForm)
 *
 * Ao selecionar um item:
 *   form[params.key]  = item[params.sourceKey]   ← FK salva
 *   form[nameForm]    = item[labelField]          ← texto de display (opcional, para referência)
 *
 * Labels com template {{campo}} ou {{campo,formato}} são substituídos automaticamente
 * pelos valores do próprio item retornado pela API.
 */
export function AutocompleteField({ component: comp, control, setValue, disabled }: AutocompleteFieldProps) {
  const { initialParams = {} } = useViewContext()
  const watchedValues = useWatch({ control }) as Record<string, unknown>
  const formValues = { ...initialParams, ...watchedValues }
  const formValuesRef = useRef(formValues)
  formValuesRef.current = formValues

  // Campo de display/busca
  const displayField = comp.nameForm ?? comp.name
  // Campo exibido nos itens da lista
  const labelField = comp.labelField ?? displayField
  // Campo do form que armazena a FK (o que vai no POST/PATCH)
  const fkField = comp.params?.key ?? displayField
  // Campo do item selecionado que fornece o valor da FK
  const sourceField = comp.params?.sourceKey ?? fkField

  const entity = comp.entity ?? comp.entitySource ?? ''

  const rawLabel = comp.label ?? comp.name
  const label = rawLabel?.includes('{{')
    ? String(evalExpr(rawLabel, formValues) ?? rawLabel)
    : rawLabel

  // Controla a FK no form (o que é salvo)
  const { field, fieldState } = useController({
    name: fkField,
    control,
    rules: { required: comp.required ? `${label} é obrigatório` : false },
  })

  const [inputText, setInputText] = useState('')
  const [options, setOptions] = useState<EntityRecord[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [selectedLabel, setSelectedLabel] = useState('')

  const inputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Ao carregar em modo edição: busca o item pela FK já salva para restaurar label E campos extras.
  // Re-aplica o `fields` mapping (ex: tipo_lancamento_acao) — sem isso, campos copiados pelo
  // autocomplete ficam vazios no form, quebrando condições de visibilidade de objetos filhos.
  useEffect(() => {
    if (field.value && !selectedLabel) {
      entityApi
        .getList<EntityRecord>(entity, { [sourceField]: field.value, pageSize: 1 })
        .then((res) => {
          const items = (res as { data?: EntityRecord[] }).data ?? (Array.isArray(res) ? res as EntityRecord[] : [])
          if (items.length > 0) {
            const item = items[0]
            const raw = String(item[labelField] ?? '')
            const text = applyLabelTemplate(raw, formValuesRef.current)
            setSelectedLabel(text)
            setInputText(text)
            // Re-aplica fields mapping — copia campos extras do item para o form
            // (ex: tipo_lancamento_acao, necessário para visibilidade de objetos filhos)
            for (const f of comp.fields ?? []) {
              setValue(f.as, item[f.field])
            }
          }
        })
        .catch(() => {})
    } else if (!field.value) {
      setSelectedLabel('')
      setInputText('')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [field.value])

  const fetchOptions = useCallback(
    async (search: string) => {
      if (!entity) return
      setIsLoading(true)
      try {
        const params: Record<string, unknown> = { pageSize: 20, pageNumber: 1 }

        if (search) {
          params[labelField] = `%${search}%`
        }

        for (const f of comp.params?.filters ?? []) {
          const raw = String(f.value ?? '')
          // Usa evalExpr para suportar expressões JS: "{{tipo_nfe}} === 'Entrada' ? 3 : 1001"
          params[f.field] = raw.includes('{{')
            ? evalExpr(raw, formValuesRef.current) ?? ''
            : raw
        }

        const res = await entityApi.getList<EntityRecord>(entity, params)
        const items =
          (res as { data?: EntityRecord[] }).data ??
          (Array.isArray(res) ? (res as EntityRecord[]) : [])

        setOptions(items)

        if (comp.autoSelectFirst && items.length === 1 && !field.value) {
          selectOption(items[0])
        }
      } catch {
        setOptions([])
      } finally {
        setIsLoading(false)
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [entity, JSON.stringify(comp.params?.filters?.map((f) => {
      const raw = String(f.value ?? '')
      return raw.includes('{{') ? evalExpr(raw, formValues) : raw
    }))],
  )

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const text = e.target.value
    setInputText(text)
    setIsOpen(true)

    if (field.value) {
      field.onChange('')
      setSelectedLabel('')
    }

    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => fetchOptions(text), 300)
  }

  function handleFocus() {
    // loadOnFocus: padrão true — busca ao entrar no campo se ainda não há opções carregadas.
    // Use loadOnFocus: false para desativar (útil em autocompletes com datasets muito grandes).
    const shouldLoadOnFocus = comp.loadOnFocus !== false
    if (shouldLoadOnFocus && options.length === 0) fetchOptions(inputText)
    setIsOpen(true)
  }

  function selectOption(item: EntityRecord) {
    const fkValue = item[sourceField]          // ex: item["id_pessoa"] → salvo em fkField
    const rawText = String(item[labelField] ?? '')
    const displayText = applyLabelTemplate(rawText, formValuesRef.current)

    // Salva a FK no campo correto
    field.onChange(fkValue)
    setSelectedLabel(displayText)
    setInputText(displayText)
    setIsOpen(false)

    // Grava o label apenas no campo auxiliar explícito (nameFormAutoComplete),
    // nunca no nameForm — que pode ser um campo real da tabela e não deve ser sobrescrito.
    // O display do autocomplete é gerenciado pelo estado interno (inputText/selectedLabel).
    if (comp.nameFormAutoComplete) {
      setValue(comp.nameFormAutoComplete, displayText)
    }

    // Copia campos adicionais do item selecionado para o form
    for (const f of comp.fields ?? []) {
      setValue(f.as, item[f.field])
    }
  }

  function handleClear() {
    field.onChange('')
    setSelectedLabel('')
    setInputText('')
    setOptions([])
    setIsOpen(false)

    // Mesma regra do selectOption: não escreve no nameForm — só no nameFormAutoComplete explícito
    if (comp.nameFormAutoComplete) setValue(comp.nameFormAutoComplete, '')
    for (const f of comp.fields ?? []) setValue(f.as, '')
  }

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        !inputRef.current?.contains(e.target as Node)
      ) {
        setIsOpen(false)
        if (selectedLabel) setInputText(selectedLabel)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [selectedLabel])

  const inputClass = [
    'w-full rounded-md border border-input bg-background px-3 py-2 text-sm pr-16',
    'placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring',
    disabled ? 'opacity-50 cursor-not-allowed' : '',
    fieldState.error ? 'border-destructive' : '',
  ].join(' ')

  return (
    <div className="space-y-1">
      {label && (
        <label className="text-sm font-medium">
          {label}
          {comp.required && <span className="ml-0.5 text-destructive" aria-hidden>*</span>}
        </label>
      )}

      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={inputText}
          onChange={handleInputChange}
          onFocus={handleFocus}
          placeholder={comp.placeholder ?? 'Buscar...'}
          disabled={disabled}
          autoComplete="off"
          className={inputClass}
        />

        {!!(inputText || field.value) && (
          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
            <button
              type="button"
              onClick={() => navigator.clipboard.writeText(inputText)}
              className="text-muted-foreground hover:text-foreground"
              tabIndex={-1}
              title="Copiar"
            >
              <i className="bi bi-clipboard text-xs" />
            </button>
            {!disabled && (
              <button
                type="button"
                onClick={handleClear}
                className="text-muted-foreground hover:text-foreground"
                tabIndex={-1}
                title="Limpar"
              >
                ×
              </button>
            )}
          </div>
        )}

        {isOpen && (
          <div
            ref={dropdownRef}
            className="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-md border border-border bg-background shadow-lg"
          >
            {isLoading ? (
              <div className="px-3 py-2 text-sm text-muted-foreground">Buscando...</div>
            ) : options.length === 0 ? (
              <div className="px-3 py-2 text-sm text-muted-foreground">
                {inputText.length > 0 ? 'Nenhum resultado.' : 'Digite para buscar.'}
              </div>
            ) : (
              options.map((item, i) => {
                const pathField     = comp.pathField
                const levelField    = comp.levelField
                const pathSep       = comp.pathSeparator ?? '|||'
                const nivel         = levelField ? Number(item[levelField] ?? 0) : 0
                const pathStr       = pathField ? String(item[pathField] ?? '') : ''
                const breadcrumbs   = pathStr ? pathStr.split(pathSep).filter(Boolean) : []

                return (
                  <button
                    key={i}
                    type="button"
                    className="w-full px-3 py-1.5 text-left hover:bg-muted transition-colors"
                    style={{ paddingLeft: `${0.75 + nivel * 0.75}rem` }}
                    onMouseDown={(e) => { e.preventDefault(); selectOption(item) }}
                  >
                    {breadcrumbs.length > 0 && (
                      <div className="text-xs text-muted-foreground truncate mb-0.5">
                        {breadcrumbs.join(' › ')}
                      </div>
                    )}
                    <div className="text-sm">{applyLabelTemplate(String(item[labelField] ?? ''), formValues)}</div>
                  </button>
                )
              })
            )}
          </div>
        )}
      </div>

      {fieldState.error && (
        <p className="text-xs text-destructive">{fieldState.error.message}</p>
      )}
    </div>
  )
}
