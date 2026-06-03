import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { AppShell } from '@/components/layout/AppShell'
import { useToast } from '@/components/ui/Toast'
import { templateMessagesApi, type NotificationTemplate } from '@/api/template-messages.api'
import { Field, inputClass, primaryButtonClass, secondaryButtonClass } from './TemplatePage'
import { readErrorMessage } from './PerfisAcessoPage'

export default function TemplateFormPage() {
  const navigate = useNavigate()
  const toast = useToast()
  const editingTemplate = (useLocation().state as { template?: NotificationTemplate } | null)?.template ?? null
  const [saving, setSaving] = useState(false)
  const [variableName, setVariableName] = useState('')
  const [form, setForm] = useState<NotificationTemplate>({
    id: editingTemplate?.id,
    cdTemplateNotification: editingTemplate?.cdTemplateNotification ?? '',
    dsTemplateNotification: editingTemplate?.dsTemplateNotification ?? '',
    subject: editingTemplate?.subject ?? '',
    type: editingTemplate?.type ?? 'WHATSAPP',
    dsTemplate: editingTemplate?.dsTemplate ?? '',
  })

  function update(field: keyof NotificationTemplate, value: string) {
    setForm((current) => ({ ...current, [field]: value }))
  }

  function insertVariable() {
    const name = formatVariableName(variableName)
    if (!name) return
    update('dsTemplate', `${form.dsTemplate}${form.dsTemplate ? ' ' : ''}#${name}#`)
    setVariableName('')
  }

  async function save() {
    if (!form.cdTemplateNotification.trim()) return toast.error('Informe o codigo do template.')
    if (!form.dsTemplateNotification.trim()) return toast.error('Informe a descricao.')
    if (!form.subject.trim()) return toast.error('Informe o assunto.')
    if (!form.dsTemplate.trim()) return toast.error('Informe o conteudo do template.')

    setSaving(true)
    try {
      if (editingTemplate?.id) {
        await templateMessagesApi.updateTemplate(editingTemplate.id, form)
        toast.success('Template atualizado com sucesso.')
      } else {
        await templateMessagesApi.createTemplate(form)
        toast.success('Template cadastrado com sucesso.')
      }
      navigate('/template')
    } catch (err: unknown) {
      toast.error(readErrorMessage(err, 'Erro ao salvar template.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <AppShell title={editingTemplate ? 'Editar Template' : 'Novo Template'} subtitle="Modelo de notificacao para e-mail ou WhatsApp.">
      <div className="min-h-full bg-background p-4 sm:p-6">
        <div className="mx-auto max-w-5xl space-y-4">
          <section className="rounded-lg border border-blue-100 bg-white p-4 shadow-sm shadow-blue-950/5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-md bg-blue-700 text-white">
                  <i className="bi bi-chat-square-text" aria-hidden />
                </div>
                <div>
                  <h1 className="text-lg font-semibold text-slate-900">{editingTemplate ? 'Editar Template' : 'Novo Template'}</h1>
                  <p className="text-sm text-slate-500">Use variaveis no formato #nome_variavel#.</p>
                </div>
              </div>
              <button type="button" onClick={() => navigate('/template')} className={secondaryButtonClass}>
                <i className="bi bi-arrow-left" aria-hidden />
                Voltar
              </button>
            </div>
          </section>

          <section className="rounded-lg border border-blue-100 bg-white p-4 shadow-sm shadow-blue-950/5">
            <div className="grid gap-4 md:grid-cols-12">
              <Field className="md:col-span-6" label="Codigo *">
                <input value={form.cdTemplateNotification} onChange={(e) => update('cdTemplateNotification', formatVariableName(e.target.value).toUpperCase())} className={inputClass} placeholder="ALERTA_COBRANCA" />
              </Field>
              <Field className="md:col-span-6" label="Descricao *">
                <input value={form.dsTemplateNotification} onChange={(e) => update('dsTemplateNotification', e.target.value)} className={inputClass} />
              </Field>
              <Field className="md:col-span-8" label="Assunto *">
                <input value={form.subject} onChange={(e) => update('subject', e.target.value)} className={inputClass} />
              </Field>
              <Field className="md:col-span-4" label="Tipo">
                <select value={form.type} onChange={(e) => update('type', e.target.value)} className={inputClass}>
                  <option value="WHATSAPP">WhatsApp</option>
                  <option value="EMAIL">E-mail</option>
                </select>
              </Field>
              <div className="md:col-span-12">
                <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-end">
                  <Field className="flex-1" label="Variavel">
                    <input value={variableName} onChange={(e) => setVariableName(formatVariableName(e.target.value))} className={inputClass} placeholder="nome_cliente" />
                  </Field>
                  <button type="button" onClick={insertVariable} className={secondaryButtonClass}>
                    <i className="bi bi-braces" aria-hidden />
                    Inserir Variavel
                  </button>
                </div>
                <Field label={form.type === 'EMAIL' ? 'Conteudo HTML *' : 'Mensagem WhatsApp *'}>
                  <textarea value={form.dsTemplate} onChange={(e) => update('dsTemplate', e.target.value)} className={`${inputClass} min-h-64 py-3 font-mono`} />
                </Field>
              </div>
            </div>
          </section>

          <div className="flex justify-end">
            <button type="button" onClick={save} disabled={saving} className={primaryButtonClass}>
              {saving ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" /> : <i className="bi bi-check-lg" aria-hidden />}
              {editingTemplate ? 'Atualizar' : 'Cadastrar'}
            </button>
          </div>
        </div>
      </div>
    </AppShell>
  )
}

function formatVariableName(value: string) {
  return value.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '').slice(0, 32)
}
