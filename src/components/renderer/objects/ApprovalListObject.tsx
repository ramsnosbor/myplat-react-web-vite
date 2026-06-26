import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { useEntityQuery } from '@/hooks/useEntityQuery'
import { useViewContext } from '../ViewContext'
import { useConnectionParams, useConnectionEnabled } from '../ObjectRenderer'
import { useAuthStore } from '@/store/authStore'
import { entityApi } from '@/api/entity.api'
import { resolveColClass } from '@/utils/colClass'
import { nowBRT } from '@/utils/dateUtils'
import type { ObjectDefinition } from '@/types/view.types'
import type { EntityRecord } from '@/types/entity.types'

interface Props { objectDef: ObjectDefinition }

type DecisaoTipo = 'Aprovado' | 'Reprovado'

interface ModalState {
  row: EntityRecord
  tipo: DecisaoTipo
  idStatusDestino: number | null
  nmStatusDestino: string | null
}

const SITUACAO_COLOR: Record<string, string> = {
  Pendente:  '#f59e0b',
  Aprovado:  '#22c55e',
  Reprovado: '#ef4444',
  Cancelado: '#6b7280',
}

function fmtDate(v: unknown): string {
  if (!v) return '—'
  const s = String(v).slice(0, 10)
  const [y, m, d] = s.split('-')
  return `${d}/${m}/${y}`
}

export function ApprovalListObject({ objectDef }: Props) {
  const { initialParams } = useViewContext()
  const connectionParams = useConnectionParams(objectDef.id)
  const isEnabled = useConnectionEnabled(objectDef.id)
  const currentUser = useAuthStore((s) => s.user)
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  // Configuração do objectDef
  const fields: Record<string, string> = (objectDef as any).fields ?? {}
  const showActions: boolean = (objectDef as any).showActions !== false
  const pageSizes: number[] = (objectDef as any).pageSizes ?? [10, 25]
  const filterConfig: Record<string, unknown> = (objectDef as any).filter ?? {}
  const orderByConfig: string = (objectDef as any).orderBy ?? ''
  const entityName: string = (objectDef as any).entity ?? ''
  const entidadeHistorico: string = (objectDef as any).entidadeHistorico ?? 'historico_workflow'

  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(pageSizes[0] ?? 10)
  const [modal, setModal] = useState<ModalState | null>(null)
  const [statusSelecionado, setStatusSelecionado] = useState<number | ''>('')
  const [observacao, setObservacao] = useState('')

  // Lê campo mapeado da linha
  const f = (row: EntityRecord, key: string): unknown =>
    fields[key] ? row[fields[key]] : row[key]

  // ─── Query principal ────────────────────────────────────────────────────────
  const { data, isLoading } = useEntityQuery({
    entity: entityName,
    params: {
      ...connectionParams,
      ...filterConfig,
      pageSize,
      page,
      ...(orderByConfig ? { orderBy: orderByConfig } : {}),
    },
    enabled: isEnabled && !!entityName,
  })

  const rows = data?.data ?? []
  const total = data?.total ?? 0
  const totalPages = Math.ceil(total / pageSize)

  // ─── Status disponíveis para dropdown (quando destino é null) ───────────────
  const idProcessoModal = modal ? (f(modal.row, 'idProcesso') as number | null) : null
  const { data: statusData } = useEntityQuery<{ id_status_processo: number; nm_status: string }>({
    entity: 'vw_status_processo',
    params: { id_processo: idProcessoModal, fl_ativo: 'Sim', pageSize: 100 },
    enabled: !!modal && modal.idStatusDestino === null && !!idProcessoModal,
  })
  const statusOptions = statusData?.data ?? []

  // ─── Mutation aprovar/reprovar ───────────────────────────────────────────────
  const mutation = useMutation({
    mutationFn: async ({
      row, tipo, idStatusDestino, obs,
    }: { row: EntityRecord; tipo: DecisaoTipo; idStatusDestino: number; obs: string }) => {
      const idAprovacao   = f(row, 'idAprovacao')
      const idProcesso    = f(row, 'idProcesso')
      const idTransicao   = f(row, 'idTransicao')
      const nmEntidade    = f(row, 'nmEntidade') as string | null
      const idRegistro    = f(row, 'idRegistro')
      const nmCampoPk     = f(row, 'nmCampoPk') as string | null
      const nmCampoStatus = f(row, 'nmCampoStatus') as string | null
      const idStatusAtual = f(row, 'idStatusAtual')
      const dtNow = nowBRT()

      const payload: Record<string, Record<string, Record<string, string | null | undefined>>> = {}

      // 1. Fecha aprovacao_pendente
      payload['aprovacao_pendente'] = {
        ap: {
          _action: 'update',
          id_aprovacao: String(idAprovacao),
          ds_situacao: tipo,
          nm_respondente: currentUser?.name ?? currentUser?.username ?? null,
          dt_resposta: dtNow,
          ds_observacao: obs || null,
          ...(tipo === 'Aprovado'
            ? { id_status_aprovado: String(idStatusDestino) }
            : { id_status_reprovado: String(idStatusDestino) }),
        },
      }

      // 2. Atualiza status da entidade alvo
      if (nmEntidade && nmCampoPk && nmCampoStatus && idRegistro != null) {
        payload[nmEntidade] = {
          entity: {
            _action: 'update',
            [nmCampoPk]: String(idRegistro),
            [nmCampoStatus]: String(idStatusDestino),
          },
        }
      }

      // 3. Registra no histórico de workflow
      if (entidadeHistorico && nmEntidade && idRegistro != null) {
        payload[entidadeHistorico] = {
          historico: {
            id_processo: idProcesso != null ? String(idProcesso) : null,
            nm_entidade: nmEntidade,
            id_registro: String(idRegistro),
            id_status_anterior: idStatusAtual != null ? String(idStatusAtual) : null,
            id_status_novo: String(idStatusDestino),
            id_transicao: idTransicao != null ? String(idTransicao) : null,
            dt_transicao: dtNow,
          },
        }
      }

      await entityApi.many(payload)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['entity', entityName] })
      queryClient.invalidateQueries({ queryKey: ['entity'] })
      closeModal()
    },
  })

  function closeModal() {
    setModal(null)
    setObservacao('')
    setStatusSelecionado('')
  }

  function handleAcao(row: EntityRecord, tipo: DecisaoTipo) {
    const idStatus = tipo === 'Aprovado'
      ? (f(row, 'idStatusAprovado') as number | null)
      : (f(row, 'idStatusReprovado') as number | null)
    const nmStatus = tipo === 'Aprovado'
      ? (f(row, 'nmStatusAprovado') as string | null)
      : (f(row, 'nmStatusReprovado') as string | null)
    setObservacao('')
    setStatusSelecionado(idStatus ?? '')
    setModal({ row, tipo, idStatusDestino: idStatus, nmStatusDestino: nmStatus })
  }

  function handleConfirmar() {
    if (!modal) return
    const idDest = modal.idStatusDestino ?? (statusSelecionado !== '' ? Number(statusSelecionado) : null)
    if (!idDest) return
    mutation.mutate({ row: modal.row, tipo: modal.tipo, idStatusDestino: idDest, obs: observacao })
  }

  function handleVerDetalhe(row: EntityRecord) {
    const url   = f(row, 'urlDetalhe') as string | null
    const chave = f(row, 'chaveDetalhe') as string | null
    const idReg = f(row, 'idRegistro')
    if (url) navigate(`/${url}${chave ? `?${chave}=${idReg}` : ''}`)
  }

  // ─── Render ─────────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className={resolveColClass(objectDef.class)}>
        <div className="py-8 text-center text-sm text-muted-foreground animate-pulse">Carregando...</div>
      </div>
    )
  }

  if (rows.length === 0) {
    return (
      <div className={resolveColClass(objectDef.class)}>
        <div className="rounded-lg border border-border bg-card p-8 text-center text-sm text-muted-foreground">
          Nenhuma aprovação encontrada.
        </div>
      </div>
    )
  }

  return (
    <div className={resolveColClass(objectDef.class)}>
      <div className="flex flex-col gap-3">
        {rows.map((row, i) => {
          const situacao  = f(row, 'situacao') as string
          const atrasada  = f(row, 'atrasada') === 'Sim'
          const isPendente = situacao === 'Pendente'
          const urlDetalhe = f(row, 'urlDetalhe') as string | null

          return (
            <div key={i} className="rounded-lg border border-border bg-card p-4 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">

                {/* Info */}
                <div className="flex flex-col gap-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm text-foreground">
                      {(f(row, 'titulo') as string) || '—'}
                    </span>
                    {f(row, 'referencia') && (
                      <span className="rounded bg-muted px-2 py-0.5 text-xs font-mono text-muted-foreground">
                        {f(row, 'referencia') as string}
                      </span>
                    )}
                    {atrasada && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-600">
                        <i className="bi bi-alarm" /> Atrasada
                      </span>
                    )}
                  </div>

                  <div className="text-xs text-muted-foreground">
                    Solicitado por{' '}
                    <span className="font-medium text-foreground">
                      {(f(row, 'solicitante') as string) || '—'}
                    </span>
                    {' · '}{fmtDate(f(row, 'dtSolicitacao'))}
                    {f(row, 'dtVencimento') && (
                      <>
                        {' · '}Prazo:{' '}
                        <span className={atrasada ? 'text-red-500 font-medium' : ''}>
                          {fmtDate(f(row, 'dtVencimento'))}
                        </span>
                      </>
                    )}
                  </div>

                  {isPendente && (
                    <div className="text-xs text-muted-foreground mt-0.5">
                      Status atual:{' '}
                      <span className="font-medium text-foreground">
                        {(f(row, 'nmStatusAtual') as string) || '—'}
                      </span>
                      {f(row, 'nmStatusAprovado') && (
                        <>
                          {' · '}Se aprovado:{' '}
                          <span className="text-green-600 font-medium">
                            {f(row, 'nmStatusAprovado') as string}
                          </span>
                        </>
                      )}
                      {f(row, 'nmStatusReprovado') && (
                        <>
                          {' · '}Se reprovado:{' '}
                          <span className="text-red-500 font-medium">
                            {f(row, 'nmStatusReprovado') as string}
                          </span>
                        </>
                      )}
                    </div>
                  )}

                  {!isPendente && (
                    <div className="text-xs text-muted-foreground">
                      Respondido por{' '}
                      <span className="font-medium text-foreground">
                        {(f(row, 'nmRespondente') as string) || '—'}
                      </span>
                      {f(row, 'dtResposta') && <>{' em '}{fmtDate(f(row, 'dtResposta'))}</>}
                    </div>
                  )}
                </div>

                {/* Badge + ações */}
                <div className="flex items-center gap-2 flex-wrap shrink-0">
                  <span
                    className="rounded-full px-3 py-1 text-xs font-semibold text-white"
                    style={{ backgroundColor: SITUACAO_COLOR[situacao] ?? '#6b7280' }}
                  >
                    {situacao}
                  </span>

                  {urlDetalhe && (
                    <button
                      type="button"
                      onClick={() => handleVerDetalhe(row)}
                      className="rounded-md border border-border px-2.5 py-1 text-xs font-medium hover:bg-muted transition-colors"
                    >
                      <i className="bi bi-box-arrow-up-right me-1" />
                      Ver
                    </button>
                  )}

                  {showActions && isPendente && (
                    <>
                      <button
                        type="button"
                        onClick={() => handleAcao(row, 'Reprovado')}
                        className="rounded-md border border-red-200 bg-red-50 px-3 py-1 text-xs font-medium text-red-600 hover:bg-red-100 transition-colors"
                      >
                        <i className="bi bi-x-circle me-1" />
                        Rejeitar
                      </button>
                      <button
                        type="button"
                        onClick={() => handleAcao(row, 'Aprovado')}
                        className="rounded-md border border-green-200 bg-green-50 px-3 py-1 text-xs font-medium text-green-600 hover:bg-green-100 transition-colors"
                      >
                        <i className="bi bi-check-circle me-1" />
                        Aprovar
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Paginação */}
      {(totalPages > 1 || pageSizes.length > 1) && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>{total} registro{total !== 1 ? 's' : ''}</span>
          {totalPages > 1 && (
            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={page === 1}
                onClick={() => setPage((p) => p - 1)}
                className="rounded border border-border px-2.5 py-1 disabled:opacity-40 hover:bg-muted"
              >‹</button>
              <span className="px-2">{page} / {totalPages}</span>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="rounded border border-border px-2.5 py-1 disabled:opacity-40 hover:bg-muted"
              >›</button>
            </div>
          )}
          {pageSizes.length > 1 && (
            <select
              value={pageSize}
              onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1) }}
              className="rounded border border-input bg-background px-2 py-1"
            >
              {pageSizes.map((s) => (
                <option key={s} value={s}>{s} por página</option>
              ))}
            </select>
          )}
        </div>
      )}

      {/* Modal de decisão */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="rounded-lg bg-background border border-border shadow-xl p-6 max-w-md w-full mx-4">
            <h3 className="text-base font-semibold mb-1">
              {modal.tipo === 'Aprovado' ? 'Confirmar Aprovação' : 'Confirmar Reprovação'}
            </h3>
            <p className="text-xs text-muted-foreground mb-4">
              {(f(modal.row, 'titulo') as string) || ''}
              {f(modal.row, 'referencia') && (
                <span className="font-mono ml-1">• {f(modal.row, 'referencia') as string}</span>
              )}
            </p>

            {/* Dropdown quando status destino não foi pré-configurado */}
            {modal.idStatusDestino === null ? (
              <div className="mb-3">
                <label className="block text-xs font-medium mb-1">
                  {modal.tipo === 'Aprovado' ? 'Status se aprovado' : 'Status se reprovado'}
                  <span className="text-red-500 ml-0.5">*</span>
                </label>
                <select
                  value={statusSelecionado}
                  onChange={(e) =>
                    setStatusSelecionado(e.target.value !== '' ? Number(e.target.value) : '')
                  }
                  className="w-full rounded border border-input bg-background px-2.5 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  <option value="">Selecione o status destino...</option>
                  {statusOptions.map((s) => (
                    <option key={String(s.id_status_processo)} value={String(s.id_status_processo)}>
                      {s.nm_status}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="mb-3 rounded bg-muted px-3 py-2 text-xs">
                Status destino:{' '}
                <span className="font-semibold text-foreground">{modal.nmStatusDestino}</span>
              </div>
            )}

            <div className="mb-4">
              <label className="block text-xs font-medium mb-1">Observação</label>
              <textarea
                value={observacao}
                onChange={(e) => setObservacao(e.target.value)}
                rows={3}
                placeholder="Opcional..."
                className="w-full rounded border border-input bg-background px-2.5 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={closeModal}
                className="rounded-md border border-input px-4 py-2 text-sm hover:bg-muted"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={
                  mutation.isPending ||
                  (modal.idStatusDestino === null && statusSelecionado === '')
                }
                onClick={handleConfirmar}
                className={[
                  'rounded-md px-4 py-2 text-sm font-medium text-white disabled:opacity-50 transition-colors',
                  modal.tipo === 'Aprovado'
                    ? 'bg-green-600 hover:bg-green-700'
                    : 'bg-red-600 hover:bg-red-700',
                ].join(' ')}
              >
                {mutation.isPending
                  ? 'Salvando...'
                  : modal.tipo === 'Aprovado'
                  ? 'Aprovar'
                  : 'Rejeitar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
