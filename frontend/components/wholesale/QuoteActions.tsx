'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { acceptQuote, declineQuote } from '@/lib/api'

interface Props {
  quoteId: number
  status: string
}

export default function QuoteActions({ quoteId, status }: Props) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  if (status !== 'sent') return null

  const accept = async () => {
    if (!confirm('Accept this quote? An order will be created.')) return
    setBusy(true)
    try {
      await acceptQuote(quoteId)
      toast.success('Quote accepted — order created')
      router.push('/wholesale/orders')
      router.refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to accept')
    } finally {
      setBusy(false)
    }
  }

  const decline = async () => {
    if (!confirm('Decline this quote?')) return
    setBusy(true)
    try {
      await declineQuote(quoteId)
      toast.success('Quote declined')
      router.refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to decline')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex gap-3">
      <button
        type="button"
        onClick={accept}
        disabled={busy}
        className="bg-stone-800 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-stone-700 disabled:opacity-50"
      >
        Accept quote
      </button>
      <button
        type="button"
        onClick={decline}
        disabled={busy}
        className="border border-stone-300 text-stone-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-stone-50 disabled:opacity-50"
      >
        Decline
      </button>
    </div>
  )
}
