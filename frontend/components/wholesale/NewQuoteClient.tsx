'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { createQuote } from '@/lib/api'

interface LocalLine {
  variant_id: number
  quantity: number
  product_name: string
  size: string
  color: string
  sku: string
}

const STORAGE_KEY = 'modestwear.wholesale.quote.v1'

function readLocalQuote(): LocalLine[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as LocalLine[]) : []
  } catch {
    return []
  }
}

function writeLocalQuote(lines: LocalLine[]): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(lines))
}

export default function NewQuoteClient() {
  const [lines, setLines] = useState<LocalLine[]>([])
  const [csv, setCsv] = useState('')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const router = useRouter()

  useEffect(() => {
    setLines(readLocalQuote())
  }, [])

  const updateQty = (variantId: number, qty: number) => {
    const next = lines
      .map((l) =>
        l.variant_id === variantId
          ? { ...l, quantity: Math.max(0, qty) }
          : l
      )
      .filter((l) => l.quantity > 0)
    setLines(next)
    writeLocalQuote(next)
  }

  const removeLine = (variantId: number) => {
    const next = lines.filter((l) => l.variant_id !== variantId)
    setLines(next)
    writeLocalQuote(next)
  }

  const clearAll = () => {
    setLines([])
    writeLocalQuote([])
  }

  const hasStructured = lines.length > 0
  const hasCsv = csv.trim().length > 0
  const canSubmit = hasStructured || hasCsv

  const submit = async () => {
    if (!canSubmit) {
      toast.error('Add at least one line item (cart or CSV)')
      return
    }
    setSubmitting(true)
    try {
      const payload: Parameters<typeof createQuote>[0] = {
        line_items: lines.map((l) => ({
          variant_id: l.variant_id,
          quantity: l.quantity,
        })),
        ...(csv.trim() ? { csv } : {}),
        ...(notes.trim() ? { notes } : {}),
      }
      const quote = await createQuote(payload)
      toast.success('Quote submitted!')
      // Clear local cart
      writeLocalQuote([])
      router.push(`/wholesale/quotes/${quote.id}`)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to submit quote'
      toast.error(msg)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="grid md:grid-cols-2 gap-6">
      <div className="bg-white rounded-xl border border-stone-200 p-6">
        <h3 className="font-serif text-lg text-stone-800 mb-3">From your cart</h3>
        {lines.length === 0 ? (
          <p className="text-sm text-stone-500">
            Nothing here yet. Browse the{' '}
            <a href="/wholesale" className="text-rose-500 hover:underline">
              catalog
            </a>{' '}
            and click <em>Add to quote</em>.
          </p>
        ) : (
          <div className="space-y-2">
            {lines.map((l) => (
              <div
                key={l.variant_id}
                className="flex items-center gap-3 py-2 border-b border-stone-100 last:border-0"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-stone-800 truncate">
                    {l.product_name}
                  </p>
                  <p className="text-xs text-stone-500">
                    {l.size} / {l.color} · SKU {l.sku}
                  </p>
                </div>
                <input
                  type="number"
                  min={1}
                  value={l.quantity}
                  onChange={(e) =>
                    updateQty(l.variant_id, Number(e.target.value))
                  }
                  className="w-20 border border-stone-300 rounded-lg px-2 py-1 text-sm"
                />
                <button
                  type="button"
                  onClick={() => removeLine(l.variant_id)}
                  className="text-stone-400 hover:text-stone-600"
                  aria-label="Remove"
                >
                  ✕
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={clearAll}
              className="text-xs text-stone-500 hover:text-stone-700"
            >
              Clear all
            </button>
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl border border-stone-200 p-6">
        <h3 className="font-serif text-lg text-stone-800 mb-3">
          …or paste a CSV
        </h3>
        <p className="text-xs text-stone-500 mb-2">
          One line per item: <code className="bg-stone-100 px-1 rounded">SKU,quantity</code>
        </p>
        <textarea
          value={csv}
          onChange={(e) => setCsv(e.target.value)}
          rows={8}
          placeholder={`SKU,quantity\nMW-DRESS-001-M,50\nMW-DRESS-001-L,30`}
          className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm font-mono mb-3 focus:outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500"
        />
        <h3 className="font-serif text-lg text-stone-800 mb-2 mt-4">Notes</h3>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder="Anything the admin should know about this request…"
          className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500"
        />
      </div>

      <div className="md:col-span-2 flex justify-end">
        <button
          type="button"
          onClick={submit}
          disabled={!canSubmit || submitting}
          className="bg-stone-800 text-white px-6 py-3 rounded-lg font-medium hover:bg-stone-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting ? 'Submitting…' : 'Submit quote request'}
        </button>
      </div>
    </div>
  )
}
