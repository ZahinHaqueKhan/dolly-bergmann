import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { backendFetch, getWholesaleUser } from '@/lib/server-fetch'
import WholesaleSignOut from '@/components/WholesaleSignOut'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Wholesale Portal — ModestWear',
  description: 'B2B wholesale portal for ModestWear',
  robots: { index: false, follow: false },
}

const NAV: { label: string; href: string }[] = [
  { label: 'Catalog', href: '/wholesale' },
  { label: 'My quotes', href: '/wholesale/quotes' },
  { label: 'My orders', href: '/wholesale/orders' },
]

export default async function WholesaleLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await getWholesaleUser()
  if (!user) {
    redirect('/account/login?next=/wholesale')
  }

  const meRes = await backendFetch('/api/wholesale/me')
  let applicationStatus: string | null = null
  if (meRes.ok) {
    const me = await meRes.json()
    applicationStatus = me.application?.status ?? null
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-serif text-stone-800">Wholesale Portal</h1>
          <p className="text-sm text-stone-500">
            {user.company_name ?? user.email}
            {applicationStatus === 'approved' && (
              <span className="ml-2 inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                Approved
              </span>
            )}
            {applicationStatus === 'pending' && (
              <span className="ml-2 inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
                Pending review
              </span>
            )}
            {applicationStatus === 'rejected' && (
              <span className="ml-2 inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
                Rejected
              </span>
            )}
            {applicationStatus === 'info_requested' && (
              <span className="ml-2 inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                More info needed
              </span>
            )}
          </p>
        </div>
        <WholesaleSignOut />
      </div>
      <nav className="mb-8 flex gap-2 border-b border-stone-200">
        {NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="px-4 py-2 text-sm text-stone-600 hover:text-stone-800 -mb-px border-b-2 border-transparent hover:border-stone-300"
          >
            {item.label}
          </Link>
        ))}
      </nav>
      {children}
    </div>
  )
}
