import { adminGet, getAdminUser } from '@/lib/server-fetch'
import { redirect } from 'next/navigation'
import { type WholesaleApplication } from '@/lib/api'
import ApplicationActions from '@/components/admin/ApplicationActions'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Wholesale applications — Admin',
}

const statusColor = (status: string) => {
  switch (status) {
    case 'approved':
      return 'bg-green-100 text-green-700'
    case 'rejected':
      return 'bg-red-100 text-red-700'
    case 'info_requested':
      return 'bg-blue-100 text-blue-700'
    default:
      return 'bg-amber-100 text-amber-700'
  }
}

const formatDate = (iso: string | null) => {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  return d.toISOString().slice(0, 10)
}

export default async function AdminApplicationsPage() {
  const admin = await getAdminUser()
  if (!admin) redirect('/account/login?next=/admin/wholesale/applications')

  let apps: WholesaleApplication[] = []
  let loadError: string | null = null
  try {
    apps = await adminGet<WholesaleApplication[]>(
      '/api/admin/wholesale/applications'
    )
  } catch (e) {
    loadError = e instanceof Error ? e.message : 'Failed to load'
  }

  return (
    <>
      <div className="mb-6">
        <h1 className="text-3xl font-serif text-stone-800">
          Wholesale applications
        </h1>
        <p className="text-sm text-stone-500 mt-1">
          {apps.length} {apps.length === 1 ? 'application' : 'applications'}
        </p>
      </div>

      {loadError ? (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
          {loadError}
        </div>
      ) : apps.length === 0 ? (
        <div className="bg-white rounded-xl border border-stone-200 p-8 text-center text-stone-500">
          No applications yet.
        </div>
      ) : (
        <div className="space-y-3">
          {apps.map((a) => (
            <div
              key={a.id}
              className="bg-white rounded-xl border border-stone-200 p-5"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-3">
                    <h2 className="font-serif text-lg text-stone-800">
                      {a.company_name}
                    </h2>
                    <span
                      className={`px-2 py-1 rounded-full text-xs font-medium capitalize ${statusColor(
                        a.status
                      )}`}
                    >
                      {a.status.replace('_', ' ')}
                    </span>
                  </div>
                  <p className="text-sm text-stone-500">
                    {a.user_email} · {a.country}
                  </p>
                  <p className="text-xs text-stone-400 mt-1">
                    Submitted {formatDate(a.created_at)}
                    {a.decided_at && ` · Decided ${formatDate(a.decided_at)}`}
                  </p>
                </div>
                <ApplicationActions application={a} />
              </div>

              <dl className="mt-4 grid md:grid-cols-2 gap-x-6 gap-y-2 text-sm">
                {a.tax_id && (
                  <div>
                    <dt className="text-xs text-stone-500">Tax ID</dt>
                    <dd className="text-stone-700">{a.tax_id}</dd>
                  </div>
                )}
                {a.phone && (
                  <div>
                    <dt className="text-xs text-stone-500">Phone</dt>
                    <dd className="text-stone-700">{a.phone}</dd>
                  </div>
                )}
                {a.website && (
                  <div>
                    <dt className="text-xs text-stone-500">Website</dt>
                    <dd className="text-stone-700 truncate">
                      <a
                        href={a.website}
                        target="_blank"
                        rel="noreferrer"
                        className="text-rose-500 hover:underline"
                      >
                        {a.website}
                      </a>
                    </dd>
                  </div>
                )}
              </dl>
              {a.notes && (
                <div className="mt-3 bg-stone-50 rounded-lg px-3 py-2 text-sm text-stone-700">
                  {a.notes}
                </div>
              )}
              {a.rejection_reason && (
                <div className="mt-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">
                  <strong>Reason sent to user:</strong> {a.rejection_reason}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  )
}
