import { getClientToken } from '@/api/client'
import { useAuthStore } from '@/store/authStore'

const SSO_URL = (import.meta.env.VITE_SSO_URL as string | undefined) ?? 'http://localhost:3001'

class PushNotificationService {
  private isSupported: boolean
  private registration: ServiceWorkerRegistration | null = null
  private subscription: PushSubscription | null = null
  private isInitializing = false
  private isInitialized = false

  constructor() {
    this.isSupported = typeof navigator !== 'undefined' &&
      'serviceWorker' in navigator &&
      'PushManager' in window
  }

  isAvailable(): boolean {
    return this.isSupported
  }

  async init(): Promise<void> {
    if (this.isInitializing || this.isInitialized) return
    if (!this.isSupported) {
      console.warn('[Push] Push Notifications not supported in this browser')
      return
    }

    this.isInitializing = true

    try {
      await this.registerServiceWorker()

      const permission = Notification.permission

      if (permission === 'granted') {
        const subscribed = await this.isSubscribed()
        if (!subscribed) {
          await this.subscribe(true)
        }
      }

      this.isInitialized = true
    } catch (error) {
      console.error('[Push] Error initializing push service:', error)
    } finally {
      this.isInitializing = false
    }
  }

  async registerServiceWorker(): Promise<ServiceWorkerRegistration> {
    if (!this.isSupported) throw new Error('Service Worker ou Push API não suportados')

    try {
      this.registration = await navigator.serviceWorker.register('/service-worker.js')
      await navigator.serviceWorker.ready
      return this.registration
    } catch (error) {
      console.error('[Push] Erro ao registrar Service Worker:', error)
      throw error
    }
  }

  async subscribe(skipPermissionRequest = false): Promise<PushSubscription> {
    try {
      let permission = Notification.permission

      if (!skipPermissionRequest && permission !== 'granted') {
        permission = await Notification.requestPermission()
        if (permission !== 'granted') throw new Error('Permissão negada')
      } else if (permission !== 'granted') {
        throw new Error('Permissão não concedida')
      }

      if (!this.registration) {
        await this.registerServiceWorker()
      }

      const vapidPublicKey = await this.getVapidPublicKey()

      this.subscription = await this.registration!.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: this.urlBase64ToUint8Array(vapidPublicKey),
      })

      await this.sendSubscriptionToServer(this.subscription)

      return this.subscription
    } catch (error) {
      console.error('[Push] Error in subscribe():', error)
      throw error
    }
  }

  async unsubscribe(): Promise<void> {
    try {
      if (!this.subscription) {
        const registration = await navigator.serviceWorker.ready
        this.subscription = await registration.pushManager.getSubscription()
      }

      if (this.subscription) {
        await this.subscription.unsubscribe()
        await this.removeSubscriptionFromServer(this.subscription)
        this.subscription = null
      }
    } catch (error) {
      console.error('[Push] Erro ao cancelar inscrição:', error)
      throw error
    }
  }

  async isSubscribed(): Promise<boolean> {
    try {
      if (!this.isSupported) return false
      const registration = await navigator.serviceWorker.ready
      this.subscription = await registration.pushManager.getSubscription()
      return this.subscription !== null
    } catch {
      return false
    }
  }

  private async getVapidPublicKey(): Promise<string> {
    const token = getClientToken()
    const response = await fetch(`${SSO_URL}/vapid-public-key`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    })

    if (!response.ok) throw new Error('Failed to fetch VAPID public key')

    const data = (await response.json()) as { publicKey: string }
    return data.publicKey
  }

  private async sendSubscriptionToServer(subscription: PushSubscription): Promise<void> {
    const token = getClientToken()
    if (!token) {
      console.error('[Push] authToken not found!')
      throw new Error('Usuário não autenticado')
    }

    // Fonte de verdade do app novo: authStore (Zustand). O cookie de tenant
    // não é escrito por esta app — só existe quando se chega vindo do Maker.
    const { user, tenant } = useAuthStore.getState()

    const tenantId = tenant?.code ?? user?.tenant?.code ?? null
    let userEmail: string | null = user?.email ?? user?.username ?? null
    let userId: string | null = user?.id ?? null

    // Fallback no JWT apenas para o que faltar (ex.: userId não presente no store)
    if (!userEmail || !userId) {
      try {
        const payload = JSON.parse(atob(token.split('.')[1])) as Record<string, unknown>
        userEmail = userEmail ?? ((payload.email ?? payload.sub ?? null) as string | null)
        userId = userId ?? ((payload.userId ?? payload.sub ?? payload.id ?? null) as string | null)
      } catch {
        // JWT inválido — continua com o que tiver do store
      }
    }

    const deviceInfo = {
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      language: navigator.language,
      timestamp: new Date().toISOString(),
    }

    const response = await fetch(`${SSO_URL}/pushSubscription`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        subscription: subscription.toJSON(),
        userEmail,
        userId,
        tenantId,
        deviceInfo,
      }),
    })

    if (!response.ok) {
      const err = await response.json().catch(() => ({})) as { message?: string }
      throw new Error(err.message ?? 'Falha ao salvar subscription no servidor')
    }
  }

  private async removeSubscriptionFromServer(subscription: PushSubscription): Promise<void> {
    const token = getClientToken()
    if (!token) return

    const { user } = useAuthStore.getState()
    const userEmail = user?.email ?? user?.username ?? ''

    // O backend SSO lê userEmail e endpoint da query string (não do body).
    const params = new URLSearchParams({
      userEmail,
      endpoint: subscription.endpoint,
    })

    const response = await fetch(`${SSO_URL}/pushSubscription?${params.toString()}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })

    if (!response.ok) {
      throw new Error('Falha ao remover subscription do servidor')
    }
  }

  private urlBase64ToUint8Array(base64String: string): Uint8Array {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
    const rawData = window.atob(base64)
    const outputArray = new Uint8Array(rawData.length)
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i)
    }
    return outputArray
  }

  async testNotification(): Promise<void> {
    const registration = await navigator.serviceWorker.ready
    await registration.showNotification('Teste de Push', {
      body: 'Esta é uma notificação de teste!',
      icon: '/logo192.png',
      badge: '/logo192.png',
      vibrate: [200, 100, 200],
      data: { url: '/', type: 'test' },
    })
  }
}

const pushNotificationService = new PushNotificationService()
export default pushNotificationService
