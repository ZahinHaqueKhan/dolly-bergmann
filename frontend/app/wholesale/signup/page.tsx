import WholesaleSignupClient from '@/components/wholesale/WholesaleSignupClient'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Wholesale application — ModestWear',
  description: 'Apply for a ModestWear wholesale account.',
  robots: { index: false, follow: false },
}

export default function WholesaleSignupPage() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-12">
      <h1 className="text-3xl font-serif text-stone-800 mb-2">
        Apply for a wholesale account
      </h1>
      <p className="text-sm text-stone-500 mb-8">
        Tell us a bit about your business. Once we approve your application
        you&apos;ll be able to browse the catalog, request quotes, and place
        orders.
      </p>
      <WholesaleSignupClient />
    </div>
  )
}
