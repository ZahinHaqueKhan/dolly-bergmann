'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { adminClientPut, adminClientPost, AdminClientError } from '@/lib/admin-client'

export default function OrderActions({
  orderId,
  currentStatus,
  statusOptions,
  hasPaymentIntent,
}: {
  orderId: number
  currentStatus: string
  statusOptions: string[]
  hasPaymentIntent: boolean
}) {
  const router = useRouter()
  const [status, setStatus] = useState(currentStatus)
  const [submitting, setSubmitting] = useState(false)
  const [refundAmount, setRefundAmount] = useState('')
  const [refundSubmitting, setRefundSubmitting] = useState(false)

  const canRefund =
    hasPaymentIntent && ['paid', 'shipped', 'delivered'].includes(currentStatus)

  const updateStatus = async () => {
    if (status === currentStatus) return
    setSubmitting(true)
    try {
      await adminClientPut(`/api/orders/admin/${orderId}/status`, { status })
      toast.success(`Order status updated to ${status}`)
      router.refresh()
    } catch (e) {
      const msg = e instanceof AdminClientError ? e.message : String(e)
      toast.error(msg)
    } finally {
      setSubmitting(false)
    }
  }

  const issueRefund = async (full: boolean) => {
    if (!confirm(full ? 'Issue a full refund?' : `Issue a partial refund of $${refundAmount}?`)) {
      return
    }
    setRefundSubmitting(true)
    try {
      const body: { amount_cents?: number } = {}
      if (!full) {
        const cents = Math.round(Number(refundAmount) * 100)
        if (!cents || cents <= 0) {
          toast.error('Enter a positive refund amount')
          setRefundSubmitting(false)
          return
        }
        body.amount_cents = cents
      }
      await adminClientPost(`/api/orders/admin/${orderId}/refund`, body)
      toast.success(full ? 'Full refund issued' : 'Partial refund issued')
      router.refresh()
    } catch (e) {
      const msg = e instanceof AdminClientError ? e.message : String(e)
      toast.error(msg)
    } finally {
      setRefundSubmitting(false)
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-xs text-stone-500 mb-1">Status</label>
        <div className="flex gap-2">
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="flex-1 border border-stone-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500"
          >
            {statusOptions.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={updateStatus}
            disabled={submitting || status === currentStatus}
            className="px-3 py-2 bg-stone-800 text-white rounded-lg text-sm font-medium hover:bg-stone-700 disabled:opacity-50"
          >
            {submitting ? 'Saving…' : 'Update'}
          </button>
        </div>
      </div>

      {canRefund && (
        <div className="border-t border-stone-100 pt-4">
          <p className="text-xs text-stone-500 mb-2">Refund</p>
          <div className="flex gap-2 items-center">
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={refundAmount}
              onChange={(e) => setRefundAmount(e.target.value)}
              placeholder="Amount (USD)"
              className="flex-1 border border-stone-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500"
            />
            <button
              type="button"
              onClick={() => issueRefund(false)}
              disabled={refundSubmitting || !refundAmount}
              className="px-3 py-2 border border-stone-300 text-stone-700 rounded-lg text-sm font-medium hover:bg-stone-50 disabled:opacity-50"
            >
              Partial
            </button>
            <button
              type="button"
              onClick={() => issueRefund(true)}
              disabled={refundSubmitting}
              className="px-3 py-2 bg-rose-500 text-white rounded-lg text-sm font-medium hover:bg-rose-600 disabled:opacity-50"
            >
              Full
            </button>
          </div>
          <p className="text-xs text-stone-400 mt-2">
            Issues a Stripe refund. With a placeholder Stripe key the
            call returns 502.
          </p>
        </div>
      )}
    </div>
  )
}
