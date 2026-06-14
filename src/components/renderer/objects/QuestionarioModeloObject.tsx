import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { entityApi } from '@/api/entity.api'
import type { EntityRecord } from '@/types/entity.types'
import type { ObjectDefinition } from '@/types/view.types'
import { useConnectionParams } from '../ObjectRenderer'
import { useToast } from '@/components/ui/Toast'
import type { Question, QuestionOption, ScaleConfig } from './QuestionarioBuilderObject'

const parseJson = (val: unknown) => {
  if (!val) return null
  if (typeof val === 'string') { try { return JSON.parse(val) } catch { return null } }
  return val
}

interface Props {
  objectDef: ObjectDefinition
}

export function QuestionarioModeloObject({ objectDef }: Props) {
  const connectionParams = useConnectionParams(objectDef.id)
  const toast = useToast()

  const def = objectDef as ObjectDefinition & Record<string, unknown>
  const questionarioEntity = String(def.questionarioEntity ?? 'questionario')
  const perguntaEntity     = String(def.perguntaEntity     ?? 'questionarioPergunta')

  const idQuestionario = connectionParams['id_questionario'] ? Number(connectionParams['id_questionario']) : null

  const { data: info, isLoading: loadingInfo } = useQuery({
    queryKey: ['entity', questionarioEntity, 'modelo', idQuestionario],
    queryFn: async () => {
      if (!idQuestionario) return null
      const res = await entityApi.getList<EntityRecord>(questionarioEntity, { id_questionario: idQuestionario, pageSize: 1 })
      const items = (res as { data?: EntityRecord[] }).data ?? (Array.isArray(res) ? (res as EntityRecord[]) : [])
      if (!items.length) return null
      return {
        titulo:   String(items[0]['titulo'] ?? ''),
        descricao: items[0]['descricao'] ? String(items[0]['descricao']) : '',
        versao:   Number(items[0]['versao'] ?? 1),
      }
    },
    enabled: idQuestionario !== null,
    staleTime: 300_000,
  })

  const { data: questions = [], isLoading: loadingQuestions } = useQuery<Question[]>({
    queryKey: ['entity', perguntaEntity, 'modelo', idQuestionario],
    queryFn: async () => {
      if (!idQuestionario) return []
      const res = await entityApi.getList<EntityRecord>(perguntaEntity, {
        id_questionario: idQuestionario,
        pageSize: 999,
        orderBy: 'nr_ordem',
      })
      const items = (res as { data?: EntityRecord[] }).data ?? (Array.isArray(res) ? (res as EntityRecord[]) : [])
      return items.map((item): Question => ({
        id_pergunta:    item['id_pergunta'] as number,
        id_questionario: item['id_questionario'] as number,
        nr_ordem:       Number(item['nr_ordem'] ?? 0),
        ds_texto:       String(item['ds_texto'] ?? ''),
        ds_ajuda:       item['ds_ajuda'] ? String(item['ds_ajuda']) : undefined,
        tp_resposta:    String(item['tp_resposta'] ?? 'text') as Question['tp_resposta'],
        fl_obrigatorio: String(item['fl_obrigatorio'] ?? 'NAO') as 'SIM' | 'NAO',
        ds_opcoes:      parseJson(item['ds_opcoes']) as QuestionOption[] | ScaleConfig | null,
        ds_condicional: parseJson(item['ds_condicional']) as Question['ds_condicional'],
        ds_placeholder: item['ds_placeholder'] ? String(item['ds_placeholder']) : null,
        fl_inline:      String(item['fl_inline'] ?? 'NAO') as 'SIM' | 'NAO',
        nr_colunas:     item['nr_colunas'] ? Number(item['nr_colunas']) : 12,
        nm_campo_auto:  item['nm_campo_auto'] ? String(item['nm_campo_auto']) : null,
      }))
    },
    enabled: idQuestionario !== null,
    staleTime: 60_000,
  })

  const [printing, setPrinting] = useState(false)

  function handlePrint() {
    if (!info || questions.length === 0) return
    setPrinting(true)

    const titulo    = info.titulo
    const descricao = info.descricao
    const versao    = info.versao
    const dataHoje  = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })

    function renderBlankBlock(q: Question): string {
      switch (q.tp_resposta) {
        case 'boolean':
          return `<div style="margin-top:8px;display:flex;gap:20px;font-size:12px;">
            <span style="display:flex;align-items:center;gap:5px;"><span style="display:inline-block;width:14px;height:14px;border:1.5px solid #555;border-radius:50%;"></span> Sim</span>
            <span style="display:flex;align-items:center;gap:5px;"><span style="display:inline-block;width:14px;height:14px;border:1.5px solid #555;border-radius:50%;"></span> Não</span>
          </div>`

        case 'select': {
          const opts = (q.ds_opcoes as QuestionOption[] | null) ?? []
          const inline = q.fl_inline === 'SIM'
          const items = opts.map(o =>
            `<span style="display:${inline ? 'inline-flex' : 'flex'};align-items:center;gap:5px;${inline ? 'margin-right:16px;' : 'margin-bottom:4px;'}">
              <span style="display:inline-block;width:13px;height:13px;border:1.5px solid #555;border-radius:50%;flex-shrink:0;"></span>
              <span style="font-size:12px;">${o.label}</span>
            </span>`
          ).join('')
          return `<div style="margin-top:8px;${inline ? 'display:flex;flex-wrap:wrap;' : ''}">${items}</div>`
        }

        case 'multiselect': {
          const opts = (q.ds_opcoes as QuestionOption[] | null) ?? []
          const inline = q.fl_inline === 'SIM'
          const items = opts.map(o =>
            `<span style="display:${inline ? 'inline-flex' : 'flex'};align-items:center;gap:5px;${inline ? 'margin-right:16px;' : 'margin-bottom:4px;'}">
              <span style="display:inline-block;width:13px;height:13px;border:1.5px solid #555;border-radius:3px;flex-shrink:0;"></span>
              <span style="font-size:12px;">${o.label}</span>
            </span>`
          ).join('')
          return `<div style="margin-top:8px;${inline ? 'display:flex;flex-wrap:wrap;' : ''}">${items}</div>`
        }

        case 'scale': {
          const cfg = q.ds_opcoes as ScaleConfig | null
          const min = cfg?.min ?? 1
          const max = cfg?.max ?? 5
          const circles = Array.from({ length: max - min + 1 }, (_, i) => {
            const val = min + i
            return `<span style="display:flex;flex-direction:column;align-items:center;gap:3px;">
              <span style="display:inline-block;width:20px;height:20px;border:1.5px solid #555;border-radius:50%;"></span>
              <span style="font-size:10px;color:#555;">${val}</span>
            </span>`
          }).join('')
          return `<div style="margin-top:8px;display:flex;gap:8px;align-items:flex-end;">${circles}</div>`
        }

        case 'textarea':
          return `<div style="margin-top:8px;border:1px solid #ccc;border-radius:4px;height:64px;width:100%;"></div>`

        default:
          return `<div style="margin-top:8px;border-bottom:1.5px solid #555;height:24px;width:100%;"></div>`
      }
    }

    let questionsHtml = '<div class="questions-grid">'
    let qNum = 0
    for (const q of questions) {
      if (q.tp_resposta === 'section') {
        questionsHtml += `
          <div style="grid-column:span 12;display:flex;align-items:center;gap:10px;margin:14px 0 6px;">
            <div style="flex:1;height:1px;background:#d1d5db;"></div>
            <span style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#6b7280;white-space:nowrap;">${q.ds_texto}</span>
            <div style="flex:1;height:1px;background:#d1d5db;"></div>
          </div>`
        continue
      }
      qNum++
      const span = q.nr_colunas === 3 ? 3 : q.nr_colunas === 4 ? 4 : q.nr_colunas === 6 ? 6 : 12
      questionsHtml += `
        <div style="grid-column:span ${span};padding:10px 12px;border:1px solid #e5e7eb;border-radius:6px;break-inside:avoid;">
          <div style="font-size:12px;font-weight:600;color:#111;line-height:1.4;">
            <span style="color:#6b7280;font-weight:400;margin-right:4px;">${qNum}.</span>${q.ds_texto}${q.fl_obrigatorio === 'SIM' ? '<span style="color:#dc2626;margin-left:2px;">*</span>' : ''}
          </div>
          ${q.ds_ajuda ? `<div style="font-size:10px;color:#9ca3af;margin-top:2px;font-style:italic;">${q.ds_ajuda}</div>` : ''}
          ${renderBlankBlock(q)}
        </div>`
    }
    questionsHtml += '</div>'

    const totalPerguntas = questions.filter(q => q.tp_resposta !== 'section').length

    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <title>${titulo} — Modelo</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, sans-serif; font-size: 12px; color: #1a1a1a; background: #f3f4f6; }
    .page { max-width: 800px; margin: 0 auto; background: #fff; padding: 32px 40px; }
    .toolbar { position: sticky; top: 0; z-index: 10; background: #1d4ed8; color: #fff; padding: 10px 20px; display: flex; align-items: center; justify-content: space-between; font-size: 13px; }
    .toolbar strong { font-size: 14px; }
    .toolbar button { background: #fff; color: #1d4ed8; border: none; border-radius: 6px; padding: 7px 18px; font-size: 13px; font-weight: 700; cursor: pointer; }
    .toolbar button:hover { background: #e0e7ff; }
    .header { border-bottom: 2px solid #1d4ed8; padding-bottom: 14px; margin-bottom: 20px; }
    .header h1 { font-size: 18px; font-weight: 700; color: #1d4ed8; margin-bottom: 4px; }
    .header p.desc { font-size: 12px; color: #555; margin-top: 4px; }
    .header-meta { display: flex; flex-wrap: wrap; gap: 20px; margin-top: 10px; font-size: 11px; color: #666; }
    .header-meta span strong { color: #333; }
    .badge-modelo { display: inline-block; padding: 2px 8px; border-radius: 20px; font-size: 10px; font-weight: 700; background: #dbeafe; color: #1e40af; }
    .questions-grid { display: grid; grid-template-columns: repeat(12, 1fr); gap: 10px; }
    .footer { margin-top: 28px; padding-top: 10px; border-top: 1px solid #e5e7eb; font-size: 10px; color: #9ca3af; display: flex; justify-content: space-between; }
    @media print {
      body { background: #fff; }
      .toolbar { display: none; }
      .page { padding: 0; max-width: 100%; }
      @page { margin: 1.5cm 1.8cm; }
    }
  </style>
</head>
<body>
  <div class="toolbar">
    <strong>📄 ${titulo} — Modelo</strong>
    <button onclick="window.print()">🖨️ Imprimir / Salvar PDF</button>
  </div>
  <div class="page">
    <div class="header">
      <h1>${titulo}</h1>
      ${descricao ? `<p class="desc">${descricao}</p>` : ''}
      <div class="header-meta">
        <span><strong>Versão:</strong> ${versao}</span>
        <span><strong>Data:</strong> ${dataHoje}</span>
        <span><strong>Tipo:</strong> <span class="badge-modelo">Modelo em branco</span></span>
        <span><strong>Perguntas:</strong> ${totalPerguntas}</span>
      </div>
    </div>

    ${questionsHtml}

    <div class="footer">
      <span>Gerado em ${new Date().toLocaleString('pt-BR')}</span>
      <span>Modelo — sem respostas</span>
    </div>
  </div>
</body>
</html>`

    const win = window.open('', '_blank', 'width=860,height=960')
    if (!win) {
      toast.error('Pop-up bloqueado. Permita pop-ups para visualizar.')
      setPrinting(false)
      return
    }
    win.document.write(html)
    win.document.close()
    win.focus()
    setPrinting(false)
  }

  const isLoading = loadingInfo || loadingQuestions
  const totalPerguntas = questions.filter(q => q.tp_resposta !== 'section').length

  if (!idQuestionario) {
    return (
      <div className="py-8 text-center text-sm text-muted-foreground">
        Nenhum questionário selecionado.
      </div>
    )
  }

  return (
    <div className="space-y-4 p-1">
      {isLoading ? (
        <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          Carregando questionário...
        </div>
      ) : (
        <>
          <div className="rounded-md border border-border bg-muted/30 px-4 py-3">
            <p className="text-sm font-semibold text-foreground">{info?.titulo}</p>
            {info?.descricao && <p className="mt-0.5 text-xs text-muted-foreground">{info.descricao}</p>}
            <div className="mt-2 flex gap-4 text-xs text-muted-foreground">
              <span>Versão {info?.versao}</span>
              <span>{totalPerguntas} pergunta{totalPerguntas !== 1 ? 's' : ''}</span>
            </div>
          </div>

          <button
            type="button"
            onClick={handlePrint}
            disabled={printing || questions.length === 0}
            className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            <i className="bi bi-printer" />
            {printing ? 'Gerando...' : 'Imprimir Modelo'}
          </button>
        </>
      )}
    </div>
  )
}
