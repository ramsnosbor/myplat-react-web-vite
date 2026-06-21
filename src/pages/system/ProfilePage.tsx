import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AppShell } from '@/components/layout/AppShell'
import { authApi, type User } from '@/api/auth.api'
import { termsApi, type CurrentTerms, type TermsStatus } from '@/api/terms.api'
import { useAuthStore } from '@/store/authStore'
import { useToast } from '@/components/ui/Toast'
import pushNotificationService from '@/services/pushNotificationService'

interface ProfileFormState {
  nome: string
  flDuploFator: boolean
  tpEnviarPor: string
}

export default function ProfilePage() {
  const storeUser = useAuthStore((s) => s.user)
  const setUser = useAuthStore((s) => s.setUser)
  const toast = useToast()
  const queryClient = useQueryClient()
  const [editOpen, setEditOpen] = useState(false)
  const [pushSupported, setPushSupported] = useState(false)
  const [pushEnabled, setPushEnabled] = useState(false)
  const [pushPermission, setPushPermission] = useState<NotificationPermission | 'unsupported'>('unsupported')
  const [pushLoading, setPushLoading] = useState(false)
  const [revokeOpen, setRevokeOpen] = useState(false)
  const [revokeReason, setRevokeReason] = useState('')
  const [form, setForm] = useState<ProfileFormState>({
    nome: '',
    flDuploFator: false,
    tpEnviarPor: '',
  })

  const { data: user, isLoading, isError } = useQuery({
    queryKey: ['logged-user'],
    queryFn: authApi.getLoggedUser,
    staleTime: 30_000,
    initialData: storeUser ?? undefined,
  })

  useEffect(() => {
    if (user) setUser(user)
  }, [user, setUser])

  useEffect(() => {
    const initPush = async () => {
      const supported = pushNotificationService.isAvailable()
      setPushSupported(supported)
      if (!supported) {
        setPushPermission('unsupported')
        setPushEnabled(false)
        return
      }
      setPushPermission(Notification.permission)
      await pushNotificationService.init()
      const subscribed = await pushNotificationService.isSubscribed()
      setPushEnabled(subscribed)
      setPushPermission(Notification.permission)
    }
    void initPush()
  }, [])

  const { data: termsData, isLoading: termsLoading } = useQuery({
    queryKey: ['profile-terms'],
    queryFn: async () => {
      const [statusResult, currentResult] = await Promise.allSettled([
        termsApi.getAcceptanceStatus(),
        termsApi.getCurrent(),
      ])
      return {
        status: statusResult.status === 'fulfilled' ? statusResult.value : null,
        current: currentResult.status === 'fulfilled' ? currentResult.value : null,
      }
    },
    staleTime: 60_000,
  })

  const mutation = useMutation({
    mutationFn: () => authApi.updateProfile({
      nome: form.nome,
      flDuploFator: form.flDuploFator ? 'S' : 'N',
      tpEnviarPor: form.flDuploFator ? form.tpEnviarPor || null : null,
    }),
    onSuccess: (updated) => {
      const nextUser = { ...(user ?? {}), ...(updated ?? {}), name: form.nome } as User
      setUser(nextUser)
      queryClient.setQueryData(['logged-user'], nextUser)
      setEditOpen(false)
      toast.success('Perfil atualizado.')
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { message?: string; messageError?: string } } })
          ?.response?.data?.messageError ??
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Erro ao salvar perfil.'
      toast.error(msg)
    },
  })

  const revokeMutation = useMutation({
    mutationFn: () => {
      const acceptanceId = termsData?.status?.aceiteId
      if (!acceptanceId) throw new Error('Aceite nao encontrado.')
      return termsApi.revokeAcceptance(acceptanceId, revokeReason)
    },
    onSuccess: async () => {
      setRevokeOpen(false)
      setRevokeReason('')
      await queryClient.invalidateQueries({ queryKey: ['profile-terms'] })
      toast.success('Consentimento revogado.')
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { message?: string; messageError?: string } } })
          ?.response?.data?.messageError ??
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Nao foi possivel revogar o consentimento.'
      toast.error(msg)
    },
  })

  const initials = useMemo(() => getUserInitials(user?.email ?? user?.username), [user])
  const mfaLabel = user?.mfaType === 'EMAIL' ? 'E-mail' : user?.mfaType === 'WHATSAPP' ? 'WhatsApp' : null

  function openEdit() {
    setForm({
      nome: user?.name ?? '',
      flDuploFator: !!user?.mfaEnabled,
      tpEnviarPor: user?.mfaType ?? '',
    })
    setEditOpen(true)
  }

  async function handlePushToggle() {
    if (!pushSupported) return
    setPushLoading(true)
    try {
      if (pushEnabled) {
        await pushNotificationService.unsubscribe()
        setPushEnabled(false)
        toast.success('Notificacoes desativadas.')
      } else {
        await pushNotificationService.subscribe()
        setPushEnabled(true)
        setPushPermission('granted')
        toast.success('Notificacoes ativadas.')
      }
    } catch {
      setPushPermission(Notification.permission)
    } finally {
      setPushLoading(false)
    }
  }

  return (
    <AppShell title="Perfil" subtitle="Dados da conta e seguranca">
      <div className="min-h-full bg-background p-4 sm:p-6">
        <div className="mx-auto max-w-5xl">
          {isLoading && (
            <div className="flex h-64 items-center justify-center">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            </div>
          )}

          {isError && (
            <div className="rounded-md border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
              Nao foi possivel carregar os dados do perfil.
            </div>
          )}

          {!isLoading && !isError && user && (
            <>
              <section className="rounded-lg bg-blue-700 p-5 text-white shadow-xl shadow-blue-950/10 sm:p-7">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 items-center gap-4">
                    <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-white/20 text-xl font-bold ring-2 ring-white/30">
                      {initials}
                    </div>
                    <div className="min-w-0">
                      <h1 className="truncate text-2xl font-semibold">{user.name ?? user.username}</h1>
                      <p className="mt-1 truncate text-sm text-blue-100">{user.email ?? user.username}</p>
                      {user.mfaEnabled && (
                        <span className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-white/25 bg-white/15 px-3 py-1 text-xs font-semibold">
                          <i className="bi bi-shield-check" aria-hidden />
                          MFA ativo{mfaLabel ? ` - ${mfaLabel}` : ''}
                        </span>
                      )}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={openEdit}
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-white/40 px-4 text-sm font-semibold text-white transition hover:bg-white/10"
                  >
                    <i className="bi bi-pencil" aria-hidden />
                    Editar perfil
                  </button>
                </div>
              </section>

              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                <InfoCard title="Dados pessoais" icon="bi bi-person">
                  <InfoRow icon="bi bi-person" label="Nome" value={user.name} />
                  <InfoRow icon="bi bi-envelope" label="E-mail" value={user.email} verified={user.confirmedEmail} />
                  <InfoRow icon="bi bi-telephone" label="Telefone" value={user.telephone} verified={user.confirmedTelephone} />
                  <InfoRow icon="bi bi-person-vcard" label="CPF" value={user.cpf} />
                  <InfoRow icon="bi bi-key" label="Usuario" value={user.username} />
                  <InfoRow icon="bi bi-calendar3" label="Conta criada em" value={formatDate(user.createdAt)} />
                </InfoCard>

                <InfoCard title="Organizacao ativa" icon="bi bi-building">
                  <InfoRow icon="bi bi-building" label="Nome" value={user.tenant?.name} />
                  <InfoRow icon="bi bi-key" label="Codigo" value={user.tenant?.code} />
                  <InfoRow icon="bi bi-card-text" label="Descricao" value={user.tenant?.description} />
                  <InfoRow icon="bi bi-bank" label="Razao social" value={user.tenant?.company} />
                  <InfoRow icon="bi bi-person-vcard" label="CNPJ / CPF" value={user.tenant?.cnpjCpf} />
                  <InfoRow icon="bi bi-receipt" label="Utiliza NF-e" value={formatYesNo(user.tenant?.usaNfe)} />
                </InfoCard>

                <InfoCard title="Seguranca" icon="bi bi-shield-check">
                  <SecurityItem
                    icon={user.mfaEnabled ? 'bi bi-shield-check' : 'bi bi-lock'}
                    title="Verificacao em duas etapas"
                    description={user.mfaEnabled ? `Ativa${mfaLabel ? ` - ${mfaLabel}` : ''}` : 'Nao ativa na sua conta'}
                    active={!!user.mfaEnabled}
                  />
                  <SecurityItem
                    icon="bi bi-envelope-check"
                    title="E-mail verificado"
                    description={user.confirmedEmail ? 'Seu e-mail foi confirmado' : 'Confirmacao de e-mail pendente'}
                    active={!!user.confirmedEmail}
                  />
                  <SecurityItem
                    icon="bi bi-phone"
                    title="Telefone verificado"
                    description={user.confirmedTelephone ? 'Seu telefone foi confirmado' : 'Confirmacao de telefone pendente'}
                    active={!!user.confirmedTelephone}
                  />
                </InfoCard>

                <InfoCard title="Notificacoes push" icon="bi bi-bell">
                  <FeatureItem
                    icon={pushEnabled ? 'bi bi-bell-fill' : 'bi bi-bell-slash'}
                    title={pushEnabled ? 'Notificacoes ativadas' : 'Notificacoes desativadas'}
                    description={getPushDescription(pushSupported, pushPermission)}
                    active={pushEnabled}
                    action={
                      <button
                        type="button"
                        onClick={handlePushToggle}
                        disabled={!pushSupported || pushLoading || pushPermission === 'denied'}
                        className={[
                          'inline-flex h-6 w-11 items-center rounded-full px-0.5 transition disabled:opacity-50',
                          pushEnabled ? 'bg-blue-600' : 'bg-slate-300',
                        ].join(' ')}
                        title={pushEnabled ? 'Desativar' : 'Ativar'}
                      >
                        <span
                          className={[
                            'h-5 w-5 rounded-full bg-white shadow transition-transform',
                            pushEnabled ? 'translate-x-5' : 'translate-x-0',
                          ].join(' ')}
                        />
                      </button>
                    }
                  />
                </InfoCard>

                <OrganizationsCard user={user} />

                <PrivacyCard
                  loading={termsLoading}
                  status={termsData?.status ?? null}
                  current={termsData?.current ?? null}
                  onRevoke={() => setRevokeOpen(true)}
                />
              </div>
            </>
          )}
        </div>
      </div>

      {editOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => !mutation.isPending && setEditOpen(false)}>
          <div className="w-full max-w-md rounded-lg bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <h2 className="text-sm font-semibold text-slate-900">Editar perfil</h2>
              <button
                type="button"
                disabled={mutation.isPending}
                onClick={() => setEditOpen(false)}
                className="rounded p-1 text-slate-500 hover:bg-slate-100"
              >
                <i className="bi bi-x-lg text-sm" aria-hidden />
              </button>
            </div>

            <div className="space-y-4 p-4">
              <label className="block space-y-1">
                <span className="text-sm font-medium text-slate-700">Nome</span>
                <input
                  value={form.nome}
                  onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))}
                  disabled={mutation.isPending}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                />
              </label>

              <label className="flex items-center justify-between gap-4 rounded-md border border-border px-3 py-2">
                <span>
                  <span className="block text-sm font-medium text-slate-800">Verificacao em duas etapas</span>
                  <span className="block text-xs text-slate-500">Exige codigo adicional no login.</span>
                </span>
                <input
                  type="checkbox"
                  checked={form.flDuploFator}
                  onChange={(e) => setForm((f) => ({ ...f, flDuploFator: e.target.checked, tpEnviarPor: e.target.checked ? f.tpEnviarPor : '' }))}
                  disabled={mutation.isPending}
                  className="h-4 w-4"
                />
              </label>

              {form.flDuploFator && (
                <label className="block space-y-1">
                  <span className="text-sm font-medium text-slate-700">Canal de envio</span>
                  <select
                    value={form.tpEnviarPor}
                    onChange={(e) => setForm((f) => ({ ...f, tpEnviarPor: e.target.value }))}
                    disabled={mutation.isPending}
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value="">Selecione...</option>
                    <option value="EMAIL">E-mail</option>
                    <option value="WHATSAPP">WhatsApp</option>
                  </select>
                </label>
              )}
            </div>

            <div className="flex justify-end gap-2 border-t border-border px-4 py-3">
              <button
                type="button"
                disabled={mutation.isPending}
                onClick={() => setEditOpen(false)}
                className="rounded-md border border-border px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={mutation.isPending || !form.nome.trim() || (form.flDuploFator && !form.tpEnviarPor)}
                onClick={() => mutation.mutate()}
                className="rounded-md bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-50"
              >
                {mutation.isPending ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {revokeOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => !revokeMutation.isPending && setRevokeOpen(false)}>
          <div className="w-full max-w-md rounded-lg bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <h2 className="text-sm font-semibold text-red-700">Revogar consentimento</h2>
              <button
                type="button"
                disabled={revokeMutation.isPending}
                onClick={() => setRevokeOpen(false)}
                className="rounded p-1 text-slate-500 hover:bg-slate-100"
              >
                <i className="bi bi-x-lg text-sm" aria-hidden />
              </button>
            </div>

            <div className="space-y-4 p-4">
              <div className="rounded-md border border-yellow-200 bg-yellow-50 px-3 py-2 text-sm leading-6 text-yellow-800">
                Ao revogar o consentimento, o acesso podera depender de um novo aceite dos Termos de Uso.
              </div>
              <label className="block space-y-1">
                <span className="text-sm font-medium text-slate-700">Motivo da revogacao</span>
                <textarea
                  value={revokeReason}
                  onChange={(e) => setRevokeReason(e.target.value)}
                  disabled={revokeMutation.isPending}
                  rows={3}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                  placeholder="Opcional"
                />
              </label>
            </div>

            <div className="flex justify-end gap-2 border-t border-border px-4 py-3">
              <button
                type="button"
                disabled={revokeMutation.isPending}
                onClick={() => setRevokeOpen(false)}
                className="rounded-md border border-border px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={revokeMutation.isPending || !termsData?.status?.aceiteId}
                onClick={() => revokeMutation.mutate()}
                className="rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
              >
                {revokeMutation.isPending ? 'Revogando...' : 'Revogar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  )
}

function InfoCard({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-blue-100 bg-white p-4 shadow-sm shadow-blue-950/5">
      <div className="mb-3 flex items-center gap-2 border-b border-slate-100 pb-3">
        <i className={`${icon} text-blue-700`} aria-hidden />
        <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
      </div>
      <div className="space-y-2">{children}</div>
    </section>
  )
}

function InfoRow({ icon, label, value, verified }: { icon: string; label: string; value?: unknown; verified?: boolean }) {
  return (
    <div className="flex items-start gap-3 rounded-md px-1 py-1.5">
      <i className={`${icon} mt-0.5 text-sm text-slate-400`} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-xs text-slate-500">{label}</p>
        <div className="mt-0.5 flex items-center gap-2">
          <p className="truncate text-sm font-medium text-slate-800">{formatValue(value)}</p>
          {verified !== undefined && (
            <i
              className={`bi ${verified ? 'bi-check-circle-fill text-green-600' : 'bi-exclamation-triangle-fill text-yellow-500'} text-xs`}
              aria-hidden
            />
          )}
        </div>
      </div>
    </div>
  )
}

function SecurityItem({ icon, title, description, active }: { icon: string; title: string; description: string; active: boolean }) {
  return (
    <div className="flex items-start gap-3 rounded-md border border-slate-100 bg-slate-50 p-3">
      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md ${active ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
        <i className={icon} aria-hidden />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-slate-800">{title}</p>
        <p className="mt-0.5 text-xs text-slate-500">{description}</p>
      </div>
      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${active ? 'bg-green-100 text-green-700' : 'bg-slate-200 text-slate-600'}`}>
        {active ? 'Ativo' : 'Pendente'}
      </span>
    </div>
  )
}

function FeatureItem({
  icon,
  title,
  description,
  active,
  action,
}: {
  icon: string
  title: string
  description: string
  active: boolean
  action?: React.ReactNode
}) {
  return (
    <div className="flex items-start gap-3 rounded-md border border-slate-100 bg-slate-50 p-3">
      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md ${active ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500'}`}>
        <i className={icon} aria-hidden />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-slate-800">{title}</p>
        <p className="mt-0.5 text-xs leading-5 text-slate-500">{description}</p>
      </div>
      {action}
    </div>
  )
}

function OrganizationsCard({ user }: { user: User }) {
  const organizations = Object.entries(user.tenantSupported ?? {})

  return (
    <InfoCard title="Organizacoes com acesso" icon="bi bi-grid">
      {organizations.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {organizations.map(([code, name]) => (
            <span
              key={code}
              className={[
                'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold',
                code === user.tenant?.code
                  ? 'border-blue-200 bg-blue-50 text-blue-700'
                  : 'border-slate-200 bg-slate-50 text-slate-600',
              ].join(' ')}
            >
              <i className="bi bi-building" aria-hidden />
              {name}
            </span>
          ))}
        </div>
      ) : (
        <p className="rounded-md border border-slate-100 bg-slate-50 p-3 text-sm text-slate-500">
          Nenhuma outra organizacao disponivel para este usuario.
        </p>
      )}
    </InfoCard>
  )
}

function PrivacyCard({
  loading,
  status,
  current,
  onRevoke,
}: {
  loading: boolean
  status: TermsStatus | null
  current: CurrentTerms | null
  onRevoke: () => void
}) {
  const accepted = !!status?.aceitouVigente

  return (
    <InfoCard title="Privacidade e LGPD" icon="bi bi-file-earmark-lock">
      {loading ? (
        <div className="flex items-center justify-center py-6 text-sm text-slate-500">
          <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          Carregando...
        </div>
      ) : (
        <>
          <FeatureItem
            icon={accepted ? 'bi bi-check-circle' : 'bi bi-exclamation-triangle'}
            title={`Termos de Uso${status?.versao ? ` (${status.versao})` : current?.versao ? ` (${current.versao})` : ''}`}
            description={accepted && status?.aceitoEm ? `Aceito em ${formatDate(status.aceitoEm)}` : accepted ? 'Termos aceitos.' : 'Aceite pendente ou nao localizado.'}
            active={accepted}
          />

          <div className="mt-3 flex flex-wrap gap-2">
            {current?.urlDocumento && (
              <a
                href={current.urlDocumento}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-md border border-blue-200 px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50"
              >
                <i className="bi bi-download" aria-hidden />
                Visualizar termos
              </a>
            )}
            {accepted && status?.aceiteId && (
              <button
                type="button"
                onClick={onRevoke}
                className="inline-flex items-center gap-2 rounded-md border border-red-200 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
              >
                <i className="bi bi-x-circle" aria-hidden />
                Revogar consentimento
              </button>
            )}
          </div>

          <p className="mt-3 text-xs leading-5 text-slate-500">
            Conforme a LGPD, o consentimento pode ser revogado a qualquer momento.
          </p>
        </>
      )}
    </InfoCard>
  )
}

function getPushDescription(supported: boolean, permission: NotificationPermission | 'unsupported') {
  if (!supported) return 'Seu navegador nao suporta notificacoes em segundo plano.'
  if (permission === 'denied') return 'Permissao bloqueada no navegador.'
  if (permission === 'granted') return 'Alertas do navegador estao permitidos para esta sessao.'
  return 'Ative para permitir alertas em tempo real no navegador.'
}

function getUserInitials(value?: string) {
  if (!value) return 'U'
  const name = value.includes('@') ? value.split('@')[0] : value
  const parts = name.split(/[._\-\s]+/).filter(Boolean)
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
  return name.slice(0, 2).toUpperCase()
}

function formatDate(value?: string) {
  if (!value) return undefined
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
}

function formatYesNo(value: unknown) {
  if (value === undefined || value === null || value === '') return undefined
  return ['S', '1', 's', 'true', 'TRUE', true].includes(value as never) ? 'Sim' : 'Nao'
}

function formatValue(value: unknown) {
  if (value === undefined || value === null || value === '') return '-'
  return String(value)
}
