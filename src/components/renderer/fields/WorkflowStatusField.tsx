import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { UseFormSetValue, UseFormGetValues } from 'react-hook-form'
import type { ComponentDefinition } from '@/types/view.types'
import { entityApi } from '@/api/entity.api'
import { notificationApi } from '@/api/notification.api'
import { useViewContext } from '../ViewContext'
import { useAuthStore } from '@/store/authStore'
import { nowBRT } from '@/utils/dateUtils'

interface WorkflowRow {
  id_processo: number
  nm_processo: string
  nm_entidade_processo: string
  nm_entidade: string
  id_status: number
  nm_status: string
  ds_cor: string | null
  ds_icone: string | null
  nr_ordem: number
  fl_estado_inicial: string
  fl_estado_final: string
  fl_permite_editar: string
  fl_permite_excluir: string
  id_transicao: number | null
  nm_transicao: string | null
  nm_rota_destino: string | null
  id_status_destino: number | null
  nm_status_destino: string | null
  ds_cor_destino: string | null
  fl_requer_comentario: string | null
  fl_requer_aprovacao: string | null
  ds_confirmacao: string | null
  id_status_aprovado: number | null
  id_status_rejeitado: number | null
  id_perfil_aprovador: number | null
  id_papel_responsavel_destino: number | null
}

interface WorkflowStatusFieldProps {
  component: ComponentDefinition
  setValue: UseFormSetValue<Record<string, unknown>>
  getValues: UseFormGetValues<Record<string, unknown>>
  formValues: Record<string, unknown>
  disabled?: boolean
}

function Badge({ label, cor, icone }: { label: string; cor?: string | null; icone?: string | null }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold text-white"
      style={{ backgroundColor: cor || '#6366f1' }}
    >
      {icone && <i className={icone} aria-hidden />}
      {label}
    </span>
  )
}

export function WorkflowStatusField({
  component: comp,
  setValue,
  getValues,
  formValues,
  disabled,
}: WorkflowStatusFieldProps) {
  const { screenParams } = useViewContext()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const currentUser = useAuthStore((s) => s.user)

  const statusField = comp.nameForm ?? comp.name
  const entityWf = (comp as any).entityWorkflow ?? 'vw_workflow_status'
  const nomeProcesso: string = (comp as any).nomeProcesso ?? ''
  const entidadeProcesso: string = (comp as any).entidadeProcesso ?? ''
  const chavePrimaria: string = (comp as any).chavePrimaria ?? ''
  const entidadeAlvo: string = (comp as any).entityTarget ?? ''
  const entidadeHistorico: string = (comp as any).entidadeHistoricoEvento ?? 'historico_workflow'
  const entidadeAprovacao: string = (comp as any).entidadeAprovacao ?? 'aprovacao_pendente'
  const nmReferenciaField: string = (comp as any).nmReferenciaField ?? ''
  const dsTituloAprovacao: string = (comp as any).dsTituloAprovacao ?? entidadeProcesso
  const nmUrlDetalhe: string = (comp as any).nmUrlDetalhe ?? ''

  // "" tratado como null — buildDefaultValues inicializa todos os campos como "" em create/edit
  const rawStatusId = formValues[statusField]
  const currentStatusId = rawStatusId === '' || rawStatusId == null ? null : (rawStatusId as number)

  // isCreateMode: sem PK na URL → é um novo registro
  const rawScreenPk = screenParams?.[chavePrimaria]
  const isCreateMode = rawScreenPk == null || rawScreenPk === ''

  // currentPk para ações de transição (usa formValues como fonte principal)
  const rawFormPk = formValues[chavePrimaria]
  const currentPk = rawFormPk === '' || rawFormPk == null
    ? (rawScreenPk === '' || rawScreenPk == null ? null : rawScreenPk)
    : rawFormPk

  const [pendingTransition, setPendingTransition] = useState<WorkflowRow | null>(null)
  const [observacaoTexto, setObservacaoTexto] = useState('')
  const appliedInitialRef = useRef(false)

  // ─── Busca config do status atual ────────────────────────────────────────────
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['workflow-status', nomeProcesso, entidadeProcesso, currentStatusId],
    queryFn: () =>
      entityApi
        .getList<WorkflowRow>(entityWf, {
          nm_processo: nomeProcesso,
          nm_entidade_processo: entidadeProcesso,
          id_status: currentStatusId,
          pageSize: 50,
        })
        .then((r) => r.data),
    enabled: !!nomeProcesso && !!entidadeProcesso && currentStatusId != null,
    staleTime: 30_000,
  })

  // ─── Busca status inicial — somente em create ─────────────────────────────────
  const { data: initialRows = [] } = useQuery({
    queryKey: ['workflow-initial', nomeProcesso, entidadeProcesso],
    queryFn: () =>
      entityApi
        .getList<WorkflowRow>(entityWf, {
          nm_processo: nomeProcesso,
          nm_entidade_processo: entidadeProcesso,
          fl_estado_inicial: 'Sim',
          pageSize: 1,
        })
        .then((r) => r.data),
    enabled: !!nomeProcesso && !!entidadeProcesso && isCreateMode && currentStatusId == null,
    staleTime: 60_000,
  })

  const statusInfo = rows[0] ?? null

  // ─── Propaga permissões para virtual fields do form ───────────────────────────
  useEffect(() => {
    if (!statusInfo) return
    setValue('_wf_permite_editar' as any, statusInfo.fl_permite_editar)
    setValue('_wf_permite_excluir' as any, statusInfo.fl_permite_excluir)
    setValue('_wf_estado_final' as any, statusInfo.fl_estado_final)
  }, [statusInfo, setValue])

  // ─── Create: bloqueia save até status inicial chegar, depois preenche ─────────
  useEffect(() => {
    if (!isCreateMode || currentStatusId != null) return
    setValue('_wf_permite_editar' as any, 'Não')
  }, [])

  useEffect(() => {
    if (!isCreateMode || initialRows.length === 0 || currentStatusId != null || appliedInitialRef.current) return
    appliedInitialRef.current = true
    setValue(statusField as any, initialRows[0].id_status)
    setValue('_wf_permite_editar' as any, initialRows[0].fl_permite_editar)
    setValue('_wf_permite_excluir' as any, initialRows[0].fl_permite_excluir)
    setValue('_wf_estado_final' as any, initialRows[0].fl_estado_final)
  }, [initialRows, currentStatusId, isCreateMode])

  // ─── Mutation: executa transição numa única transação via /default/many ────────
  const transitionMutation = useMutation({
    mutationFn: async ({ row, observacao }: { row: WorkflowRow; observacao?: string }) => {
      if (!currentPk) return null
      const targetEntity = entidadeAlvo || statusInfo?.nm_entidade
      if (!targetEntity || !chavePrimaria) return null
      const dtNow = nowBRT()

      // Transição só de navegação (sem mudança de status)
      if (!row.id_status_destino) {
        return { newStatusId: null, rota: row.nm_rota_destino, pk: String(currentPk) }
      }

      const payload: Record<string, Record<string, Record<string, string | null | undefined>>> = {}

      // 1. Atualiza status da entidade alvo
      payload[targetEntity] = {
        entity: {
          _action: 'update',
          [chavePrimaria]: String(currentPk),
          [statusField]: String(row.id_status_destino),
        },
      }

      // 2. Registra no histórico
      if (entidadeHistorico) {
        payload[entidadeHistorico] = {
          historico: {
            id_processo: statusInfo?.id_processo != null ? String(statusInfo.id_processo) : null,
            nm_entidade: targetEntity,
            id_registro: String(currentPk),
            id_status_anterior: currentStatusId != null ? String(currentStatusId) : null,
            id_status_novo: String(row.id_status_destino),
            id_transicao: row.id_transicao != null ? String(row.id_transicao) : null,
            dt_transicao: dtNow,
            ds_observacao: observacao?.trim() || null,
          },
        }
      }

      // 3. Se a transição requer aprovação, cria pendência
      if (row.fl_requer_aprovacao === 'Sim') {
        const nmRef = nmReferenciaField
          ? String(getValues(nmReferenciaField as any) ?? currentPk)
          : String(currentPk)
        payload[entidadeAprovacao] = {
          aprovacao: {
            id_processo: statusInfo?.id_processo != null ? String(statusInfo.id_processo) : null,
            id_transicao: row.id_transicao != null ? String(row.id_transicao) : null,
            id_status_atual: String(row.id_status_destino),
            nm_entidade: targetEntity,
            id_registro: String(currentPk),
            nm_referencia: nmRef,
            ds_titulo: dsTituloAprovacao,
            nm_url_detalhe: nmUrlDetalhe || null,
            ds_chave_detalhe: nmUrlDetalhe ? String(currentPk) : null,
            nm_solicitante: currentUser?.name ?? currentUser?.username ?? null,
            dt_solicitacao: dtNow,
            ds_situacao: 'Pendente',
            id_status_aprovado: row.id_status_aprovado != null ? String(row.id_status_aprovado) : null,
            id_status_reprovado: row.id_status_rejeitado != null ? String(row.id_status_rejeitado) : null,
            id_responsavel_perfil: (row.id_perfil_aprovador ?? row.id_papel_responsavel_destino) != null
              ? String(row.id_perfil_aprovador ?? row.id_papel_responsavel_destino)
              : null,
            nm_campo_pk: chavePrimaria,
            nm_campo_status: statusField,
          },
        }
      }

      await entityApi.many(payload)
      return {
        newStatusId: row.id_status_destino,
        rota: row.nm_rota_destino,
        pk: String(currentPk),
        idPapelResponsavel: row.id_papel_responsavel_destino,
        textoNotificacao: `${dsTituloAprovacao || entidadeProcesso}: ${row.nm_status_destino ?? row.nm_transicao ?? 'status atualizado'}`,
      }
    },
    onSuccess: (result) => {
      if (!result) return
      if (result.newStatusId != null) setValue(statusField as any, result.newStatusId)
      queryClient.invalidateQueries({ queryKey: ['entity'] })
      queryClient.invalidateQueries({ queryKey: ['entity-single'] })
      queryClient.invalidateQueries({ queryKey: ['workflow-status'] })
      setPendingTransition(null)
      if (result.idPapelResponsavel != null) {
        notificationApi.notifyRole(result.idPapelResponsavel, result.textoNotificacao!).catch(() => {})
      }
      if (result.rota && result.pk) navigate(`/${result.rota}/${result.pk}`)
    },
  })

  function handleTransitionClick(row: WorkflowRow) {
    if (transitionMutation.isPending) return
    if (row.ds_confirmacao || row.fl_requer_comentario === 'Sim') {
      setObservacaoTexto('')
      setPendingTransition(row)
    } else {
      transitionMutation.mutate({ row })
    }
  }

  const transitions = rows.filter((r) => r.id_transicao != null)

  // ─── Guards ───────────────────────────────────────────────────────────────────
  if (!nomeProcesso || !entidadeProcesso) {
    return (
      <div className="rounded border border-destructive p-2 text-xs text-destructive">
        workflowStatus: configure nomeProcesso e entidadeProcesso no componente.
      </div>
    )
  }

  // No create ainda não há registro — o useEffect já pré-preencheu o campo via setValue.
  if (currentPk == null) return null

  if (currentStatusId == null) {
    return (
      <div className="text-xs text-muted-foreground animate-pulse italic">
        Aplicando status inicial...
      </div>
    )
  }

  if (isLoading) {
    return <div className="text-xs text-muted-foreground animate-pulse">Carregando workflow...</div>
  }

  if (!statusInfo) {
    return (
      <div className="text-xs text-muted-foreground italic">
        Status {currentStatusId} não encontrado no processo {nomeProcesso}/{entidadeProcesso}.
      </div>
    )
  }

  return (
    <div className="flex items-center gap-3 flex-wrap">

      {/* Badge do status atual */}
      <span className="text-sm text-muted-foreground font-medium">Status:</span>
      <Badge label={statusInfo.nm_status} cor={statusInfo.ds_cor} icone={statusInfo.ds_icone ?? undefined} />
      {statusInfo.fl_estado_final === 'Sim' && (
        <span className="text-xs text-muted-foreground">(status final)</span>
      )}

      {/* Botões de transição inline */}
      {transitions.length > 0 && transitions.map((row) => (
            <button
              key={row.id_transicao}
              type="button"
              disabled={transitionMutation.isPending}
              onClick={() => handleTransitionClick(row)}
              className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              style={{ backgroundColor: row.ds_cor_destino || '#6366f1' }}
            >
              {row.fl_requer_aprovacao === 'Sim' && (
                <i className="bi bi-lock-fill text-xs" aria-hidden />
              )}
              {row.nm_transicao ?? row.nm_status_destino}
            </button>
      ))}

      {/* Modal de confirmação / comentário */}
      {pendingTransition && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="rounded-lg bg-background border border-border shadow-xl p-6 max-w-sm w-full mx-4">
            <h3 className="text-base font-semibold mb-3">
              {pendingTransition.nm_transicao ?? 'Confirmar transição'}
            </h3>

            {pendingTransition.ds_confirmacao && (
              <p className="text-sm text-muted-foreground mb-4">{pendingTransition.ds_confirmacao}</p>
            )}

            {pendingTransition.fl_requer_comentario === 'Sim' && (
              <div className="mb-4">
                <label className="block text-sm font-medium mb-1">
                  Comentário <span className="text-destructive">*</span>
                </label>
                <textarea
                  rows={3}
                  value={observacaoTexto}
                  onChange={(e) => setObservacaoTexto(e.target.value)}
                  placeholder="Descreva o motivo desta ação..."
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            )}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingTransition(null)}
                className="rounded-md border border-input px-4 py-2 text-sm hover:bg-muted"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={
                  transitionMutation.isPending ||
                  (pendingTransition.fl_requer_comentario === 'Sim' && observacaoTexto.trim() === '')
                }
                onClick={() => transitionMutation.mutate({ row: pendingTransition, observacao: observacaoTexto })}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                {transitionMutation.isPending ? 'Executando...' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
