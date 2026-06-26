import { redirect } from 'next/navigation'
import { backendFetch, getWholesaleUser } from '@/lib/server-fetch'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Application Status — Wholesale Portal',
  robots: { index: false, follow: false },
}

export default async function WholesalePendingPage() {
  const user = await getWholesaleUser()
  if (!user) redirect('/account/login?next=/wholesale/pending')

  const meRes = await backendFetch('/api/wholesale/me')
  if (!meRes.ok) {
    return (
      <div className="bg-white rounded-xl border border-stone-200 p-8 text-stone-500">
        Could not load application status.
      </div>
    )
  }
  const me = await meRes.json()
  const app = me.application

  if (me.user?.approved_at) {
    // Already approved — bounce to the catalog.
    redirect('/wholesale')
  }

  return (
    <div className="bg-white rounded-xl border border-stone-200 p-8 max-w-2xl mx-auto">
      <h2 className="text-2xl font-serif text-stone-800 mb-2">
        {app?.status === 'rejected' ? 'Application not approved' : 'Application under review'}
      </h2>
      {app?.status === 'pending' && (
        <p className="text-sm text-stone-600 mb-4">
          Thanks for applying to the ModestWear wholesale program! We&apos;ve
          received your details and an admin is reviewing your application.
          We&apos;ll email you the moment you&apos;re approved — usually within
          one business day.
        </p>
      )}
      {app?.status === 'rejected' && (
        <>
          <p className="text-sm text-stone-600 mb-4">
            Unfortunately we couldn&apos;t approve your wholesale application.
          </p>
          {app.rejection_reason && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3 mb-4">
              <strong>Reason:</strong> {app.rejection_reason}
            </div>
          )}
        </>
      )}
      {app?.status === 'info_requested' && (
        <>
          <p className="text-sm text-stone-600 mb-4">
            We need a bit more information before we can finish reviewing your
            application.
          </p>
          {app.rejection_reason && (
            <div className="bg-blue-50 border border-blue-200 text-blue-700 text-sm rounded-lg px-4 py-3 mb-4">
              {app.rejection_reason}
            </div>
          )}
        </>
      )}

      <dl className="text-sm space-y-2 mt-6">
        <div className="flex gap-3">
          <dt className="text-stone-500 w-32">Company</dt>
          <dd className="text-stone-700">{app?.company_name}</dd>
        </div>
        <div className="flex gap-3">
          <dt className="text-stone-500 w-32">Country</dt>
          <dd className="text-stone-700">{app?.country}</dd>
        </div>
        <div className="flex gap-3">
          <dt className="text-stone-500 w-32">Status</dt>
          <dd>
            <span
              className={
                'px-2 py-1 rounded-full text-xs font-medium capitalize ' +
                (app?.status === 'approved'
                  ? 'bg-green-100 text-green-700'
                  : app?.status === 'rejected'
                  ? 'bg-red-100 text-red-700'
                  : 'bg-amber-100 text-amber-700')
              }
            >
              {app?.status}
            </span>
          </dd>
        </div>
      </dl>
    </div>
  )
}
