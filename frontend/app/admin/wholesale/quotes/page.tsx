import Link from 'next/link'
import { adminGet, getAdminUser } from '@/lib/server-fetch'
import { redirect } from 'next/navigation'
import { type WholesaleQuote } from '@/lib/api'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Wholesale quotes — Admin',
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

export default async function AdminQuotesPage() {
  const admin = await getAdminUser()
  if (!admin) redirect('/account/login?next=/admin/wholesale/quotes')

  let quotes: WholesaleQuote[] = []
  let loadError: string | null = null
  try {
    quotes = await adminGet<WholesaleQuote[]>('/api/admin/wholesale/quotes')
  } catch (e) {
    loadError = e instanceof Error ? e.message : 'Failed to load'
  }

  return (
    <>
      <div className="mb-6">
        <h1 className="text-3xl font-serif text-stone-800">Wholesale quotes</h1>
        <p className="text-sm text-stone-500 mt-1">
          {quotes.length} {quotes.length === 1 ? 'quote' : 'quotes'}
        </p>
      </div>

      {loadError ? (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
          {loadError}
        </div>
      ) : quotes.length === 0 ? (
        <div className="bg-white rounded-xl border border-stone-200 p-8 text-center text-stone-500">
          No wholesale quotes yet.
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
                    Buyer
                  </th>
                  <th className="text-left py-3 px-4 text-stone-500 font-medium">
                    Status
                  </th>
                  <th className="text-right py-3 px-4 text-stone-500 font-medium">
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
                  <tr
                    key={q.id}
                    className="border-b border-stone-100 hover:bg-stone-50"
                  >
                    <td className="py-3 px-4 text-stone-700 font-medium">
                      #{q.id}
                    </td>
                    <td className="py-3 px-4 text-stone-600">
                      <div>{q.user_company || q.user_email}</div>
                      <div className="text-xs text-stone-400">
                        {q.user_email}
                      </div>
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
                    <td className="py-3 px-4 text-right text-stone-600">
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
                        href={`/admin/wholesale/quotes/${q.id}`}
                        className="text-rose-500 hover:underline text-sm"
                      >
                        Review
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
