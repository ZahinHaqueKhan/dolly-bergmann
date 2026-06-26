'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import {
  adminApproveApplication,
  adminRejectApplication,
  adminRequestInfo,
  type WholesaleApplication,
} from '@/lib/api'

export default function ApplicationActions({
  application,
}: {
  application: WholesaleApplication
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [showReason, setShowReason] = useState<null | 'reject' | 'request_info'>(
    null
  )
  const [reason, setReason] = useState('')

  const approve = async () => {
    setBusy(true)
    try {
      await adminApproveApplication(application.id)
      toast.success('Approved')
      router.refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed')
    } finally {
      setBusy(false)
    }
  }

  const reject = async () => {
    if (!reason.trim()) {
      toast.error('Enter a reason')
      return
    }
    setBusy(true)
    try {
      await adminRejectApplication(application.id, reason)
      toast.success('Rejected')
      setShowReason(null)
      setReason('')
      router.refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed')
    } finally {
      setBusy(false)
    }
  }

  const requestInfo = async () => {
    if (!reason.trim()) {
      toast.error('Enter a message')
      return
    }
    setBusy(true)
    try {
      await adminRequestInfo(application.id, reason)
      toast.success('Info requested')
      setShowReason(null)
      setReason('')
      router.refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed')
    } finally {
      setBusy(false)
    }
  }

  if (application.status === 'approved') {
    return (
      <span className="text-xs text-green-700 font-medium">Approved</span>
    )
  }
  if (application.status === 'rejected') {
    return (
      <span className="text-xs text-red-700 font-medium">Rejected</span>
    )
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2 flex-wrap">
        <button
          type="button"
          onClick={approve}
          disabled={busy}
          className="bg-stone-800 text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-stone-700 disabled:opacity-50"
        >
          Approve
        </button>
        <button
          type="button"
          onClick={() => {
            setShowReason('reject')
            setReason(application.rejection_reason || '')
          }}
          disabled={busy}
          className="border border-stone-300 text-stone-700 px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-stone-50 disabled:opacity-50"
        >
          Reject
        </button>
        <button
          type="button"
          onClick={() => {
            setShowReason('request_info')
            setReason(application.rejection_reason || '')
          }}
          disabled={busy}
          className="border border-stone-300 text-stone-700 px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-stone-50 disabled:opacity-50"
        >
          Request info
        </button>
      </div>
      {showReason && (
        <div className="mt-2 space-y-2">
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            placeholder={
              showReason === 'reject'
                ? 'Reason for rejection (will be emailed)…'
                : 'What info do you need?'
            }
            className="w-full border border-stone-300 rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={showReason === 'reject' ? reject : requestInfo}
              disabled={busy}
              className="bg-stone-800 text-white px-2 py-1 rounded text-xs font-medium hover:bg-stone-700 disabled:opacity-50"
            >
              Confirm
            </button>
            <button
              type="button"
              onClick={() => {
                setShowReason(null)
                setReason('')
              }}
              className="text-xs text-stone-500 hover:text-stone-700 px-2"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
