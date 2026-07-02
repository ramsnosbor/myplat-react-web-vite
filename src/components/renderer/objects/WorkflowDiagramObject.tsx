import { useMemo, useRef, useState, useCallback } from 'react'
import { useStore } from 'zustand'
import { useEntityQuery } from '@/hooks/useEntityQuery'
import { useViewContext } from '../ViewContext'
import { useConnectionParams, useConnectionEnabled } from '../ObjectRenderer'
import { resolveColClass } from '@/utils/colClass'
import type { ObjectDefinition } from '@/types/view.types'
import type { EntityRecord } from '@/types/entity.types'

interface Props { objectDef: ObjectDefinition }

// ─── Constantes de layout ────────────────────────────────────────────────────
const NODE_W = 176
const NODE_H = 60
const COL_GAP = 90      // espaço horizontal entre camadas
const ROW_GAP = 36      // espaço vertical entre nós da mesma camada
const MARGIN = 40
const DEFAULT_NODE_COLOR = '#6366f1'

interface StatusRow extends EntityRecord {
  id_status_processo: number
  nm_status: string
  ds_cor: string | null
  ds_icone: string | null
  nr_ordem: number | null
  fl_estado_inicial: string | null
  fl_estado_final: string | null
  fl_ativo: string | null
}

interface TransicaoRow extends EntityRecord {
  id_transicao: number
  id_status_origem: number
  id_status_destino: number
  nm_transicao: string | null
  fl_requer_aprovacao: string | null
  fl_ativo: string | null
  id_status_aprovado: number | null
  id_status_rejeitado: number | null
}

// Ramo de decisão derivado de uma transição com aprovação:
// o status destino "forka" em aprovado (verde) / reprovado (vermelho).
interface ForkEdge {
  transicao: TransicaoRow
  from: number          // id_status_destino (onde a decisão acontece)
  to: number            // id_status_aprovado | id_status_rejeitado
  tipo: 'aprovado' | 'reprovado'
}

function buildForkEdges(edges: TransicaoRow[]): ForkEdge[] {
  const forks: ForkEdge[] = []
  for (const e of edges) {
    if (e.fl_requer_aprovacao !== 'Sim') continue
    if (e.id_status_aprovado != null) {
      forks.push({ transicao: e, from: e.id_status_destino, to: e.id_status_aprovado, tipo: 'aprovado' })
    }
    if (e.id_status_rejeitado != null) {
      forks.push({ transicao: e, from: e.id_status_destino, to: e.id_status_rejeitado, tipo: 'reprovado' })
    }
  }
  return forks
}

interface PositionedNode {
  row: StatusRow
  x: number
  y: number
  layer: number
}

// ─── Layout automático: camadas por BFS a partir do status inicial ───────────
// À prova de ciclos: cada nó recebe camada uma única vez (BFS = caminho mais curto).
// Arestas "de volta" (ex: Rejeitar → status anterior) não reposicionam o destino.
function computeLayout(nodes: StatusRow[], edges: TransicaoRow[], forks: ForkEdge[]): {
  positioned: PositionedNode[]
  width: number
  height: number
} {
  if (nodes.length === 0) return { positioned: [], width: 0, height: 0 }

  const byId = new Map<number, StatusRow>()
  for (const n of nodes) byId.set(n.id_status_processo, n)

  const adj = new Map<number, number[]>()
  const incoming = new Map<number, number>()
  for (const n of nodes) { adj.set(n.id_status_processo, []); incoming.set(n.id_status_processo, 0) }
  const addEdge = (from: number, to: number) => {
    if (!byId.has(from) || !byId.has(to) || from === to) return
    adj.get(from)!.push(to)
    incoming.set(to, (incoming.get(to) ?? 0) + 1)
  }
  for (const e of edges) addEdge(e.id_status_origem, e.id_status_destino)
  // Ramos de decisão também posicionam os nós aprovado/reprovado à frente do destino
  for (const fk of forks) addEdge(fk.from, fk.to)

  // Fontes: status inicial declarado → senão sem arestas de entrada → senão menor nr_ordem
  let sources = nodes.filter((n) => n.fl_estado_inicial === 'Sim').map((n) => n.id_status_processo)
  if (sources.length === 0) sources = nodes.filter((n) => (incoming.get(n.id_status_processo) ?? 0) === 0).map((n) => n.id_status_processo)
  if (sources.length === 0) {
    const sorted = [...nodes].sort((a, b) => (a.nr_ordem ?? 0) - (b.nr_ordem ?? 0))
    sources = [sorted[0].id_status_processo]
  }

  const layer = new Map<number, number>()
  const queue: number[] = []
  for (const s of sources) { layer.set(s, 0); queue.push(s) }
  while (queue.length > 0) {
    const u = queue.shift()!
    const lu = layer.get(u)!
    for (const v of adj.get(u) ?? []) {
      if (!layer.has(v)) { layer.set(v, lu + 1); queue.push(v) }
    }
  }
  // Nós desconectados: posiciona por nr_ordem na camada 0
  for (const n of nodes) {
    if (!layer.has(n.id_status_processo)) layer.set(n.id_status_processo, 0)
  }

  // Agrupa por camada, ordena cada camada por nr_ordem → nome
  const layers = new Map<number, StatusRow[]>()
  for (const n of nodes) {
    const l = layer.get(n.id_status_processo)!
    if (!layers.has(l)) layers.set(l, [])
    layers.get(l)!.push(n)
  }
  for (const arr of layers.values()) {
    arr.sort((a, b) => (a.nr_ordem ?? 0) - (b.nr_ordem ?? 0) || a.nm_status.localeCompare(b.nm_status))
  }

  const maxLayer = Math.max(...layer.values())
  const maxRows = Math.max(...[...layers.values()].map((a) => a.length))
  const colStep = NODE_W + COL_GAP
  const rowStep = NODE_H + ROW_GAP

  const positioned: PositionedNode[] = []
  for (let l = 0; l <= maxLayer; l++) {
    const arr = layers.get(l) ?? []
    // centraliza verticalmente a coluna em relação à coluna mais cheia
    const offsetY = ((maxRows - arr.length) * rowStep) / 2
    arr.forEach((row, i) => {
      positioned.push({
        row,
        layer: l,
        x: MARGIN + l * colStep,
        y: MARGIN + offsetY + i * rowStep,
      })
    })
  }

  const width = MARGIN * 2 + (maxLayer + 1) * colStep - COL_GAP
  const height = MARGIN * 2 + maxRows * rowStep - ROW_GAP
  return { positioned, width, height }
}

export function WorkflowDiagramObject({ objectDef }: Props) {
  const { viewStore } = useViewContext()
  const setObjectState = useStore(viewStore, (s) => s.setObjectState)
  const connectionParams = useConnectionParams(objectDef.id)
  const isEnabled = useConnectionEnabled(objectDef.id)

  const entityStatus: string = (objectDef as any).entity ?? 'vw_status_processo'
  const entityTransicao: string = (objectDef as any).entityTransicao ?? 'vw_transicao_workflow'
  const statusModal: string = (objectDef as any).statusModal ?? ''
  const transicaoModal: string = (objectDef as any).transicaoModal ?? ''
  const idProcesso = connectionParams.id_processo

  // ─── Dados ──────────────────────────────────────────────────────────────────
  const { data: statusData, isLoading: loadingStatus } = useEntityQuery<StatusRow>({
    entity: entityStatus,
    params: { ...connectionParams, pageSize: 300 },
    enabled: isEnabled && idProcesso != null,
  })
  const { data: transData, isLoading: loadingTrans } = useEntityQuery<TransicaoRow>({
    entity: entityTransicao,
    params: { ...connectionParams, pageSize: 500 },
    enabled: isEnabled && idProcesso != null,
  })

  const nodes = useMemo(() => statusData?.data ?? [], [statusData])
  const edges = useMemo(() => transData?.data ?? [], [transData])
  const forks = useMemo(() => buildForkEdges(edges), [edges])
  const decisaoNodes = useMemo(() => new Set(forks.map((f) => f.from)), [forks])

  const { positioned } = useMemo(() => computeLayout(nodes, edges, forks), [nodes, edges, forks])
  const posById = useMemo(() => {
    const m = new Map<number, PositionedNode>()
    for (const p of positioned) m.set(p.row.id_status_processo, p)
    return m
  }, [positioned])

  // ─── Pan / Zoom ───────────────────────────────────────────────────────────────
  const [view, setView] = useState({ tx: 0, ty: 0, scale: 1 })
  const panRef = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null)

  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1
    setView((v) => ({ ...v, scale: Math.min(2.5, Math.max(0.3, v.scale * factor)) }))
  }, [])

  const onBgMouseDown = useCallback((e: React.MouseEvent) => {
    panRef.current = { x: e.clientX, y: e.clientY, tx: view.tx, ty: view.ty }
  }, [view.tx, view.ty])

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!panRef.current) return
    setView((v) => ({
      ...v,
      tx: panRef.current!.tx + (e.clientX - panRef.current!.x),
      ty: panRef.current!.ty + (e.clientY - panRef.current!.y),
    }))
  }, [])

  const endPan = useCallback(() => { panRef.current = null }, [])

  const resetView = useCallback(() => setView({ tx: 0, ty: 0, scale: 1 }), [])

  // ─── Ações: abre os modais existentes ────────────────────────────────────────
  const openStatus = useCallback((row: StatusRow) => {
    if (!statusModal) return
    setObjectState(statusModal, {
      mode: 'edit',
      queryParams: { id_status_processo: row.id_status_processo },
      selectedRow: row,
    })
  }, [statusModal, setObjectState])

  const openTransicao = useCallback((row: TransicaoRow) => {
    if (!transicaoModal) return
    setObjectState(transicaoModal, {
      mode: 'edit',
      queryParams: { id_transicao: row.id_transicao },
      selectedRow: row,
    })
  }, [transicaoModal, setObjectState])

  const novoStatus = useCallback(() => {
    if (!statusModal) return
    setObjectState(statusModal, { mode: 'create', selectedRow: null, formData: null })
  }, [statusModal, setObjectState])

  const novaTransicao = useCallback(() => {
    if (!transicaoModal) return
    setObjectState(transicaoModal, { mode: 'create', selectedRow: null, formData: null })
  }, [transicaoModal, setObjectState])

  // ─── Render ─────────────────────────────────────────────────────────────────
  const wrapperClass = resolveColClass(objectDef.class)
  const isLoading = loadingStatus || loadingTrans

  if (idProcesso == null) {
    return (
      <div className={wrapperClass}>
        <div className="rounded-lg border border-border bg-card p-8 text-center text-sm text-muted-foreground">
          Salve o processo para montar o fluxo.
        </div>
      </div>
    )
  }

  return (
    <div className={wrapperClass}>
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        {/* Toolbar */}
        <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
          <div className="flex items-center gap-2">
            {statusModal && (
              <button
                type="button"
                onClick={novoStatus}
                className="inline-flex items-center gap-1.5 rounded-md bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700 transition-colors"
              >
                <i className="bi bi-plus-circle" /> Novo Status
              </button>
            )}
            {transicaoModal && (
              <button
                type="button"
                onClick={novaTransicao}
                className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 transition-colors"
              >
                <i className="bi bi-arrow-left-right" /> Nova Transição
              </button>
            )}
          </div>
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => setView((v) => ({ ...v, scale: Math.max(0.3, v.scale / 1.1) }))}
              className="h-7 w-7 rounded border border-border text-sm hover:bg-muted" title="Diminuir zoom">−</button>
            <button type="button" onClick={() => setView((v) => ({ ...v, scale: Math.min(2.5, v.scale * 1.1) }))}
              className="h-7 w-7 rounded border border-border text-sm hover:bg-muted" title="Aumentar zoom">+</button>
            <button type="button" onClick={resetView}
              className="h-7 rounded border border-border px-2 text-xs hover:bg-muted" title="Resetar visão">
              <i className="bi bi-arrows-fullscreen" />
            </button>
          </div>
        </div>

        {/* Canvas */}
        {isLoading ? (
          <div className="py-16 text-center text-sm text-muted-foreground animate-pulse">Carregando fluxo...</div>
        ) : nodes.length === 0 ? (
          <div className="py-16 text-center text-sm text-muted-foreground">
            Nenhum status cadastrado. Use <span className="font-medium text-foreground">Novo Status</span> para começar.
          </div>
        ) : (
          <svg
            width="100%"
            height={460}
            onWheel={onWheel}
            onMouseDown={onBgMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={endPan}
            onMouseLeave={endPan}
            style={{ cursor: panRef.current ? 'grabbing' : 'grab', display: 'block', background: 'var(--muted, #f8fafc)' }}
          >
            <defs>
              <marker id="wf-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M 0 0 L 10 5 L 0 10 z" fill="#94a3b8" />
              </marker>
              <marker id="wf-arrow-aprov" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M 0 0 L 10 5 L 0 10 z" fill="#f59e0b" />
              </marker>
              <marker id="wf-arrow-ok" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M 0 0 L 10 5 L 0 10 z" fill="#22c55e" />
              </marker>
              <marker id="wf-arrow-no" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M 0 0 L 10 5 L 0 10 z" fill="#ef4444" />
              </marker>
            </defs>

            <g transform={`translate(${view.tx},${view.ty}) scale(${view.scale})`}>
              {/* Arestas primeiro (ficam atrás dos nós) */}
              {edges.map((e) => {
                const src = posById.get(e.id_status_origem)
                const dst = posById.get(e.id_status_destino)
                if (!src || !dst) return null
                const aprov = e.fl_requer_aprovacao === 'Sim'
                const inativo = e.fl_ativo != null && e.fl_ativo !== 'Sim'
                const stroke = aprov ? '#f59e0b' : '#94a3b8'

                // Self-loop
                if (e.id_status_origem === e.id_status_destino) {
                  const lx = src.x + NODE_W / 2
                  const ly = src.y
                  const d = `M ${lx - 20} ${ly} C ${lx - 40} ${ly - 50}, ${lx + 40} ${ly - 50}, ${lx + 20} ${ly}`
                  return (
                    <g key={e.id_transicao} className="cursor-pointer" onClick={(ev) => { ev.stopPropagation(); openTransicao(e) }}>
                      <path d={d} fill="none" stroke={stroke} strokeWidth={2}
                        strokeDasharray={inativo ? '5 4' : undefined}
                        markerEnd={`url(#${aprov ? 'wf-arrow-aprov' : 'wf-arrow'})`} opacity={inativo ? 0.5 : 1} />
                      {e.nm_transicao && (
                        <EdgeLabel x={lx} y={ly - 52} text={e.nm_transicao} aprov={aprov} />
                      )}
                    </g>
                  )
                }

                const x1 = src.x + NODE_W
                const y1 = src.y + NODE_H / 2
                const x2 = dst.x
                const y2 = dst.y + NODE_H / 2
                const dx = Math.max(40, Math.abs(x2 - x1) * 0.5)
                const d = `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`
                const midX = (x1 + x2) / 2
                const midY = (y1 + y2) / 2

                return (
                  <g key={e.id_transicao} className="cursor-pointer" onClick={(ev) => { ev.stopPropagation(); openTransicao(e) }}>
                    {/* trilha invisível mais grossa para facilitar o clique */}
                    <path d={d} fill="none" stroke="transparent" strokeWidth={14} />
                    <path d={d} fill="none" stroke={stroke} strokeWidth={2}
                      strokeDasharray={inativo ? '5 4' : undefined}
                      markerEnd={`url(#${aprov ? 'wf-arrow-aprov' : 'wf-arrow'})`} opacity={inativo ? 0.5 : 1} />
                    {(e.nm_transicao || aprov) && (
                      <EdgeLabel x={midX} y={midY} text={e.nm_transicao ?? ''} aprov={aprov} />
                    )}
                  </g>
                )
              })}

              {/* Ramos de decisão (fork aprovado/reprovado do status destino) */}
              {forks.map((fk, i) => {
                const src = posById.get(fk.from)
                const dst = posById.get(fk.to)
                if (!src || !dst) return null
                const ok = fk.tipo === 'aprovado'
                const stroke = ok ? '#22c55e' : '#ef4444'
                const marker = ok ? 'wf-arrow-ok' : 'wf-arrow-no'
                const inativo = fk.transicao.fl_ativo != null && fk.transicao.fl_ativo !== 'Sim'

                const x1 = src.x + NODE_W
                const y1 = src.y + NODE_H / 2 + (ok ? -10 : 10) // separa os dois ramos na saída
                const x2 = dst.x
                const y2 = dst.y + NODE_H / 2
                const dx = Math.max(40, Math.abs(x2 - x1) * 0.5)
                const d = `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`
                const midX = (x1 + x2) / 2
                const midY = (y1 + y2) / 2

                return (
                  <g key={`fk-${fk.transicao.id_transicao}-${i}`} className="cursor-pointer"
                    onClick={(ev) => { ev.stopPropagation(); openTransicao(fk.transicao) }}>
                    <path d={d} fill="none" stroke="transparent" strokeWidth={14} />
                    <path d={d} fill="none" stroke={stroke} strokeWidth={2} strokeDasharray="6 3"
                      markerEnd={`url(#${marker})`} opacity={inativo ? 0.5 : 1} />
                    <ForkLabel x={midX} y={midY} tipo={fk.tipo} />
                  </g>
                )
              })}

              {/* Nós */}
              {positioned.map((p) => {
                const { row } = p
                const color = row.ds_cor || DEFAULT_NODE_COLOR
                const inativo = row.fl_ativo != null && row.fl_ativo !== 'Sim'
                const inicial = row.fl_estado_inicial === 'Sim'
                const final = row.fl_estado_final === 'Sim'
                const decisao = decisaoNodes.has(row.id_status_processo)
                return (
                  <g key={row.id_status_processo} transform={`translate(${p.x},${p.y})`}
                    className="cursor-pointer" onClick={(ev) => { ev.stopPropagation(); openStatus(row) }}
                    opacity={inativo ? 0.55 : 1}>
                    <rect width={NODE_W} height={NODE_H} rx={10} fill={color}
                      stroke={decisao ? '#f59e0b' : inicial ? '#16a34a' : final ? '#1e293b' : 'rgba(0,0,0,0.15)'}
                      strokeWidth={decisao || inicial || final ? 2.5 : 1}
                      strokeDasharray={decisao ? '6 3' : undefined} />
                    {decisao && (
                      <text x={NODE_W - 14} y={14} fontSize={9} fill="rgba(255,255,255,0.95)" textAnchor="end" style={{ pointerEvents: 'none' }}>
                        ⑂ decisão
                      </text>
                    )}
                    <text x={14} y={NODE_H / 2 - 5} fontSize={13} fontWeight={600}
                      fill="#fff" dominantBaseline="middle" style={{ pointerEvents: 'none' }}>
                      {truncate(row.nm_status, 20)}
                    </text>
                    {/* badges inicial/final */}
                    {inicial && (
                      <text x={14} y={NODE_H / 2 + 13} fontSize={9} fill="rgba(255,255,255,0.9)" style={{ pointerEvents: 'none' }}>
                        ● início
                      </text>
                    )}
                    {final && (
                      <text x={NODE_W - 14} y={NODE_H / 2 + 13} fontSize={9} fill="rgba(255,255,255,0.9)" textAnchor="end" style={{ pointerEvents: 'none' }}>
                        fim ●
                      </text>
                    )}
                  </g>
                )
              })}
            </g>
          </svg>
        )}

        {/* Legenda */}
        {nodes.length > 0 && (
          <div className="flex flex-wrap items-center gap-4 border-t border-border px-3 py-2 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1"><span className="inline-block h-3 w-3 rounded border-2 border-green-600" /> Inicial</span>
            <span className="inline-flex items-center gap-1"><span className="inline-block h-3 w-3 rounded border-2 border-slate-800" /> Final</span>
            <span className="inline-flex items-center gap-1"><span className="inline-block h-0.5 w-5" style={{ background: '#f59e0b' }} /> Requer aprovação</span>
            <span className="inline-flex items-center gap-1"><span className="inline-block h-3 w-3 rounded border-2 border-dashed border-amber-500" /> Decisão (fork)</span>
            <span className="inline-flex items-center gap-1"><span className="inline-block h-0.5 w-5" style={{ background: '#22c55e' }} /> Aprovado</span>
            <span className="inline-flex items-center gap-1"><span className="inline-block h-0.5 w-5" style={{ background: '#ef4444' }} /> Reprovado</span>
            <span className="inline-flex items-center gap-1 opacity-60"><span className="inline-block h-0.5 w-5 border-t-2 border-dashed border-slate-400" /> Inativo</span>
            <span className="ml-auto italic">Clique num status ou transição para editar · arraste para mover · scroll para zoom</span>
          </div>
        )}
      </div>
    </div>
  )
}

// Label de aresta com fundo para legibilidade
function EdgeLabel({ x, y, text, aprov }: { x: number; y: number; text: string; aprov: boolean }) {
  const label = aprov && text ? `🔒 ${text}` : aprov ? '🔒' : text
  const w = Math.max(20, label.length * 6.5 + 10)
  return (
    <g style={{ pointerEvents: 'none' }}>
      <rect x={x - w / 2} y={y - 9} width={w} height={18} rx={5} fill="#fff" stroke="#e2e8f0" />
      <text x={x} y={y + 1} fontSize={10.5} fill={aprov ? '#b45309' : '#475569'} textAnchor="middle" dominantBaseline="middle">
        {label}
      </text>
    </g>
  )
}

// Label dos ramos de decisão (aprovado/reprovado)
function ForkLabel({ x, y, tipo }: { x: number; y: number; tipo: 'aprovado' | 'reprovado' }) {
  const ok = tipo === 'aprovado'
  const label = ok ? '✓ Aprovado' : '✗ Reprovado'
  const w = label.length * 6.5 + 12
  return (
    <g style={{ pointerEvents: 'none' }}>
      <rect x={x - w / 2} y={y - 9} width={w} height={18} rx={5} fill="#fff" stroke={ok ? '#bbf7d0' : '#fecaca'} />
      <text x={x} y={y + 1} fontSize={10.5} fontWeight={600} fill={ok ? '#15803d' : '#b91c1c'} textAnchor="middle" dominantBaseline="middle">
        {label}
      </text>
    </g>
  )
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + '…' : s
}
