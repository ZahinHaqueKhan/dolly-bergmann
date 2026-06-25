'use client'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/auth'
import { getOrders } from '@/lib/api'

export const dynamic = 'force-dynamic'

interface OrderListItem {
  id: number
  status: string
  total: number
  created_at: string
  items_count?: number
  items?: { quantity: number }[]
}

export default function OrdersPage() {
  const router = useRouter()
  const user = useAuthStore((s) => s.user)
  const authStatus = useAuthStore((s) => s.status)
  const hydrateAuth = useAuthStore((s) => s.hydrate)
  const [orders, setOrders] = useState<OrderListItem[] | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (authStatus === 'idle') {
      void hydrateAuth()
    }
  }, [authStatus, hydrateAuth])

  useEffect(() => {
    if (authStatus === 'unauthenticated') {
      router.replace('/account/login?next=/account/orders')
    }
  }, [authStatus, router])

  useEffect(() => {
    if (authStatus !== 'authenticated') return
    let cancelled = false
    const load = async () => {
      setLoading(true)
      try {
        // The backend currently returns a shape that may differ; tolerate
        // either a flat list or an object with `orders`. The orders
        // endpoint will be re-shaped in Phase 3.
        const data = (await getOrders()) as OrderListItem[] | { orders: OrderListItem[] }
        if (cancelled) return
        setOrders(Array.isArray(data) ? data : data.orders ?? [])
      } catch {
        if (!cancelled) setOrders([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [authStatus])

  if (authStatus === 'loading' || authStatus === 'idle' || !user) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-12">
        <p className="text-stone-500">Loading...</p>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-12">
        <p className="text-stone-500">Loading orders...</p>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-serif text-stone-800 mb-6">Orders</h1>
      {orders && orders.length > 0 ? (
        <div className="space-y-3">
          {orders.map((o) => (
            <Link
              key={o.id}
              href={`/account/orders/${o.id}`}
              className="block bg-white rounded-xl border border-stone-200 p-4 flex items-center justify-between hover:border-stone-300 transition-colors"
            >
              <div>
                <p className="text-stone-800 font-medium">Order #{o.id}</p>
                <p className="text-stone-500 text-sm">
                  {new Date(o.created_at).toLocaleDateString()} ·{' '}
                  {o.items_count ?? 0} item(s)
                </p>
              </div>
              <div className="text-right">
                <p className="text-stone-800 font-medium">${(o.total / 100).toFixed(2)}</p>
                <p className="text-stone-500 text-sm capitalize">{o.status}</p>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-stone-200 p-12 text-center">
          <h2 className="font-serif text-lg text-stone-800 mb-2">No orders yet</h2>
          <p className="text-stone-500 text-sm mb-6">
            When you place an order, it will appear here.
          </p>
          <Link
            href="/shop"
            className="inline-block bg-stone-800 text-white px-6 py-3 rounded-lg font-medium hover:bg-stone-700 transition-colors"
          >
            Start shopping
          </Link>
        </div>
      )}
    </div>
  )
}
