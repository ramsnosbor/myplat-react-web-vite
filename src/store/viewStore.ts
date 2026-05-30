import { createStore } from 'zustand'

// ─── Estado por objeto de uma view ───────────────────────────────────────────

export interface ObjectState {
  /** Linha selecionada na tabela / dados do formulário atual */
  selectedRow: Record<string, unknown> | null
  /** Dados atuais do formulário (modo create/edit) */
  formData: Record<string, unknown> | null
  /** Parâmetros de listagem (vindo do FilterObject ao submeter) */
  queryParams: Record<string, unknown>
  /** Modo atual do objeto crud */
  mode: 'create' | 'edit' | 'detail' | 'list' | null
}

// ─── Store da view (uma instância por ViewRenderer) ──────────────────────────

export interface ViewStoreState {
  objects: Record<string, ObjectState>
  setObjectState: (objectId: string, state: Partial<ObjectState>) => void
  resetObject: (objectId: string) => void
  getObjectState: (objectId: string) => ObjectState
}

const defaultObjectState = (): ObjectState => ({
  selectedRow: null,
  formData: null,
  queryParams: {},
  mode: null,
})

/**
 * Cria uma nova store de view isolada.
 * Usar com useRef + createStore para que cada ViewRenderer tenha a sua própria.
 */
export function createViewStore() {
  return createStore<ViewStoreState>()((set, get) => ({
    objects: {},

    setObjectState(objectId, state) {
      set((prev) => ({
        objects: {
          ...prev.objects,
          [objectId]: {
            ...defaultObjectState(),
            ...prev.objects[objectId],
            ...state,
          },
        },
      }))
    },

    resetObject(objectId) {
      set((prev) => ({
        objects: {
          ...prev.objects,
          [objectId]: defaultObjectState(),
        },
      }))
    },

    getObjectState(objectId) {
      return get().objects[objectId] ?? defaultObjectState()
    },
  }))
}

export type ViewStore = ReturnType<typeof createViewStore>
