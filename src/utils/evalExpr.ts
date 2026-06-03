/**
 * Avalia uma expressão que pode conter {{campo}} substituídos por valores do form.
 * Exemplos:
 *   evalExpr("{{tipo_nfe}}!='Serviço'", { tipo_nfe: "Saida" }) → true
 *   evalExpr("{{tipo_nfe}} === 'Entrada' ? 0 : 1", { tipo_nfe: "Saida" }) → 1
 *   evalExpr("{{tipo_nfe}}='Entrada' ? 'Fornecedor' : 'Cliente'", { tipo_nfe: "Entrada" }) → 'Fornecedor'
 */
export function evalExpr(expr: string | boolean | undefined, values: Record<string, unknown>): unknown {
  if (expr === undefined || expr === null) return undefined
  if (typeof expr === 'boolean') return expr
  if (!expr) return undefined
  try {
    // Normaliza = solitário para == antes da substituição de {{campo}}
    // Cobre: campo=0, {{campo}}='valor', etc. — evita erro de atribuição em string literal
    const normalized = expr.replace(/(?<![!<>=])=(?![=>])/g, '==')

    const resolved = normalized.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
      const val = values[key]
      if (val === undefined || val === null) return 'undefined'
      if (typeof val === 'string') return `'${val.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`
      return String(val)
    })
    // eslint-disable-next-line no-new-func
    return new Function(`return (${resolved})`)()
  } catch {
    return undefined
  }
}

/**
 * Avalia uma expressão aritmética com {campo} (chave simples).
 * Todos os valores são coercidos para number (parseFloat) antes da avaliação,
 * evitando o problema de concatenação de strings com o operador +.
 *
 * Exemplo:
 *   evalArithmeticExpr("{valor_bruto} - {valor_desconto} + {valor_juros}", values)
 *   → 100.5 - 0 + 2.5 → 103
 */
export function evalArithmeticExpr(expr: string, values: Record<string, unknown>): number | undefined {
  try {
    const resolved = expr.replace(/\{(\w+)\}/g, (_, key: string) => {
      const raw = values[key]
      const num = parseFloat(String(raw ?? '0').replace(',', '.'))
      return isNaN(num) ? '0' : String(num)
    })
    // eslint-disable-next-line no-new-func
    const result = new Function(`return (${resolved})`)()
    return typeof result === 'number' && isFinite(result) ? result : undefined
  } catch {
    return undefined
  }
}

/** Interpola {{campo}} substituindo pelo valor em string (para títulos, filtros, etc.) */
export function interpolateExpr(template: string, values: Record<string, unknown>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    const val = values[key]
    return val !== undefined && val !== null ? String(val) : ''
  })
}

/**
 * Resolve um template contra um objeto de valores, suportando:
 *   {{campo}}           → substituição direta pelo valor
 *   {{campo,YYYYMM}}    → formatação de data (YYYY MM DD HH mm)
 *   {{campo}} + '-suf'  → expressão JS avaliada após substituição
 *
 * Usado em actionParams.fileName, actionParams.month, actionParams.filters, etc.
 */
export function resolveTemplate(template: string, values: Record<string, unknown>): string {
  if (!template.includes('{{')) return template

  // 1. Substitui {{campo,formato}} (templates de data)
  const withDates = template.replace(/\{\{([^,}]+),([^}]+)\}\}/g, (_, field: string, fmt: string) => {
    const raw = values[field.trim()]
    if (raw === undefined || raw === null || raw === '') return ''
    const d = new Date(String(raw))
    if (isNaN(d.getTime())) return String(raw)
    const pad = (n: number) => String(n).padStart(2, '0')
    return fmt.trim()
      .replace('YYYY', String(d.getFullYear()))
      .replace('MM', pad(d.getMonth() + 1))
      .replace('DD', pad(d.getDate()))
      .replace('HH', pad(d.getHours()))
      .replace('mm', pad(d.getMinutes()))
  })

  // 2. Se ainda há {{campo}}, avalia o restante como expressão JS
  if (!withDates.includes('{{')) return withDates

  const result = evalExpr(withDates, values)
  return result !== undefined && result !== null ? String(result) : ''
}
