import { useRef, createContext, useContext, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { viewsApi } from '@/api/views.api'
import { createViewStore, type ViewStore } from '@/store/viewStore'
import { ObjectRenderer } from './ObjectRenderer'
import type { ViewDefinition, Navbar, Connection } from '@/types/view.types'

// ─── Contexto da view (viewStore + connections + definição) ───────────────────

interface ViewContextValue {
  viewStore: ViewStore
  connections: Connection[]
  definition: ViewDefinition
}

const ViewContext = createContext<ViewContextValue | null>(null)

export function useViewContext() {
  const ctx = useContext(ViewContext)
  if (!ctx) throw new Error('useViewContext deve ser usado dentro de ViewRenderer')
  return ctx
}

// ─── ViewRenderer ─────────────────────────────────────────────────────────────

interface ViewRendererProps {
  screenName: string
}

export function ViewRenderer({ screenName }: ViewRendererProps) {
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

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    )
  }

  if (error || !definition) {
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
        definition,
      }}
    >
      <ViewContent definition={definition} />
    </ViewContext.Provider>
  )
}

// ─── ViewContent: renderiza navbars e objects ────────────────────────────────

function ViewContent({ definition }: { definition: ViewDefinition }) {
  const hasNavbars = definition.navbars && definition.navbars.length > 0

  if (hasNavbars) {
    return <NavbarView navbars={definition.navbars} definition={definition} />
  }

  // Sem navbars: renderiza todos os objects diretamente
  return (
    <div className="p-4 space-y-4">
      {definition.objects.map((obj) => (
        <ObjectRenderer key={obj.id} objectDef={obj} />
      ))}
    </div>
  )
}

// ─── NavbarView: tabs de navegação entre grupos de objects ───────────────────

function NavbarView({
  navbars,
  definition,
}: {
  navbars: Navbar[]
  definition: ViewDefinition
}) {
  const [activeNavbar, setActiveNavbar] = useState(navbars[0]?.id ?? '')

  const currentNavbar = navbars.find((n) => n.id === activeNavbar)
  const objectsToRender = definition.objects.filter((obj) =>
    currentNavbar?.objects.includes(obj.id),
  )

  return (
    <div className="flex flex-col h-full">
      {/* Tabs */}
      {navbars.length > 1 && (
        <div className="flex border-b border-border bg-card px-4">
          {navbars.map((nav) => (
            <button
              key={nav.id}
              onClick={() => setActiveNavbar(nav.id)}
              className={[
                'px-4 py-3 text-sm font-medium border-b-2 transition-colors',
                activeNavbar === nav.id
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
              ].join(' ')}
            >
              {nav.label}
            </button>
          ))}
        </div>
      )}

      {/* Objects da navbar ativa */}
      <div className="flex-1 overflow-auto p-4 space-y-4">
        {objectsToRender.map((obj) => (
          <ObjectRenderer key={obj.id} objectDef={obj} />
        ))}
      </div>
    </div>
  )
}
