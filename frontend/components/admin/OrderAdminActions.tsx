'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import {
  adminMarkOrderPaid,
  adminUpdateOrderStatus,
  type WholesaleOrder,
} from '@/lib/api'

const STATUS_OPTIONS = [
  'awaiting_payment',
  'paid',
  'processing',
  'shipped',
  'delivered',
  'cancelled',
]

export default function OrderAdminActions({ order }: { order: WholesaleOrder }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [showShip, setShowShip] = useState(false)
  const [trackingNumber, setTrackingNumber] = useState(order.tracking_number || '')
  const [shippingCarrier, setShippingCarrier] = useState(
    order.shipping_carrier || ''
  )
  const [status, setStatus] = useState(order.status)

  const markPaid = async () => {
    setBusy(true)
    try {
      await adminMarkOrderPaid(order.id)
      toast.success('Marked as paid — buyer has been notified')
      router.refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed')
    } finally {
      setBusy(false)
    }
  }

  const updateStatus = async (next: string) => {
    setBusy(true)
    try {
      await adminUpdateOrderStatus(order.id, { status: next as WholesaleOrder['status'] })
      toast.success(`Status updated to ${next}`)
      router.refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed')
    } finally {
      setBusy(false)
    }
  }

  const markShipped = async () => {
    if (!trackingNumber || !shippingCarrier) {
      toast.error('Tracking number and carrier required')
      return
    }
    setBusy(true)
    try {
      await adminUpdateOrderStatus(order.id, {
        status: 'shipped',
        tracking_number: trackingNumber,
        shipping_carrier: shippingCarrier,
      })
      toast.success('Marked as shipped')
      setShowShip(false)
      router.refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      {order.payment_status !== 'paid' && (
        <button
          type="button"
          onClick={markPaid}
          disabled={busy}
          className="w-full bg-rose-500 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-rose-600 disabled:opacity-50"
        >
          Mark as paid
        </button>
      )}

      <div>
        <label className="block text-xs text-stone-500 mb-1">Status</label>
        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value as WholesaleOrder['status'])
          }}
          className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500"
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s.replace('_', ' ')}
            </option>
          ))}
        </select>
        {status === 'shipped' ? (
          <div className="mt-2 space-y-2">
            <input
              type="text"
              placeholder="Tracking number"
              value={trackingNumber}
              onChange={(e) => setTrackingNumber(e.target.value)}
              className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500"
            />
            <input
              type="text"
              placeholder="Shipping carrier (e.g. FedEx)"
              value={shippingCarrier}
              onChange={(e) => setShippingCarrier(e.target.value)}
              className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500"
            />
            <button
              type="button"
              onClick={markShipped}
              disabled={busy}
              className="w-full bg-stone-800 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-stone-700 disabled:opacity-50"
            >
              Save + mark shipped
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => updateStatus(status)}
            disabled={busy || status === order.status}
            className="mt-2 w-full bg-stone-800 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-stone-700 disabled:opacity-50"
          >
            Save status
          </button>
        )}
      </div>
    </div>
  )
}
