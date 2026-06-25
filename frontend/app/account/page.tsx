'use client'
import Link from 'next/link'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/auth'
import { useCartStore } from '@/store/cart'

export const dynamic = 'force-dynamic'

export default function AccountPage() {
  const router = useRouter()
  const user = useAuthStore((s) => s.user)
  const status = useAuthStore((s) => s.status)
  const hydrate = useAuthStore((s) => s.hydrate)
  const clearCart = useCartStore((s) => s.clearCart)
  const cartCount = useCartStore((s) =>
    s.items.reduce((sum, i) => sum + i.quantity, 0)
  )

  useEffect(() => {
    if (status === 'idle') {
      void hydrate()
    }
  }, [status, hydrate])

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.replace('/account/login?next=/account')
    }
  }, [status, router])

  if (status === 'loading' || status === 'idle' || !user) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-12">
        <p className="text-stone-500">Loading...</p>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-12">
      <div className="mb-8">
        <h1 className="text-3xl font-serif text-stone-800">
          Welcome, {user.first_name ?? user.email.split('@')[0]}
        </h1>
        <p className="text-stone-500 mt-1 text-sm">
          Signed in as <span className="text-stone-700">{user.email}</span>
          {user.role !== 'customer' && (
            <span className="ml-2 inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-rose-100 text-rose-700 capitalize">
              {user.role}
            </span>
          )}
        </p>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        <Link
          href="/account/orders"
          className="bg-white rounded-xl border border-stone-200 p-6 hover:border-stone-300 transition-colors"
        >
          <h2 className="font-serif text-lg text-stone-800 mb-1">Orders</h2>
          <p className="text-sm text-stone-500">View your order history and tracking.</p>
        </Link>

        <Link
          href="/account/wishlist"
          className="bg-white rounded-xl border border-stone-200 p-6 hover:border-stone-300 transition-colors"
        >
          <h2 className="font-serif text-lg text-stone-800 mb-1">Wishlist</h2>
          <p className="text-sm text-stone-500">Products you saved for later.</p>
        </Link>

        <Link
          href="/cart"
          className="bg-white rounded-xl border border-stone-200 p-6 hover:border-stone-300 transition-colors"
        >
          <h2 className="font-serif text-lg text-stone-800 mb-1">Cart</h2>
          <p className="text-sm text-stone-500">
            {cartCount === 0
              ? 'Your cart is empty.'
              : `${cartCount} item${cartCount === 1 ? '' : 's'} in your cart.`}
          </p>
        </Link>
      </div>

      <div className="mt-8">
        <Link
          href="/shop"
          className="inline-block bg-stone-800 text-white px-6 py-3 rounded-lg font-medium hover:bg-stone-700 transition-colors"
        >
          Continue shopping
        </Link>
      </div>

      {process.env.NODE_ENV !== 'production' && cartCount > 0 && (
        <div className="mt-12 border-t border-stone-200 pt-6">
          <button
            onClick={clearCart}
            className="text-xs text-stone-400 hover:text-stone-600"
            type="button"
          >
            Clear local cart (dev)
          </button>
        </div>
      )}
    </div>
  )
}
