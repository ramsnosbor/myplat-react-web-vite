import { useWatch } from 'react-hook-form'
import { useNavigate } from 'react-router-dom'
import type {
  UseFormRegister,
  Control,
  UseFormWatch,
  UseFormSetValue,
  UseFormGetValues,
  FieldErrors,
  RegisterOptions,
} from 'react-hook-form'
import type { ComponentDefinition } from '@/types/view.types'
import { AutocompleteField } from './AutocompleteField'
import { SelectField } from './SelectField'
import { DateField } from './DateField'
import { NumberField } from './NumberField'
import { CpfCnpjField, PhoneNumberField, EmailField } from './MaskedField'
import { evalExpr } from '@/utils/evalExpr'
import { useViewContext } from '../ViewContext'
import { resolveColClass } from '@/utils/colClass'

interface FieldRendererProps {
  component: ComponentDefinition
  register: UseFormRegister<Record<string, unknown>>
  control: Control<Record<string, unknown>>
  watch: UseFormWatch<Record<string, unknown>>
  setValue: UseFormSetValue<Record<string, unknown>>
  getValues: UseFormGetValues<Record<string, unknown>>
  errors?: FieldErrors<Record<string, unknown>>
  disabled?: boolean
  mode?: 'create' | 'edit' | 'detail'
  /** Valores do form calculados no CrudObject — fonte única de verdade para expressões */
  formValues?: Record<string, unknown>
}

export function FieldRenderer({ component: comp, register, control, setValue, watch: _watch, getValues: _getValues, errors, disabled, mode = 'create', formValues: formValuesProp }: FieldRendererProps) {
  const { initialParams = {} } = useViewContext()
  const watchedValues = useWatch({ control }) as Record<string, unknown>
  // Usa formValues do CrudObject (prop) quando disponível — garante sincronização única
  const formValues = formValuesProp ?? { ...initialParams, ...watchedValues }

  const fieldName = comp.nameForm ?? comp.name

  const visibleByMode = comp.visibleOn ? comp.visibleOn.includes(mode) : true
  const visibleByExpr = comp.visible ? evalExpr(comp.visible, formValues) !== false : true
  const isVisible = !comp.hidden && visibleByMode && !!visibleByExpr

  const disabledByProp = typeof comp.disabled === 'boolean'
    ? comp.disabled
    : typeof comp.disabled === 'string'
      ? !!evalExpr(comp.disabled, formValues)
      : false
  const isDisabled = disabled || disabledByProp || !!comp.disabledOn?.includes(mode)

  const rawLabel = comp.label ?? comp.name
  const label = rawLabel?.includes('{{') ? String(evalExpr(rawLabel, formValues) ?? rawLabel) : rawLabel

  const fieldError = errors?.[fieldName]
  const errorMessage = fieldError?.message as string | undefined

  const registerOpts: RegisterOptions<Record<string, unknown>> = {
    required: comp.required ? `${label} é obrigatório` : false,
  }

  // Hidden: sem espaço no grid
  if (comp.type === 'hidden') {
    return <input type="hidden" {...register(fieldName)} />
  }

  if (comp.type === 'generalActions') return null

  // Invisível: retorna null sem o wrapper — elimina o espaço no grid
  if (!isVisible) return null

  const colClass = resolveColClass(comp.class)

  const inputClass = [
    'w-full rounded-md border bg-background px-3 py-2 text-sm',
    fieldError ? 'border-destructive focus:ring-destructive' : 'border-input focus:ring-ring',
    'placeholder:text-muted-foreground focus:outline-none focus:ring-2',
    isDisabled ? 'opacity-50 cursor-not-allowed' : '',
  ].join(' ')

  // Wrapper do grid + label + erro para tipos simples
  function wrapField(children: React.ReactNode) {
    return (
      <div className={colClass}>
        <div className="space-y-1">
          {label && (
            <label className="text-sm font-medium">
              {label}
              {comp.required && <span className="ml-0.5 text-destructive" aria-hidden>*</span>}
            </label>
          )}
          {children}
          {errorMessage && (
            <p className="text-xs text-destructive" role="alert">{errorMessage}</p>
          )}
        </div>
      </div>
    )
  }

  switch (comp.type) {
    case 'chipselect':
      return (
        <div className={colClass}>
          <ChipSelectField component={comp} control={control} setValue={setValue} disabled={isDisabled} />
        </div>
      )

    case 'groupcheckbox':
      return (
        <div className={colClass}>
          <GroupCheckboxField component={comp} control={control} setValue={setValue} disabled={isDisabled} />
        </div>
      )

    case 'linkpanel':
      return (
        <div className={colClass}>
          <LinkPanelField component={comp} />
        </div>
      )

    case 'autocomplete':
      return (
        <div className={colClass}>
          <AutocompleteField component={comp} control={control} setValue={setValue} disabled={isDisabled} />
        </div>
      )

    case 'select':
      return (
        <div className={colClass}>
          <SelectField component={comp} control={control} setValue={setValue} disabled={isDisabled} inputClass={inputClass} error={errorMessage} formValues={formValues} />
        </div>
      )

    case 'cpfCnpj':
      return (
        <div className={colClass}>
          <CpfCnpjField component={comp} control={control} setValue={setValue}
            disabled={isDisabled} inputClass={inputClass} error={errorMessage} />
        </div>
      )

    case 'phoneNumber':
      return (
        <div className={colClass}>
          <PhoneNumberField component={comp} control={control} setValue={setValue}
            disabled={isDisabled} inputClass={inputClass} error={errorMessage} />
        </div>
      )

    case 'email':
      return (
        <div className={colClass}>
          <EmailField component={comp} control={control} setValue={setValue}
            disabled={isDisabled} inputClass={inputClass} error={errorMessage} />
        </div>
      )

    case 'text':
    case 'mask':
      return wrapField(
        <input type="text" placeholder={comp.placeholder ?? ''} maxLength={comp.maxLength ?? undefined}
          disabled={isDisabled} className={inputClass} {...register(fieldName, registerOpts)} />
      )

    case 'number':
      return (
        <div className={colClass}>
          <NumberField component={comp} control={control} fieldType="number"
            disabled={isDisabled} inputClass={inputClass} error={errorMessage} />
        </div>
      )

    case 'decimal':
      return (
        <div className={colClass}>
          <NumberField component={comp} control={control} fieldType="decimal"
            disabled={isDisabled} inputClass={inputClass} error={errorMessage} />
        </div>
      )

    case 'currency':
      return (
        <div className={colClass}>
          <NumberField component={comp} control={control} fieldType="currency"
            disabled={isDisabled} inputClass={inputClass} error={errorMessage} />
        </div>
      )

    case 'date':
      return (
        <div className={colClass}>
          <DateField
            component={comp}
            control={control}
            setValue={setValue}
            disabled={isDisabled}
            inputClass={inputClass}
            error={errorMessage}
            mode={mode}
          />
        </div>
      )

    case 'textarea':
      return wrapField(
        <textarea rows={comp.rows ?? 3} placeholder={comp.placeholder ?? ''} disabled={isDisabled}
          className={inputClass} {...register(fieldName, registerOpts)} />
      )

    case 'switch':
    case 'checkbox':
      return (
        <div className={colClass}>
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <input type="checkbox" id={fieldName} disabled={isDisabled}
                className="h-4 w-4 rounded border-input" {...register(fieldName, registerOpts)} />
              {label && (
                <label htmlFor={fieldName} className="text-sm font-medium">
                  {label}
                  {comp.required && <span className="ml-0.5 text-destructive" aria-hidden>*</span>}
                </label>
              )}
            </div>
            {errorMessage && <p className="text-xs text-destructive" role="alert">{errorMessage}</p>}
          </div>
        </div>
      )

    case 'label':
    case 'title':
      return (
        <div className={colClass}>
          <div style={comp.labelStyle as React.CSSProperties}>
            <span className="text-sm font-semibold">{label}</span>
          </div>
        </div>
      )

    case 'template':
      return (
        <div className={colClass}>
          <TemplateField component={comp} control={control} />
        </div>
      )

    case 'html':
      return (
        <div className={colClass}>
          <div className="text-sm text-foreground"
            dangerouslySetInnerHTML={{ __html: comp.template ?? comp.defaultValue as string ?? '' }} />
        </div>
      )

    default:
      return wrapField(
        <input type="text" placeholder={comp.placeholder ?? ''} disabled={isDisabled}
          className={inputClass} {...register(fieldName, registerOpts)} />
      )
  }
}

// ─── ChipSelectField ──────────────────────────────────────────────────────────
// Cada opção tem seu próprio nameForm (campo booleano no form).
// Alterna entre checkedValue ("Sim") e uncheckedValue ("Não") ao clicar.

interface ChipSelectFieldProps {
  component: ComponentDefinition
  control: Control<Record<string, unknown>>
  setValue: UseFormSetValue<Record<string, unknown>>
  disabled?: boolean
}

function ChipSelectField({ component: comp, control, setValue, disabled }: ChipSelectFieldProps) {
  const allValues = useWatch({ control }) as Record<string, unknown>
  const checkedValue   = comp.checkedValue   ?? 'Sim'
  const uncheckedValue = comp.uncheckedValue ?? 'Não'
  const label = comp.label ?? comp.name

  return (
    <div className="space-y-1.5">
      {label && <label className="text-sm font-medium">{label}</label>}
      <div className="flex flex-wrap gap-2">
        {(comp.options ?? []).map((opt, i) => {
          const fieldName = opt.nameForm ?? opt.value
          const isChecked = allValues[fieldName] === checkedValue

          return (
            <button
              key={i}
              type="button"
              disabled={disabled}
              onClick={() =>
                setValue(fieldName, isChecked ? uncheckedValue : checkedValue, { shouldDirty: true })
              }
              className={[
                'px-3 py-1 rounded-full text-xs font-medium border transition-colors',
                isChecked
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-background text-muted-foreground border-border hover:border-muted-foreground',
                disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer',
              ].join(' ')}
            >
              {opt.text}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ─── LinkPanelField ────────────────────────────────────────────────────────────
// Card clicável que navega para uma tela interna.
// Campos usados: name (título), description, icon, iconColor, iconBg, url, params.

function LinkPanelField({ component: comp }: { component: ComponentDefinition }) {
  const navigate = useNavigate()

  function handleClick() {
    if (!comp.url) return
    const params = comp.params as Record<string, unknown> | null | undefined
    navigate(`/home/${comp.url}`, params ? { state: { searchParams: params } } : undefined)
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className="w-full rounded-xl border border-border bg-card p-4 text-left shadow-sm transition-all hover:shadow-md hover:border-primary/40 hover:-translate-y-0.5 active:translate-y-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="flex items-start gap-4">
        {/* Ícone */}
        {comp.icon && (
          <div
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg"
            style={{ backgroundColor: comp.iconBg ?? '#f0f0f0' }}
          >
            <i
              className={`${comp.icon} text-xl`}
              style={{ color: comp.iconColor ?? '#333' }}
            />
          </div>
        )}

        {/* Texto */}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">{comp.name}</p>
          {comp.description && (
            <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">{comp.description}</p>
          )}
        </div>

        {/* Seta */}
        <i className="bi bi-chevron-right shrink-0 text-xs text-muted-foreground mt-0.5" />
      </div>
    </button>
  )
}

// ─── GroupCheckboxField ────────────────────────────────────────────────────────
// Usado em FilterObject. Cada opção tem seu próprio nameForm.
// singleSelect=true → comportamento radio (deseleciona as demais ao selecionar).
// columns → número de colunas no grid (default: 4).

function GroupCheckboxField({ component: comp, control, setValue, disabled }: ChipSelectFieldProps) {
  const allValues   = useWatch({ control }) as Record<string, unknown>
  const checkedValue   = comp.checkedValue   ?? 'Sim'
  const uncheckedValue = comp.uncheckedValue ?? ''
  const singleSelect   = comp.singleSelect   ?? false
  const cols           = comp.columns        ?? 4
  const label          = comp.label          ?? comp.name

  function handleClick(clickedNameForm: string) {
    if (singleSelect) {
      // Comportamento radio: desseleciona todas, seleciona a clicada
      for (const opt of comp.options ?? []) {
        const fn = opt.nameForm ?? opt.value
        const current = allValues[fn]
        const isClicked = fn === clickedNameForm
        if (isClicked) {
          // toggle: se já está marcada, desmarca
          setValue(fn, current === checkedValue ? uncheckedValue : checkedValue, { shouldDirty: true })
        } else {
          setValue(fn, uncheckedValue, { shouldDirty: true })
        }
      }
    } else {
      const current = allValues[clickedNameForm]
      setValue(clickedNameForm, current === checkedValue ? uncheckedValue : checkedValue, { shouldDirty: true })
    }
  }

  return (
    <div className="space-y-1.5">
      {label && <label className="text-sm font-medium">{label}</label>}
      <div
        className="grid gap-2"
        style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
      >
        {(comp.options ?? []).map((opt, i) => {
          const fieldName = opt.nameForm ?? opt.value
          const isChecked = allValues[fieldName] === checkedValue

          return (
            <button
              key={i}
              type="button"
              disabled={disabled}
              onClick={() => handleClick(fieldName)}
              className={[
                'flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm transition-colors',
                isChecked
                  ? 'border-primary bg-primary/10 text-primary font-medium'
                  : 'border-border bg-background text-muted-foreground hover:border-muted-foreground hover:text-foreground',
                disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer',
              ].join(' ')}
            >
              <span
                className={[
                  'h-4 w-4 shrink-0 rounded-sm border flex items-center justify-center',
                  isChecked ? 'border-primary bg-primary' : 'border-input',
                ].join(' ')}
              >
                {isChecked && <i className="bi bi-check text-primary-foreground text-xs" />}
              </span>
              {opt.text}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ─── TemplateField ─────────────────────────────────────────────────────────────

function TemplateField({ component: comp, control }: { component: ComponentDefinition; control: Control<Record<string, unknown>> }) {
  const values = useWatch({ control }) as Record<string, unknown>
  const template = comp.template ?? ''
  const rendered = template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    const val = values[key]
    return val !== null && val !== undefined ? String(val) : ''
  })
  const label = comp.label ?? comp.name
  return (
    <div className="space-y-1">
      {label && <label className="text-sm font-medium">{label}</label>}
      <div className="text-sm text-foreground" dangerouslySetInnerHTML={{ __html: rendered }} />
    </div>
  )
}
