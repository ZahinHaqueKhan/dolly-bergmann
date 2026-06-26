import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { adminGet, getAdminUser } from '@/lib/server-fetch'
import { type WholesaleQuote } from '@/lib/api'
import QuoteBuilder from '@/components/admin/QuoteBuilder'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Quote detail — Admin',
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

const formatDate = (iso: string | null) => {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  return d.toLocaleString()
}

export default async function AdminQuoteDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const admin = await getAdminUser()
  if (!admin) redirect('/account/login?next=/admin/wholesale/quotes')

  let quote: WholesaleQuote
  try {
    quote = await adminGet<WholesaleQuote>(
      `/api/admin/wholesale/quotes/${id}`
    )
  } catch {
    notFound()
  }

  return (
    <>
      <div className="mb-6">
        <Link
          href="/admin/wholesale/quotes"
          className="text-sm text-stone-500 hover:text-stone-700"
        >
          ← All quotes
        </Link>
        <div className="flex items-center justify-between mt-1">
          <h1 className="text-3xl font-serif text-stone-800">Quote #{quote.id}</h1>
          <span
            className={`px-3 py-1 rounded-full text-sm font-medium capitalize ${statusColor(
              quote.status
            )}`}
          >
            {quote.status}
          </span>
        </div>
        <p className="text-sm text-stone-500 mt-1">
          {quote.user_company || quote.user_email} · {quote.user_email}
        </p>
        <p className="text-xs text-stone-400 mt-1">
          Created {formatDate(quote.created_at)}
          {quote.sent_at && ` · Sent ${formatDate(quote.sent_at)}`}
          {quote.responded_at &&
            ` · Responded ${formatDate(quote.responded_at)}`}
        </p>
      </div>

      <QuoteBuilder quote={quote} />
    </>
  )
}
