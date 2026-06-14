import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { useController, useWatch, useFormState } from 'react-hook-form'
import type { Control, UseFormSetValue } from 'react-hook-form'
import { useStore } from 'zustand'
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
    const raw = formValues[getAutocompleteLabelKey(rawField)] ?? formValues[rawField]
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

function getAutocompleteLabelKey(fieldName: string) {
  return `${fieldName}__label`
}

/**
 * Insere texto em um input/textarea do DOM identificado pelo atributo `name`.
 * Usa o setter nativo para que o React (react-hook-form) detecte a mudança via
 * eventos `input` e `change`, igual ao padrão adotado no app legado.
 *
 * @param targetField  - valor do atributo `name` do campo alvo
 * @param text         - texto a inserir
 * @param insertMode   - onde inserir: 'cursor' (padrão) | 'start' | 'end'
 */
function domInsertText(
  targetField: string,
  text: string,
  insertMode: 'cursor' | 'start' | 'end' = 'cursor',
) {
  const el =
    document.getElementById(targetField) ??
    document.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[name="${targetField}"]`)
  if (!el) {
    console.warn(`[behavior.insertInto] Campo "${targetField}" não encontrado no DOM.`)
    return
  }

  const current = (el as HTMLInputElement | HTMLTextAreaElement).value ?? ''
  const cursorPos = insertMode === 'cursor'
    ? ((el as HTMLInputElement).selectionStart ?? current.length)
    : 0

  let newValue: string
  let newCursor: number

  if (insertMode === 'start') {
    newValue  = text + current
    newCursor = text.length
  } else if (insertMode === 'end') {
    newValue  = current + text
    newCursor = newValue.length
  } else {
    // cursor
    newValue  = current.substring(0, cursorPos) + text + current.substring(cursorPos)
    newCursor = cursorPos + text.length
  }

  const isTextarea = el.tagName.toLowerCase() === 'textarea'
  const proto = isTextarea
    ? window.HTMLTextAreaElement.prototype
    : window.HTMLInputElement.prototype
  const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set
  if (nativeSetter) {
    nativeSetter.call(el, newValue)
  } else {
    (el as HTMLInputElement).value = newValue
  }

  // Posiciona o cursor após o texto inserido
  ;(el as HTMLInputElement).selectionStart = newCursor
  ;(el as HTMLInputElement).selectionEnd   = newCursor

  // Dispara eventos para react-hook-form detectar a mudança
  el.dispatchEvent(new InputEvent('input',  { bubbles: true, cancelable: true }))
  el.dispatchEvent(new Event('change',      { bubbles: true, cancelable: true }))
  el.focus()
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
  const { initialParams = {}, viewStore } = useViewContext()

  // Selector retorna string JSON (primitivo) para evitar loop infinito com useSyncExternalStore.
  // React compara primitivos por valor — dois JSONs iguais são a mesma referência lógica,
  // então só re-renderiza quando os dados efetivamente mudam.
  const globalFormDataJson = useStore(
    viewStore,
    (s) => JSON.stringify(
      Object.values(s.objects).reduce<Record<string, unknown>>(
        (acc, obj) => obj.formData ? { ...acc, ...(obj.formData as Record<string, unknown>) } : acc,
        {},
      )
    ),
  )
  // Parseia só quando o JSON muda — evita criar novo objeto a cada render
  const globalFormData = useMemo(
    () => JSON.parse(globalFormDataJson || '{}') as Record<string, unknown>,
    [globalFormDataJson],
  )

  const watchedValues = useWatch({ control }) as Record<string, unknown>
  // Prioridade: form próprio > dados globais da tela > initialParams
  const formValues = { ...initialParams, ...globalFormData, ...watchedValues }
  const formValuesRef = useRef(formValues)
  formValuesRef.current = formValues

  // Campo de display/busca
  const displayField = comp.nameForm ?? comp.name
  // Campo exibido nos itens da lista
  const labelField = comp.labelField ?? displayField
  // Campo do form que armazena a FK (o que vai no POST/PATCH)
  const fkField = comp.params?.key ?? displayField
  const fkLabelField = getAutocompleteLabelKey(fkField)
  // Campo do item selecionado que fornece o valor da FK
  const sourceField = comp.params?.sourceKey ?? fkField

  // Normaliza comp.fields: suporta tanto formato legado (string[]) quanto o formato atual ({field, as}[]).
  // O formato legado vinha do app anterior onde fields era apenas uma lista de nomes de campo.
  // Tratar strings como { field: x, as: x } evita f.as = undefined → setValue(undefined, ...) → campo "undefined" no form.
  const normalizedFields = (comp.fields ?? []).map((f) =>
    typeof f === 'string' ? { field: f as string, as: f as string } : f,
  )

  const entity = comp.entity ?? comp.entitySource ?? ''

  // ─── system.entity.columns ───────────────────────────────────────────────────
  // Entity mágica: em vez de GET /default/..., chama GET /entities/{entityName}
  // e expõe as colunas do schema como opções do autocomplete.
  // O nome da entidade alvo vem do filtro  { field: 'entity', value: '{{campo}}' }.
  const isSystemEntityColumns = entity === 'system.entity.columns'

  /** Resolve o nome da entidade alvo para system.entity.columns */
  const resolveSystemEntityName = (): string => {
    const entityFilter = (comp.params?.filters ?? []).find((f) => f.field === 'entity')
    if (!entityFilter) return ''
    const raw = String(entityFilter.value ?? '')
    return raw.includes('{{')
      ? String(evalExpr(raw, formValuesRef.current) ?? '')
      : raw
  }

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

  // Para behavior.insertInto: posição do cursor no campo alvo.
  // Não podemos ler selectionStart em handleFocus porque browsers (Chrome) resetam
  // selectionStart para 0 quando o elemento perde o foco. A solução é ouvir os eventos
  // do próprio textarea (blur, mouseup, keyup) enquanto ele ainda está ativo.
  const savedInsertionStateRef = useRef<{ cursorPos: number } | null>(null)

  useEffect(() => {
    if (comp.behavior?.type !== 'insertInto' || !comp.behavior.targetField) return
    const targetField = comp.behavior.targetField

    const savePos = (e: Event) => {
      const el = e.currentTarget as HTMLInputElement | HTMLTextAreaElement
      savedInsertionStateRef.current = { cursorPos: el.selectionStart ?? el.value.length }
    }

    // Busca o elemento no DOM; tenta novamente se ainda não renderizou
    const attach = (): (() => void) | undefined => {
      const el =
        document.getElementById(targetField) ??
        document.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[name="${targetField}"]`)
      if (!el) {
        const t = setTimeout(attach, 150)
        return () => clearTimeout(t)
      }
      el.addEventListener('mouseup', savePos)
      el.addEventListener('keyup',   savePos)
      el.addEventListener('blur',    savePos)
      return () => {
        el.removeEventListener('mouseup', savePos)
        el.removeEventListener('keyup',   savePos)
        el.removeEventListener('blur',    savePos)
      }
    }

    const cleanup = attach()
    return cleanup
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [comp.behavior?.targetField])

  // ─── Reset quando filtros dinâmicos do pai mudam ────────────────────────────
  // Calcula a chave dos filtros que usam {{campo}} resolvidos contra os valores do form.
  // Quando o pai muda (ex: id_pessoa_emitente), a chave muda → filho é limpo.
  const dynamicFilterValues = (comp.params?.filters ?? [])
    .filter((f) => String(f.value ?? '').includes('{{'))
    .map((f) => String(evalExpr(String(f.value ?? ''), formValues) ?? ''))
    .join('\x00')

  // Extrai os campos-fonte dos filtros dinâmicos (ex: "{{id_pessoa_emitente}}" → "id_pessoa_emitente").
  // Usado para verificar se o campo foi alterado pelo usuário (isDirty) ou pelo sistema (form.reset,
  // computedFrom com shouldDirty:false). Computado uma única vez pois comp é estático.
  const filterSourceFields = useMemo(() => {
    const sources = new Set<string>()
    for (const f of comp.params?.filters ?? []) {
      const matches = String(f.value ?? '').matchAll(/\{\{(\w+)\}\}/g)
      for (const m of matches) sources.add(m[1])
    }
    return [...sources]
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Subscreve apenas ao isDirty dos campos-fonte — evita re-renders desnecessários.
  const { dirtyFields } = useFormState({ control, name: filterSourceFields as [string, ...string[]] })
  const dirtyFieldsRef = useRef(dirtyFields)
  dirtyFieldsRef.current = dirtyFields

  const prevDynamicFilterValues = useRef<string | null>(null)

  useEffect(() => {
    // Primeira renderização: registra o valor inicial sem limpar
    if (prevDynamicFilterValues.current === null) {
      prevDynamicFilterValues.current = dynamicFilterValues
      return
    }
    // Sem mudança → ignora
    if (prevDynamicFilterValues.current === dynamicFilterValues) return

    prevDynamicFilterValues.current = dynamicFilterValues

    // resetOnParentUpdate: false → nunca limpa (ex: CFOP que tem filtro por campo computado)
    if (comp.params?.resetOnParentUpdate === false) return

    // ─── Regra central do cascade ────────────────────────────────────────────
    // O cascade só dispara se pelo menos um campo-fonte do filtro foi alterado
    // PELO USUÁRIO (isDirty = true).
    //
    // isDirty = false quando:
    //   - form.reset(record) — carregamento do registro em edit/detail
    //   - computedFrom com shouldDirty:false — campo derivado automático
    //   - setValue sem shouldDirty:true — cópia automática de campos (fields[])
    //
    // isDirty = true quando:
    //   - Usuário seleciona um item no autocomplete (field.onChange)
    //   - Usuário digita/limpa um campo de texto
    //
    // Isso resolve: CFOP não limpa quando destinoDaOperacao muda durante o init
    // porque destinoDaOperacao é computedFrom (shouldDirty:false → não fica dirty).
    const anySourceDirty = filterSourceFields.some((name) => !!(dirtyFieldsRef.current as Record<string, boolean>)[name])
    if (!anySourceDirty) return

    // Filtro-pai alterado pelo usuário → limpa seleção do filho
    field.onChange('')
    setSelectedLabel('')
    setInputText('')
    setOptions([])
    setIsOpen(false)
    setValue(fkLabelField, '')
    if (comp.nameFormAutoComplete) setValue(comp.nameFormAutoComplete, '')
    for (const f of normalizedFields) setValue(f.as, '')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dynamicFilterValues])

  // Ao carregar em modo edição: busca o item pela FK já salva para restaurar label E campos extras.
  // Re-aplica o `fields` mapping (ex: tipo_lancamento_acao) — sem isso, campos copiados pelo
  // autocomplete ficam vazios no form, quebrando condições de visibilidade de objetos filhos.
  useEffect(() => {
    // Usa comparação explícita para não tratar 0 (zero) como ausência de valor —
    // 0 é um ID válido em algumas tabelas (ex: nfe_status com id_nfe_status = 0).
    const hasValue = field.value !== undefined && field.value !== null && field.value !== ''
    if (hasValue && !selectedLabel) {
      // ── system.entity.columns: restaura label lendo o schema ─────────────────
      if (isSystemEntityColumns) {
        const entityName = resolveSystemEntityName()
        if (entityName) {
          entityApi.getSchema(entityName)
            .then((schema) => {
              const rawCols = (schema.config?.columns ?? []) as Array<Record<string, unknown>>
              const col = rawCols.find((c) => String(c.name) === String(field.value))
              if (col) {
                const text = String((col.description as string | undefined) || col.name || '')
                setSelectedLabel(text)
                setInputText(text)
                setValue(fkLabelField, text)
                for (const f of normalizedFields) setValue(f.as, col[f.field])
              }
            })
            .catch(() => {})
        }
        return
      }

      // ── Entidade normal: GET /default/{entity} ────────────────────────────
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
            setValue(fkLabelField, text)
            // Re-aplica fields mapping — copia campos extras do item para o form
            // (ex: tipo_lancamento_acao, necessário para visibilidade de objetos filhos)
            for (const f of normalizedFields) {
              setValue(f.as, item[f.field])
            }
          }
        })
        .catch(() => {})
    } else if (!hasValue) {
      setSelectedLabel('')
      setInputText('')
    }
  // selectedLabel incluído para re-disparar se o label foi limpo externamente
  // (ex: HMR ou re-mount) sem que field.value tenha mudado.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [field.value, selectedLabel === ''])

  const fetchOptions = useCallback(
    async (search: string) => {
      if (!entity) return
      setIsLoading(true)
      try {
        // ── system.entity.columns: busca schema e expõe colunas como opções ──
        if (isSystemEntityColumns) {
          const entityName = resolveSystemEntityName()
          if (!entityName) { setOptions([]); return }

          const schema = await entityApi.getSchema(entityName)
          const rawCols = (schema.config?.columns ?? []) as Array<Record<string, unknown>>

          // Mapeia colunas para o formato de EntityRecord esperado pelo autocomplete.
          // [sourceField] = col.name     → valor salvo no form (ex: "nome_campo")
          // [labelField]  = description  → texto exibido na lista
          let items: EntityRecord[] = rawCols.map((col) => ({
            ...col,
            [sourceField]: col.name,
            [labelField]: (col.description as string | undefined) || (col.name as string) || '',
          }))

          // Filtra client-side por texto de busca (schema retorna tudo de uma vez)
          if (search) {
            const lower = search.toLowerCase()
            items = items.filter((item) =>
              String(item[labelField] ?? '').toLowerCase().includes(lower) ||
              String((item as Record<string, unknown>).name ?? '').toLowerCase().includes(lower),
            )
          }

          // Ordena alfabeticamente pelo label
          items.sort((a, b) => String(a[labelField] ?? '').localeCompare(String(b[labelField] ?? '')))

          setOptions(items)
          if (comp.autoSelectFirst && items.length === 1 && !field.value) selectOption(items[0])
          return
        }

        // ── Entidade normal: GET /default/{entity} ────────────────────────────
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

    if (field.value !== undefined && field.value !== null && field.value !== '') {
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
    const rawFkValue = item[sourceField]       // ex: item["id_pessoa"] → salvo em fkField
    // Quando o sourceField é um texto com template {{var}}, parseia antes de salvar
    const fkValue = typeof rawFkValue === 'string'
      ? applyLabelTemplate(rawFkValue, formValuesRef.current)
      : rawFkValue
    const rawText = String(item[labelField] ?? '')
    const displayText = applyLabelTemplate(rawText, formValuesRef.current)

    // Salva a FK no campo correto
    field.onChange(fkValue)
    setSelectedLabel(displayText)
    setInputText(displayText)
    setIsOpen(false)
    setValue(fkLabelField, displayText)

    // Grava o label apenas no campo auxiliar explícito (nameFormAutoComplete),
    // nunca no nameForm — que pode ser um campo real da tabela e não deve ser sobrescrito.
    // O display do autocomplete é gerenciado pelo estado interno (inputText/selectedLabel).
    if (comp.nameFormAutoComplete) {
      setValue(comp.nameFormAutoComplete, displayText)
    }

    // Copia campos adicionais do item selecionado para o form
    // Strings com {{var}} são parseadas com os valores atuais do form antes de salvar
    for (const f of normalizedFields) {
      const raw = item[f.field]
      setValue(f.as, typeof raw === 'string' ? applyLabelTemplate(raw, formValuesRef.current) : raw)
    }

    // ── behavior: insertInto ──────────────────────────────────────────────────
    // Insere texto gerado pelo template no campo `targetField`, na posição do cursor.
    // Uso típico: autocomplete de colunas insere "{{nome_campo}}" num textarea de template.
    const beh = comp.behavior
    if (beh?.type === 'insertInto' && beh.targetField) {
      // Substitui ${fieldName} pelo valor do campo correspondente no item selecionado.
      // Ex: "{{${name}}}" + item{name:"dt_nasc"}  → "{{dt_nasc}}"
      //     "{{${name}}}" + item{name:"id_pessoa"} → "{{id_pessoa__label}}"
      // Campos id_* são FKs numéricas — usa sufixo __label para exibir o valor legível.
      const textToInsert = (beh.insertTemplate ?? '').replace(
        /\$\{(\w+)\}/g,
        (_, f: string) => {
          const val = String((item as Record<string, unknown>)[f] ?? '')
          return val.startsWith('id_') ? `${val}__label` : val
        },
      )

      if (textToInsert) {
        const targetField = beh.targetField
        const insertMode  = beh.insertMode ?? 'cursor'

        // Valor atual: formValuesRef inclui watchedValues — sempre reflete o conteúdo
        // atual do textarea (atualizado pelo react-hook-form a cada keystroke).
        const currentValue = String(formValuesRef.current[targetField] ?? '')

        // Posição do cursor: salva pelos listeners nativos (blur/mouseup/keyup) do textarea,
        // que disparam ANTES que o browser redefina selectionStart para 0 ao perder o foco.
        // Fallback: fim do texto se o usuário nunca interagiu com o textarea.
        const saved = savedInsertionStateRef.current
        const cursorPos = insertMode === 'cursor'
          ? (saved?.cursorPos ?? currentValue.length)
          : (insertMode === 'start' ? 0 : currentValue.length)

        let newValue: string
        let newCursor: number

        if (insertMode === 'start') {
          newValue  = textToInsert + currentValue
          newCursor = textToInsert.length
        } else if (insertMode === 'end') {
          newValue  = currentValue + textToInsert
          newCursor = newValue.length
        } else {
          // cursor: insere exatamente onde estava o cursor
          newValue  = currentValue.substring(0, cursorPos) + textToInsert + currentValue.substring(cursorPos)
          newCursor = cursorPos + textToInsert.length
        }

        // Atualiza via react-hook-form (confiável para uncontrolled inputs gerenciados por register)
        setValue(targetField, newValue)

        // Reposiciona o cursor e foca o textarea após o React aplicar o novo valor
        requestAnimationFrame(() => {
          const target =
            document.getElementById(targetField) ??
            document.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[name="${targetField}"]`)
          if (target) {
            target.focus()
            ;(target as HTMLInputElement).selectionStart = newCursor
            ;(target as HTMLInputElement).selectionEnd   = newCursor
          }
        })
      }

      if (beh.clearAfterInsert) {
        // Limpa o autocomplete para permitir inserção de outra variável em seguida
        field.onChange('')
        setSelectedLabel('')
        setInputText('')
        setOptions([])
        setIsOpen(false)
        setValue(fkLabelField, '')
      }
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
    for (const f of normalizedFields) setValue(f.as, '')
    setValue(fkLabelField, '')
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

  // Pré-processa as opções para evitar repetir linhas de ancestrais iguais ao item anterior.
  // Para cada item, calcula a partir de qual nível os ancestrais diferem do anterior.
  //
  // Exemplo (4 itens):
  //   item 1 → mostra "3 RECEITAS", "3.01 RECEITA LÍQUIDA", "3.01.01 RECEITA…" + item
  //   item 2 → mostra apenas o item (3.01.01 não mudou, omite os ancestrais repetidos)
  //   item 3 → mostra "3.01.02 OUTRAS RECEITAS" + item (divergência a partir do nível 2)
  //   item 4 → mostra "4 DESPESAS", "4.01 DESP. OPER." + item (divergência no nível 0)
  const pathSep = comp.pathSeparator ?? '|||'
  const getAncestors = (it: EntityRecord): string[] => {
    const pf = comp.pathField ?? (it['path_string'] !== undefined ? 'path_string' : undefined)
    const ps = pf ? String(it[pf] ?? '') : ''
    return ps ? ps.split(pathSep).filter(Boolean) : []
  }
  const renderedOptions = options.map((item, i) => {
    const ancestors = getAncestors(item)
    const itemLabel = applyLabelTemplate(String(item[labelField] ?? ''), formValues)
    const hasPath   = ancestors.length > 0

    // Primeiro índice em que este item diverge do anterior
    let shownFrom = 0
    if (i > 0 && hasPath) {
      const prev = getAncestors(options[i - 1])
      for (let j = 0; j < Math.min(ancestors.length, prev.length); j++) {
        if (ancestors[j] === prev[j]) shownFrom = j + 1
        else break
      }
    }

    const newAncestors = ancestors.slice(shownFrom)

    return (
      <button
        key={i}
        type="button"
        className="w-full text-left hover:bg-muted/60 transition-colors border-b border-border/30 last:border-0"
        onMouseDown={(e) => { e.preventDefault(); selectOption(item) }}
      >
        {hasPath ? (
          <div className="py-0.5">
            {newAncestors.map((ancestor, rel) => {
              const depth = shownFrom + rel
              return (
                <div
                  key={depth}
                  className="text-xs text-muted-foreground leading-snug py-px select-none"
                  style={{ paddingLeft: `${0.75 + depth * 1.1}rem` }}
                >
                  {ancestor}
                </div>
              )
            })}
            <div
              className="text-sm font-medium text-foreground py-0.5"
              style={{ paddingLeft: `${0.75 + ancestors.length * 1.1}rem` }}
            >
              {itemLabel}
            </div>
          </div>
        ) : (
          <div className="px-3 py-1.5 text-sm">{itemLabel}</div>
        )}
      </button>
    )
  })

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

        {!!(inputText || (field.value !== undefined && field.value !== null && field.value !== '')) && (
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
            className="absolute z-50 mt-1 max-h-96 w-full overflow-auto rounded-md border border-border bg-background shadow-lg"
          >
            {isLoading ? (
              <div className="px-3 py-2 text-sm text-muted-foreground">Buscando...</div>
            ) : options.length === 0 ? (
              <div className="px-3 py-2 text-sm text-muted-foreground">
                {inputText.length > 0 ? 'Nenhum resultado.' : 'Digite para buscar.'}
              </div>
            ) : (
              <>{renderedOptions}</>
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
