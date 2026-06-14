import { useState, useMemo, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { entityApi } from '@/api/entity.api'
import type { EntityRecord } from '@/types/entity.types'
import type { ObjectDefinition } from '@/types/view.types'
import { useViewContext } from '../ViewContext'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/ui/ConfirmDialog'

// ─── Tipos internos ───────────────────────────────────────────────────────────

interface TreeNode {
  id: string | number
  codigo: string
  nome: string
  parentId: string | number | null
  children: TreeNode[]
  level: number
  raw: EntityRecord
}

type FormMode = 'idle' | 'create' | 'edit'

interface Props {
  objectDef: ObjectDefinition
}

// ─── Helpers de máscara ───────────────────────────────────────────────────────

/**
 * Parseia "9.99.999.9999" → [1, 2, 3, 4] (quantidade de dígitos por nível).
 * Cada segmento separado por ponto define quantos dígitos aquele nível suporta.
 */
function parseMask(mask: string): number[] {
  return mask.split('.').map((seg) => seg.replace(/[^9]/g, '9').length)
}

/**
 * Gera o próximo código filho disponível para um pai.
 *
 * Exemplo:
 *   parentCode="3", siblings=["3.01","3.02"], maskDigits=[1,2,3,4]
 *   → "3.03"
 *
 * Para conta raiz (sem pai):
 *   parentCode="", siblings=["1","2"], maskDigits=[1,2,3,4]
 *   → "3"
 */
function nextChildCode(
  parentCode: string,
  siblings: TreeNode[],
  maskDigits: number[],
): string {
  const parentDepth = parentCode ? parentCode.split('.').length : 0
  const childDigits = maskDigits[parentDepth]
  if (childDigits === undefined) return '' // profundidade máxima atingida

  const maxNum = siblings.reduce((max, sib) => {
    const parts = sib.codigo.split('.')
    const last = parseInt(parts[parts.length - 1] ?? '0', 10)
    return isNaN(last) ? max : Math.max(max, last)
  }, 0)

  const next = String(maxNum + 1).padStart(childDigits, '0')
  return parentCode ? `${parentCode}.${next}` : next
}

/**
 * Valida se o código respeita a máscara e a estrutura do pai.
 * Retorna string de erro ou null se válido.
 */
function validateCode(
  code: string,
  maskDigits: number[],
  parentCode: string | null,
): string | null {
  const parts = code.split('.')

  if (parts.length > maskDigits.length) {
    return `Profundidade máxima é ${maskDigits.length} nível(is).`
  }

  for (let i = 0; i < parts.length; i++) {
    const expected = maskDigits[i]
    if (expected === undefined) return `Nível ${i + 1} não existe na máscara.`
    if (!/^\d+$/.test(parts[i])) return `Nível ${i + 1} deve conter apenas dígitos.`
    if (parts[i].length !== expected) {
      return `Nível ${i + 1} deve ter exatamente ${expected} dígito(s). Ex: ${parts[i].padStart(expected, '0')}`
    }
  }

  if (parentCode) {
    const expectedPrefix = parentCode + '.'
    if (!code.startsWith(expectedPrefix)) {
      return `Código deve iniciar com "${expectedPrefix}".`
    }
    // Verifica se tem exatamente um nível a mais que o pai
    const parentParts = parentCode.split('.')
    if (parts.length !== parentParts.length + 1) {
      return `Código deve ter ${parentParts.length + 1} segmentos (pai tem ${parentParts.length}).`
    }
  } else {
    // Conta raiz — apenas 1 segmento
    if (parts.length !== 1) {
      return 'Conta raiz deve ter apenas 1 segmento (sem ponto).'
    }
  }

  return null
}

// ─── Construtor de árvore ─────────────────────────────────────────────────────

/**
 * Constrói a árvore derivando pai-filho PELO CÓDIGO, não pelo parentIdField.
 *
 * Motivo: parentIdField é sujeito a divergência de tipo (number vs string),
 * campo ausente ou FK inconsistente. O código hierárquico já carrega a estrutura:
 *   "1.01"     → parent code = "1"     (lastIndexOf('.') = 1)
 *   "1.01.001" → parent code = "1.01"
 *   "1"        → root (sem ponto)
 *
 * parentIdField continua sendo usado apenas no POST/PATCH para envio ao banco.
 */
function buildTree(
  items: EntityRecord[],
  idField: string,
  codeField: string,
  nameField: string,
): TreeNode[] {
  // Mapa código → nó (chave = código da conta)
  const codeMap = new Map<string, TreeNode>()

  for (const item of items) {
    const rawId = item[idField]
    if (rawId === null || rawId === undefined) continue
    const codigo = String(item[codeField] ?? '').trim()
    if (!codigo) continue

    codeMap.set(codigo, {
      id: rawId as string | number,
      codigo,
      nome: String(item[nameField] ?? ''),
      parentId: null, // preenchido na fase de linkagem abaixo
      children: [],
      level: 0,
      raw: item,
    })
  }

  const roots: TreeNode[] = []

  for (const node of codeMap.values()) {
    const lastDot = node.codigo.lastIndexOf('.')
    if (lastDot > 0) {
      // Tem ponto → existe um pai cujo código é tudo antes do último ponto
      const parentCode = node.codigo.slice(0, lastDot)
      const parentNode = codeMap.get(parentCode)
      if (parentNode) {
        parentNode.children.push(node)
        node.parentId = parentNode.id
      } else {
        // Pai não encontrado (gap no plano) → trata como raiz
        roots.push(node)
      }
    } else {
      // Sem ponto → conta raiz
      roots.push(node)
    }
  }

  function sortAndLevel(nodes: TreeNode[], level: number) {
    nodes.sort((a, b) => {
      const aParts = a.codigo.split('.').map(Number)
      const bParts = b.codigo.split('.').map(Number)
      for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
        const diff = (aParts[i] ?? 0) - (bParts[i] ?? 0)
        if (diff !== 0) return diff
      }
      return 0
    })
    for (const n of nodes) {
      n.level = level
      sortAndLevel(n.children, level + 1)
    }
  }
  sortAndLevel(roots, 0)

  return roots
}

/** Mapa plano id→node para lookups O(1). Chave normalizada como string. */
function flatMap(tree: TreeNode[]): Map<string, TreeNode> {
  const map = new Map<string, TreeNode>()
  function walk(nodes: TreeNode[]) {
    for (const n of nodes) { map.set(String(n.id), n); walk(n.children) }
  }
  walk(tree)
  return map
}

// ─── TreeObject ───────────────────────────────────────────────────────────────

export function TreeObject({ objectDef }: Props) {
  const { screenParams } = useViewContext()
  const queryClient = useQueryClient()
  const toast = useToast()
  const { confirm, confirmDialog } = useConfirm()

  // Campos configuráveis via JSON (com defaults para conta_gerencial)
  const def = objectDef as ObjectDefinition & Record<string, unknown>
  const idField       = String(def.idField       ?? 'id_conta_gerencial')
  const codeField     = String(def.codeField     ?? 'cd_conta_gerencial')
  const nameField     = String(def.nameField     ?? 'nome_conta_gerencial')
  const parentIdField = String(def.parentIdField ?? 'id_conta_gerencial_pai')
  const maskParam     = String(def.maskParam     ?? 'MASCARA_PLANO_GERENCIAL')
  const defaultMask   = String(def.defaultMask   ?? '9.99.999.9999')
  const entityName    = objectDef.entity ?? 'contaGerencial'
  const popoverFields = (def.popoverFields as Array<{ field: string; label: string; editable?: boolean }> | undefined) ?? []

  // Máscara vinda do parâmetro de sistema (ou default)
  const mask       = String(screenParams[maskParam] || defaultMask)
  const maskDigits = useMemo(() => parseMask(mask), [mask])

  // ── Estado da UI ────────────────────────────────────────────────────────────
  const [expandedIds,    setExpandedIds]    = useState<Set<string | number>>(new Set())
  const [selectedId,     setSelectedId]     = useState<string | number | null>(null)
  const [formMode,       setFormMode]       = useState<FormMode>('idle')
  const [formParent,     setFormParent]     = useState<TreeNode | null>(null)
  const [formCodigo,     setFormCodigo]     = useState('')
  const [formNome,       setFormNome]       = useState('')
  const [formError,      setFormError]      = useState<string | null>(null)
  const [searchText,     setSearchText]     = useState('')
  const [changingParent, setChangingParent] = useState(false)
  const [parentSearch,   setParentSearch]   = useState('')
  const [formExtraFields, setFormExtraFields] = useState<Record<string, string>>({})

  // ── Busca todos os registros (sem paginação — árvore precisa do conjunto completo) ──
  const { data: rawItems = [], isLoading } = useQuery<EntityRecord[]>({
    queryKey: ['entity', entityName, 'tree'],
    queryFn: async () => {
      const res = await entityApi.getList<EntityRecord>(entityName, { pageSize: 9999 })
      return (res as { data?: EntityRecord[] }).data ?? (Array.isArray(res) ? (res as EntityRecord[]) : [])
    },
    staleTime: 30_000,
  })

  // ── Filtra itens pelo texto de busca ─────────────────────────────────────────
  // Quando há texto: mantém os itens que batem E todos os seus ancestrais
  // (para preservar o contexto hierárquico na árvore).
  const filteredItems = useMemo(() => {
    const q = searchText.trim().toLowerCase()
    if (!q) return rawItems

    // Códigos que batem diretamente
    const matchCodes = new Set<string>()
    for (const item of rawItems) {
      const codigo = String(item[codeField] ?? '').toLowerCase()
      const nome   = String(item[nameField]  ?? '').toLowerCase()
      if (codigo.includes(q) || nome.includes(q)) {
        matchCodes.add(String(item[codeField] ?? ''))
      }
    }

    // Inclui todos os ancestrais de cada resultado para manter hierarquia visível
    const included = new Set<string>()
    for (const code of matchCodes) {
      const parts = code.split('.')
      for (let i = 1; i <= parts.length; i++) {
        included.add(parts.slice(0, i).join('.'))
      }
    }

    return rawItems.filter((item) => included.has(String(item[codeField] ?? '')))
  }, [rawItems, searchText, codeField, nameField])

  // ── Monta a árvore a partir do array filtrado ─────────────────────────────
  const tree    = useMemo(() => buildTree(filteredItems, idField, codeField, nameField), [filteredItems, idField, codeField, nameField])
  const nodeMap = useMemo(() => flatMap(tree), [tree])

  const selectedNode = selectedId !== null ? (nodeMap.get(String(selectedId)) ?? null) : null

  // Contas elegíveis como pai (exclui o nó atual e todos os seus descendentes)
  const eligibleParents = useMemo(() => {
    if (!selectedNode) return rawItems
    const excluded = new Set<string>()
    excluded.add(selectedNode.codigo)
    function collectCodes(nodes: TreeNode[]) {
      for (const n of nodes) { excluded.add(n.codigo); collectCodes(n.children) }
    }
    collectCodes(selectedNode.children)
    return rawItems.filter((item) => !excluded.has(String(item[codeField] ?? '')))
  }, [rawItems, selectedNode, codeField])

  /** Retorna todos os descendentes (filhos, netos, etc.) de um nó */
  function collectDescendants(node: TreeNode): TreeNode[] {
    const result: TreeNode[] = []
    function walk(nodes: TreeNode[]) {
      for (const n of nodes) { result.push(n); walk(n.children) }
    }
    walk(node.children)
    return result
  }

  /** Sugere o próximo código disponível sob um pai, excluindo o próprio nó (em edição) */
  function suggestCode(newParent: TreeNode | null): string {
    const siblings = rawItems
      .filter((item) => {
        const pid = item[parentIdField]
        const thisCodigo = String(item[codeField] ?? '')
        if (thisCodigo === selectedNode?.codigo) return false // exclui o próprio nó
        return newParent
          ? pid !== null && pid !== undefined && String(pid) === String(newParent.id)
          : pid === null || pid === undefined || pid === ''
      })
      .map((item) => ({ codigo: String(item[codeField] ?? '') } as TreeNode))
    return nextChildCode(newParent?.codigo ?? '', siblings, maskDigits)
  }

  /** Expande todos os nós da árvore atual */
  function expandAll() {
    const all = new Set<string | number>()
    function collect(nodes: TreeNode[]) {
      for (const n of nodes) { all.add(n.id); collect(n.children) }
    }
    collect(tree)
    setExpandedIds(all)
  }

  /** Recolhe todos os nós */
  function collapseAll() {
    setExpandedIds(new Set())
  }

  // Expande raízes automaticamente na primeira carga (sem filtro)
  useEffect(() => {
    if (tree.length > 0 && expandedIds.size === 0 && !searchText) {
      const initial = new Set<string | number>()
      for (const root of tree) {
        initial.add(root.id)
        for (const child of root.children) initial.add(child.id)
      }
      setExpandedIds(initial)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tree.length])

  // Quando filtra: expande toda a árvore para mostrar os resultados
  useEffect(() => {
    if (!searchText.trim()) return
    const all = new Set<string | number>()
    function collectAll(nodes: TreeNode[]) {
      for (const n of nodes) { all.add(n.id); collectAll(n.children) }
    }
    collectAll(tree)
    setExpandedIds(all)
  }, [searchText, tree])

  // ── Mutations ────────────────────────────────────────────────────────────────
  const saveMutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      if (formMode === 'create') {
        return entityApi.create(entityName, data)
      }

      // Salva o nó principal
      const result = await entityApi.update(entityName, { [idField]: selectedId, ...data })

      // Se o código mudou e há descendentes, atualiza todos em cascata
      const oldCode = selectedNode?.codigo ?? ''
      const newCode = String(data[codeField] ?? '')
      if (oldCode && newCode && oldCode !== newCode && selectedNode) {
        const descendants = collectDescendants(selectedNode)
        if (descendants.length > 0) {
          await Promise.all(
            descendants.map((d) => {
              // Substitui o prefixo antigo pelo novo
              const newDescCode = newCode + d.codigo.slice(oldCode.length)
              return entityApi.update(entityName, {
                [idField]:     d.id,
                [codeField]:   newDescCode,
                // parentId dos descendentes não muda (continuam ligados ao mesmo pai de sempre)
              })
            })
          )
        }
      }

      return result
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['entity', entityName, 'tree'] })
      toast.success(formMode === 'create' ? 'Conta criada com sucesso.' : 'Conta atualizada com sucesso.')
      // Seleciona o registro salvo (para edição imediata após create)
      const saved = (result as { data?: EntityRecord }).data ?? (result as unknown as EntityRecord)
      const savedId = saved?.[idField] as string | number | undefined
      if (savedId !== undefined) {
        setSelectedId(savedId)
        setFormMode('edit')
      } else {
        setFormMode('idle')
      }
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { messageError?: string; message?: string } } })
        ?.response?.data?.messageError ??
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Erro ao salvar.'
      toast.error(msg)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string | number) => entityApi.remove(entityName, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['entity', entityName, 'tree'] })
      toast.success('Conta excluída.')
      resetForm()
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { messageError?: string; message?: string } } })
        ?.response?.data?.messageError ??
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Erro ao excluir.'
      toast.error(msg)
    },
  })

  // ── Helpers de UI ─────────────────────────────────────────────────────────
  function resetForm() {
    setFormMode('idle')
    setSelectedId(null)
    setFormParent(null)
    setFormCodigo('')
    setFormNome('')
    setFormError(null)
    setChangingParent(false)
    setParentSearch('')
    setFormExtraFields({})
  }

  function toggleExpand(id: string | number, e: React.MouseEvent) {
    e.stopPropagation()
    setExpandedIds((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  /** Clicou em um nó → modo edição */
  function handleSelectNode(node: TreeNode) {
    setSelectedId(node.id)
    setFormMode('edit')
    setFormParent(node.parentId !== null ? (nodeMap.get(String(node.parentId)) ?? null) : null)
    setFormCodigo(node.codigo)
    setFormNome(node.nome)
    setFormError(null)
    // Popula campos extras editáveis com os valores atuais do nó
    const extras: Record<string, string> = {}
    for (const pf of popoverFields) {
      if (pf.editable) extras[pf.field] = String(node.raw[pf.field] ?? '')
    }
    setFormExtraFields(extras)
  }

  /** Clicou em "+ Filho" ou "Novo raiz" → modo criação */
  function handleAddChild(parent: TreeNode | null) {
    // Busca irmãos diretamente no rawItems com comparação string-safe.
    // Evita depender de parent.children da árvore, que pode estar vazio
    // se houver divergência de tipo (número vs string) entre id e parentId.
    const siblings = rawItems
      .filter((item) => {
        const pid = item[parentIdField]
        if (parent) {
          // Filhos diretos do parent: parentId == parent.id (compara como string para segurança)
          return pid !== null && pid !== undefined && String(pid) === String(parent.id)
        } else {
          // Contas raiz: sem parent id
          return pid === null || pid === undefined || pid === ''
        }
      })
      .map((item) => ({ codigo: String(item[codeField] ?? '') }) as TreeNode)

    const suggested = nextChildCode(parent?.codigo ?? '', siblings, maskDigits)
    if (!suggested) {
      toast.error(`Profundidade máxima da máscara atingida (${maskDigits.length} níveis).`)
      return
    }
    setSelectedId(null)
    setFormMode('create')
    setFormParent(parent)
    setFormCodigo(suggested)
    setFormNome('')
    setFormError(null)
    // Inicializa campos extras editáveis em branco para criação
    const extras: Record<string, string> = {}
    for (const pf of popoverFields) {
      if (pf.editable) extras[pf.field] = ''
    }
    setFormExtraFields(extras)
    // Expande o pai para mostrar onde o item vai aparecer
    if (parent) setExpandedIds((prev) => new Set([...prev, parent.id]))
  }

  async function handleDelete() {
    if (!selectedNode) return
    if (selectedNode.children.length > 0) {
      toast.error('Não é possível excluir uma conta que possui contas filhas.')
      return
    }
    if (await confirm(`Excluir a conta "${selectedNode.codigo} — ${selectedNode.nome}"?`)) {
      deleteMutation.mutate(selectedNode.id)
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)

    const code = formCodigo.trim()
    const nome = formNome.trim()

    if (!code) { setFormError('Código é obrigatório.'); return }
    if (!nome) { setFormError('Nome é obrigatório.'); return }

    // Valida máscara + posicionamento em relação ao pai
    const maskErr = validateCode(code, maskDigits, formParent?.codigo ?? null)
    if (maskErr) { setFormError(maskErr); return }

    // Valida unicidade (exclui o próprio nó em modo edição)
    const duplicate = [...nodeMap.values()].some(
      (n) => n.codigo === code && (formMode === 'create' || n.id !== selectedId),
    )
    if (duplicate) { setFormError(`Já existe uma conta com o código "${code}".`); return }

    // Conta com filhos não pode ter o código alterado:
    // os filhos dependem do prefixo do pai para a hierarquia funcionar.
    if (formMode === 'edit' && selectedNode && selectedNode.children.length > 0) {
      if (code !== selectedNode.codigo) {
        setFormError(
          `Esta conta possui ${selectedNode.children.length} sub-conta(s). ` +
          `Alterar o código quebraria a hierarquia dos filhos.`
        )
        return
      }
    }

    saveMutation.mutate({
      [codeField]:     code,
      [nameField]:     nome,
      [parentIdField]: formParent?.id ?? null,
      ...formExtraFields,
    })
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        Carregando plano de contas...
      </div>
    )
  }

  return (
    <div style={objectDef.style as React.CSSProperties}>
      {confirmDialog}

      {objectDef.title && (
        <h3 className="mb-3 text-sm font-semibold text-foreground">{objectDef.title}</h3>
      )}

      <div className="grid grid-cols-12 gap-4" style={{ minHeight: '480px' }}>

        {/* ── Painel esquerdo: árvore (full mobile, 6 cols md+) ───────────── */}
        <div className="col-span-12 md:col-span-6 flex flex-col">
          {/* Cabeçalho */}
          <div className="mb-2 flex items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground flex-1">
              {searchText.trim()
                ? `${filteredItems.length} de ${rawItems.length} conta${rawItems.length !== 1 ? 's' : ''}`
                : `${rawItems.length} conta${rawItems.length !== 1 ? 's' : ''}`}
            </span>

            {/* Expandir / Recolher tudo */}
            <button
              type="button"
              onClick={expandAll}
              title="Expandir tudo"
              className="flex items-center justify-center h-6 w-6 rounded border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <i className="bi bi-arrows-expand text-xs" />
            </button>
            <button
              type="button"
              onClick={collapseAll}
              title="Recolher tudo"
              className="flex items-center justify-center h-6 w-6 rounded border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <i className="bi bi-arrows-collapse text-xs" />
            </button>

            <button
              type="button"
              onClick={() => handleAddChild(null)}
              className="flex items-center gap-1 rounded-md bg-primary px-2 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              <i className="bi bi-plus" />
              Nova raiz
            </button>
          </div>

          {/* Campo de busca */}
          <div className="mb-2 relative">
            <i className="bi bi-search absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none" />
            <input
              type="text"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="Filtrar por código ou nome…"
              className="w-full rounded-md border border-input bg-background py-1.5 pl-7 pr-7 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
            />
            {searchText && (
              <button
                type="button"
                onClick={() => setSearchText('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                tabIndex={-1}
              >
                <i className="bi bi-x text-sm" />
              </button>
            )}
          </div>

          {/* Árvore */}
          <div className="overflow-y-auto rounded-md border border-border bg-background p-1" style={{ maxHeight: 'calc(100vh - 220px)', minHeight: '300px' }}>
            {tree.length === 0 ? (
              <div className="px-4 py-10 text-center text-sm text-muted-foreground">
                {searchText.trim() ? (
                  <>
                    <i className="bi bi-search mb-2 block text-2xl opacity-40" />
                    Nenhuma conta encontrada para<br />
                    <span className="font-medium">"{searchText}"</span>
                  </>
                ) : (
                  <>
                    <i className="bi bi-diagram-3 mb-2 block text-2xl" />
                    Nenhuma conta cadastrada.
                    <br />
                    <button
                      type="button"
                      onClick={() => handleAddChild(null)}
                      className="mt-2 text-primary underline text-xs"
                    >
                      Criar primeira conta
                    </button>
                  </>
                )}
              </div>
            ) : (
              tree.map((node) => (
                <TreeNodeRow
                  key={node.id}
                  node={node}
                  expandedIds={expandedIds}
                  selectedId={selectedId}
                  searchText={searchText.trim().toLowerCase()}
                  onToggle={toggleExpand}
                  onSelect={handleSelectNode}
                  onAddChild={handleAddChild}
                />
              ))
            )}
          </div>
        </div>

        {/* ── Painel direito: formulário (full mobile, 6 cols md+) ────────── */}
        <div className="col-span-12 md:col-span-6 min-w-0">
          <div className="md:sticky md:top-4">
          {formMode === 'idle' ? (
            <div className="flex items-center justify-center rounded-md border border-dashed border-border text-sm text-muted-foreground"
              style={{ minHeight: '340px' }}>
              <div className="text-center px-6 py-8 select-none">
                {/* Ilustração SVG — diagrama de árvore */}
                <svg
                  viewBox="0 0 160 120"
                  className="mx-auto mb-5 opacity-30"
                  style={{ width: 140, height: 105 }}
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  {/* Linhas verticais / conectores */}
                  <line x1="80" y1="22" x2="80" y2="42" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                  <line x1="80" y1="56" x2="80" y2="66" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  <line x1="80" y1="66" x2="40" y2="76" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  <line x1="80" y1="66" x2="120" y2="76" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  <line x1="40" y1="90" x2="40" y2="100" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                  <line x1="40" y1="100" x2="24" y2="108" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                  <line x1="40" y1="100" x2="56" y2="108" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />

                  {/* Nó raiz */}
                  <rect x="56" y="8" width="48" height="14" rx="4" fill="currentColor" opacity="0.7" />
                  <rect x="60" y="12" width="20" height="2.5" rx="1" fill="white" opacity="0.6" />
                  <rect x="83" y="12" width="14" height="2.5" rx="1" fill="white" opacity="0.4" />

                  {/* Nó nível 1 */}
                  <rect x="56" y="42" width="48" height="14" rx="4" fill="currentColor" opacity="0.5" />
                  <rect x="60" y="46" width="16" height="2.5" rx="1" fill="white" opacity="0.5" />
                  <rect x="79" y="46" width="18" height="2.5" rx="1" fill="white" opacity="0.35" />

                  {/* Nó nível 2 — esquerda */}
                  <rect x="18" y="76" width="44" height="14" rx="4" fill="currentColor" opacity="0.35" />
                  <rect x="22" y="80" width="13" height="2.5" rx="1" fill="white" opacity="0.5" />
                  <rect x="38" y="80" width="16" height="2.5" rx="1" fill="white" opacity="0.3" />

                  {/* Nó nível 2 — direita */}
                  <rect x="98" y="76" width="44" height="14" rx="4" fill="currentColor" opacity="0.35" />
                  <rect x="102" y="80" width="13" height="2.5" rx="1" fill="white" opacity="0.5" />
                  <rect x="118" y="80" width="17" height="2.5" rx="1" fill="white" opacity="0.3" />

                  {/* Nós nível 3 */}
                  <rect x="10" y="108" width="28" height="10" rx="3" fill="currentColor" opacity="0.2" />
                  <rect x="42" y="108" width="28" height="10" rx="3" fill="currentColor" opacity="0.2" />
                </svg>

                <p className="text-sm font-medium text-foreground/70 mb-1">
                  Nenhuma conta selecionada
                </p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Clique em uma conta na árvore para editar<br />
                  ou use <span className="font-medium">Nova raiz</span> / <span className="font-medium">+ filho</span> para criar
                </p>
              </div>
            </div>
          ) : (
            <form
              onSubmit={handleSubmit}
              className="rounded-md border border-border bg-background p-5 space-y-4"
            >
              {/* Título */}
              <div className="flex items-center gap-2">
                <i className={`bi ${formMode === 'create' ? 'bi-plus-circle text-primary' : 'bi-pencil text-muted-foreground'} text-sm`} />
                <h4 className="text-sm font-semibold text-foreground">
                  {formMode === 'create' ? 'Nova conta' : 'Editar conta'}
                </h4>
                {formMode === 'edit' && selectedNode && (
                  <span className="ml-auto text-xs text-muted-foreground font-mono">
                    #{String(selectedNode.id)}
                  </span>
                )}
              </div>

              {/* Conta pai — exibe atual com opção de trocar */}
              <div className="space-y-1">
                <label className="text-sm font-medium">Conta Pai</label>

                {changingParent ? (
                  // ── Seletor de nova conta pai ─────────────────────────────
                  <div className="rounded-md border border-primary/40 bg-background p-2 space-y-1.5">
                    <div className="relative">
                      <i className="bi bi-search absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none" />
                      <input
                        type="text"
                        autoFocus
                        value={parentSearch}
                        onChange={(e) => setParentSearch(e.target.value)}
                        placeholder="Buscar conta pai…"
                        className="w-full rounded border border-input bg-background py-1.5 pl-7 pr-3 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
                      />
                    </div>
                    {/* Opção: sem pai (raiz) */}
                    <div className="max-h-40 overflow-y-auto rounded border border-border text-xs">
                      <button
                        type="button"
                        onClick={() => {
                          setFormParent(null)
                          setChangingParent(false)
                          setParentSearch('')
                          const suggested = suggestCode(null)
                          if (suggested) setFormCodigo(suggested)
                        }}
                        className="w-full px-3 py-1.5 text-left hover:bg-muted transition-colors text-muted-foreground italic"
                      >
                        Sem pai (conta raiz)
                      </button>
                      {eligibleParents
                        .filter((item) => {
                          const q = parentSearch.toLowerCase()
                          return !q
                            || String(item[codeField] ?? '').toLowerCase().includes(q)
                            || String(item[nameField] ?? '').toLowerCase().includes(q)
                        })
                        .map((item, i) => {
                          const codigo = String(item[codeField] ?? '')
                          const nome   = String(item[nameField] ?? '')
                          return (
                            <button
                              key={i}
                              type="button"
                              onClick={() => {
                                const newParentNode = nodeMap.get(String(item[idField])) ?? null
                                setFormParent(newParentNode)
                                setChangingParent(false)
                                setParentSearch('')
                                const suggested = suggestCode(newParentNode)
                                if (suggested) setFormCodigo(suggested)
                              }}
                              className="w-full px-3 py-1.5 text-left hover:bg-muted transition-colors border-t border-border/40"
                            >
                              <span className="font-mono text-muted-foreground">{codigo}</span>
                              {' '}{nome}
                            </button>
                          )
                        })
                      }
                    </div>
                    <button
                      type="button"
                      onClick={() => { setChangingParent(false); setParentSearch('') }}
                      className="text-xs text-muted-foreground hover:text-foreground"
                    >
                      Cancelar
                    </button>
                  </div>
                ) : (
                  // ── Exibição da conta pai atual ───────────────────────────
                  <div className="flex items-center gap-2 rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
                    <span className="flex-1">
                      {formParent
                        ? <><span className="font-mono font-medium">{formParent.codigo}</span> — {formParent.nome}</>
                        : <span className="italic">Conta raiz (sem pai)</span>
                      }
                    </span>
                    {formMode === 'edit' && (
                      <button
                        type="button"
                        onClick={() => { setChangingParent(true); setParentSearch('') }}
                        className="shrink-0 text-primary hover:underline font-medium"
                      >
                        Alterar
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Indicação da máscara */}
              <div className="text-xs text-muted-foreground">
                Máscara: <code className="font-mono rounded bg-muted px-1">{mask}</code>
                {' — '}
                Nível {(formParent?.codigo.split('.').length ?? 0) + 1} de {maskDigits.length}
              </div>

              {/* Campo: Código — bloqueado quando a conta tem filhos */}
              {(() => {
                const hasChildren = formMode === 'edit' && (selectedNode?.children.length ?? 0) > 0
                return (
                  <div className="space-y-1">
                    <label className="text-sm font-medium flex items-center gap-1.5">
                      Código <span className="text-destructive">*</span>
                      {hasChildren && (
                        <span className="text-xs font-normal text-muted-foreground">
                          (bloqueado — conta possui filhos)
                        </span>
                      )}
                    </label>
                    <input
                      type="text"
                      value={formCodigo}
                      onChange={(e) => !hasChildren && setFormCodigo(e.target.value)}
                      readOnly={hasChildren}
                      placeholder={formParent ? `${formParent.codigo}.${'0'.repeat(maskDigits[formParent.codigo.split('.').length] ?? 2)}` : ''}
                      className={[
                        'w-full rounded-md border px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring',
                        hasChildren
                          ? 'border-input bg-muted text-muted-foreground cursor-not-allowed opacity-70'
                          : 'border-input bg-background',
                      ].join(' ')}
                    />
                  </div>
                )
              })()}

              {/* Campo: Nome */}
              <div className="space-y-1">
                <label className="text-sm font-medium">
                  Nome <span className="text-destructive">*</span>
                </label>
                <input
                  type="text"
                  value={formNome}
                  onChange={(e) => setFormNome(e.target.value)}
                  placeholder="Descrição da conta"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  autoFocus={formMode === 'create'}
                />
              </div>

              {/* Campos extras configurados via popoverFields no JSON */}
              {popoverFields.length > 0 && (
                <>
                  {popoverFields.map(({ field, label, editable }) =>
                    editable ? (
                      /* Campo editável — aparece em create e edit */
                      <div key={field} className="space-y-1">
                        <label className="text-sm font-medium">{label}</label>
                        <input
                          type="text"
                          value={formExtraFields[field] ?? ''}
                          onChange={(e) =>
                            setFormExtraFields((prev) => ({ ...prev, [field]: e.target.value }))
                          }
                          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                        />
                      </div>
                    ) : (
                      /* Campo somente leitura — aparece apenas em edit */
                      formMode === 'edit' && selectedNode ? (
                        <div key={field} className="text-xs text-muted-foreground">
                          <span className="font-medium">{label}:</span>{' '}
                          <code className="font-mono rounded bg-muted px-1">
                            {String(selectedNode.raw[field] ?? '—')}
                          </code>
                        </div>
                      ) : null
                    )
                  )}
                </>
              )}

              {/* Aviso de cascata: quando código muda e há descendentes */}
              {formMode === 'edit' && selectedNode && formCodigo !== selectedNode.codigo && selectedNode.children.length > 0 && (
                <div className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
                  <i className="bi bi-exclamation-triangle mr-1" />
                  {collectDescendants(selectedNode).length} sub-conta(s) terão seus códigos atualizados automaticamente.
                </div>
              )}

              {/* Erro de validação */}
              {formError && (
                <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
                  <i className="bi bi-exclamation-triangle mr-1" />
                  {formError}
                </p>
              )}

              {/* Botões */}
              <div className="flex flex-wrap gap-2 pt-1 border-t border-border">
                <button
                  type="submit"
                  disabled={saveMutation.isPending}
                  className="rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors cursor-pointer"
                >
                  {saveMutation.isPending ? 'Salvando...' : 'Salvar'}
                </button>

                <button
                  type="button"
                  onClick={resetForm}
                  className="rounded-md border border-border px-4 py-1.5 text-sm text-muted-foreground hover:bg-accent transition-colors cursor-pointer"
                >
                  Cancelar
                </button>

                {formMode === 'edit' && selectedNode && (
                  <>
                    <button
                      type="button"
                      onClick={() => handleAddChild(selectedNode)}
                      className="rounded-md border border-primary px-4 py-1.5 text-sm text-primary hover:bg-primary/10 transition-colors cursor-pointer"
                    >
                      <i className="bi bi-plus-circle mr-1" />
                      Novo filho
                    </button>

                    <button
                      type="button"
                      onClick={handleDelete}
                      disabled={deleteMutation.isPending || selectedNode.children.length > 0}
                      title={selectedNode.children.length > 0 ? 'Remova os filhos antes de excluir' : 'Excluir esta conta'}
                      className="ml-auto rounded-md bg-destructive px-4 py-1.5 text-sm font-medium text-destructive-foreground hover:bg-destructive/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
                    >
                      {deleteMutation.isPending ? 'Excluindo...' : 'Excluir'}
                    </button>
                  </>
                )}
              </div>
            </form>
          )}
          </div>{/* fim sticky */}
        </div>
      </div>
    </div>
  )
}

// ─── TreeNodeRow ──────────────────────────────────────────────────────────────

interface TreeNodeRowProps {
  node: TreeNode
  expandedIds: Set<string | number>
  selectedId: string | number | null
  searchText: string
  onToggle: (id: string | number, e: React.MouseEvent) => void
  onSelect: (node: TreeNode) => void
  onAddChild: (node: TreeNode) => void
}

/** Destaca as ocorrências de `q` dentro de `text` com fundo amarelo. */
function Highlight({ text, q }: { text: string; q: string }) {
  if (!q) return <>{text}</>
  const idx = text.toLowerCase().indexOf(q)
  if (idx < 0) return <>{text}</>
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-yellow-200 text-yellow-900 rounded-sm px-0.5">{text.slice(idx, idx + q.length)}</mark>
      {text.slice(idx + q.length)}
    </>
  )
}

function TreeNodeRow({ node, expandedIds, selectedId, searchText, onToggle, onSelect, onAddChild }: TreeNodeRowProps) {
  const isExpanded = expandedIds.has(node.id)
  const isSelected = node.id === selectedId
  const hasChildren = node.children.length > 0
  const indent = node.level * 18

  // Nó que bate diretamente na busca (não apenas ancestral)
  const isMatch = searchText
    ? node.codigo.toLowerCase().includes(searchText) || node.nome.toLowerCase().includes(searchText)
    : false

  return (
    <div>
      <div
        className={[
          'group flex items-center gap-1.5 rounded py-1 pr-1 cursor-pointer text-sm transition-colors select-none',
          isSelected
            ? 'bg-primary/10 text-primary'
            : isMatch && searchText
              ? 'bg-yellow-50 hover:bg-yellow-100'
              : 'hover:bg-muted/60 text-foreground',
        ].join(' ')}
        style={{ paddingLeft: `${6 + indent}px` }}
        onClick={() => onSelect(node)}
      >
        {/* Toggle expand/collapse */}
        <button
          type="button"
          onClick={(e) => onToggle(node.id, e)}
          className="shrink-0 flex h-4 w-4 items-center justify-center rounded text-muted-foreground hover:text-foreground transition-colors"
          tabIndex={-1}
        >
          {hasChildren ? (
            <i className={`bi bi-chevron-${isExpanded ? 'down' : 'right'} text-[10px]`} />
          ) : (
            <span className="text-[10px] text-muted-foreground/30">─</span>
          )}
        </button>

        {/* Código */}
        <span className={`shrink-0 font-mono text-xs ${isSelected ? 'text-primary' : 'text-muted-foreground'}`}
          style={{ minWidth: '3.5rem' }}>
          <Highlight text={node.codigo} q={searchText} />
        </span>

        {/* Nome */}
        <span className="flex-1 truncate text-sm">
          <Highlight text={node.nome} q={searchText} />
        </span>

        {/* Botão "+ filho" — aparece no hover ou quando selecionado */}
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onAddChild(node) }}
          title={`Novo filho de ${node.codigo}`}
          tabIndex={-1}
          className={[
            'shrink-0 rounded p-0.5 text-xs transition-colors',
            'opacity-0 group-hover:opacity-100',
            isSelected ? 'opacity-100 text-primary hover:bg-primary/10' : 'text-muted-foreground hover:text-primary hover:bg-primary/10',
          ].join(' ')}
        >
          <i className="bi bi-plus-circle" />
        </button>
      </div>

      {/* Filhos */}
      {isExpanded && hasChildren && (
        <div>
          {node.children.map((child) => (
            <TreeNodeRow
              key={child.id}
              node={child}
              expandedIds={expandedIds}
              selectedId={selectedId}
              searchText={searchText}
              onToggle={onToggle}
              onSelect={onSelect}
              onAddChild={onAddChild}
            />
          ))}
        </div>
      )}
    </div>
  )
}
