import { apiClient } from './client'
import type { ViewDefinition, ComponentDefinition, RawViewResponse, Navbar } from '@/types/view.types'

export const viewsApi = {
  /**
   * Carrega e normaliza o JSON de uma tela.
   *
   * A API retorna:
   *   { name, view: { objects, components, entities, connections, navbars } }
   *
   * components é um array separado vinculado aos objects por idObject.
   * Normalizamos agrupando os components dentro de cada object.
   */
  getView(screenName: string): Promise<ViewDefinition> {
    return apiClient
      .get<RawViewResponse>(`/views/${screenName}`)
      .then((r) => normalize(r.data))
  },
}

function normalize(raw: RawViewResponse): ViewDefinition {
  const view = raw.view ?? {}

  // Agrupa components pelo idObject a que pertencem
  const byObject = (view.components ?? []).reduce<Record<string, ComponentDefinition[]>>(
    (acc, comp) => {
      const key = comp.idObject ?? '__orphan__'
      ;(acc[key] ??= []).push(comp)
      return acc
    },
    {},
  )

  // Injeta os components dentro de cada object
  const objects = (view.objects ?? []).map((obj) => ({
    ...obj,
    components: byObject[obj.id] ?? [],
  }))

  const navbars: Navbar[] = (view.navbars ?? []).map((nav: any) => {
    // Formato com tabs explícitas: { tabs: [{ id, objectList/objects }] }
    // Formato card/flat:          { objectList: [...] }  (sem tabs)
    const rawTabs: any[] = nav.tabs ?? []
    const tabs = rawTabs.length > 0
      ? rawTabs.map((tab: any, i: number) => ({
          id: String(tab.id ?? tab.idTab ?? i),
          label: tab.name ?? tab.label ?? '',
          objects: tab.objectList ?? tab.objects ?? [],
          visible: tab.visible,
        }))
      // Navbar estilo card com objectList direto → tab única implícita
      : (nav.objectList ?? []).length > 0
        ? [{ id: nav.id, label: '', objects: nav.objectList as string[], visible: undefined }]
        : []

    return {
      id: nav.id,
      label: nav.name ?? nav.label ?? nav.title ?? '',
      class: nav.class,
      style: nav.style,
      tabs,
    }
  })

  return {
    entities: view.entities ?? [],
    connections: view.connections ?? [],
    navbars,
    objects,
    parameters: view.parameters ?? [],
  }
}
