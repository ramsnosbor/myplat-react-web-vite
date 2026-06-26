import { apiClient } from './client'

export interface NotificationItem {
  id: number | string
  title: string
  message: string
  type: string
  read: boolean
  timestamp: string
  data?: Record<string, unknown>
}

interface BackendNotification {
  id: number | string
  dsTemplate?: string
  type?: string
  creationDate?: string
  data?: Record<string, unknown>
}

function adaptNotification(item: BackendNotification): NotificationItem {
  const message = item.dsTemplate ?? ''
  const firstLine = message.split('\n')[0] || 'Notificacao'

  return {
    id: item.id,
    title: firstLine.length > 50 ? `${firstLine.slice(0, 50)}...` : firstLine,
    message,
    type: item.type ?? 'info',
    read: false,
    timestamp: item.creationDate ?? new Date().toISOString(),
    data: item.data ?? {},
  }
}

export const notificationApi = {
  async getList(params: { page?: number; limit?: number; unreadOnly?: boolean } = {}) {
    const { page = 1, limit = 20, unreadOnly = false } = params
    const response = await apiClient.get<BackendNotification[] | { notifications?: BackendNotification[] }>(
      '/api/notifications',
      { params: { page, limit, unreadOnly } },
    )

    const raw = Array.isArray(response.data) ? response.data : response.data.notifications ?? []
    return {
      notifications: raw.map(adaptNotification),
      total: raw.length,
      page,
    }
  },

  async getUnreadCount(): Promise<number> {
    try {
      const response = await apiClient.get<{ unreadCount?: number; count?: number }>('/api/notifications/unread-count')
      return response.data.unreadCount ?? response.data.count ?? 0
    } catch {
      const data = await notificationApi.getList({ unreadOnly: true })
      return data.notifications.length
    }
  },

  markAsRead(notificationId: number | string): Promise<void> {
    return apiClient.patch(`/api/notifications/${notificationId}/read`).then(() => undefined)
  },

  markAllAsRead(): Promise<void> {
    return apiClient.patch('/api/notifications/read-all').then(() => undefined)
  },

  notifyRole(idPapel: number, texto: string): Promise<void> {
    return apiClient.post('/api/notifications/workflow', { idPapel, texto }).then(() => undefined)
  },
}
