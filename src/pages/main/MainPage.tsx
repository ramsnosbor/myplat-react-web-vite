import { useParams, useLocation } from 'react-router-dom'
import { ViewRenderer } from '@/components/renderer/ViewRenderer'
import { AppShell } from '@/components/layout/AppShell'

export default function MainPage() {
  const { screen } = useParams<{ screen?: string }>()
  const location = useLocation()
  const screenName = screen ?? 'home'

  const state = location.state as {
    initialParams?: Record<string, unknown>
    searchParams?: Record<string, unknown>
    mode?: string
  } | null

  const stateInitialParams = state?.initialParams ?? {}
  const stateSearchParams = state?.searchParams ?? {}
  const urlParams = Object.fromEntries(new URLSearchParams(location.search).entries())
  const modeParam = state?.mode ? { _mode: state.mode } : {}
  const hideMenu = String(urlParams.hideMenu ?? '').toLowerCase() === 'true'

  const merged = { ...urlParams, ...stateSearchParams, ...stateInitialParams, ...modeParam }
  const initialParams = Object.keys(merged).length > 0 ? merged : undefined

  if (hideMenu) {
    return (
      <main className="min-h-screen bg-background">
        <ViewRenderer
          key={`${screenName}-${JSON.stringify(initialParams ?? {})}`}
          screenName={screenName}
          initialParams={initialParams}
        />
      </main>
    )
  }

  return (
    <AppShell title={screenName !== 'home' ? screenName : 'Inicio'}>
      <ViewRenderer
        key={`${screenName}-${JSON.stringify(initialParams ?? {})}`}
        screenName={screenName}
        initialParams={initialParams}
      />
    </AppShell>
  )
}
