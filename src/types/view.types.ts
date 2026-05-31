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
  params?: Record<string, unknown>
  orderBy?: string
  url?: string
  data?: unknown
  pagination?: {
    pageNumber: number
    pageSize: number
    totalPages: number | null
    totalElements: number | null
  }
}

/** Estrutura bruta retornada pela API antes de normalização */
export interface RawViewResponse {
  name: string
  view: {
    objects?: Omit<ObjectDefinition, 'components'>[]
    components?: ComponentDefinition[]
    entities?: EntityNode[]
    connections?: Connection[]
    navbars?: any[]
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

export interface NavbarTab {
  id: string
  label?: string
  objects: string[]
  visible?: string
}

export interface Navbar {
  id: string
  label?: string
  icon?: string
  class?: string
  style?: Record<string, string>
  tabs: NavbarTab[]
}

// ─── Object Definition ────────────────────────────────────────────────────────

export type ObjectType = 'crud' | 'table' | 'filter' | 'panel' | 'calendar' | 'bulkEditTable' | 'wizard' | 'chart' | 'grid'
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
  dynamic?: boolean
  hideButtons?: boolean
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
  addRowButton?: boolean | { label?: string; icon?: string; variant?: string; defaults?: Record<string, unknown> }
  collapsible?: boolean
  collapsedByDefault?: boolean
  totalise?: boolean
  statusColors?: Record<string, string>
  objectList?: string[]
  selectAllDefault?: boolean
  filterButtonName?: string
  filterButtonIcon?: string | false
  createObject?: string
  createButtonIcon?: string | false
  createButtonVariant?: string
  clearFilter?: boolean
  collapsibleVariant?: string
  collapsibleIcon?: string
  pageSizes?: number[]
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
  // Grid
  gap?: number
  columns?: { xs?: number; sm?: number; md?: number; lg?: number }
  itemStyle?: Record<string, string>
  components: ComponentDefinition[]
}

export interface HookAction {
  type: 'script' | 'js'
  name: string
}

export interface SubmitAction {
  action: 'executeScript' | 'updateConnections' | 'showObject' | 'closeObject' | 'saveMany' | 'reload'
  script?: string
  scriptId?: string
  object?: string
  objectAction?: string
  reloadParent?: boolean
  /** saveMany: entidade alvo (opcional — usa a do objeto se omitido) */
  entity?: string
  /** saveMany: campo que identifica se é create (null/0) ou update */
  primaryKey?: string
}

export interface CrudAction {
  name: string
  action: string
  icon?: string
  variant?: string
  size?: string
  visibleOn?: string[]
  visible?: string | boolean
  tooltip?: string
  reloadAfterAction?: boolean
  params?: Record<string, string>
  confirmation?: string
  // action: "executeScript"
  script?: string
  scriptId?: string
  // action: "api"
  method?: string
  url?: string
  data?: Record<string, string>
  // action: "showObject" / "closeObject"
  object?: string
  objectAction?: string
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
  | 'html' | 'hidden' | 'generalActions' | 'currency' | 'chipselect' | 'groupcheckbox' | 'linkpanel'
  | 'actions'

export interface ComponentDefinition {
  idComponent: number
  idObject?: string
  idTab?: string
  type: ComponentType
  name: string       // campo da entidade (dado)
  title?: string     // cabeçalho da coluna (tabela)
  nameForm?: string
  label?: string
  description?: string
  placeholder?: string
  icon?: string
  required?: boolean
  variant?: string
  editable?: boolean
  disabled?: boolean
  disabledOn?: string[]
  disabledRule?: string
  enabledOn?: string[]
  visibleOn?: string[]
  visible?: string
  hidden?: boolean
  class?: string
  className?: string  // alias Bootstrap legado (BulkEditTable usa className em vez de class)
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

  // Select / ChipSelect
  options?: Array<{ text: string; value: string; nameForm?: string }>
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
  /** Mapeamento de campos do retorno do CEP para campos do form (type: cep) */
  cepFields?: Record<string, string>
  lockupFields?: string[]
  loadOnFocus?: boolean
  autoSelectFirst?: boolean
  contextParams?: Record<string, unknown>
  /** Campo que contém o caminho hierárquico separado por ||| (ex: "path_string") */
  pathField?: string
  /** Campo que contém o nível de profundidade para indentação visual (ex: "nivel") */
  levelField?: string
  /** Separador do pathField — padrão: "|||" */
  pathSeparator?: string

  // Switch/Checkbox/ChipSelect/GroupCheckbox
  checkedValue?: string
  uncheckedValue?: string
  /** GroupCheckbox: seleção exclusiva (radio) */
  singleSelect?: boolean
  /** GroupCheckbox: número de colunas no grid */
  columns?: number

  // Textarea
  rows?: number | null
  /** Impede quebra de linha no textarea (bloqueia Enter e limpa \n no onChange/paste) */
  noLineBreak?: boolean

  // Label/Title / BulkEditTable
  labelStyle?: Record<string, string>
  titleStyle?: Record<string, string>   // alias usado no BulkEditTable (col header label)
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

  // Link/Button/LinkPanel
  link?: string
  iconColor?: string
  iconBg?: string
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
  title?: string        // label do botão (generalActions usa title)
  name?: string         // alias legacy de title
  icon?: string         // classe Bootstrap Icons, ex: "bi bi-plus-circle"
  variant?: string      // primary | danger | success | warning | secondary | outline-*
  style?: Record<string, string>  // CSS inline no botão
  tooltip?: string
  confirmation?: string
  type?: string         // para export: "PDF" | "CSV"
  url?: string          // para navigate: rota destino
  entities?: string[]   // entidades relacionadas (export/navigate)
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
