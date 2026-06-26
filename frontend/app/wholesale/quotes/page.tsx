import Link from 'next/link'
import { redirect } from 'next/navigation'
import { listMyQuotes, type WholesaleQuote } from '@/lib/api'
import { getWholesaleUser, backendFetch } from '@/lib/server-fetch'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'My quotes — Wholesale Portal',
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
  return d.toISOString().slice(0, 10)
}

export default async function MyQuotesPage() {
  const user = await getWholesaleUser()
  if (!user) redirect('/account/login?next=/wholesale/quotes')
  if (!user.approved_at) redirect('/wholesale/pending')

  let quotes: WholesaleQuote[] = []
  let loadError: string | null = null
  try {
    quotes = await listMyQuotes()
  } catch (e) {
    loadError = e instanceof Error ? e.message : 'Failed to load quotes'
  }

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-serif text-stone-800">My quotes</h2>
          <p className="text-sm text-stone-500 mt-1">
            {quotes.length} {quotes.length === 1 ? 'quote' : 'quotes'}
          </p>
        </div>
        <Link
          href="/wholesale/quote/new"
          className="bg-stone-800 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-stone-700"
        >
          + New quote
        </Link>
      </div>

      {loadError ? (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
          {loadError}
        </div>
      ) : quotes.length === 0 ? (
        <div className="bg-white rounded-xl border border-stone-200 p-8 text-center text-stone-500">
          You haven&apos;t submitted any quotes yet.
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-stone-200 bg-stone-50">
                  <th className="text-left py-3 px-4 text-stone-500 font-medium">
                    Quote
                  </th>
                  <th className="text-left py-3 px-4 text-stone-500 font-medium">
                    Status
                  </th>
                  <th className="text-left py-3 px-4 text-stone-500 font-medium">
                    Items
                  </th>
                  <th className="text-right py-3 px-4 text-stone-500 font-medium">
                    Total
                  </th>
                  <th className="text-left py-3 px-4 text-stone-500 font-medium">
                    Created
                  </th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {quotes.map((q) => (
                  <tr key={q.id} className="border-b border-stone-100 hover:bg-stone-50">
                    <td className="py-3 px-4 text-stone-700 font-medium">
                      #{q.id}
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`px-2 py-1 rounded-full text-xs font-medium capitalize ${statusColor(
                          q.status
                        )}`}
                      >
                        {q.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-stone-600">
                      {q.line_items.length}
                    </td>
                    <td className="py-3 px-4 text-right text-stone-600">
                      {q.grand_total > 0 ? formatMoney(q.grand_total) : '—'}
                    </td>
                    <td className="py-3 px-4 text-stone-400">
                      {formatDate(q.created_at)}
                    </td>
                    <td className="py-3 px-4">
                      <Link
                        href={`/wholesale/quotes/${q.id}`}
                        className="text-rose-500 hover:underline text-sm"
                      >
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  )
}
