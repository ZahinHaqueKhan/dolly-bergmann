'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useEffect } from 'react'
import toast from 'react-hot-toast'

import { useCartStore } from '@/store/cart'

export const dynamic = 'force-dynamic'

export default function CartPage() {
  const items = useCartStore((s) => s.items)
  const total = useCartStore((s) => s.total)
  const loading = useCartStore((s) => s.loading)
  const error = useCartStore((s) => s.error)
  const hydrate = useCartStore((s) => s.hydrate)
  const update = useCartStore((s) => s.update)
  const remove = useCartStore((s) => s.remove)

  useEffect(() => {
    void hydrate()
  }, [hydrate])

  async function onUpdate(itemId: number, quantity: number) {
    try {
      await update(itemId, quantity)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not update')
    }
  }

  async function onRemove(itemId: number) {
    try {
      await remove(itemId)
      toast.success('Removed from cart')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not remove')
    }
  }

  if (loading && items.length === 0) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-16 text-center">
        <p className="text-stone-500">Loading your cart...</p>
      </div>
    )
  }

  if (!loading && items.length === 0) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-16 text-center">
        <h1 className="text-3xl font-serif text-stone-800 mb-4">Your Cart is Empty</h1>
        <p className="text-stone-500 mb-8">Looks like you have not added anything to your cart yet.</p>
        <Link
          href="/shop"
          className="inline-block bg-stone-800 text-white px-6 py-3 rounded-lg font-medium hover:bg-stone-700 transition-colors"
        >
          Continue Shopping
        </Link>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-serif text-stone-800 mb-8">Shopping Cart</h1>
      {error && (
        <div className="mb-4 p-3 bg-red-50 text-red-700 text-sm rounded-lg">{error}</div>
      )}
      <div className="grid md:grid-cols-3 gap-12">
        <div className="md:col-span-2 space-y-4">
          {items.map((item) => (
            <div
              key={item.id}
              className="flex gap-4 bg-white rounded-xl p-4 border border-stone-200"
            >
              <div className="w-24 h-24 relative rounded-lg overflow-hidden bg-stone-100 flex-shrink-0">
                {item.image && (
                  <Image
                    src={item.image}
                    alt={item.product_name}
                    fill
                    className="object-cover"
                    sizes="96px"
                  />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-medium text-stone-800 truncate">{item.product_name}</h3>
                <p className="text-sm text-stone-500">
                  {item.size && `Size: ${item.size}`} {item.color && `| Color: ${item.color}`}
                </p>
                <p className="font-medium mt-1 text-stone-800">
                  ${(item.price / 100).toFixed(2)}
                </p>
              </div>
              <div className="flex flex-col items-end justify-between">
                <button
                  onClick={() => onRemove(item.id)}
                  className="text-stone-400 hover:text-stone-600 text-sm"
                  aria-label={`Remove ${item.product_name} from cart`}
                >
                  Remove
                </button>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => onUpdate(item.id, Math.max(1, item.quantity - 1))}
                    className="w-8 h-8 border border-stone-200 rounded-lg flex items-center justify-center hover:bg-stone-50 transition-colors"
                    aria-label="Decrease quantity"
                  >
                    −
                  </button>
                  <span className="w-8 text-center text-sm">{item.quantity}</span>
                  <button
                    onClick={() => onUpdate(item.id, item.quantity + 1)}
                    disabled={item.quantity >= item.stock}
                    className="w-8 h-8 border border-stone-200 rounded-lg flex items-center justify-center hover:bg-stone-50 transition-colors disabled:opacity-50 disabled:hover:bg-transparent"
                    aria-label="Increase quantity"
                  >
                    +
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="bg-white rounded-xl p-6 border border-stone-200 h-fit">
          <h2 className="font-serif text-lg text-stone-800 mb-4">Order Summary</h2>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between text-stone-600">
              <span>Subtotal</span>
              <span>${(total / 100).toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-stone-600">
              <span>Shipping</span>
              <span className="text-stone-500">Calculated at checkout</span>
            </div>
            <div className="border-t border-stone-200 pt-3 flex justify-between font-medium text-stone-800">
              <span>Total</span>
              <span>${(total / 100).toFixed(2)}</span>
            </div>
          </div>
          <Link
            href="/checkout"
            className="mt-6 block w-full bg-rose-500 text-white text-center py-3 rounded-lg font-medium hover:bg-rose-600 transition-colors"
          >
            Proceed to Checkout
          </Link>
          <Link
            href="/shop"
            className="mt-3 block text-center text-stone-500 text-sm hover:text-stone-700"
          >
            Continue Shopping
          </Link>
        </div>
      </div>
    </div>
  )
}
