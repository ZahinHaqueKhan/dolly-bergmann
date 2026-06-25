'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'

import { getOrder, type OrderDetail } from '@/lib/api'
import { useAuthStore } from '@/store/auth'

export const dynamic = 'force-dynamic'

const STATUS_BADGE: Record<string, string> = {
  paid: 'bg-rose-100 text-rose-700',
  pending: 'bg-amber-100 text-amber-700',
  shipped: 'bg-blue-100 text-blue-700',
  delivered: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-700',
  refunded: 'bg-stone-100 text-stone-700',
}

export default function OrderDetailPage() {
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const orderId = Number(params?.id)
  const authStatus = useAuthStore((s) => s.status)
  const hydrate = useAuthStore((s) => s.hydrate)
  const [order, setOrder] = useState<OrderDetail | null>(null)
  // start as `true` so we don't show "missing" between mount and fetch
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (authStatus === 'idle') void hydrate()
  }, [authStatus, hydrate])

  useEffect(() => {
    if (authStatus === 'unauthenticated') {
      router.replace(`/account/login?next=/account/orders/${orderId}`)
      return
    }
    if (!Number.isFinite(orderId)) return
    let cancelled = false
    // The "loading" reset on a new orderId is intentional — when the
    // user navigates from /orders/1 to /orders/2 we want the second
    // page to show a spinner while the second fetch is in flight. The
    // lint rule discourages setState-in-effect, but here the
    // alternative (showing stale data while the new request is in
    // flight) is worse than the cascading render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true)
    getOrder(orderId)
      .then((o) => {
        if (cancelled) return
        setOrder(o)
        setError(null)
      })
      .catch((e) => {
        if (cancelled) return
        setError(e instanceof Error ? e.message : 'Could not load order')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [authStatus, orderId, router])

  if (authStatus === 'loading' || authStatus === 'idle' || loading) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-12">
        <p className="text-stone-500">Loading order...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-12">
        <h1 className="text-3xl font-serif text-stone-800 mb-4">Order</h1>
        <p className="text-red-700 bg-red-50 p-3 rounded-lg text-sm">{error}</p>
        <Link
          href="/account/orders"
          className="text-rose-500 hover:text-rose-600 mt-4 inline-block text-sm"
        >
          ← Back to orders
        </Link>
      </div>
    )
  }

  if (!order) return null

  const ship = order.shipping_address
  const badge = STATUS_BADGE[order.status] ?? 'bg-stone-100 text-stone-700'

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <Link
        href="/account/orders"
        className="text-stone-500 hover:text-stone-700 text-sm mb-4 inline-block"
      >
        ← All orders
      </Link>

      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-3xl font-serif text-stone-800">Order #{order.id}</h1>
          <p className="text-stone-500 text-sm mt-1">
            Placed {new Date(order.created_at).toLocaleString()}
          </p>
        </div>
        <span
          className={`px-3 py-1 rounded-full text-xs font-medium capitalize ${badge}`}
        >
          {order.status}
        </span>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl p-6 border border-stone-200">
          <h2 className="font-serif text-lg text-stone-800 mb-3">Shipping to</h2>
          {ship && Object.keys(ship).length > 0 ? (
            <div className="text-sm text-stone-600 space-y-1">
              <p className="font-medium text-stone-800">{ship.name || '(no name)'}</p>
              <p>{ship.line1}</p>
              {ship.line2 && <p>{ship.line2}</p>}
              <p>
                {ship.city}, {ship.state} {ship.postal_code}
              </p>
              <p>{ship.country}</p>
            </div>
          ) : (
            <p className="text-stone-500 text-sm">No shipping address on file.</p>
          )}
        </div>

        <div className="bg-white rounded-xl p-6 border border-stone-200">
          <h2 className="font-serif text-lg text-stone-800 mb-3">Status</h2>
          <ul className="text-sm text-stone-600 space-y-2">
            <li className="flex items-center gap-2">
              <span className="w-2 h-2 bg-green-500 rounded-full" />
              Order placed
            </li>
            <li className="flex items-center gap-2">
              <span
                className={`w-2 h-2 rounded-full ${
                  order.status === 'paid' ||
                  order.status === 'shipped' ||
                  order.status === 'delivered'
                    ? 'bg-green-500'
                    : 'bg-stone-300'
                }`}
              />
              Paid
            </li>
            <li className="flex items-center gap-2">
              <span
                className={`w-2 h-2 rounded-full ${
                  order.status === 'shipped' || order.status === 'delivered'
                    ? 'bg-green-500'
                    : 'bg-stone-300'
                }`}
              />
              Shipped
            </li>
            <li className="flex items-center gap-2">
              <span
                className={`w-2 h-2 rounded-full ${
                  order.status === 'delivered' ? 'bg-green-500' : 'bg-stone-300'
                }`}
              />
              Delivered
            </li>
          </ul>
          {(order.status === 'shipped' || order.status === 'delivered') && (
            <p className="text-xs text-stone-500 mt-3">
              Tracking will be emailed when available.
            </p>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl p-6 border border-stone-200 mt-6">
        <h2 className="font-serif text-lg text-stone-800 mb-4">Items</h2>
        <div className="space-y-3 text-sm">
          {order.items.map((it, i) => (
            <div
              key={i}
              className="flex justify-between items-center text-stone-700 border-b border-stone-100 last:border-0 pb-3 last:pb-0"
            >
              <div>
                <p className="font-medium text-stone-800">{it.product_name}</p>
                <p className="text-xs text-stone-500">
                  {it.size} / {it.color} × {it.quantity}
                </p>
              </div>
              <div className="text-right">
                <p className="text-stone-800">${(it.subtotal / 100).toFixed(2)}</p>
                <p className="text-xs text-stone-500">
                  ${(it.unit_price / 100).toFixed(2)} each
                </p>
              </div>
            </div>
          ))}
        </div>
        <div className="border-t border-stone-200 pt-3 mt-3 flex justify-between font-medium text-stone-800">
          <span>Total</span>
          <span>${(order.total / 100).toFixed(2)}</span>
        </div>
      </div>
    </div>
  )
}
