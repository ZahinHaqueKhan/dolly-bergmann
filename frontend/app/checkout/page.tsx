'use client'
import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useCartStore } from '@/store/cart'
export const dynamic = 'force-dynamic'

export default function CheckoutPage() {
  const { items, total } = useCartStore()
  const [step, setStep] = useState(1)
  const [coupon, setCoupon] = useState('')
  const [couponApplied, setCouponApplied] = useState(false)

  if (items.length === 0) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-16 text-center">
        <h1 className="text-3xl font-serif text-stone-800 mb-4">Nothing to Checkout</h1>
        <Link href="/shop" className="bg-stone-800 text-white px-6 py-3 rounded-full font-medium hover:bg-stone-700">Continue Shopping</Link>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-serif text-stone-800 mb-8">Checkout</h1>

      <div className="flex gap-4 mb-8">
        {['Shipping', 'Payment', 'Confirmation'].map((s, i) => (
          <div key={s} className={`flex items-center gap-2 ${step > i ? 'text-rose-500' : 'text-stone-400'}`}>
            <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${step > i ? 'bg-rose-500 text-white' : 'bg-stone-200 text-stone-500'}`}>{i + 1}</span>
            <span className="font-medium text-sm">{s}</span>
          </div>
        ))}
      </div>

      <div className="grid md:grid-cols-3 gap-12">
        <div className="md:col-span-2 space-y-6">
          {step === 1 && (
            <div className="bg-white rounded-xl p-6 border border-stone-100">
              <h2 className="font-serif text-xl text-stone-800 mb-6">Shipping Address</h2>
              <div className="grid grid-cols-2 gap-4">
                <input type="text" placeholder="First Name" className="border border-stone-200 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-stone-400" />
                <input type="text" placeholder="Last Name" className="border border-stone-200 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-stone-400" />
                <input type="email" placeholder="Email" className="border border-stone-200 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-stone-400 col-span-2" />
                <input type="text" placeholder="Address" className="border border-stone-200 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-stone-400 col-span-2" />
                <input type="text" placeholder="City" className="border border-stone-200 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-stone-400" />
                <input type="text" placeholder="ZIP Code" className="border border-stone-200 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-stone-400" />
              </div>
              <button onClick={() => setStep(2)} className="mt-6 w-full bg-stone-800 text-white py-3 rounded-full font-medium hover:bg-stone-700">Continue to Payment</button>
            </div>
          )}

          {step === 2 && (
            <div className="bg-white rounded-xl p-6 border border-stone-100">
              <h2 className="font-serif text-xl text-stone-800 mb-6">Payment Method</h2>
              <div className="bg-stone-50 rounded-lg p-4 mb-4 flex items-center gap-3">
                <input type="radio" name="payment" id="stripe" defaultChecked className="text-stone-800" />
                <label htmlFor="stripe" className="flex-1 font-medium text-stone-700">Credit / Debit Card</label>
                <div className="flex gap-1">
                  {['visa', 'mc', 'amex'].map(c => (
                    <div key={c} className="w-10 h-6 bg-white rounded border border-stone-200 flex items-center justify-center text-xs text-stone-400">{c.toUpperCase()}</div>
                  ))}
                </div>
              </div>
              <div className="space-y-3 mb-4">
                <input type="text" placeholder="Card Number" className="border border-stone-200 rounded-lg px-4 py-3 text-sm w-full" />
                <div className="grid grid-cols-2 gap-3">
                  <input type="text" placeholder="MM / YY" className="border border-stone-200 rounded-lg px-4 py-3 text-sm" />
                  <input type="text" placeholder="CVC" className="border border-stone-200 rounded-lg px-4 py-3 text-sm" />
                </div>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setStep(1)} className="flex-1 border border-stone-300 text-stone-700 py-3 rounded-full font-medium hover:bg-stone-50">Back</button>
                <button onClick={() => setStep(3)} className="flex-1 bg-stone-800 text-white py-3 rounded-full font-medium hover:bg-stone-700">Place Order</button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="bg-white rounded-xl p-6 border border-stone-100 text-center py-12">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"/></svg>
              </div>
              <h2 className="text-2xl font-serif text-stone-800 mb-2">Order Confirmed!</h2>
              <p className="text-stone-500 mb-6">Thank you for your order. A confirmation email has been sent.</p>
              <Link href="/account" className="bg-stone-800 text-white px-6 py-3 rounded-full font-medium hover:bg-stone-700">View Order Status</Link>
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl p-6 border border-stone-100 h-fit">
          <h2 className="font-serif text-lg text-stone-800 mb-4">Order Summary</h2>
          <div className="space-y-3 max-h-64 overflow-y-auto mb-4">
            {items.map(item => (
              <div key={item.variant_id} className="flex gap-3">
                <div className="w-12 h-12 relative rounded bg-stone-100 flex-shrink-0">
                  {item.image && <Image src={item.image} alt={item.product_name} fill className="object-cover rounded" />}
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-stone-700">{item.product_name}</p>
                  <p className="text-xs text-stone-400">Qty: {item.quantity}</p>
                </div>
                <p className="text-sm font-medium">${(item.price * item.quantity).toFixed(2)}</p>
              </div>
            ))}
          </div>
          <div className="space-y-2 text-sm border-t border-stone-200 pt-3">
            <div className="flex gap-2">
              <input value={coupon} onChange={e => setCoupon(e.target.value)} placeholder="Coupon code" className="flex-1 border border-stone-200 rounded px-3 py-2 text-xs" />
              <button onClick={() => setCouponApplied(true)} className="bg-stone-100 text-stone-600 px-3 py-2 rounded text-xs font-medium hover:bg-stone-200">Apply</button>
            </div>
            {couponApplied && <p className="text-green-600 text-xs">Coupon applied! 10% off</p>}
            <div className="flex justify-between text-stone-600"><span>Subtotal</span><span>${total().toFixed(2)}</span></div>
            {couponApplied && <div className="flex justify-between text-green-600"><span>Discount</span><span>-${(total() * 0.1).toFixed(2)}</span></div>}
            <div className="flex justify-between text-stone-600"><span>Shipping</span><span>Free</span></div>
            <div className="flex justify-between font-medium text-stone-800 pt-2 border-t"><span>Total</span><span>${(couponApplied ? total() * 0.9 : total()).toFixed(2)}</span></div>
          </div>
        </div>
      </div>
    </div>
  )
}