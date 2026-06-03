import type { ObjectDefinition } from '@/types/view.types'

interface Props {
  objectDef: ObjectDefinition
}

/**
 * IframeObject — renderiza um <iframe> com a URL declarada em objectDef.url.
 *
 * Usado tipicamente como modal (variant: "modal", dynamic: true) para embutir
 * outras telas da aplicação dentro de um overlay. A altura é lida de
 * objectDef.style.height (ex: "700px"); caso ausente, usa 100% do container.
 *
 * Exemplo de uso no JSON:
 *   { "type": "iframe", "url": "/home/listSaldo?hideMenu=true",
 *     "variant": "modal", "size": "xxl", "style": { "height": "700px" } }
 */
export function IframeObject({ objectDef }: Props) {
  const url  = objectDef.url ?? ''
  const height = (objectDef.style as Record<string, string> | undefined)?.height ?? '100%'

  if (!url) {
    return (
      <div className="flex items-center justify-center p-8 text-sm text-muted-foreground">
        <i className="bi bi-exclamation-triangle mr-2" />
        URL não configurada no objeto iframe.
      </div>
    )
  }

  return (
    <iframe
      src={url}
      style={{ width: '100%', height, border: 'none', display: 'block' }}
      title={objectDef.title ?? objectDef.name ?? 'iframe'}
      allowFullScreen
    />
  )
}
