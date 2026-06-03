import { useMemo } from 'react'
import { useAuthStore } from '@/store/authStore'
import { AppShell } from '@/components/layout/AppShell'

const SYSTEM_PAGES = {
  profile: {
    title: 'Perfil',
    description: 'Dados da conta, seguranca e organizacao ativa.',
    icon: 'bi bi-person-circle',
  },
  parameterConfig: {
    title: 'Tags - Parametros',
    description: 'Configuracoes e tags usadas por rotinas do sistema.',
    icon: 'bi bi-sliders',
  },
  usuarioList: {
    title: 'Lista de Usuarios',
    description: 'Consulta e administracao de usuarios do ambiente.',
    icon: 'bi bi-people',
  },
  'perfis-acesso': {
    title: 'Perfis de Acesso',
    description: 'Perfis, niveis e permissoes por modulo.',
    icon: 'bi bi-shield-check',
  },
  'usuario-perfis': {
    title: 'Usuarios e Perfis',
    description: 'Vinculo entre usuarios e perfis de acesso.',
    icon: 'bi bi-person-lock',
  },
  'usuario-cliente': {
    title: 'Usuarios Cliente',
    description: 'Usuarios externos vinculados ao tenant atual.',
    icon: 'bi bi-person-badge',
  },
  template: {
    title: 'Templates',
    description: 'Modelos usados em comunicacoes e mensagens.',
    icon: 'bi bi-chat-square-text',
  },
  messagesDefinition: {
    title: 'Mensagens Automatizadas',
    description: 'Definicoes de disparo e variaveis de mensagens.',
    icon: 'bi bi-bell',
  },
} as const

export type SystemPageKey = keyof typeof SYSTEM_PAGES

interface SystemPageProps {
  page: SystemPageKey
}

export default function SystemPage({ page }: SystemPageProps) {
  const user = useAuthStore((s) => s.user)
  const tenant = useAuthStore((s) => s.tenant)
  const config = SYSTEM_PAGES[page]

  const stats = useMemo(() => [
    { label: 'Escopo', value: tenant?.label ?? tenant?.code ?? 'Tenant atual' },
    { label: 'Usuario', value: user?.name ?? user?.username ?? 'Usuario logado' },
    { label: 'Tipo', value: 'Tela fixa do sistema' },
  ], [tenant, user])

  return (
    <AppShell title={config.title} subtitle={config.description}>
    <div className="min-h-full bg-background p-4 sm:p-6">
      <div className="mx-auto max-w-6xl">
        <section className="rounded-lg border border-blue-100 bg-white p-5 shadow-sm shadow-blue-950/5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-blue-700 text-white">
                <i className={`${config.icon} text-xl`} aria-hidden />
              </div>
              <div className="min-w-0">
                <h1 className="truncate text-xl font-semibold text-slate-900">{config.title}</h1>
                <p className="mt-1 text-sm text-slate-500">{config.description}</p>
              </div>
            </div>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            {stats.map((item) => (
              <div key={item.label} className="rounded-md border border-slate-100 bg-slate-50 px-3 py-2">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{item.label}</p>
                <p className="mt-1 truncate text-sm font-semibold text-slate-800">{item.value}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-4 rounded-lg border border-dashed border-blue-200 bg-white p-8 text-center shadow-sm shadow-blue-950/5">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-blue-50 text-blue-700 ring-1 ring-blue-100">
            <i className="bi bi-tools text-2xl" aria-hidden />
          </div>
          <h2 className="mt-4 text-base font-semibold text-slate-900">Tela pronta para implementacao fixa</h2>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-500">
            Esta rota ja esta criada como pagina de sistema. A proxima etapa e adaptar aqui a regra especifica da tela antiga,
            usando componentes e APIs desta arquitetura.
          </p>
        </section>
      </div>
    </div>
    </AppShell>
  )
}
