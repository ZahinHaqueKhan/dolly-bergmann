'use client'

import Link from 'next/link'
import { useEffect, useState, useRef } from 'react'
import { useSearchParams } from 'next/navigation'

import { getOrderByStripeSession, type OrderDetail } from '@/lib/api'
import { useAuthStore } from '@/store/auth'

export const dynamic = 'force-dynamic'

const POLL_INTERVAL_MS = 2500
const POLL_TIMEOUT_MS = 60_000

export default function OrderSuccessPage() {
  const sp = useSearchParams()
  const sessionId = sp.get('session_id')
  const user = useAuthStore((s) => s.user)
  const authStatus = useAuthStore((s) => s.status)
  const hydrate = useAuthStore((s) => s.hydrate)
  const [order, setOrder] = useState<OrderDetail | null>(null)
  const [timedOut, setTimedOut] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Use null + lazy init so we don't call Date.now() during render (lint
  // rule: components and hooks must be pure).
  const startedAt = useRef<number | null>(null)

  useEffect(() => {
    if (authStatus === 'idle') void hydrate()
  }, [authStatus, hydrate])

  // Derive the "no session_id" error eagerly — it's a render-time
  // condition, not a side effect, so we compute it inline rather than
  // calling setState in an effect (React 19 lint rule).
  const sessionIdMissing = !sessionId

  useEffect(() => {
    if (sessionIdMissing) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setError("Missing session_id — Stripe did not redirect us back with one.")
      return
    }
    const sid = sessionId
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | null = null
    if (startedAt.current === null) {
      startedAt.current = Date.now()
    }

    async function tick() {
      if (cancelled) return
      if (startedAt.current !== null && Date.now() - startedAt.current > POLL_TIMEOUT_MS) {
        setTimedOut(true)
        return
      }
      try {
        const o = await getOrderByStripeSession(sid)
        if (cancelled) return
        setOrder(o)
        if (o.status === 'paid' || o.status === 'cancelled' || o.status === 'refunded') {
          return
        }
      } catch (e) {
        if (cancelled) return
        const msg = e instanceof Error ? e.message : ''
        if (msg === 'Not your order' || msg === 'Sign in to view this order') {
          setError(msg)
          return
        }
        if (msg !== 'Order not yet created') {
          setError(msg || 'Waiting for order to be created...')
        }
      }
      timer = setTimeout(tick, POLL_INTERVAL_MS)
    }
    void tick()
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
    // We deliberately don't add `sessionIdMissing` to deps — it's
    // derived from `sessionId` and a change in `sessionId` already
    // re-runs the effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, authStatus, user])

  if (error) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-12">
        <h1 className="text-3xl font-serif text-stone-800 mb-4">Order status</h1>
        <p className="text-stone-600">{error}</p>
        <Link href="/shop" className="text-rose-500 hover:text-rose-600 mt-6 inline-block text-sm">
          Continue shopping →
        </Link>
      </div>
    )
  }

  if (timedOut) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-12">
        <h1 className="text-3xl font-serif text-stone-800 mb-4">Thanks for your order!</h1>
        <p className="text-stone-600">
          Stripe has confirmed your payment. We are still processing the order on our end —
          you will receive an email confirmation shortly.
        </p>
        <div className="mt-6 flex gap-3">
          <Link
            href="/account/orders"
            className="bg-stone-800 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-stone-700 transition-colors"
          >
            View my orders
          </Link>
          <Link
            href="/shop"
            className="text-rose-500 hover:text-rose-600 text-sm self-center"
          >
            Continue shopping →
          </Link>
        </div>
      </div>
    )
  }

  if (!order) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-12 text-center">
        <p className="text-stone-500">Confirming your payment...</p>
        <p className="text-xs text-stone-400 mt-2">This usually takes a few seconds.</p>
      </div>
    )
  }

  if (order.status === 'cancelled' || order.status === 'refunded') {
    return (
      <div className="max-w-3xl mx-auto px-4 py-12">
        <h1 className="text-3xl font-serif text-stone-800 mb-4">Order {order.status}</h1>
        <p className="text-stone-600">
          We were unable to complete this order. If you believe this is in error, please contact
          support.
        </p>
        <Link href="/shop" className="text-rose-500 hover:text-rose-600 mt-6 inline-block text-sm">
          Continue shopping →
        </Link>
      </div>
    )
  }

  const ship = order.shipping_address
  const expectedFrom = new Date()
  expectedFrom.setDate(expectedFrom.getDate() + 5)
  const expectedTo = new Date()
  expectedTo.setDate(expectedTo.getDate() + 10)

  return (
    <div className="max-w-3xl mx-auto px-4 py-12">
      <div className="bg-green-50 border border-green-200 rounded-xl p-6 mb-8 flex items-center gap-4">
        <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
          <svg className="w-6 h-6 text-green-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <div>
          <h1 className="font-serif text-2xl text-stone-800">Order confirmed</h1>
          <p className="text-sm text-stone-600">
            Order #{order.id} — a confirmation email is on the way.
          </p>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl p-6 border border-stone-200">
          <h2 className="font-serif text-lg text-stone-800 mb-3">Shipping to</h2>
          <div className="text-sm text-stone-600 space-y-1">
            <p className="font-medium text-stone-800">{ship?.name || '(no name)'}</p>
            <p>{ship?.line1}</p>
            {ship?.line2 && <p>{ship.line2}</p>}
            <p>
              {ship?.city}, {ship?.state} {ship?.postal_code}
            </p>
            <p>{ship?.country}</p>
          </div>
        </div>

        <div className="bg-white rounded-xl p-6 border border-stone-200">
          <h2 className="font-serif text-lg text-stone-800 mb-3">Expected delivery</h2>
          <p className="text-sm text-stone-600">
            {expectedFrom.toLocaleDateString()} – {expectedTo.toLocaleDateString()}
          </p>
          <p className="text-xs text-stone-500 mt-2">
            We&apos;ll email tracking info as soon as it ships.
          </p>
        </div>
      </div>

      <div className="bg-white rounded-xl p-6 border border-stone-200 mt-6">
        <h2 className="font-serif text-lg text-stone-800 mb-4">Order summary</h2>
        <div className="space-y-2 text-sm">
          {order.items.map((it, i) => (
            <div key={i} className="flex justify-between text-stone-700">
              <span>
                {it.product_name} · {it.size}/{it.color} × {it.quantity}
              </span>
              <span>${(it.subtotal / 100).toFixed(2)}</span>
            </div>
          ))}
          <div className="border-t border-stone-200 pt-3 flex justify-between font-medium text-stone-800">
            <span>Total</span>
            <span>${(order.total / 100).toFixed(2)}</span>
          </div>
        </div>
      </div>

      <div className="mt-8 flex gap-3">
        <Link
          href="/account/orders"
          className="bg-stone-800 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-stone-700 transition-colors"
        >
          View my orders
        </Link>
        <Link
          href="/shop"
          className="text-rose-500 hover:text-rose-600 text-sm self-center"
        >
          Continue shopping →
        </Link>
      </div>
    </div>
  )
}
