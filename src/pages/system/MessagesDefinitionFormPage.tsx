import { useMemo, useState } from 'react'
import dayjs from 'dayjs'
import { useLocation, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { AppShell } from '@/components/layout/AppShell'
import { useToast } from '@/components/ui/Toast'
import { templateMessagesApi, type AutomatedMessage } from '@/api/template-messages.api'
import { Field, inputClass, primaryButtonClass, secondaryButtonClass } from './TemplatePage'
import { readErrorMessage } from './PerfisAcessoPage'

const periodicityOptions = ['Diario', 'Semanal', 'Quinzenal', 'Mensal', 'Envio Unico', 'Trimestral', 'Semestral', 'Anual']
const days = [{ code: 'SUN', label: 'Dom' }, { code: 'MON', label: 'Seg' }, { code: 'TUE', label: 'Ter' }, { code: 'WED', label: 'Qua' }, { code: 'THU', label: 'Qui' }, { code: 'FRI', label: 'Sex' }, { code: 'SAT', label: 'Sab' }]
const hours = Array.from({ length: 25 }, (_, index) => index)

export default function MessagesDefinitionFormPage() {
  const navigate = useNavigate()
  const toast = useToast()
  const editing = (useLocation().state as { messageDefinition?: AutomatedMessage } | null)?.messageDefinition ?? null
  const [saving, setSaving] = useState(false)
  const [selectedDays, setSelectedDays] = useState<string[]>(editing?.arrayDayOfWeek?.split(',').filter(Boolean) ?? [])
  const [mappings, setMappings] = useState<Record<string, string>>(Object.fromEntries((editing?.automatedMessagesParameters ?? []).map((p) => [p.code.replaceAll('#', ''), p.value])))
  const [form, setForm] = useState({
    description: editing?.description ?? '',
    periodicity: editing?.executionInterval ?? '',
    notificationTypeId: String(editing?.notificationType?.id ?? editing?.notificationTypeId ?? ''),
    templateId: String(editing?.notificationTemplate?.id ?? editing?.notificationTemplateId ?? ''),
    entityName: editing?.entityName ?? '',
    beginDate: editing?.beginDate ?? dayjs().format('YYYY-MM-DD'),
    endDate: editing?.endDate ?? dayjs().format('YYYY-MM-DD'),
    beginHour: String(editing?.beginHour ?? ''),
    endHour: String(editing?.endHour ?? ''),
  })

  const templatesQuery = useQuery({
    queryKey: ['notification-templates-options'],
    queryFn: () => templateMessagesApi.getTemplates({ pageSize: 9999, orderBy: 'dsTemplateNotification,asc' }),
    staleTime: 30_000,
  })
  const typesQuery = useQuery({ queryKey: ['notification-types'], queryFn: templateMessagesApi.getNotificationTypes, staleTime: 30_000 })

  const templates = templatesQuery.data?.table ?? []
  const selectedTemplate = templates.find((template) => String(template.id) === form.templateId) ?? editing?.notificationTemplate
  const variables = useMemo(() => extractVariables(selectedTemplate?.dsTemplate ?? ''), [selectedTemplate?.dsTemplate])

  function update(field: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [field]: value }))
  }

  function toggleDay(code: string) {
    setSelectedDays((current) => current.includes(code) ? current.filter((item) => item !== code) : [...current, code])
  }

  async function save() {
    if (!form.description.trim()) return toast.error('Informe a descricao da campanha.')
    if (!form.periodicity) return toast.error('Selecione a periodicidade.')
    if (!form.notificationTypeId) return toast.error('Selecione o tipo de notificacao.')
    if (!form.templateId) return toast.error('Selecione o template.')
    if (!form.entityName.trim()) return toast.error('Informe a entidade.')
    if (!form.beginDate) return toast.error('Informe a data de inicio.')
    if (!form.beginHour || !form.endHour) return toast.error('Informe as horas de inicio e fim.')
    if (selectedDays.length === 0) return toast.error('Selecione ao menos um dia.')

    const payload = {
      description: form.description.trim(),
      executionInterval: form.periodicity,
      entityName: form.entityName.trim(),
      notificationTypeId: Number(form.notificationTypeId),
      notificationTemplateId: Number(form.templateId),
      beginDate: form.beginDate,
      endDate: form.endDate || form.beginDate,
      beginHour: Number(form.beginHour),
      endHour: Number(form.endHour),
      arrayDayOfWeek: selectedDays.join(','),
      automatedMessagesParameter: variables.map((variable) => ({ code: `#${variable}#`, value: mappings[variable] ?? '' })),
    }

    setSaving(true)
    try {
      if (editing?.id) {
        await templateMessagesApi.updateAutomatedMessage(editing.id, payload)
        toast.success('Campanha atualizada com sucesso.')
      } else {
        await templateMessagesApi.createAutomatedMessage(payload)
        toast.success('Campanha criada com sucesso.')
      }
      navigate('/messagesDefinition')
    } catch (err: unknown) {
      toast.error(readErrorMessage(err, 'Erro ao salvar campanha.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <AppShell title={editing ? 'Editar Campanha' : 'Nova Campanha'} subtitle="Disparo automatizado baseado em template.">
      <div className="min-h-full w-full bg-background p-3 sm:p-4">
        <div className="w-full space-y-4">
          <section className="rounded-lg border border-blue-100 bg-white p-4 shadow-sm shadow-blue-950/5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-md bg-blue-700 text-white"><i className="bi bi-bell" aria-hidden /></div><div><h1 className="text-lg font-semibold text-slate-900">{editing ? 'Editar Campanha' : 'Nova Campanha'}</h1><p className="text-sm text-slate-500">Configure periodo, template e variaveis.</p></div></div>
              <button type="button" onClick={() => navigate('/messagesDefinition')} className={secondaryButtonClass}><i className="bi bi-arrow-left" aria-hidden />Voltar</button>
            </div>
          </section>

          <section className="rounded-lg border border-blue-100 bg-white p-4 shadow-sm shadow-blue-950/5">
            <div className="grid gap-4 md:grid-cols-12">
              <Field className="md:col-span-4" label="Data de Criacao"><input value={editing?.creationDate ? dayjs(editing.creationDate).format('DD/MM/YYYY') : dayjs().format('DD/MM/YYYY')} disabled className={inputClass} /></Field>
              <Field className="md:col-span-4" label="Data de Inicio"><input type="date" value={form.beginDate} onChange={(e) => update('beginDate', e.target.value)} className={inputClass} /></Field>
              <Field className="md:col-span-4" label="Data Fim"><input type="date" value={form.endDate} onChange={(e) => update('endDate', e.target.value)} className={inputClass} /></Field>
              <Field className="md:col-span-12" label="Descricao da Campanha"><input value={form.description} onChange={(e) => update('description', e.target.value)} className={inputClass} /></Field>
              <Field className="md:col-span-4" label="Periodicidade"><select value={form.periodicity} onChange={(e) => update('periodicity', e.target.value)} className={inputClass}><option value="">Selecione...</option>{periodicityOptions.map((item) => <option key={item} value={item}>{item}</option>)}</select></Field>
              <Field className="md:col-span-4" label="Tipo de Notificacao"><select value={form.notificationTypeId} onChange={(e) => update('notificationTypeId', e.target.value)} className={inputClass}><option value="">Selecione...</option>{(typesQuery.data ?? []).map((type) => <option key={type.id} value={type.id}>{type.notificationType}</option>)}</select></Field>
              <Field className="md:col-span-4" label="Status"><input value="Ativo" disabled className={inputClass} /></Field>
              <div className="md:col-span-12"><span className="text-sm font-medium text-slate-700">Dias para execucao</span><div className="mt-2 flex flex-wrap gap-2">{days.map((day) => <button key={day.code} type="button" onClick={() => toggleDay(day.code)} className={`rounded-md border px-3 py-2 text-sm font-semibold ${selectedDays.includes(day.code) ? 'border-blue-700 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>{day.label}</button>)}</div></div>
              <Field className="md:col-span-4" label="Hora Inicio"><select value={form.beginHour} onChange={(e) => update('beginHour', e.target.value)} className={inputClass}><option value="">Selecione...</option>{hours.map((h) => <option key={h} value={h}>{h}</option>)}</select></Field>
              <Field className="md:col-span-4" label="Hora Fim"><select value={form.endHour} onChange={(e) => update('endHour', e.target.value)} className={inputClass}><option value="">Selecione...</option>{hours.map((h) => <option key={h} value={h}>{h}</option>)}</select></Field>
              <Field className="md:col-span-4" label="Ultima Execucao"><input value={editing?.lastExecution ? dayjs(editing.lastExecution).format('DD/MM/YYYY HH:mm') : ''} disabled className={inputClass} /></Field>
              <Field className="md:col-span-6" label="Template da Mensagem"><select value={form.templateId} onChange={(e) => { update('templateId', e.target.value); setMappings({}) }} className={inputClass}><option value="">Selecione...</option>{templates.map((template) => <option key={template.id} value={template.id}>{template.dsTemplateNotification}</option>)}</select></Field>
              <Field className="md:col-span-6" label="Entidade"><input value={form.entityName} onChange={(e) => update('entityName', e.target.value)} className={inputClass} placeholder="person, invoice, customer..." /></Field>
            </div>
          </section>

          <section className="rounded-lg border border-blue-100 bg-white p-4 shadow-sm shadow-blue-950/5">
            <h2 className="text-base font-semibold text-slate-900">Variaveis da Campanha</h2>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {variables.length > 0 ? variables.map((variable) => (
                <Field key={variable} label={`#${variable}#`}>
                  <input value={mappings[variable] ?? ''} onChange={(e) => setMappings((current) => ({ ...current, [variable]: e.target.value }))} className={inputClass} placeholder="Campo da entidade" />
                </Field>
              )) : <p className="text-sm text-slate-500">Selecione um template com variaveis para mapear campos.</p>}
            </div>
          </section>

          <div className="flex justify-end"><button type="button" onClick={save} disabled={saving} className={primaryButtonClass}>{saving ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" /> : <i className="bi bi-check-lg" aria-hidden />}{editing ? 'Atualizar' : 'Cadastrar'}</button></div>
        </div>
      </div>
    </AppShell>
  )
}

function extractVariables(template: string) {
  const matches = template.match(/#\s*([a-z0-9_]{1,32})\s*#/gi)
  if (!matches) return []
  return Array.from(new Set(matches.map((item) => item.replaceAll('#', '').trim())))
}
