import { useRef, useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useQuery } from '@tanstack/react-query'
import { useStore } from 'zustand'
import { viewsApi } from '@/api/views.api'
import { parameterApi } from '@/api/parameter.api'
import { createViewStore, type ViewStore } from '@/store/viewStore'
import { ObjectRenderer } from './ObjectRenderer'
import { useAuthStore } from '@/store/authStore'
import { resolveColClass } from '@/utils/colClass'
import { ViewContext, useViewContext } from './ViewContext'
import { evalExpr } from '@/utils/evalExpr'
import type { ViewDefinition, Navbar, ObjectDefinition } from '@/types/view.types'

// ─── Cache de parâmetros SSO ──────────────────────────────────────────────────
// Evita múltiplas chamadas para o mesmo parâmetro quando há várias views
// ou re-renders que disparam o mesmo fetch. Compartilhado entre instâncias.
const _paramCache = new Map<string, Promise<string | null>>()
function fetchParam(name: string): Promise<string | null> {
  if (!_paramCache.has(name)) {
    _paramCache.set(
      name,
      parameterApi
        .getConfig({ cdParameter: name, orderBy: 'id,asc' })
        .then((r) => {
          const val = r.table?.[0]?.vlParameter
          return val !== undefined && val !== null ? String(val) : null
        })
        .catch(() => null),
    )
  }
  return _paramCache.get(name)!
}

// ─── ViewRenderer ─────────────────────────────────────────────────────────────

interface ViewRendererProps {
  screenName: string
  /** Params iniciais do menu (ex: { tipo_nfe: "Saida" } de "listNfe?tipo_nfe=Saida") */
  initialParams?: Record<string, unknown>
}

export function ViewRenderer({ screenName, initialParams }: ViewRendererProps) {
  // Store isolada por instância de view (não compartilhada globalmente)
  const storeRef = useRef<ViewStore | null>(null)
  if (!storeRef.current) {
    storeRef.current = createViewStore()
  }

  const { data: definition, isLoading, error } = useQuery({
    queryKey: ['view', screenName],
    queryFn: () => viewsApi.getView(screenName),
    staleTime: 5 * 60 * 1000, // 5 minutos de cache para a definição da view
  })

  // ─── Parâmetros SSO ────────────────────────────────────────────────────────
  // Busca os parâmetros declarados em definition.parameters[] via GET /parameters?cdParameter=name
  // Disponíveis em formValues (como {{UTILIZA_PLANO_GERENCIAL}}) e nos payloads de script.
  const [screenParams, setScreenParams] = useState<Record<string, string>>({})

  useEffect(() => {
    const paramDefs = definition?.parameters
    if (!paramDefs || paramDefs.length === 0) {
      setScreenParams({})
      return
    }
    let cancelled = false
    Promise.all(
      paramDefs.map(async (def) => {
        if (!def?.name) return [null, null] as const
        const value = await fetchParam(def.name)
        const resolved = value ?? def.default ?? undefined
        return [def.name, resolved] as const
      }),
    ).then((entries) => {
      if (cancelled) return
      const result: Record<string, string> = {}
      for (const [key, val] of entries) {
        if (key && val !== undefined) result[key] = val
      }
      setScreenParams(result)
    })
    return () => { cancelled = true }
  }, [definition?.parameters])

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    )
  }

  if (error || !definition) {
    // Tela "home" sem view configurada → tela de boas-vindas
    if (screenName === 'home') {
      return <HomeScreen />
    }
    return (
      <div className="flex h-full items-center justify-center">
        <div className="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">
          Erro ao carregar a tela "{screenName}".
        </div>
      </div>
    )
  }

  return (
    <ViewContext.Provider
      value={{
        viewStore: storeRef.current,
        connections: definition.connections ?? [],
        initialParams,
        screenParams,
        definition: {
          entities: definition.entities ?? [],
          connections: definition.connections ?? [],
          navbars: definition.navbars ?? [],
          objects: definition.objects ?? [],
          newFormShowPopup: definition.newFormShowPopup,
        },
      }}
    >
      <ViewContent definition={definition} />
    </ViewContext.Provider>
  )
}

// ─── ViewContent: renderiza navbars e objects ────────────────────────────────

function ViewContent({ definition }: { definition: ViewDefinition }) {
  const navbars = definition.navbars ?? []
  const objects = definition.objects ?? []
  const hasNavbars = navbars.length > 0

  const modalObjects = objects.filter((o) => o.variant === 'modal')
  const inlineObjects = objects.filter((o) => o.variant !== 'modal')

  if (hasNavbars) {
    const navbarObjectIds = new Set(
      navbars.flatMap((n) => n.tabs.flatMap((t) => t.objects)),
    )
    const orphanDynamic = inlineObjects.filter((o) => o.dynamic && !navbarObjectIds.has(o.id))

    return (
      <div className="flex flex-col h-full overflow-auto">
        <div className="p-4 grid grid-cols-12 gap-4 items-start">
          {navbars.map((navbar) => (
            <NavbarSection
              key={navbar.id}
              navbar={navbar}
              allObjects={inlineObjects}
            />
          ))}
        </div>
        {orphanDynamic.map((obj) => <ObjectSlot key={obj.id} objectDef={obj} />)}
        {modalObjects.map((obj) => <ModalWrapper key={obj.id} objectDef={obj} />)}
      </div>
    )
  }

  return (
    <>
      <div className="p-4 grid grid-cols-12 gap-4 items-start">
        {inlineObjects.map((obj) => (
          <ObjectSlot key={obj.id} objectDef={obj} />
        ))}
      </div>
      {modalObjects.map((obj) => <ModalWrapper key={obj.id} objectDef={obj} />)}
    </>
  )
}

// ─── NavbarSection: uma seção com tabs internas ──────────────────────────────

function NavbarSection({
  navbar,
  allObjects,
}: {
  navbar: Navbar
  allObjects: ObjectDefinition[]
}) {
  const { initialParams = {}, screenParams = {} } = useViewContext()

  // Contexto de avaliação: screenParams (parâmetros SSO como UTILIZA_PLANO_GERENCIAL)
  // + initialParams (parâmetros de URL como tipo_nfe)
  const exprContext = { ...screenParams, ...initialParams } as Record<string, unknown>

  // Filtra tabs visíveis avaliando `tab.visible`
  const visibleTabs = navbar.tabs.filter((tab) => {
    if (!tab.visible) return true
    const result = evalExpr(tab.visible, exprContext)
    return result !== false && result !== 0 && result !== ''
  })

  const [activeTab, setActiveTab] = useState(visibleTabs[0]?.id ?? '')
  const [mobileTabsOpen, setMobileTabsOpen] = useState(false)

  // Se a tab ativa ficou oculta, troca para a primeira visível
  useEffect(() => {
    if (!visibleTabs.find((t) => t.id === activeTab)) {
      setActiveTab(visibleTabs[0]?.id ?? '')
    }
  }, [visibleTabs.map((t) => t.id).join(',')])

  const currentTab = visibleTabs.find((t) => t.id === activeTab) ?? visibleTabs[0]
  const objectsToRender = allObjects.filter((obj) =>
    currentTab?.objects?.includes(obj.id) ?? false,
  )

  const hasTabs = visibleTabs.length > 1

  return (
    <div className={resolveColClass(navbar.class)} style={navbar.style as React.CSSProperties}>
      {hasTabs && (
        <>
          <div className="hidden border-b border-border bg-card px-4 md:flex">
            {visibleTabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={[
                  'px-4 py-3 text-sm font-medium border-b-2 transition-colors',
                  activeTab === tab.id
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground',
                ].join(' ')}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="relative border-b border-border bg-card px-2 py-2 md:hidden">
            <button
              type="button"
              onClick={() => setMobileTabsOpen((open) => !open)}
              className="flex h-10 w-full items-center justify-between gap-3 rounded-md border border-border bg-background px-3 text-left text-sm font-semibold text-foreground shadow-sm"
            >
              <span className="min-w-0 truncate">{currentTab?.label ?? currentTab?.id ?? 'Aba'}</span>
              <i className={`bi bi-chevron-down shrink-0 text-xs text-muted-foreground transition-transform ${mobileTabsOpen ? 'rotate-180' : ''}`} aria-hidden />
            </button>

            {mobileTabsOpen && (
              <div className="absolute left-2 right-2 top-[52px] z-30 overflow-hidden rounded-md border border-border bg-popover text-popover-foreground shadow-xl">
                {visibleTabs.map((tab) => {
                  const active = activeTab === tab.id
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => {
                        setActiveTab(tab.id)
                        setMobileTabsOpen(false)
                      }}
                      className={[
                        'flex w-full items-center justify-between gap-3 px-3 py-3 text-left text-sm transition-colors',
                        active ? 'bg-primary/10 font-semibold text-primary' : 'hover:bg-muted',
                      ].join(' ')}
                    >
                      <span className="min-w-0 truncate">{tab.label ?? tab.id}</span>
                      {active && <i className="bi bi-check2 shrink-0 text-sm" aria-hidden />}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </>
      )}
      <div className="grid grid-cols-12 gap-4 items-start p-2">
        {objectsToRender.map((obj) => (
          <ObjectSlot key={obj.id} objectDef={obj} />
        ))}
      </div>
    </div>
  )
}

// ─── ObjectSlot: wrapper de grid que desaparece quando o object é oculto ─────
//
// Um <div> vazio no CSS Grid ainda ocupa espaço (célula vazia).
// ObjectSlot lê o mode do viewStore e retorna null (sem div) quando o
// object é dynamic e ainda não foi ativado — eliminando o espaço vazio.

function ObjectSlot({ objectDef }: { objectDef: ObjectDefinition }) {
  const { viewStore, screenParams, initialParams = {}, connections } = useViewContext()
  const objectMode = useStore(viewStore, (s) => s.objects[objectDef.id]?.mode ?? null)

  // Lê formData do pai (via connection) para incluir no contexto de visibilidade.
  // Permite condições como {{tipo_lancamento_acao}}!='transferencia' que dependem
  // de valores do form do objeto pai, não apenas de screenParams/initialParams.
  // IMPORTANTE: retornar `undefined` (primitivo estável) quando sem pai — retornar `{}`
  // criaria um novo objeto a cada render e causaria loop infinito no useStore do Zustand.
  const parentId = connections.find((c) => c.child === objectDef.id)?.parent
  const parentFormData = useStore(viewStore, (s) =>
    parentId
      ? (s.objects[parentId]?.formData as Record<string, unknown> | undefined)
      : undefined,
  )

  // dynamic sem mode → nem renderiza o wrapper (zero espaço no grid)
  if (objectDef.dynamic && !objectMode) return null

  // Avalia visible usando screenParams + initialParams + formData do pai
  if (objectDef.visible !== undefined && objectDef.visible !== null) {
    const ctx = { ...screenParams, ...initialParams, ...(parentFormData ?? {}) }
    const result = evalExpr(String(objectDef.visible), ctx)
    if (result === false || result === 0 || result === '' || result === null || result === undefined) {
      return null
    }
  }

  return (
    <div className={`${resolveColClass(objectDef.class)} min-w-0 w-full`}>
      <ObjectRenderer objectDef={objectDef} />
    </div>
  )
}

// ─── ModalWrapper: renderiza um object variant="modal" como overlay ───────────

const MODAL_SIZE: Record<string, string> = {
  sm:   'max-w-sm',
  md:   'max-w-lg',
  lg:   'max-w-2xl',
  xl:   'max-w-4xl',
  xxl:  'max-w-6xl',
  full: 'max-w-[95vw]',
}

function ModalWrapper({ objectDef }: { objectDef: ObjectDefinition }) {
  const { viewStore } = useViewContext()
  const objectMode = useStore(viewStore, (s) => s.objects[objectDef.id]?.mode ?? null)
  const setObjectState = useStore(viewStore, (s) => s.setObjectState)

  // Modal só abre quando seu mode é definido (create | edit | detail | list)
  if (!objectMode) return null

  function handleClose() {
    setObjectState(objectDef.id, { mode: null, selectedRow: null, formData: null })
  }

  // keepOpen: true → modal só fecha por action explícita (cancel / closeObject).
  // Desabilita o clique no backdrop e oculta o botão ×.
  const keepOpen = objectDef.keepOpen === true

  const isFullscreen = objectDef.fullscreen === true
  const sizeClass = isFullscreen ? 'max-w-full' : (MODAL_SIZE[objectDef.size ?? 'lg'] ?? 'max-w-2xl')
  const centeredClass = objectDef.centered !== false ? 'items-center' : 'items-start pt-16'
  const modalHeightClass = isFullscreen ? 'h-screen rounded-none' : 'max-h-[90vh] rounded-lg'
  const paddingClass = isFullscreen ? 'p-0' : 'p-4'

  return createPortal(
    <div
      className={`fixed inset-0 z-50 flex ${isFullscreen ? 'items-stretch' : centeredClass} justify-center bg-black/50 ${paddingClass}`}
      onClick={(e) => { if (!keepOpen && e.target === e.currentTarget) handleClose() }}
    >
      <div
        className={`relative w-full ${sizeClass} ${modalHeightClass} overflow-hidden bg-background shadow-xl flex flex-col`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header do modal */}
        <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold text-foreground">
            {objectDef.title ?? ''}
          </h2>
          <button
            type="button"
            onClick={handleClose}
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            aria-label="Fechar"
          >
            <i className="bi bi-x-lg text-sm" aria-hidden />
          </button>
        </div>

        {/* Conteúdo do modal — iframe sem padding para ocupar toda a área */}
        <div className={`flex-1 overflow-auto ${objectDef.type === 'iframe' ? 'p-0' : 'p-4'}`}>
          <ObjectRenderer objectDef={objectDef} />
        </div>
      </div>
    </div>,
    document.body,
  )
}

// ─── HomeScreen: tela inicial quando não há view "home" configurada ───────────

function HomeScreen() {
  const user = useAuthStore((s) => s.user)
  const tenant = useAuthStore((s) => s.tenant)
  const modules = useAuthStore((s) => s.modules)

  const firstName = user?.name?.split(' ')[0] ?? user?.username ?? 'Usuário'

  return (
    <div className="flex flex-col h-full items-center justify-center p-8 text-center">
      <div className="max-w-md">
        {/* Ícone */}
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-3xl">
          🏠
        </div>

        {/* Boas-vindas */}
        <h1 className="text-2xl font-bold text-foreground">
          Olá, {firstName}!
        </h1>
        {tenant && (
          <p className="mt-1 text-sm text-muted-foreground">{tenant.label}</p>
        )}
        <p className="mt-4 text-sm text-muted-foreground">
          Selecione um módulo no menu lateral para começar.
        </p>

        {/* Módulos disponíveis como atalhos */}
        {modules.length > 0 && (
          <div className="mt-8 flex flex-wrap justify-center gap-2">
            {modules.slice(0, 6).map((mod) => (
              <div
                key={mod.idModulo}
                className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground"
                style={{ borderColor: mod.color ? `${mod.color}40` : undefined }}
              >
                {mod.icon && <i className={`${mod.icon} text-xs`} style={{ color: mod.color ?? undefined }} />}
                <span>{mod.shortName ?? mod.name}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
