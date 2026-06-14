import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { AppShell } from '@/components/layout/AppShell'
import { useToast } from '@/components/ui/Toast'
import { userAdminApi, type UserAdminRecord } from '@/api/user-admin.api'

interface Filters {
  id: string
  name: string
  telephone: string
  email: string
}

const pageSizes = [2, 25, 50, 100, 500]

export default function UsuarioListPage() {
  const navigate = useNavigate()
  const toast = useToast()
  const [filters, setFilters] = useState<Filters>({ id: '', name: '', telephone: '', email: '' })
  const [appliedFilters, setAppliedFilters] = useState<Filters>({ id: '', name: '', telephone: '', email: '' })
  const [pageNumber, setPageNumber] = useState(1)
  const [pageSize, setPageSize] = useState(25)

  const queryParams = useMemo(() => ({
    ...compact(appliedFilters),
    pageNumber,
    pageSize,
  }), [appliedFilters, pageNumber, pageSize])

  const usersQuery = useQuery({
    queryKey: ['tenant-users', queryParams],
    queryFn: () => userAdminApi.getTenantUsers(queryParams),
    staleTime: 10_000,
  })

  const users = usersQuery.data?.table ?? []
  const totalElements = usersQuery.data?.size ?? 0
  const totalPages = Math.max(1, Math.ceil(totalElements / pageSize))

  function applyFilters() {
    setPageNumber(1)
    setAppliedFilters(filters)
  }

  async function inviteUser() {
    if (!filters.email.trim()) {
      toast.error('Informe um e-mail valido.')
      return
    }

    try {
      const user = await userAdminApi.getUserByEmail(filters.email.trim())
      if (!user?.id) {
        toast.error('Usuario nao encontrado.')
        return
      }
      openPermissions(user)
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string; messageError?: string } } })
          ?.response?.data?.messageError ??
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Erro ao buscar usuario.'
      toast.error(msg)
    }
  }

  function openPermissions(user: UserAdminRecord) {
    navigate('/usuario', {
      state: {
        id: user.id,
        name: user.name ?? user.nome ?? user.email ?? `Usuario ${user.id}`,
      },
    })
  }

  return (
    <AppShell title="Lista de Usuarios" subtitle="Consulta e administracao de usuarios do ambiente.">
      <div className="min-h-full w-full bg-background p-3 sm:p-4">
        <div className="w-full space-y-4">
          <section className="rounded-lg border border-blue-100 bg-white p-4 shadow-sm shadow-blue-950/5">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-md bg-blue-700 text-white">
                <i className="bi bi-people" aria-hidden />
              </div>
              <div>
                <h1 className="text-lg font-semibold text-slate-900">Lista de Usuarios</h1>
                <p className="text-sm text-slate-500">Filtre usuarios e acesse suas permissoes.</p>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-12">
              <Field className="md:col-span-2" label="ID">
                <input
                  type="number"
                  value={filters.id}
                  onChange={(e) => setFilters((f) => ({ ...f, id: e.target.value }))}
                  className={inputClass}
                  placeholder="ID"
                />
              </Field>
              <Field className="md:col-span-4" label="Nome">
                <input
                  value={filters.name}
                  onChange={(e) => setFilters((f) => ({ ...f, name: e.target.value }))}
                  className={inputClass}
                  placeholder="Nome do usuario"
                />
              </Field>
              <Field className="md:col-span-3" label="Telefone">
                <input
                  value={filters.telephone}
                  onChange={(e) => setFilters((f) => ({ ...f, telephone: e.target.value }))}
                  className={inputClass}
                  placeholder="Telefone"
                />
              </Field>
              <Field className="md:col-span-3" label="E-mail">
                <input
                  value={filters.email}
                  onChange={(e) => setFilters((f) => ({ ...f, email: e.target.value }))}
                  className={inputClass}
                  placeholder="E-mail"
                />
              </Field>
            </div>

            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button type="button" onClick={() => navigate('/home')} className={secondaryButtonClass}>
                Voltar
              </button>
              <button type="button" onClick={inviteUser} className={secondaryButtonClass}>
                <i className="bi bi-envelope-plus" aria-hidden />
                Convidar
              </button>
              <button type="button" onClick={applyFilters} className={primaryButtonClass}>
                <i className="bi bi-search" aria-hidden />
                Filtrar
              </button>
            </div>
          </section>

          <section className="rounded-lg border border-blue-100 bg-white shadow-sm shadow-blue-950/5">
            <div className="overflow-hidden rounded-lg">
              <div className="max-h-[calc(100vh-330px)] overflow-auto">
                <table className="w-full border-separate border-spacing-0 text-sm">
                  <thead className="sticky top-0 z-10 bg-slate-50">
                    <tr>
                      {['ID', 'Nome', 'CPF', 'E-mail', 'Telefone', 'Acoes'].map((header) => (
                        <th key={header} className="border-b border-slate-200 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                          {header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {usersQuery.isLoading ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-12 text-center text-sm text-slate-500">
                          <span className="mr-2 inline-block h-4 w-4 animate-spin rounded-full border-2 border-blue-700 border-t-transparent align-[-2px]" />
                          Carregando...
                        </td>
                      </tr>
                    ) : users.length > 0 ? (
                      users.map((user) => (
                        <tr key={user.id} className="hover:bg-slate-50/80">
                          <td className="border-b border-slate-100 px-4 py-3 text-slate-700">{user.id}</td>
                          <td className="border-b border-slate-100 px-4 py-3 font-medium text-slate-900">{user.name ?? user.nome ?? '-'}</td>
                          <td className="border-b border-slate-100 px-4 py-3 text-slate-600">{user.cpf ?? '-'}</td>
                          <td className="border-b border-slate-100 px-4 py-3 text-slate-600">{user.email ?? '-'}</td>
                          <td className="border-b border-slate-100 px-4 py-3 text-slate-600">{user.telephone ?? '-'}</td>
                          <td className="border-b border-slate-100 px-4 py-3">
                            <div className="flex items-center gap-1">
                              <IconButton title="Permissoes" icon="bi bi-person-lock" tone="warning" onClick={() => openPermissions(user)} />
                              <IconButton title="Remover" icon="bi bi-x-circle" tone="danger" onClick={() => openPermissions(user)} />
                            </div>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={6} className="px-4 py-14 text-center">
                          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-blue-700 ring-1 ring-blue-100">
                            <i className="bi bi-inbox text-xl" aria-hidden />
                          </div>
                          <p className="mt-3 text-sm font-semibold text-slate-800">Nenhum usuario encontrado</p>
                          <p className="mt-1 text-xs text-slate-500">Ajuste os filtros e tente novamente.</p>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex flex-col gap-3 border-t border-slate-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-slate-500">
                Registros: <span className="font-semibold text-slate-700">{totalElements}</span>
                <span className="mx-2">|</span>
                Paginas: <span className="font-semibold text-slate-700">{totalPages}</span>
              </p>
              <div className="flex items-center justify-end gap-2">
                <button className={pagerButtonClass} onClick={() => setPageNumber(1)} disabled={pageNumber <= 1}>Primeira</button>
                <button className={pagerButtonClass} onClick={() => setPageNumber((p) => Math.max(1, p - 1))} disabled={pageNumber <= 1}>Anterior</button>
                <span className="rounded-md border border-slate-200 px-3 py-1.5 text-sm text-slate-700">{pageNumber}</span>
                <button className={pagerButtonClass} onClick={() => setPageNumber((p) => Math.min(totalPages, p + 1))} disabled={pageNumber >= totalPages}>Proxima</button>
                <button className={pagerButtonClass} onClick={() => setPageNumber(totalPages)} disabled={pageNumber >= totalPages}>Ultima</button>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value))
                    setPageNumber(1)
                  }}
                  className="h-9 rounded-md border border-slate-200 bg-white px-2 text-sm outline-none focus:ring-2 focus:ring-blue-100"
                >
                  {pageSizes.map((size) => <option key={size} value={size}>{size}</option>)}
                </select>
              </div>
            </div>
          </section>
        </div>
      </div>
    </AppShell>
  )
}

const inputClass = 'h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100'
const primaryButtonClass = 'inline-flex h-9 items-center gap-2 rounded-md bg-blue-700 px-3 text-sm font-semibold text-white transition hover:bg-blue-800'
const secondaryButtonClass = 'inline-flex h-9 items-center gap-2 rounded-md border border-slate-200 px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50'
const pagerButtonClass = 'rounded-md border border-slate-200 px-3 py-1.5 text-sm text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50'

function Field({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <label className={['block space-y-1', className].filter(Boolean).join(' ')}>
      <span className="text-sm font-medium text-slate-700">{label}</span>
      {children}
    </label>
  )
}

function IconButton({ title, icon, tone, onClick }: { title: string; icon: string; tone: 'warning' | 'danger'; onClick: () => void }) {
  const cls = tone === 'warning'
    ? 'border-yellow-200 bg-yellow-50 text-yellow-700 hover:bg-yellow-100'
    : 'border-red-200 bg-red-50 text-red-700 hover:bg-red-100'

  return (
    <button type="button" title={title} onClick={onClick} className={`inline-flex h-8 w-8 items-center justify-center rounded-md border transition ${cls}`}>
      <i className={icon} aria-hidden />
    </button>
  )
}

function compact(filters: Filters) {
  return Object.fromEntries(Object.entries(filters).filter(([, value]) => value !== ''))
}
