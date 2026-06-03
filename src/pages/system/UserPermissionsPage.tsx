import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { AppShell } from '@/components/layout/AppShell'
import { useToast } from '@/components/ui/Toast'
import { userAdminApi, type UserEntityPermission } from '@/api/user-admin.api'

const marks = [
  { value: 0, label: 'Ler' },
  { value: 25, label: 'Alterar' },
  { value: 50, label: 'Criar' },
  { value: 75, label: 'Excluir' },
  { value: 100, label: 'Total' },
]

export default function UserPermissionsPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const toast = useToast()
  const state = location.state as { id?: number | string; name?: string } | null
  const userId = state?.id
  const userName = state?.name ?? 'Usuario'
  const [permissions, setPermissions] = useState<UserEntityPermission[]>([])
  const [defaultValue, setDefaultValue] = useState(50)

  const permissionsQuery = useQuery({
    queryKey: ['user-entities', userId],
    queryFn: () => userAdminApi.getUserEntities(userId as number | string),
    enabled: !!userId,
  })

  useEffect(() => {
    if (permissionsQuery.data?.table) setPermissions(permissionsQuery.data.table)
  }, [permissionsQuery.data])

  const sortedPermissions = useMemo(
    () => [...permissions].sort((a, b) => a.entity.localeCompare(b.entity)),
    [permissions],
  )

  const mutation = useMutation({
    mutationFn: () => userAdminApi.updateUserEntities(userId as number | string, permissions),
    onSuccess: () => toast.success('Registro atualizado com sucesso.'),
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { message?: string; messageError?: string } } })
          ?.response?.data?.messageError ??
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Erro ao atualizar permissoes.'
      toast.error(msg)
    },
  })

  function updatePermission(entityId: number | string, verbValue: number) {
    setPermissions((current) => current.map((item) => (
      String(item.entityId) === String(entityId) ? { ...item, verbValue } : item
    )))
  }

  if (!userId) {
    return (
      <AppShell title="Permissoes do Usuario" subtitle="Selecione um usuario para editar permissoes.">
        <div className="p-6">
          <div className="rounded-lg border border-blue-100 bg-white p-8 text-center shadow-sm shadow-blue-950/5">
            <p className="text-sm text-slate-600">Nenhum usuario selecionado.</p>
            <button className="mt-4 rounded-md bg-blue-700 px-4 py-2 text-sm font-semibold text-white" onClick={() => navigate('/usuarioList')}>
              Voltar
            </button>
          </div>
        </div>
      </AppShell>
    )
  }

  return (
    <AppShell title="Permissoes do Usuario" subtitle="Controle de funcionalidades por usuario.">
      <div className="min-h-full bg-background p-4 sm:p-6">
        <div className="mx-auto max-w-6xl rounded-lg border border-blue-100 bg-white p-4 shadow-sm shadow-blue-950/5">
          <div className="grid gap-3 md:grid-cols-12">
            <Field className="md:col-span-3" label="ID">
              <input className={inputClass} value={userId} disabled />
            </Field>
            <Field className="md:col-span-9" label="Nome">
              <input className={inputClass} value={userName} disabled />
            </Field>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
            <Field label="Aplicar todos">
              <PermissionSlider value={defaultValue} onChange={setDefaultValue} />
            </Field>
            <button
              type="button"
              onClick={() => setPermissions((current) => current.map((item) => ({ ...item, verbValue: defaultValue })))}
              className="h-9 rounded-md bg-blue-700 px-4 text-sm font-semibold text-white hover:bg-blue-800"
            >
              Aplicar Todos
            </button>
          </div>

          <div className="mt-6 border-t border-slate-100 pt-4">
            <h2 className="text-sm font-semibold text-slate-900">Funcionalidades</h2>
            <div className="mt-3 max-h-[48vh] overflow-auto rounded-md border border-slate-200">
              {permissionsQuery.isLoading ? (
                <div className="py-12 text-center text-sm text-slate-500">Carregando...</div>
              ) : sortedPermissions.map((item, index) => (
                <div key={item.entityId} className={`grid gap-3 px-4 py-3 md:grid-cols-[minmax(0,1fr)_minmax(260px,420px)] md:items-center ${index % 2 === 0 ? 'bg-slate-50' : 'bg-white'}`}>
                  <label className="flex items-center gap-2 text-sm font-medium text-slate-800">
                    <input
                      type="checkbox"
                      checked={item.verbValue >= 0}
                      onChange={(e) => updatePermission(item.entityId, e.target.checked ? 100 : -1)}
                      className="h-4 w-4"
                    />
                    {item.entity}
                  </label>
                  <PermissionSlider value={item.verbValue} onChange={(value) => updatePermission(item.entityId, value)} disabled={item.verbValue < 0} />
                </div>
              ))}
            </div>
          </div>

          <div className="mt-4 flex justify-end gap-2">
            <button type="button" onClick={() => navigate('/usuarioList')} className="rounded-md border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              Voltar
            </button>
            <button type="button" onClick={() => mutation.mutate()} disabled={mutation.isPending} className="rounded-md bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-50">
              {mutation.isPending ? 'Enviando...' : 'Enviar'}
            </button>
          </div>
        </div>
      </div>
    </AppShell>
  )
}

const inputClass = 'h-10 w-full rounded-md border border-slate-200 bg-slate-50 px-3 text-sm text-slate-600 outline-none'

function Field({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <label className={['block space-y-1', className].filter(Boolean).join(' ')}>
      <span className="text-sm font-medium text-slate-700">{label}</span>
      {children}
    </label>
  )
}

function PermissionSlider({ value, onChange, disabled }: { value: number; onChange: (value: number) => void; disabled?: boolean }) {
  return (
    <div>
      <input
        type="range"
        min={0}
        max={100}
        step={25}
        value={Math.max(0, value)}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-blue-700 disabled:opacity-40"
      />
      <div className="mt-1 grid grid-cols-5 text-[11px] text-slate-500">
        {marks.map((mark) => <span key={mark.value} className="text-center">{mark.label}</span>)}
      </div>
    </div>
  )
}
