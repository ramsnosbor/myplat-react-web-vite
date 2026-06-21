import { create } from 'zustand'

export interface MonitorConfig {
  entity: string
  idField: string
  statusField: string
  successStatus: number[]
  errorStatus: number[]
  label: string
}

export interface MonitorItem extends MonitorConfig {
  key: string          // `${entity}:${id}`
  id: string | number
  startedAt: number
}

interface MonitorStore {
  items: MonitorItem[]
  add: (config: MonitorConfig, id: string | number, resolvedLabel: string) => void
  remove: (key: string) => void
}

export const useMonitorStore = create<MonitorStore>((set) => ({
  items: [],

  add: (config, id, resolvedLabel) => {
    const key = `${config.entity}:${id}`
    set((s) => ({
      items: [
        ...s.items.filter((i) => i.key !== key),
        { ...config, id, label: resolvedLabel, key, startedAt: Date.now() },
      ],
    }))
  },

  remove: (key) => set((s) => ({ items: s.items.filter((i) => i.key !== key) })),
}))
