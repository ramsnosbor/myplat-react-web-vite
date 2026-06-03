import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AppShell } from '@/components/layout/AppShell'
import { useToast } from '@/components/ui/Toast'
import { parameterApi, type ParameterRecord } from '@/api/parameter.api'
import { tagApi } from '@/api/tag.api'

interface TagFormState {
  id?: number | string
  nomeTag: string
  descricao: string
}

export default function ParameterConfigPage() {
  const toast = useToast()
  const queryClient = useQueryClient()
  const [selectedGroupId, setSelectedGroupId] = useState<number | string | null>(null)
  const [editingTag, setEditingTag] = useState<TagFormState | null>(null)

  const groupsQuery = useQuery({
    queryKey: ['tags'],
    queryFn: tagApi.getAll,
    staleTime: 30_000,
  })

  const groups = groupsQuery.data ?? []

  useEffect(() => {
    if (!selectedGroupId && groups.length > 0) {
      setSelectedGroupId(groups[0].id)
    }
  }, [groups, selectedGroupId])

  const selectedGroup = useMemo(
    () => groups.find((group) => String(group.id) === String(selectedGroupId)) ?? null,
    [groups, selectedGroupId],
  )

  const parametersQuery = useQuery({
    queryKey: ['parameters', selectedGroupId],
    queryFn: () => parameterApi.getConfig({ tagId: selectedGroupId, orderBy: 'cdParameter,asc' }),
    enabled: selectedGroupId !== null,
    staleTime: 10_000,
  })

  const parameters = (parametersQuery.data?.table ?? []) as ParameterRecord[]

  const saveTagMutation = useMutation({
    mutationFn: async (payload: TagFormState) => {
      if (payload.id) return tagApi.update(payload.id, { nomeTag: payload.nomeTag, descricao: payload.descricao })
      return tagApi.create({ nomeTag: payload.nomeTag, descricao: payload.descricao })
    },
    onSuccess: async (saved) => {
      await queryClient.invalidateQueries({ queryKey: ['tags'] })
      setEditingTag(null)
      if (!selectedGroupId) setSelectedGroupId(saved.id)
      toast.success('Grupo salvo com sucesso.')
    },
    onError: () => toast.error('Nao foi possivel salvar o grupo.'),
  })

  const updateParameterMutation = useMutation({
    mutationFn: async (parameter: ParameterRecord) => {
      const tagId = parameter.tag?.id ?? selectedGroupId
      return parameterApi.update(parameter.id, {
        cdParameter: parameter.cdParameter,
        dsParameter: parameter.dsParameter,
        vlParameter: parameter.vlParameter,
        tag: tagId ? { id: tagId } : parameter.tag,
      })
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['parameters', selectedGroupId] })
      toast.success('Parametro atualizado.')
    },
    onError: () => toast.error('Nao foi possivel atualizar o parametro.'),
  })

  const toggleParameterMutation = useMutation({
    mutationFn: async ({ parameter, checked }: { parameter: ParameterRecord; checked: boolean }) => {
      if (checked) return parameterApi.active(parameter.id)
      return parameterApi.inactive(parameter.id)
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['parameters', selectedGroupId] })
    },
    onError: () => toast.error('Nao foi possivel alterar o status.'),
  })

  return (
    <AppShell title="Tags - Parametros" subtitle="Configuracoes e grupos de parametros do sistema.">
      <div className="min-h-full bg-background p-4 sm:p-6">
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)]">
            <aside className="rounded-lg border border-blue-100 bg-white shadow-sm shadow-blue-950/5">
              <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900">Grupos</p>
                  <p className="text-xs text-slate-500">Selecione um grupo para carregar os parametros.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setEditingTag({ nomeTag: '', descricao: '' })}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-blue-200 text-blue-700 transition hover:bg-blue-50"
                  title="Novo grupo"
                >
                  <i className="bi bi-plus-lg" aria-hidden />
                </button>
              </div>

              <div className="max-h-[calc(100vh-240px)] overflow-auto p-2 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                {groupsQuery.isLoading ? (
                  <div className="flex items-center justify-center py-10 text-sm text-slate-500">
                    <span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-blue-700 border-t-transparent" />
                    Carregando...
                  </div>
                ) : groups.length > 0 ? (
                  <div className="space-y-1">
                    {groups.map((group) => {
                      const active = String(group.id) === String(selectedGroupId)
                      return (
                        <button
                          key={group.id}
                          type="button"
                          onClick={() => setSelectedGroupId(group.id)}
                          className={[
                            'flex w-full items-center justify-between rounded-md border px-3 py-2 text-left transition',
                            active
                              ? 'border-blue-200 bg-blue-50 text-blue-800'
                              : 'border-transparent text-slate-700 hover:border-slate-200 hover:bg-slate-50',
                          ].join(' ')}
                        >
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-semibold">{group.nomeTag}</span>
                            {group.descricao && <span className="block truncate text-xs text-slate-500">{group.descricao}</span>}
                          </span>
                          <span
                            className="ml-3 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-slate-500 transition hover:bg-white hover:text-blue-700"
                            title="Editar grupo"
                            onClick={(e) => {
                              e.stopPropagation()
                              setEditingTag({ id: group.id, nomeTag: group.nomeTag ?? '', descricao: group.descricao ?? '' })
                            }}
                          >
                            <i className="bi bi-pencil-square" aria-hidden />
                          </span>
                        </button>
                      )
                    })}
                  </div>
                ) : (
                  <div className="px-4 py-10 text-center text-sm text-slate-500">
                    Nenhum grupo cadastrado.
                  </div>
                )}
              </div>
            </aside>

            <section className="rounded-lg border border-blue-100 bg-white shadow-sm shadow-blue-950/5">
              <div className="flex flex-col gap-3 border-b border-slate-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900">
                    {selectedGroup ? `Parametrizando: ${selectedGroup.nomeTag}` : 'Selecione um grupo'}
                  </p>
                  <p className="text-xs text-slate-500">
                    Valores podem ser ajustados direto na linha.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-200 px-3 text-sm text-slate-700 transition hover:bg-slate-50"
                    onClick={() => queryClient.invalidateQueries({ queryKey: ['parameters', selectedGroupId] })}
                  >
                    <i className="bi bi-arrow-clockwise" aria-hidden />
                    Atualizar
                  </button>
                </div>
              </div>

              <div className="p-4">
                {!selectedGroup ? (
                  <EmptyState text="Selecione um grupo na lista ao lado para visualizar os parametros." />
                ) : parametersQuery.isLoading ? (
                  <LoadingState />
                ) : parameters.length > 0 ? (
                  <div className="overflow-hidden rounded-md border border-slate-200">
                    <div className="max-h-[calc(100vh-280px)] overflow-auto">
                      <table className="w-full border-separate border-spacing-0 text-sm">
                        <thead className="sticky top-0 z-10 bg-slate-50">
                          <tr>
                            <th className="w-40 border-b border-slate-200 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                              Codigo
                            </th>
                            <th className="border-b border-slate-200 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                              Descricao
                            </th>
                            <th className="w-[320px] border-b border-slate-200 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                              Valor
                            </th>
                            <th className="w-28 border-b border-slate-200 px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-slate-500">
                              Ativo
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {parameters.map((parameter) => {
                            const checked = isActive(parameter.activeFlag)
                            return (
                              <tr key={parameter.id} className="border-t border-slate-100 hover:bg-slate-50/80">
                                <td className="border-b border-slate-100 px-4 py-3 align-top">
                                  <div className="font-semibold text-slate-900">{parameter.cdParameter}</div>
                                </td>
                                <td className="border-b border-slate-100 px-4 py-3 align-top text-slate-600">
                                  {parameter.dsParameter ?? '-'}
                                </td>
                                <td className="border-b border-slate-100 px-4 py-3 align-top">
                                  <input
                                    value={parameter.vlParameter ?? ''}
                                    onChange={(e) => {
                                      const nextValue = e.target.value
                                      queryClient.setQueryData(
                                        ['parameters', selectedGroupId],
                                        (current: { table?: ParameterRecord[] } | undefined) => ({
                                          ...current,
                                          table: (current?.table ?? []).map((item) =>
                                            item.id === parameter.id ? { ...item, vlParameter: nextValue } : item,
                                          ),
                                        }),
                                      )
                                    }}
                                    onBlur={(e) => {
                                      const nextValue = e.target.value
                                      updateParameterMutation.mutate({ ...parameter, vlParameter: nextValue })
                                    }}
                                    className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                                    placeholder="Valor"
                                  />
                                </td>
                                <td className="border-b border-slate-100 px-4 py-3 align-top text-center">
                                  <button
                                    type="button"
                                    disabled={toggleParameterMutation.isPending}
                                    onClick={() => toggleParameterMutation.mutate({ parameter, checked: !checked })}
                                    className={[
                                      'inline-flex h-6 w-11 items-center rounded-full px-0.5 transition',
                                      checked ? 'bg-blue-600' : 'bg-slate-300',
                                    ].join(' ')}
                                    title={checked ? 'Desativar' : 'Ativar'}
                                  >
                                    <span
                                      className={[
                                        'h-5 w-5 rounded-full bg-white shadow transition-transform',
                                        checked ? 'translate-x-5' : 'translate-x-0',
                                      ].join(' ')}
                                    />
                                  </button>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : (
                  <EmptyState text="Nenhum parametro encontrado para este grupo." />
                )}
              </div>
            </section>
          </div>
        </div>
      </div>

      {editingTag && (
        <ModalShell title={editingTag.id ? 'Editar grupo' : 'Novo grupo'} onClose={() => !saveTagMutation.isPending && setEditingTag(null)}>
          <div className="space-y-4">
            <label className="block space-y-1">
              <span className="text-sm font-medium text-slate-700">Nome do grupo</span>
              <input
                value={editingTag.nomeTag}
                onChange={(e) => setEditingTag((prev) => (prev ? { ...prev, nomeTag: e.target.value } : prev))}
                className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              />
            </label>

            <label className="block space-y-1">
              <span className="text-sm font-medium text-slate-700">Descricao</span>
              <textarea
                value={editingTag.descricao}
                onChange={(e) => setEditingTag((prev) => (prev ? { ...prev, descricao: e.target.value } : prev))}
                rows={3}
                className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              />
            </label>
          </div>

          <div className="mt-6 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setEditingTag(null)}
              className="rounded-md border border-slate-200 px-4 py-2 text-sm text-slate-700 transition hover:bg-slate-50"
              disabled={saveTagMutation.isPending}
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => saveTagMutation.mutate(editingTag)}
              disabled={saveTagMutation.isPending || !editingTag.nomeTag.trim()}
              className="rounded-md bg-blue-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-800 disabled:opacity-50"
            >
              {saveTagMutation.isPending ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </ModalShell>
      )}
    </AppShell>
  )
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex min-h-[320px] flex-col items-center justify-center text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-blue-50 text-blue-700 ring-1 ring-blue-100">
        <i className="bi bi-inbox text-2xl" aria-hidden />
      </div>
      <p className="mt-4 text-sm font-semibold text-slate-900">Nada para mostrar</p>
      <p className="mt-1 max-w-md text-sm leading-6 text-slate-500">{text}</p>
    </div>
  )
}

function LoadingState() {
  return (
    <div className="flex min-h-[320px] items-center justify-center text-sm text-slate-500">
      <span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-blue-700 border-t-transparent" />
      Carregando...
    </div>
  )
}

function ModalShell({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: ReactNode
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-lg bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
          <button type="button" className="rounded p-1 text-slate-500 transition hover:bg-slate-100" onClick={onClose}>
            <i className="bi bi-x-lg text-sm" aria-hidden />
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  )
}

function isActive(value: unknown) {
  return ['1', 1, true, 'S', 's', 'true', 'TRUE'].includes(value as never)
}
