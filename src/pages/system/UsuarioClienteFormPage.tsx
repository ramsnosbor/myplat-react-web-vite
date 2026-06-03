import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { AppShell } from '@/components/layout/AppShell'
import { useToast } from '@/components/ui/Toast'
import { ssoAccessApi, type ClientUserLookup, type ClientUserScope } from '@/api/sso-access.api'
import { getProfileId, readErrorMessage } from './PerfisAcessoPage'
import { formatCpf, onlyDigits } from './UsuarioClientePage'

interface FormState {
  cpf: string
  nome: string
  email: string
  telefone: string
  idPerfil: string
}

export default function UsuarioClienteFormPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const toast = useToast()
  const userId = (location.state as { userId?: number | string } | null)?.userId
  const isEdit = !!userId
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [lookingUp, setLookingUp] = useState(false)
  const [lookupInfo, setLookupInfo] = useState<ClientUserLookup | null>(null)
  const [form, setForm] = useState<FormState>({ cpf: '', nome: '', email: '', telefone: '', idPerfil: '' })
  const [scopes, setScopes] = useState<ClientUserScope[]>([])

  const profilesQuery = useQuery({
    queryKey: ['client-access-profiles'],
    queryFn: ssoAccessApi.getClientProfiles,
    staleTime: 30_000,
  })

  useEffect(() => {
    if (!isEdit || !userId) return
    setLoading(true)
    ssoAccessApi.getClientUser(userId)
      .then((client) => {
        setForm({
          cpf: formatCpf(client.cpf ?? ''),
          nome: client.nome ?? client.name ?? '',
          email: client.email ?? '',
          telefone: formatPhone(client.telefone ?? client.telephone ?? ''),
          idPerfil: String(client.idPerfil ?? ''),
        })
        setScopes(Array.isArray(client.escopos) ? client.escopos : [])
      })
      .catch((err: unknown) => toast.error(readErrorMessage(err, 'Erro ao carregar cliente.')))
      .finally(() => setLoading(false))
  }, [isEdit, toast, userId])

  const selectedProfileIds = useMemo(() => new Set(profilesQuery.data?.map((profile) => String(getProfileId(profile))) ?? []), [profilesQuery.data])

  function updateField(field: keyof FormState, value: string) {
    setForm((current) => ({ ...current, [field]: value }))
    if (field === 'cpf' && lookupInfo) setLookupInfo(null)
  }

  async function lookupCpf() {
    if (isEdit) return
    const cpf = onlyDigits(form.cpf)
    if (cpf.length < 11) {
      setLookupInfo(null)
      return
    }

    setLookingUp(true)
    try {
      const info = await ssoAccessApi.lookupClientUserByCpf(cpf)
      setLookupInfo(info.exists ? info : { exists: false })
      if (info.exists) {
        setForm((current) => ({
          ...current,
          nome: info.nome ?? current.nome,
          email: info.email ?? current.email,
          telefone: formatPhone(info.telefone ?? current.telefone),
        }))
      }
    } catch {
      setLookupInfo(null)
    } finally {
      setLookingUp(false)
    }
  }

  function addScope() {
    setScopes((current) => [...current, { paramKey: '', paramValue: '' }])
  }

  function updateScope(index: number, field: keyof ClientUserScope, value: string) {
    setScopes((current) => current.map((scope, idx) => idx === index ? { ...scope, [field]: value } : scope))
  }

  function removeScope(index: number) {
    setScopes((current) => current.filter((_, idx) => idx !== index))
  }

  function validate() {
    if (!isEdit && !onlyDigits(form.cpf)) return 'CPF e obrigatorio.'
    if (!form.nome.trim()) return 'Nome e obrigatorio.'
    if (form.email && !isEmail(form.email)) return 'E-mail invalido.'
    if (!form.idPerfil || !selectedProfileIds.has(form.idPerfil)) return 'Selecione um perfil.'
    if (scopes.some((scope) => !scope.paramKey.trim() || !scope.paramValue.trim())) return 'Todos os escopos precisam de chave e valor.'
    if (lookupInfo?.jaVinculadoAoTenant) return 'Este usuario ja esta vinculado a este tenant.'
    return null
  }

  async function save() {
    const error = validate()
    if (error) {
      toast.error(error)
      return
    }

    setSaving(true)
    try {
      const payload = {
        nome: form.nome.trim(),
        email: form.email.trim(),
        telefone: form.telefone.trim(),
        idPerfil: Number(form.idPerfil),
        escopos: scopes,
      }

      if (isEdit && userId) {
        await ssoAccessApi.updateClientUser(userId, payload)
        toast.success('Cliente atualizado com sucesso.')
      } else {
        await ssoAccessApi.createClientUser({ ...payload, cpf: form.cpf })
        toast.success('Cliente cadastrado com sucesso.')
      }
      navigate('/usuario-cliente')
    } catch (err: unknown) {
      toast.error(readErrorMessage(err, 'Erro ao salvar cliente.'))
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <AppShell title="Usuarios Cliente" subtitle="Carregando cliente.">
        <div className="flex min-h-full items-center justify-center bg-background p-6 text-sm text-slate-500">
          <span className="mr-2 inline-block h-4 w-4 animate-spin rounded-full border-2 border-blue-700 border-t-transparent" />
          Carregando...
        </div>
      </AppShell>
    )
  }

  return (
    <AppShell title={isEdit ? 'Editar Cliente' : 'Novo Cliente'} subtitle="Dados, perfil e escopos de acesso.">
      <div className="min-h-full bg-background p-4 sm:p-6">
        <div className="mx-auto max-w-5xl space-y-4">
          <section className="rounded-lg border border-blue-100 bg-white p-4 shadow-sm shadow-blue-950/5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-md bg-blue-700 text-white">
                  <i className={`bi ${isEdit ? 'bi-pencil-square' : 'bi-person-plus'}`} aria-hidden />
                </div>
                <div>
                  <h1 className="text-lg font-semibold text-slate-900">{isEdit ? 'Editar Cliente' : 'Novo Cliente'}</h1>
                  <p className="text-sm text-slate-500">Informe os dados do usuario cliente e seus limites de acesso.</p>
                </div>
              </div>
              <button type="button" onClick={() => navigate('/usuario-cliente')} className={secondaryButtonClass}>
                <i className="bi bi-arrow-left" aria-hidden />
                Voltar
              </button>
            </div>
          </section>

          {!isEdit && lookupInfo?.exists && (
            <section className={`rounded-lg border p-4 text-sm ${lookupInfo.jaVinculadoAoTenant ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-blue-200 bg-blue-50 text-blue-800'}`}>
              <div className="flex gap-3">
                <i className={`bi ${lookupInfo.jaVinculadoAoTenant ? 'bi-exclamation-triangle' : 'bi-info-circle'} mt-0.5`} aria-hidden />
                <p>
                  {lookupInfo.jaVinculadoAoTenant
                    ? `Este CPF ja esta vinculado a este tenant como ${lookupInfo.tpVinculo ?? 'cliente'}.`
                    : 'Usuario ja existe no SSO. Os dados cadastrais foram preenchidos; defina perfil e escopos para vincular ao tenant.'}
                </p>
              </div>
            </section>
          )}

          <section className="rounded-lg border border-blue-100 bg-white p-4 shadow-sm shadow-blue-950/5">
            <h2 className="text-base font-semibold text-slate-900">Dados do Cliente</h2>
            <div className="mt-4 grid gap-4 md:grid-cols-12">
              <Field className="md:col-span-4" label="CPF *">
                <div className="relative">
                  <input
                    value={form.cpf}
                    onChange={(e) => updateField('cpf', formatCpf(e.target.value))}
                    onBlur={lookupCpf}
                    disabled={isEdit}
                    className={inputClass}
                    placeholder="000.000.000-00"
                    maxLength={14}
                  />
                  {lookingUp && <span className="absolute right-3 top-3 h-4 w-4 animate-spin rounded-full border-2 border-blue-700 border-t-transparent" />}
                </div>
              </Field>
              <Field className="md:col-span-8" label="Nome *">
                <input value={form.nome} onChange={(e) => updateField('nome', e.target.value)} disabled={!!lookupInfo?.exists} className={inputClass} maxLength={120} />
              </Field>
              <Field className="md:col-span-5" label="E-mail">
                <input value={form.email} onChange={(e) => updateField('email', e.target.value)} disabled={!!lookupInfo?.exists} className={inputClass} type="email" maxLength={120} />
              </Field>
              <Field className="md:col-span-3" label="Whatsapp">
                <input value={form.telefone} onChange={(e) => updateField('telefone', formatPhone(e.target.value))} disabled={!!lookupInfo?.exists} className={inputClass} placeholder="99 99999-9999" maxLength={13} />
              </Field>
              <Field className="md:col-span-4" label="Perfil *">
                <select value={form.idPerfil} onChange={(e) => updateField('idPerfil', e.target.value)} className={inputClass}>
                  <option value="">Selecione...</option>
                  {(profilesQuery.data ?? []).map((profile) => {
                    const id = getProfileId(profile)
                    return <option key={id} value={id}>{profile.nome}</option>
                  })}
                </select>
              </Field>
            </div>
          </section>

          <section className="rounded-lg border border-blue-100 bg-white shadow-sm shadow-blue-950/5">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <div>
                <h2 className="text-base font-semibold text-slate-900">Escopos de Acesso</h2>
                <p className="text-xs text-slate-500">Exemplo: cnpj_emitente = 12345678000199.</p>
              </div>
              <button type="button" onClick={addScope} title="Adicionar escopo" className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-blue-700 text-white transition hover:bg-blue-800">
                <i className="bi bi-plus-lg" aria-hidden />
              </button>
            </div>
            <div className="overflow-auto">
              <table className="w-full table-fixed border-separate border-spacing-0 text-sm">
                <colgroup>
                  <col />
                  <col />
                  <col className="w-16" />
                </colgroup>
                <thead className="bg-slate-50">
                  <tr>
                    <th className={thClass}>Chave</th>
                    <th className={thClass}>Valor</th>
                    <th className={thClass}></th>
                  </tr>
                </thead>
                <tbody>
                  {scopes.length > 0 ? scopes.map((scope, index) => (
                    <tr key={`${scope.paramKey}-${index}`}>
                      <td className="border-b border-slate-100 px-4 py-3">
                        <input value={scope.paramKey} onChange={(e) => updateScope(index, 'paramKey', e.target.value)} className={inputClass} placeholder="cnpj_emitente" />
                      </td>
                      <td className="border-b border-slate-100 px-4 py-3">
                        <input value={scope.paramValue} onChange={(e) => updateScope(index, 'paramValue', e.target.value)} className={inputClass} />
                      </td>
                      <td className="border-b border-slate-100 px-4 py-3 text-center">
                        <button type="button" title="Remover" onClick={() => removeScope(index)} className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-red-200 bg-red-50 text-red-700 hover:bg-red-100">
                          <i className="bi bi-trash" aria-hidden />
                        </button>
                      </td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan={3} className="px-4 py-12 text-center text-sm text-slate-500">Nenhum escopo definido.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <div className="flex justify-end">
            <button type="button" onClick={save} disabled={saving} className={primaryButtonClass}>
              {saving ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" /> : <i className="bi bi-check-lg" aria-hidden />}
              Salvar
            </button>
          </div>
        </div>
      </div>
    </AppShell>
  )
}

function formatPhone(value: string) {
  const digits = onlyDigits(value).slice(0, 11)
  if (digits.length <= 2) return digits
  if (digits.length <= 7) return `${digits.slice(0, 2)} ${digits.slice(2)}`
  return `${digits.slice(0, 2)} ${digits.slice(2, 7)}-${digits.slice(7)}`
}

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

const inputClass = 'h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500'
const primaryButtonClass = 'inline-flex h-9 items-center gap-2 rounded-md bg-blue-700 px-3 text-sm font-semibold text-white transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-70'
const secondaryButtonClass = 'inline-flex h-9 items-center gap-2 rounded-md border border-slate-200 px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50'
const thClass = 'border-b border-slate-200 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500'

function Field({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <label className={['block space-y-1', className].filter(Boolean).join(' ')}>
      <span className="text-sm font-medium text-slate-700">{label}</span>
      {children}
    </label>
  )
}
