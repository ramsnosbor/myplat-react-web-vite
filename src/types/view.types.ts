// ─── Definição de View (JSON de tela) ───────────────────────────────────────

export interface ViewDefinition {
  entities: EntityNode[]
  connections: Connection[]
  navbars: Navbar[]
  objects: ObjectDefinition[]
}

// ─── Entity Node ─────────────────────────────────────────────────────────────

export interface EntityNode {
  id: string
  entity: string
  params: Record<string, unknown>
  orderBy?: string
  pagination?: {
    pageNumber: number
    pageSize: number
    totalPages: number | null
    totalElements: number | null
  }
}

// ─── Connection (pai → filho) ─────────────────────────────────────────────────

export interface Connection {
  parent: string
  child: string
  /** Mapa de campo_filho → campo_pai */
  keys: Record<string, string>
  params?: {
    searchParams?: Record<string, unknown>
    action?: string
  }
  resetOnParentUpdate?: boolean
}

// ─── Navbar ───────────────────────────────────────────────────────────────────

export interface Navbar {
  id: string
  label: string
  icon?: string
  objects: string[]
}

// ─── Object Definition ────────────────────────────────────────────────────────

export type ObjectType = 'crud' | 'table' | 'filter' | 'panel' | 'calendar' | 'bulkEditTable' | 'wizard'
export type ObjectMode = 'create' | 'edit' | 'detail' | ''
export type ObjectVariant = 'modal' | 'page' | 'inline' | ''

export interface ObjectDefinition {
  id: string
  type: ObjectType
  entity: string
  title?: string
  description?: string
  scope?: string | null
  security?: string | null
  class?: string
  style?: Record<string, string>
  hidden?: boolean
  primaryKey?: string
  defaultView?: string
  afterSubmit?: string
  afterCreate?: HookAction[]
  afterUpdate?: HookAction[]
  beforeUpdate?: HookAction[]
  afterSubmitActions?: SubmitAction[]
  submitActions?: SubmitAction[]
  showBackButton?: boolean
  showSaveButtons?: boolean
  showSubmitButton?: boolean
  showCreateButton?: boolean
  showHeader?: boolean
  showFooter?: boolean
  showEmptyState?: boolean
  backButtonName?: string
  createButtonName?: string
  createButtonText?: string
  updateButtonName?: string
  submitLabel?: string
  createUrl?: string
  createScope?: string
  newFormShowPopup?: boolean
  addNew?: boolean
  keepOpen?: boolean
  insertMode?: string
  insertTemplate?: string
  clearAfterInsert?: boolean
  reloadAfterAction?: boolean
  reloadParent?: boolean
  saveEntity?: string
  fullscreen?: boolean
  mode?: ObjectMode
  variant?: ObjectVariant
  size?: string
  centered?: boolean
  filterObjectId?: string
  navigateTo?: string
  asyncProcess?: boolean
  idProcess?: string
  defaults?: Record<string, unknown>
  lockupFields?: Record<string, string>
  inputs?: Record<string, string>
  outputs?: Record<string, string>
  crudActionsPosition?: string
  crudActions?: CrudAction[]
  orderBy?: string
  pagination?: { pageSize: number; pageSizes: number[] }
  selectable?: boolean
  singleSelect?: boolean
  editable?: boolean
  deleteShow?: boolean
  emptyState?: string
  addRowButton?: boolean
  collapsible?: boolean
  collapsedByDefault?: boolean
  totalise?: boolean
  statusColors?: Record<string, string>
  objectList?: string[]
  selectAllDefault?: boolean
  filterButtonName?: string
  initialSubmit?: boolean
  panelBodyStyle?: Record<string, string>
  panelCardStyle?: Record<string, string>
  panelColClass?: string
  panelShowLabel?: boolean
  popoverFields?: PopoverField[]
  startField?: string
  endField?: string
  startDate?: string
  endDate?: string
  titleField?: string
  dateParam?: string
  timeIntervals?: number
  hourStart?: string
  hourEnd?: string
  month?: boolean
  tabs?: Tab[]
  steps?: Step[]
  components: ComponentDefinition[]
}

export interface HookAction {
  type: 'script' | 'js'
  name: string
}

export interface SubmitAction {
  action: 'executeScript' | 'updateConnections' | 'showObject' | 'closeObject'
  script?: string
  object?: string
  objectAction?: string
  reloadParent?: boolean
}

export interface CrudAction {
  name: string
  action: string
  icon?: string
  variant?: string
  size?: string
  visibleOn?: string[]
  visible?: string
  tooltip?: string
  reloadAfterAction?: boolean
  params?: Record<string, string>
  confirmation?: string
}

export interface PopoverField {
  label: string
  field: string
  icon?: string
}

export interface Tab {
  idTab: string
  label: string
  icon?: string
}

export interface Step {
  id: string
  title: string
  type: 'screen' | 'filterSelect'
  screen?: string
  objectId?: string
  filterObjectId?: string
  entity?: string
  mode?: 'auto' | 'create' | 'edit'
  inputs?: Record<string, string>
  outputs?: Record<string, string>
  scope?: Array<{ entity: string; key: string; from: string }>
}

// ─── Component Definition ─────────────────────────────────────────────────────

export type ComponentType =
  | 'text' | 'number' | 'decimal' | 'date' | 'select' | 'autocomplete'
  | 'switch' | 'checkbox' | 'textarea' | 'label' | 'title' | 'template'
  | 'file' | 'image' | 'richtext' | 'color' | 'mask' | 'range'
  | 'chart' | 'pivot' | 'kanban' | 'monaco' | 'cep' | 'link' | 'button'
  | 'html' | 'hidden'

export interface ComponentDefinition {
  idComponent: number
  idObject?: string
  idTab?: string
  type: ComponentType
  name: string
  nameForm?: string
  label?: string
  description?: string
  placeholder?: string
  required?: boolean
  disabled?: boolean
  disabledOn?: string[]
  disabledRule?: string
  enabledOn?: string[]
  visibleOn?: string[]
  visible?: string
  hidden?: boolean
  class?: string
  md?: number | null
  sm?: number | null
  xs?: number | null
  style?: Record<string, string>
  defaultValue?: unknown
  rules?: unknown
  tooltip?: string
  transient?: boolean

  // Text/Number/Decimal
  mask?: string
  maxLength?: number | null
  singleLine?: boolean
  decimal?: number | null
  decimalPlaces?: number | null
  precision?: number | null
  min?: number | null
  max?: number | null
  step?: number | null
  disableEnter?: boolean

  // Date
  range?: boolean
  rangeParam?: string
  maxDays?: number | null

  // Select
  options?: Array<{ text: string; value: string }>
  multiple?: boolean
  clearable?: boolean
  dataOptions?: string

  // Autocomplete
  entity?: string
  entitySource?: string
  nameFormAutoComplete?: string
  labelField?: string
  valueField?: string
  params?: {
    key?: string
    sourceKey?: string
    filters?: Array<{ field: string; value: string }>
    resetOnParentUpdate?: boolean
  }
  fields?: Array<{ field: string; as: string }>
  lockupFields?: string[]
  loadOnFocus?: boolean
  autoSelectFirst?: boolean
  contextParams?: Record<string, unknown>

  // Switch/Checkbox
  checkedValue?: string
  uncheckedValue?: string

  // Textarea
  rows?: number | null

  // Label/Title
  labelStyle?: Record<string, string>
  valueStyle?: Record<string, string>

  // Template
  template?: string
  templates?: Array<{ template: string }>

  // File/Image
  fileName?: string
  nomeArquivo?: string
  nomeProcesso?: string
  docType?: string

  // Chart
  XAxis?: string
  YAxis?: string
  absoluteValues?: boolean
  innerRadius?: number | null
  outerRadius?: number | null
  lineStyle?: string
  dimension?: string
  symbol?: string
  cx?: string
  cy?: string

  // Link/Button
  link?: string
  url?: string
  method?: string
  target?: string
  navigateTo?: string

  // Computed
  computedFrom?: string
  computedName?: string

  // Display
  source?: string
  dynamic?: boolean
  showLabel?: boolean
  showValue?: boolean

  // Actions (usado em type=table como column)
  actions?: ComponentAction[]
}

export interface ComponentAction {
  action: string
  name?: string
  icon?: string
  variant?: string
  tooltip?: string
  confirmation?: string
  visibleOn?: string[]
  visible?: string
  keyboardShortcut?: string
  executeBefore?: boolean
  params?: Array<{ key: string; sourceKey?: string; entity?: string; field?: string }>
  deleteCascade?: Array<{ entity: string; params: Array<{ key: string; sourceKey: string }> }>
  script?: string
  scriptId?: string
  object?: string
  objectAction?: string
  scope?: Array<{ entity: string; key: string; from: string }>
  actionParams?: {
    reportName?: string
    docType?: string
    fileName?: string
    month?: string
    filters?: Record<string, string>
  }
  searchParams?: Record<string, unknown>
}
