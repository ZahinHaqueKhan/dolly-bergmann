import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

import {
  addToCart as apiAddToCart,
  clearCart as apiClearCart,
  getCart,
  removeFromCart as apiRemoveFromCart,
  updateCartItem as apiUpdateCartItem,
  type CartItem as ApiCartItem,
} from '@/lib/api'

// We keep a thin local copy of the cart in localStorage so the Header
// badge can render a count synchronously on first paint. The full
// source of truth is the backend (PLAN 3.1: server is the source of
// truth, localStorage is just a read-through cache + the session id
// persistence).
//
// The store is hydrated by /api/cart on first paint and after every
// mutation. We pass an X-Session-Id header for anonymous users so the
// backend can find their cart. The session id is generated client-side
// once and persisted in localStorage (PLAN 3.1).

export type CartItem = ApiCartItem

interface CartState {
  items: CartItem[]
  total: number
  itemCount: number
  sessionId: string | null
  loading: boolean
  error: string | null

  // The current user id (or null for guests). The auth store owns the
  // truth, but we mirror it here so the cart can decide whether to
  // send the X-Session-Id header.
  userId: number | null

  setUser: (userId: number | null) => void

  // Pull the current cart from the backend. Safe to call on every page
  // mount; it's idempotent.
  hydrate: () => Promise<void>

  add: (variantId: number, quantity?: number) => Promise<void>
  update: (itemId: number, quantity: number) => Promise<void>
  remove: (itemId: number) => Promise<void>
  clear: () => Promise<void>
}

const STORAGE_KEY = 'modestwear.cart.v1'

function genSessionId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return 'sess-' + Math.random().toString(36).slice(2) + Date.now().toString(36)
}

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      total: 0,
      itemCount: 0,
      sessionId: null,
      loading: false,
      error: null,
      userId: null,

      setUser: (userId) => {
        if (get().userId !== userId) {
          set({ userId })
          void get().hydrate()
        }
      },

      hydrate: async () => {
        set({ loading: true, error: null })
        try {
          const sid = get().userId ? undefined : get().sessionId ?? undefined
          const cart = await getCart(sid)
          const nextSession = cart.session_id ?? get().sessionId ?? null
          set({
            items: cart.items,
            total: cart.total,
            itemCount: cart.item_count,
            sessionId: nextSession,
            loading: false,
          })
        } catch (e) {
          set({
            loading: false,
            error: e instanceof Error ? e.message : 'Cart load failed',
          })
        }
      },

      add: async (variantId, quantity = 1) => {
        const sid = get().userId ? undefined : get().sessionId ?? undefined
        const cart = await apiAddToCart(variantId, quantity, sid)
        set({
          items: cart.items,
          total: cart.total,
          itemCount: cart.item_count,
          sessionId: cart.session_id ?? get().sessionId ?? null,
          error: null,
        })
      },

      update: async (itemId, quantity) => {
        const sid = get().userId ? undefined : get().sessionId ?? undefined
        const cart = await apiUpdateCartItem(itemId, quantity, sid)
        set({
          items: cart.items,
          total: cart.total,
          itemCount: cart.item_count,
          sessionId: cart.session_id ?? get().sessionId ?? null,
        })
      },

      remove: async (itemId) => {
        const sid = get().userId ? undefined : get().sessionId ?? undefined
        const cart = await apiRemoveFromCart(itemId, sid)
        set({
          items: cart.items,
          total: cart.total,
          itemCount: cart.item_count,
          sessionId: cart.session_id ?? get().sessionId ?? null,
        })
      },

      clear: async () => {
        const sid = get().userId ? undefined : get().sessionId ?? undefined
        const cart = await apiClearCart(sid)
        set({
          items: cart.items,
          total: cart.total,
          itemCount: cart.item_count,
          sessionId: cart.session_id ?? get().sessionId ?? null,
        })
      },
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() =>
        typeof window !== 'undefined' ? window.localStorage : (undefined as never)
      ),
      partialize: (state) => ({
        sessionId: state.sessionId,
        // Mirror just enough for a synchronous Header badge render
        // before the first /api/cart response lands.
        items: state.items,
        total: state.total,
        itemCount: state.itemCount,
      }),
      onRehydrateStorage: () => (state) => {
        if (!state?.sessionId) {
          state!.sessionId = genSessionId()
        }
      },
    }
  )
)
