import { redirect } from 'next/navigation'
import { getWholesaleUser } from '@/lib/server-fetch'
import NewQuoteClient from '@/components/wholesale/NewQuoteClient'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'New quote — Wholesale Portal',
  robots: { index: false, follow: false },
}

export default async function NewQuotePage() {
  const user = await getWholesaleUser()
  if (!user) redirect('/account/login?next=/wholesale/quote/new')
  if (!user.approved_at) redirect('/wholesale/pending')

  return (
    <>
      <div className="mb-6">
        <h2 className="text-2xl font-serif text-stone-800">Request a quote</h2>
        <p className="text-sm text-stone-500 mt-1">
          Add items from the catalog, or paste a CSV. We&apos;ll send you back
          a priced quote within one business day.
        </p>
      </div>
      <NewQuoteClient />
    </>
  )
}
