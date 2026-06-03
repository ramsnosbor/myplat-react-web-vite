import { ssoClient } from './client'

export interface PageResponse<T> {
  table: T[]
  number?: number
  size?: number
  totalPages?: number
  totalElements?: number
}

export interface NotificationTemplate {
  id?: number | string
  cdTemplateNotification: string
  dsTemplateNotification: string
  dsTemplate: string
  subject: string
  type?: 'EMAIL' | 'WHATSAPP' | string
}

export interface NotificationType {
  id: number | string
  notificationType: string
}

export interface AutomatedMessageParameter {
  code: string
  value: string
}

export interface AutomatedMessage {
  id?: number | string
  creationDate?: string
  description: string
  executionInterval: string
  entityName?: string
  notificationType?: NotificationType
  notificationTypeId?: number | string
  notificationTemplate?: NotificationTemplate
  notificationTemplateId?: number | string
  beginDate: string
  endDate?: string
  beginHour: number | string
  endHour: number | string
  arrayDayOfWeek?: string
  active?: boolean
  lastExecution?: string
  automatedMessagesParameters?: AutomatedMessageParameter[]
}

export interface AutomatedMessagePayload {
  description: string
  executionInterval: string
  entityName: string
  notificationTypeId: number | string
  notificationTemplateId: number | string
  beginDate: string
  endDate: string
  beginHour: number | string
  endHour: number | string
  arrayDayOfWeek: string
  automatedMessagesParameter: AutomatedMessageParameter[]
}

export const templateMessagesApi = {
  getTemplates(params: Record<string, unknown> = {}): Promise<PageResponse<NotificationTemplate>> {
    return ssoClient.get('/notification-template', { params }).then((r) => normalizePage<NotificationTemplate>(r.data))
  },

  createTemplate(data: NotificationTemplate): Promise<void> {
    return ssoClient.post('/notification-template', data).then(() => undefined)
  },

  updateTemplate(id: number | string, data: NotificationTemplate): Promise<void> {
    return ssoClient.put(`/notification-template/${id}`, data).then(() => undefined)
  },

  getAutomatedMessages(params: Record<string, unknown> = {}): Promise<PageResponse<AutomatedMessage>> {
    return ssoClient.get('/automated-messages', { params }).then((r) => normalizePage<AutomatedMessage>(r.data))
  },

  createAutomatedMessage(data: AutomatedMessagePayload): Promise<void> {
    return ssoClient.post('/automated-messages', data).then(() => undefined)
  },

  updateAutomatedMessage(id: number | string, data: AutomatedMessagePayload): Promise<void> {
    return ssoClient.put(`/automated-messages/${id}`, data).then(() => undefined)
  },

  getNotificationTypes(): Promise<NotificationType[]> {
    return ssoClient.get('/notification-types').then((r) => Array.isArray(r.data) ? r.data : [])
  },
}

function normalizePage<T>(data: unknown): PageResponse<T> {
  if (Array.isArray(data)) return { table: data, totalElements: data.length, totalPages: 1, number: 0, size: data.length }
  const shaped = data as Partial<PageResponse<T>> | null
  return {
    table: shaped?.table ?? [],
    number: shaped?.number ?? 0,
    size: shaped?.size ?? shaped?.table?.length ?? 0,
    totalPages: shaped?.totalPages ?? 1,
    totalElements: shaped?.totalElements ?? shaped?.table?.length ?? 0,
  }
}
