'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'

import { createCheckoutSession } from '@/lib/api'
import { useCartStore } from '@/store/cart'

export const dynamic = 'force-dynamic'

const FREE_SHIPPING_THRESHOLD_CENTS = 10000
const FLAT_SHIPPING_CENTS = 700

export default function CheckoutPage() {
  const router = useRouter()
  const items = useCartStore((s) => s.items)
  const subtotal = useCartStore((s) => s.total)
  const loading = useCartStore((s) => s.loading)
  const hydrate = useCartStore((s) => s.hydrate)
  const clear = useCartStore((s) => s.clear)

  const [form, setForm] = useState({
    name: '',
    email: '',
    line1: '',
    line2: '',
    city: '',
    state: '',
    postal_code: '',
    country: 'US',
  })
  const [coupon, setCoupon] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void hydrate()
  }, [hydrate])

  const shipping = subtotal >= FREE_SHIPPING_THRESHOLD_CENTS ? 0 : FLAT_SHIPPING_CENTS
  const total = subtotal + shipping

  if (loading && items.length === 0) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-16 text-center">
        <p className="text-stone-500">Loading...</p>
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-16 text-center">
        <h1 className="text-3xl font-serif text-stone-800 mb-4">Your cart is empty</h1>
        <p className="text-stone-500 mb-8">Add something before checking out.</p>
        <Link
          href="/shop"
          className="inline-block bg-stone-800 text-white px-6 py-3 rounded-lg font-medium hover:bg-stone-700 transition-colors"
        >
          Continue Shopping
        </Link>
      </div>
    )
  }

  function setField<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  function validate(): string | null {
    if (!form.name.trim()) return 'Name is required'
    if (!form.email.trim()) return 'Email is required'
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email)) return 'Email is not valid'
    if (!form.line1.trim()) return 'Address is required'
    if (!form.city.trim()) return 'City is required'
    if (!form.state.trim()) return 'State is required'
    if (!form.postal_code.trim()) return 'Postal code is required'
    if (!form.country.trim()) return 'Country is required'
    return null
  }

  async function onPlaceOrder() {
    setError(null)
    const v = validate()
    if (v) {
      setError(v)
      return
    }
    setSubmitting(true)
    try {
      // PLAN 3.4: shipping address goes to /api/checkout, the server
      // forwards it to Stripe. The webhook re-extracts it from
      // session.shipping_details (FIX BUG 1).
      const result = await createCheckoutSession({
        shipping_address: { ...form },
        coupon_code: coupon || undefined,
      })
      // Clear the local cart so the badge updates immediately. The
      // server will also clear it on the webhook.
      void clear()
      // In dev with the placeholder Stripe key, the backend returns a
      // success_url with the fake session_id. In production this is
      // the real Stripe checkout page.
      router.push(result.checkout_url)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start checkout')
      toast.error('Checkout failed')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-serif text-stone-800 mb-8">Checkout</h1>

      <div className="grid md:grid-cols-3 gap-12">
        <div className="md:col-span-2 space-y-6">
          <div className="bg-white rounded-xl p-6 border border-stone-200">
            <h2 className="font-serif text-xl text-stone-800 mb-6">Shipping Address</h2>
            <div className="grid grid-cols-2 gap-4">
              <Field
                label="Full name"
                value={form.name}
                onChange={(v) => setField('name', v)}
                placeholder="Jane Doe"
                className="col-span-2"
                autoComplete="name"
                required
              />
              <Field
                label="Email"
                type="email"
                value={form.email}
                onChange={(v) => setField('email', v)}
                placeholder="jane@example.com"
                className="col-span-2"
                autoComplete="email"
                required
              />
              <Field
                label="Address line 1"
                value={form.line1}
                onChange={(v) => setField('line1', v)}
                placeholder="123 Main St"
                className="col-span-2"
                autoComplete="address-line1"
                required
              />
              <Field
                label="Address line 2 (optional)"
                value={form.line2}
                onChange={(v) => setField('line2', v)}
                placeholder="Apt 4B"
                className="col-span-2"
                autoComplete="address-line2"
              />
              <Field
                label="City"
                value={form.city}
                onChange={(v) => setField('city', v)}
                placeholder="Boston"
                autoComplete="address-level2"
                required
              />
              <Field
                label="State / Region"
                value={form.state}
                onChange={(v) => setField('state', v)}
                placeholder="MA"
                autoComplete="address-level1"
                required
              />
              <Field
                label="Postal code"
                value={form.postal_code}
                onChange={(v) => setField('postal_code', v)}
                placeholder="02101"
                autoComplete="postal-code"
                required
              />
              <Field
                label="Country"
                value={form.country}
                onChange={(v) => setField('country', v)}
                placeholder="US"
                autoComplete="country"
                required
              />
            </div>
          </div>

          {error && (
            <div className="bg-red-50 text-red-700 text-sm rounded-lg p-3 border border-red-100">
              {error}
            </div>
          )}

          <button
            onClick={onPlaceOrder}
            disabled={submitting}
            className="w-full bg-stone-800 text-white py-3 rounded-lg font-medium hover:bg-stone-700 transition-colors disabled:opacity-50"
          >
            {submitting ? 'Redirecting...' : 'Place Order'}
          </button>
          <p className="text-xs text-stone-500 text-center">
            You will be redirected to Stripe to complete your purchase securely.
          </p>
        </div>

        <div className="bg-white rounded-xl p-6 border border-stone-200 h-fit">
          <h2 className="font-serif text-lg text-stone-800 mb-4">Order Summary</h2>
          <div className="space-y-3 max-h-64 overflow-y-auto mb-4">
            {items.map((item) => (
              <div key={item.id} className="flex gap-3">
                <div className="w-12 h-12 relative rounded bg-stone-100 flex-shrink-0">
                  {item.image && (
                    <Image
                      src={item.image}
                      alt={item.product_name}
                      fill
                      className="object-cover rounded"
                      sizes="48px"
                    />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-stone-700 truncate">
                    {item.product_name}
                  </p>
                  <p className="text-xs text-stone-500">
                    Qty: {item.quantity} · {item.size} · {item.color}
                  </p>
                </div>
                <p className="text-sm font-medium text-stone-800">
                  ${(item.subtotal / 100).toFixed(2)}
                </p>
              </div>
            ))}
          </div>

          <div className="space-y-2 text-sm border-t border-stone-200 pt-4">
            <label className="block text-xs text-stone-500 mb-1">Coupon code (optional)</label>
            <div className="flex gap-2 mb-3">
              <input
                value={coupon}
                onChange={(e) => setCoupon(e.target.value)}
                placeholder="WELCOME10"
                className="flex-1 border border-stone-300 rounded-lg px-3 py-2 text-sm focus:border-rose-500 focus:ring-1 focus:ring-rose-500"
              />
            </div>
            <div className="flex justify-between text-stone-600">
              <span>Subtotal</span>
              <span>${(subtotal / 100).toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-stone-600">
              <span>Shipping</span>
              <span>{shipping === 0 ? 'Free' : `$${(shipping / 100).toFixed(2)}`}</span>
            </div>
            {subtotal < FREE_SHIPPING_THRESHOLD_CENTS && (
              <p className="text-xs text-stone-500">
                Add ${((FREE_SHIPPING_THRESHOLD_CENTS - subtotal) / 100).toFixed(2)} more for free shipping.
              </p>
            )}
            <div className="flex justify-between font-medium text-stone-800 pt-2 border-t border-stone-200">
              <span>Total</span>
              <span>${(total / 100).toFixed(2)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
  className,
  autoComplete,
  required,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  type?: string
  className?: string
  autoComplete?: string
  required?: boolean
}) {
  return (
    <label className={`block ${className ?? ''}`}>
      <span className="block text-xs text-stone-500 mb-1">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        required={required}
        className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm focus:border-rose-500 focus:ring-1 focus:ring-rose-500"
      />
    </label>
  )
}
