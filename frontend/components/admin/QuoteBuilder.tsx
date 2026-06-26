'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { adminUpdateQuote, adminSendQuote, type WholesaleQuote } from '@/lib/api'

interface Props {
  quote: WholesaleQuote
}

const formatMoney = (cents: number) =>
  `$${(cents / 100).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`

export default function QuoteBuilder({ quote }: Props) {
  const router = useRouter()
  const [unitPrices, setUnitPrices] = useState<Record<number, string>>(() => {
    const m: Record<number, string> = {}
    for (const li of quote.line_items) {
      m[li.id] =
        li.unit_price !== null
          ? (li.unit_price / 100).toFixed(2)
          : ''
    }
    return m
  })
  const [shipping, setShipping] = useState(
    quote.shipping_cost ? (quote.shipping_cost / 100).toFixed(2) : '0.00'
  )
  const [tax, setTax] = useState(
    quote.tax ? (quote.tax / 100).toFixed(2) : '0.00'
  )
  const [adminNotes, setAdminNotes] = useState(quote.admin_notes || '')
  const [validUntil, setValidUntil] = useState(
    quote.valid_until
      ? quote.valid_until.split('T')[0]
      : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
          .toISOString()
          .split('T')[0]
  )
  const [saving, setSaving] = useState(false)
  const [sending, setSending] = useState(false)

  const editable = quote.status === 'submitted'

  // Compute live totals (not persisted until save)
  let subtotal = 0
  for (const li of quote.line_items) {
    const v = parseFloat(unitPrices[li.id] ?? '')
    if (!isNaN(v) && v >= 0) subtotal += v * li.quantity * 100
  }
  const shippingCents = Math.round(parseFloat(shipping || '0') * 100)
  const taxCents = Math.round(parseFloat(tax || '0') * 100)
  const total = subtotal + shippingCents + taxCents

  const allPriced = quote.line_items.every(
    (li) => parseFloat(unitPrices[li.id] ?? '') >= 0
  )

  const save = async () => {
    if (!editable) return
    setSaving(true)
    try {
      await adminUpdateQuote(quote.id, {
        line_items: quote.line_items.map((li) => {
          const v = parseFloat(unitPrices[li.id] ?? '')
          return {
            id: li.id,
            unit_price_cents: Math.round((isNaN(v) ? 0 : v) * 100),
          }
        }),
        shipping_cost: shippingCents,
        tax: taxCents,
        admin_notes: adminNotes || undefined,
        valid_until: validUntil
          ? new Date(validUntil).toISOString()
          : undefined,
      })
      toast.success('Saved')
      router.refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const send = async () => {
    if (!allPriced) {
      toast.error('All line items must have a unit price before sending')
      return
    }
    if (!confirm('Send this quote to the buyer? This will email them the PDF.'))
      return
    setSending(true)
    try {
      // Save first so the price snapshot is what gets sent.
      await adminUpdateQuote(quote.id, {
        line_items: quote.line_items.map((li) => {
          const v = parseFloat(unitPrices[li.id] ?? '')
          return {
            id: li.id,
            unit_price_cents: Math.round((isNaN(v) ? 0 : v) * 100),
          }
        }),
        shipping_cost: shippingCents,
        tax: taxCents,
        admin_notes: adminNotes || undefined,
        valid_until: validUntil
          ? new Date(validUntil).toISOString()
          : undefined,
      })
      await adminSendQuote(quote.id)
      toast.success('Quote sent')
      router.refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to send')
    } finally {
      setSending(false)
    }
  }

  if (!editable && quote.status !== 'sent') {
    // Read-only view for accepted/declined/expired
    return (
      <div className="bg-white rounded-xl border border-stone-200 p-6 text-stone-500 text-sm">
        This quote is {quote.status} and cannot be edited.
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border border-stone-200 p-6">
        <h2 className="font-serif text-lg text-stone-800 mb-4">Line items</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-stone-200 text-stone-500">
              <th className="text-left py-2 font-medium">Product</th>
              <th className="text-left py-2 font-medium">Variant</th>
              <th className="text-right py-2 font-medium">Qty</th>
              <th className="text-right py-2 font-medium">Unit (USD)</th>
              <th className="text-right py-2 font-medium">Line total</th>
            </tr>
          </thead>
          <tbody>
            {quote.line_items.map((li) => {
              const v = parseFloat(unitPrices[li.id] ?? '')
              const line = isNaN(v) || v < 0 ? null : v * li.quantity
              return (
                <tr key={li.id} className="border-b border-stone-100">
                  <td className="py-2 text-stone-700">{li.product_name}</td>
                  <td className="py-2 text-stone-600">
                    {li.size} / {li.color}
                    <div className="text-xs text-stone-400 font-mono">
                      {li.sku}
                    </div>
                  </td>
                  <td className="py-2 text-right text-stone-700">
                    {li.quantity}
                  </td>
                  <td className="py-2 text-right">
                    {editable ? (
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={unitPrices[li.id] ?? ''}
                        onChange={(e) =>
                          setUnitPrices((m) => ({
                            ...m,
                            [li.id]: e.target.value,
                          }))
                        }
                        className="w-24 text-right border border-stone-300 rounded-lg px-2 py-1 text-sm focus:outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500"
                      />
                    ) : (
                      <span className="text-stone-600">
                        {li.unit_price !== null
                          ? formatMoney(li.unit_price)
                          : '—'}
                      </span>
                    )}
                  </td>
                  <td className="py-2 text-right text-stone-700 font-medium">
                    {line !== null ? `$${line.toFixed(2)}` : '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-stone-200 p-6">
          <h2 className="font-serif text-lg text-stone-800 mb-3">
            Pricing &amp; terms
          </h2>
          <div className="space-y-3">
            <label className="block text-sm">
              <span className="text-stone-600">Shipping (USD)</span>
              <input
                type="number"
                min={0}
                step="0.01"
                value={shipping}
                onChange={(e) => setShipping(e.target.value)}
                disabled={!editable}
                className="mt-1 w-full border border-stone-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500"
              />
            </label>
            <label className="block text-sm">
              <span className="text-stone-600">Tax (USD)</span>
              <input
                type="number"
                min={0}
                step="0.01"
                value={tax}
                onChange={(e) => setTax(e.target.value)}
                disabled={!editable}
                className="mt-1 w-full border border-stone-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500"
              />
            </label>
            <label className="block text-sm">
              <span className="text-stone-600">Valid until</span>
              <input
                type="date"
                value={validUntil}
                onChange={(e) => setValidUntil(e.target.value)}
                disabled={!editable}
                className="mt-1 w-full border border-stone-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500"
              />
            </label>
            <label className="block text-sm">
              <span className="text-stone-600">Internal notes (not sent)</span>
              <textarea
                rows={3}
                value={adminNotes}
                onChange={(e) => setAdminNotes(e.target.value)}
                disabled={!editable}
                className="mt-1 w-full border border-stone-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500"
              />
            </label>
          </div>
        </div>
        <div className="bg-stone-50 rounded-xl border border-stone-200 p-6">
          <h2 className="font-serif text-lg text-stone-800 mb-3">Totals</h2>
          <dl className="text-sm space-y-2">
            <div className="flex justify-between">
              <dt className="text-stone-500">Subtotal</dt>
              <dd className="text-stone-700">
                ${(subtotal / 100).toFixed(2)}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-stone-500">Shipping</dt>
              <dd className="text-stone-700">
                ${(shippingCents / 100).toFixed(2)}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-stone-500">Tax</dt>
              <dd className="text-stone-700">${(taxCents / 100).toFixed(2)}</dd>
            </div>
            <div className="flex justify-between border-t border-stone-200 pt-2 mt-2">
              <dt className="text-stone-800 font-medium">Total</dt>
              <dd className="text-stone-800 font-medium">
                ${(total / 100).toFixed(2)}
              </dd>
            </div>
          </dl>
        </div>
      </div>

      {editable && (
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={save}
            disabled={saving || sending}
            className="border border-stone-300 text-stone-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-stone-50 disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save draft'}
          </button>
          <button
            type="button"
            onClick={send}
            disabled={saving || sending || !allPriced}
            className="bg-stone-800 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-stone-700 disabled:opacity-50"
          >
            {sending ? 'Sending…' : 'Send quote'}
          </button>
        </div>
      )}

      {quote.status === 'sent' && (
        <div className="bg-blue-50 border border-blue-200 text-blue-800 text-sm rounded-lg px-4 py-3">
          This quote has been sent. The buyer can now accept or decline it.
          {quote.pdf_path && (
            <>
              {' '}
              <a
                href={quote.pdf_path}
                target="_blank"
                rel="noreferrer"
                className="text-rose-500 hover:underline"
              >
                View PDF
              </a>
            </>
          )}
        </div>
      )}
    </div>
  )
}
