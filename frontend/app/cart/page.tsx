'use client'
import Image from 'next/image'
import Link from 'next/link'
import { useCartStore } from '@/store/cart'
export const dynamic = 'force-dynamic'

export default function CartPage() {
  const { items, removeItem, updateQuantity, total } = useCartStore()

  if (items.length === 0) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-16 text-center">
        <h1 className="text-3xl font-serif text-stone-800 mb-4">Your Cart is Empty</h1>
        <p className="text-stone-500 mb-8">Looks like you have not added anything to your cart yet.</p>
        <Link href="/shop" className="bg-stone-800 text-white px-6 py-3 rounded-full font-medium hover:bg-stone-700">
          Continue Shopping
        </Link>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-serif text-stone-800 mb-8">Shopping Cart</h1>
      <div className="grid md:grid-cols-3 gap-12">
        <div className="md:col-span-2 space-y-4">
          {items.map(item => (
            <div key={item.variant_id} className="flex gap-4 bg-white rounded-xl p-4 border border-stone-100">
              <div className="w-24 h-24 relative rounded-lg overflow-hidden bg-stone-100 flex-shrink-0">
                {item.image && <Image src={item.image} alt={item.product_name} fill className="object-cover" />}
              </div>
              <div className="flex-1">
                <h3 className="font-medium text-stone-800">{item.product_name}</h3>
                <p className="text-sm text-stone-500">{item.size && `Size: ${item.size}`} {item.color && `| Color: ${item.color}`}</p>
                <p className="font-medium mt-1">${item.price}</p>
              </div>
              <div className="flex flex-col items-end justify-between">
                <button onClick={() => removeItem(item.variant_id)} className="text-stone-400 hover:text-stone-600 text-sm">Remove</button>
                <div className="flex items-center gap-2">
                  <button onClick={() => updateQuantity(item.variant_id, Math.max(1, item.quantity - 1))} className="w-8 h-8 border border-stone-200 rounded flex items-center justify-center hover:bg-stone-50">-</button>
                  <span className="w-8 text-center text-sm">{item.quantity}</span>
                  <button onClick={() => updateQuantity(item.variant_id, item.quantity + 1)} className="w-8 h-8 border border-stone-200 rounded flex items-center justify-center hover:bg-stone-50">+</button>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="bg-white rounded-xl p-6 border border-stone-100 h-fit">
          <h2 className="font-serif text-lg text-stone-800 mb-4">Order Summary</h2>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between text-stone-600">
              <span>Subtotal</span>
              <span>${total().toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-stone-600">
              <span>Shipping</span>
              <span className="text-stone-400">Calculated at checkout</span>
            </div>
            <div className="border-t border-stone-200 pt-3 flex justify-between font-medium text-stone-800">
              <span>Total</span>
              <span>${total().toFixed(2)}</span>
            </div>
          </div>
          <Link href="/checkout" className="mt-6 block w-full bg-stone-800 text-white text-center py-3 rounded-full font-medium hover:bg-stone-700">
            Proceed to Checkout
          </Link>
          <Link href="/shop" className="mt-3 block text-center text-stone-500 text-sm hover:text-stone-700">
            Continue Shopping
          </Link>
        </div>
      </div>
    </div>
  )
}