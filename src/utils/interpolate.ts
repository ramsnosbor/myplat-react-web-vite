/** Substitui {{campo}} pelo valor correspondente em `params`. */
export function interpolate(
  template: string | undefined,
  params: Record<string, unknown> | undefined,
): string {
  if (!template) return ''
  if (!params) return template
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const value = params[key]
    return value === undefined || value === null ? `{{${key}}}` : String(value)
  })
}
