import { create } from 'zustand'

export interface NotificationToastItem {
  key: string
  title: string
  message: string
  createdAt: number
}

interface NotificationToastStore {
  items: NotificationToastItem[]
  push: (item: Omit<NotificationToastItem, 'createdAt'>) => void
  remove: (key: string) => void
}

export const useNotificationToastStore = create<NotificationToastStore>((set) => ({
  items: [],

  push: (item) => {
    set((s) => ({
      items: [...s.items.filter((i) => i.key !== item.key), { ...item, createdAt: Date.now() }],
    }))
  },

  remove: (key) => set((s) => ({ items: s.items.filter((i) => i.key !== key) })),
}))
