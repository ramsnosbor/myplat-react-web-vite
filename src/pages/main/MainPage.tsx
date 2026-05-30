import { useParams } from 'react-router-dom'
import { ViewRenderer } from '@/components/renderer/ViewRenderer'
import { useAuthStore } from '@/store/authStore'

export default function MainPage() {
  const { screen } = useParams<{ screen?: string }>()
  const homePath = useAuthStore((s) => s.homePath)

  // Se não há screen na URL, usa a tela padrão do homePath (ex: "home")
  const screenName = screen ?? homePath.replace('/home/', '') ?? 'home'

  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar / Menu — será implementado na etapa de layout */}
      <aside className="hidden w-64 border-r border-border bg-card md:flex md:flex-col">
        <div className="p-4 text-sm font-semibold text-muted-foreground">
          Menu (em breve)
        </div>
      </aside>

      {/* Conteúdo principal */}
      <main className="flex-1 overflow-auto">
        <ViewRenderer key={screenName} screenName={screenName} />
      </main>
    </div>
  )
}
