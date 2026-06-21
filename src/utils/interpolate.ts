/** Substitui {{campo}} ou {{campo:formato}} pelo valor correspondente em `params`.
 *  Formatos suportados: :date → DD/MM/AAAA, :datetime → DD/MM/AAAA HH:MM */
export function interpolate(
  template: string | undefined,
  params: Record<string, unknown> | undefined,
): string {
  if (!template) return ''
  if (!params) return template
  return template.replace(/\{\{(\w+)(?::(\w+))?\}\}/g, (match, key, fmt) => {
    const value = params[key]
    if (value === undefined || value === null) return ''
    const str = String(value)
    if (!fmt) return str
    if (fmt === 'date' || fmt === 'datetime') {
      const d = new Date(str)
      if (isNaN(d.getTime())) return str
      const pad = (n: number) => String(n).padStart(2, '0')
      const date = `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`
      if (fmt === 'date') return date
      return `${date} ${pad(d.getHours())}:${pad(d.getMinutes())}`
    }
    return str
  })
}
