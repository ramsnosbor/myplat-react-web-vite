import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AppRouter } from './router'
import { ToastProvider } from './components/ui/Toast'
import { ActionMonitor } from './components/ui/ActionMonitor'

// ─── TanStack Query client ────────────────────────────────────────────────────

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 30_000, // 30 segundos de cache padrão
    },
  },
})

// ─── App ──────────────────────────────────────────────────────────────────────

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <AppRouter />
        <ActionMonitor />
      </ToastProvider>
    </QueryClientProvider>
  )
}
