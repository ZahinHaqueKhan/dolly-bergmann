import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface CartItem {
  variant_id: number
  product_name: string
  size: string
  color: string
  price: number
  quantity: number
  image: string
}

interface CartStore {
  items: CartItem[]
  addItem: (item: CartItem) => void
  removeItem: (variant_id: number) => void
  updateQuantity: (variant_id: number, quantity: number) => void
  clearCart: () => void
  total: () => number
}

export const useCartStore = create<CartStore>()(
  persist(
    (set, get) => ({
      items: [],
      addItem: (item) => set((state) => {
        const existing = state.items.find(i => i.variant_id === item.variant_id)
        if (existing) {
          return { items: state.items.map(i => i.variant_id === item.variant_id ? { ...i, quantity: i.quantity + item.quantity } : i) }
        }
        return { items: [...state.items, item] }
      }),
      removeItem: (variant_id) => set((state) => ({ items: state.items.filter(i => i.variant_id !== variant_id) })),
      updateQuantity: (variant_id, quantity) => set((state) => ({ items: state.items.map(i => i.variant_id === variant_id ? { ...i, quantity } : i) })),
      clearCart: () => set({ items: [] }),
      total: () => get().items.reduce((sum, i) => sum + i.price * i.quantity, 0),
    }),
    { name: 'cart-storage' }
  )
)