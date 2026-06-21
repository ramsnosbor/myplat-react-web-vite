// ─── Definição de View (JSON de tela) ───────────────────────────────────────

export interface ViewDefinition {
  entities: EntityNode[]
  connections: Connection[]
  navbars: Navbar[]
  objects: ObjectDefinition[]
  /** Parâmetros SSO declarados na view — buscados via GET /parameters?cdParameter=name */
  parameters?: ParameterDef[]
}

export interface ParameterDef {
  /** Nome do parâmetro (cdParameter) */
  name: string
  /** Valor padrão caso o parâmetro não seja encontrado no SSO */
  default?: string
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
    parameters?: ParameterDef[]
  }
}

// ─── Connection (pai → filho) ─────────────────────────────────────────────────

export interface Connection {
  parent: string
  child: string
  /** Mapa de campo_filho → campo_pai */
  keys: Record<string, string>
  /**
   * false → conexão soft (declarada dentro do objeto, ex: modal.connections).
   * Usada apenas para invalidar queries após submit — não bloqueia filhos.
   * Omitido/true → conexão bloqueante (declarada em view.connections raiz).
   */
  blocking?: boolean
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

export type ObjectType = 'crud' | 'table' | 'filter' | 'panel' | 'calendar' | 'bulkEditTable' | 'wizard' | 'chart' | 'grid' | 'tree' | 'questionarioBuilder' | 'questionarioResponder'
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
  visible?: string | boolean
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
  // ── Tree object ──────────────────────────────────────────────────────────────
  idField?: string          // campo PK (ex: "id_conta_gerencial")
  codeField?: string        // campo do código hierárquico (ex: "cd_conta_gerencial")
  nameField?: string        // campo do nome (ex: "nome_conta_gerencial")
  parentIdField?: string    // campo FK para o pai (ex: "id_conta_gerencial_pai")
  maskParam?: string        // nome do parâmetro de sistema com a máscara (ex: "MASCARA_PLANO_GERENCIAL")
  defaultMask?: string      // máscara padrão caso o parâmetro não exista (ex: "9.99.999.9999")
  // ── Questionario objects ─────────────────────────────────────────────────────
  questionarioEntity?: string   // entidade do questionário (default: "questionario")
  perguntaEntity?: string       // entidade de perguntas (default: "questionarioPergunta")
  respostaItemEntity?: string   // entidade dos itens de resposta (default: "questionarioRespostaItem")
  /** Nome do parâmetro de sistema com o ID (único) ou lista "1,2,3" do questionário */
  idQuestionarioParam?: string
  /** ID fixo de um único questionário — vai direto, sem picker */
  idQuestionario?: number
  /** IDs fixos de múltiplos questionários — abre picker restrito a esses IDs */
  idQuestionarios?: number[] | string
  entidadeRef?: string          // nome da entidade vinculada à resposta (ex: "residente")
  idRefParam?: string           // initialParam ou screenParam com o ID da entidade vinculada
  /** View/entidade a consultar para preenchimento automático de perguntas com nm_campo_auto.
   *  Se não informado, usa "vw_" + entidadeRef (ex: entidadeRef="residente" → "vw_residente") */
  entidadeRefView?: string
  /** Nome do relatório Jasper para exportar a resposta como PDF (ex: "questionarioResposta") */
  reportName?: string
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
  // Childs: renderiza objetos filhos embutidos abaixo deste objeto
  childs?: string[]
  childLayout?: 'vertical' | 'horizontal' | 'grid'
  components: ComponentDefinition[]
}

export interface HookAction {
  type: 'script' | 'js'
  /** Nome do script — aceita "name", "scriptId" ou "script" (compatibilidade com diferentes formatos do JSON) */
  name?: string
  scriptId?: string
  script?: string
  /** Params estáticos enviados como customParams ao script (suporta {{campo}} resolvido contra screenParams + form) */
  params?: Record<string, string>
  /** Entidades adicionais a invalidar no TanStack Query após o hook executar com sucesso */
  affectedEntities?: string[]
  reloadAfterAction?: boolean
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
  params?: Record<string, unknown>
}

export interface CrudAction {
  name?: string
  title?: string
  action: string
  icon?: string
  variant?: string
  accept?: string
  size?: string
  visibleOn?: string[]
  visible?: string | boolean
  tooltip?: string
  reloadAfterAction?: boolean
  /** Entidades adicionais a invalidar após sucesso (complementa result.affectedEntities do script) */
  affectedEntities?: string[]
  /** Entidades cujo cache deve ser removido antes de navegar (garante fetch limpo na tela de destino) */
  reloadEntities?: string[]
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
  // monitor: polling de status após execução bem-sucedida
  monitor?: {
    entity: string
    idField: string
    statusField: string
    successStatus: number[]
    errorStatus: number[]
    label: string
  }
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
  | 'chart' | 'pivot' | 'kanban' | 'monaco' | 'cep' | 'cpfCnpj' | 'phoneNumber' | 'email' | 'link' | 'button'
  | 'html' | 'hidden' | 'generalActions' | 'currency' | 'chipselect' | 'groupcheckbox' | 'linkpanel'
  | 'password' | 'fileupload'
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
  /** Largura da coluna na tabela. Ex: "120px", "10%", "200px" */
  width?: string
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
  /**
   * Comportamento especial ao selecionar um item.
   * type: 'insertInto' → insere texto no campo `targetField` em vez de (ou além de) salvar a FK.
   */
  behavior?: {
    type: 'insertInto'
    /** nameForm do campo alvo que receberá o texto inserido */
    targetField: string
    /** Template do texto a inserir. Use ${fieldName} para substituir por campos do item selecionado.
     *  Ex: "{{${name}}}" com item {name:"nm_campo"} → "{{nm_campo}}"  */
    insertTemplate?: string
    /** Onde inserir: 'cursor' (padrão) | 'start' | 'end' */
    insertMode?: 'cursor' | 'start' | 'end'
    /** Se true, limpa o autocomplete após inserir */
    clearAfterInsert?: boolean
  }
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
  templates?: Array<{ template: string; visible?: string; placeHolder?: string }>

  // File/Image / FileUpload
  fileName?: string
  accept?: string       // ex: ".pdf,.docx" — tipos aceitos pelo file picker
  download?: boolean    // true → exibe botão de download quando há arquivo salvo
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
  computedFrom?: string   // expressão JS com {{campo}} — avaliada em tempo real
  expression?: string     // expressão aritmética com {campo} (chave simples) — normalizado para computedFrom
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
  /** Tipos aceitos pelo seletor de arquivo em action="uploadNavigate". */
  accept?: string
  entities?: string[]   // entidades relacionadas (export/navigate)
  /** Entidades a invalidar após executeScript com sucesso (complementa result.affectedEntities do script) */
  affectedEntities?: string[]
  /** Entidades cujo cache deve ser removido antes de navegar (garante fetch limpo na tela de destino) */
  reloadEntities?: string[]
  /** Recarrega a entidade atual do objeto após executeScript com sucesso */
  reloadAfterAction?: boolean
  /** Params estáticos enviados como customParams ao script (suporta {{campo}} resolvido contra screenParams + initialParams) */
  customParams?: Record<string, string>
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
