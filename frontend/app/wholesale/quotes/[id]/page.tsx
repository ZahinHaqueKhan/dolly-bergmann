import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { getWholesaleUser } from '@/lib/server-fetch'
import { getQuote } from '@/lib/api'
import QuoteActions from '@/components/wholesale/QuoteActions'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Quote detail — Wholesale Portal',
  robots: { index: false, follow: false },
}

const statusColor = (status: string) => {
  switch (status) {
    case 'accepted':
      return 'bg-green-100 text-green-700'
    case 'sent':
      return 'bg-blue-100 text-blue-700'
    case 'submitted':
      return 'bg-amber-100 text-amber-700'
    case 'declined':
    case 'expired':
      return 'bg-red-100 text-red-700'
    default:
      return 'bg-stone-100 text-stone-700'
  }
}

const formatMoney = (cents: number) =>
  `$${(cents / 100).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`

const formatDate = (iso: string | null) => {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  return d.toLocaleString()
}

export default async function MyQuoteDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const user = await getWholesaleUser()
  if (!user) redirect('/account/login?next=/wholesale/quotes')
  if (!user.approved_at) redirect('/wholesale/pending')

  let quote
  try {
    quote = await getQuote(Number(id))
  } catch {
    notFound()
  }

  const priced = quote.line_items.every((li) => li.unit_price !== null)
  const isDraft = quote.status === 'submitted' && !priced

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <div>
          <Link
            href="/wholesale/quotes"
            className="text-sm text-stone-500 hover:text-stone-700"
          >
            ← All quotes
          </Link>
          <h2 className="text-2xl font-serif text-stone-800 mt-1">
            Quote #{quote.id}
          </h2>
          <p className="text-sm text-stone-500 mt-1">
            Created {formatDate(quote.created_at)}
            {quote.valid_until && ` · Valid until ${formatDate(quote.valid_until)}`}
          </p>
        </div>
        <span
          className={`px-3 py-1 rounded-full text-sm font-medium capitalize ${statusColor(
            quote.status
          )}`}
        >
          {quote.status}
        </span>
      </div>

      {isDraft && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-lg px-4 py-3 mb-6">
          Your request is in the admin&apos;s queue. You&apos;ll see prices
          here once we&apos;ve reviewed and sent the quote.
        </div>
      )}

      {quote.admin_notes && (
        <div className="bg-blue-50 border border-blue-200 text-blue-800 text-sm rounded-lg px-4 py-3 mb-6">
          <strong>From the team:</strong> {quote.admin_notes}
        </div>
      )}

      <div className="bg-white rounded-xl border border-stone-200 p-6 mb-6">
        <h3 className="font-serif text-lg text-stone-800 mb-4">Line items</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-stone-200 text-stone-500">
                <th className="text-left py-2 font-medium">Product</th>
                <th className="text-left py-2 font-medium">Size / Color</th>
                <th className="text-left py-2 font-medium">SKU</th>
                <th className="text-right py-2 font-medium">Qty</th>
                <th className="text-right py-2 font-medium">Unit</th>
                <th className="text-right py-2 font-medium">Line total</th>
              </tr>
            </thead>
            <tbody>
              {quote.line_items.map((li) => (
                <tr key={li.id} className="border-b border-stone-100">
                  <td className="py-2 text-stone-700">{li.product_name}</td>
                  <td className="py-2 text-stone-600">
                    {li.size} / {li.color}
                  </td>
                  <td className="py-2 text-stone-500 font-mono text-xs">
                    {li.sku}
                  </td>
                  <td className="py-2 text-right text-stone-700">
                    {li.quantity}
                  </td>
                  <td className="py-2 text-right text-stone-600">
                    {li.unit_price !== null ? formatMoney(li.unit_price) : '—'}
                  </td>
                  <td className="py-2 text-right text-stone-700 font-medium">
                    {li.line_total !== null ? formatMoney(li.line_total) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              {priced && (
                <>
                  <tr>
                    <td colSpan={5} className="pt-3 text-right text-stone-500">
                      Subtotal
                    </td>
                    <td className="pt-3 text-right text-stone-700">
                      {formatMoney(quote.subtotal)}
                    </td>
                  </tr>
                  <tr>
                    <td colSpan={5} className="text-right text-stone-500">
                      Shipping
                    </td>
                    <td className="text-right text-stone-700">
                      {formatMoney(quote.shipping_cost)}
                    </td>
                  </tr>
                  <tr>
                    <td colSpan={5} className="text-right text-stone-500">
                      Tax
                    </td>
                    <td className="text-right text-stone-700">
                      {formatMoney(quote.tax)}
                    </td>
                  </tr>
                  <tr>
                    <td
                      colSpan={5}
                      className="pt-3 text-right text-stone-800 font-medium"
                    >
                      Total
                    </td>
                    <td className="pt-3 text-right text-stone-800 font-medium">
                      {formatMoney(quote.grand_total)}
                    </td>
                  </tr>
                </>
              )}
            </tfoot>
          </table>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div className="text-sm text-stone-500">
          {quote.notes && (
            <>
              <strong>Your notes:</strong> {quote.notes}
            </>
          )}
        </div>
        <QuoteActions quoteId={quote.id} status={quote.status} />
      </div>
    </>
  )
}
