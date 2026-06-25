'use client'
import { create } from 'zustand'
import { getWishlist, removeFromWishlist, toggleWishlist } from '@/lib/api'

interface WishlistState {
  // Set of product IDs that are currently saved. Used by the heart icon
  // on every ProductCard to render the filled/empty state without
  // fetching the full list per card.
  savedIds: Set<number>
  status: 'idle' | 'loading' | 'ready'
  hydrate: () => Promise<void>
  isSaved: (productId: number) => boolean
  toggle: (productId: number) => Promise<boolean>
  // Hard remove (used by the /account/wishlist page button).
  remove: (productId: number) => Promise<void>
}

export const useWishlistStore = create<WishlistState>((set, get) => ({
  savedIds: new Set<number>(),
  status: 'idle',

  hydrate: async () => {
    if (get().status === 'loading') return
    set({ status: 'loading' })
    try {
      const { items } = await getWishlist()
      set({ savedIds: new Set(items.map((i) => i.product_id)), status: 'ready' })
    } catch {
      // 401: not logged in. Leave the set empty. Don't throw — every
      // ProductCard mounts independently and a guest user must not
      // crash the shop.
      set({ status: 'ready' })
    }
  },

  isSaved: (productId) => get().savedIds.has(productId),

  toggle: async (productId) => {
    const { saved } = await toggleWishlist(productId)
    set((state) => {
      const next = new Set(state.savedIds)
      if (saved) {
        next.add(productId)
      } else {
        next.delete(productId)
      }
      return { savedIds: next }
    })
    return saved
  },

  remove: async (productId) => {
    await removeFromWishlist(productId)
    set((state) => {
      const next = new Set(state.savedIds)
      next.delete(productId)
      return { savedIds: next }
    })
  },
}))
