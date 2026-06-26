import { adminGet, getAdminUser } from '@/lib/server-fetch'
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Audit log — Admin',
}

const formatDate = (iso: string | null) => {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  return d.toLocaleString()
}

interface AuditEntry {
  id: number
  admin_user_id: number
  action: string
  entity_type: string
  entity_id: number | null
  details: Record<string, unknown> | null
  ip: string | null
  method: string | null
  path: string | null
  created_at: string | null
}

const actionColor = (action: string) => {
  switch (action) {
    case 'delete':
    case 'reject':
      return 'bg-red-100 text-red-700'
    case 'create':
    case 'approve':
    case 'mark_paid':
      return 'bg-green-100 text-green-700'
    case 'update':
    case 'update_status':
    case 'send':
      return 'bg-blue-100 text-blue-700'
    case 'resolve':
    case 'request_info':
      return 'bg-amber-100 text-amber-700'
    default:
      return 'bg-stone-100 text-stone-700'
  }
}

export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: Promise<{
    action?: string
    entity_type?: string
    entity_id?: string
  }>
}) {
  const admin = await getAdminUser()
  if (!admin) redirect('/account/login?next=/admin/audit')

  const sp = await searchParams
  const params = new URLSearchParams()
  if (sp.action) params.set('action', sp.action)
  if (sp.entity_type) params.set('entity_type', sp.entity_type)
  if (sp.entity_id) params.set('entity_id', sp.entity_id)
  params.set('limit', '100')

  let data: { items: AuditEntry[] } = { items: [] }
  let loadError: string | null = null
  try {
    data = await adminGet<{ items: AuditEntry[] }>(`/api/admin/audit?${params}`)
  } catch (e) {
    loadError = e instanceof Error ? e.message : 'Failed to load'
  }

  return (
    <>
      <div className="mb-6">
        <h1 className="text-3xl font-serif text-stone-800">Audit log</h1>
        <p className="text-sm text-stone-500 mt-1">
          {data.items.length} entries, newest first.
        </p>
      </div>

      <form className="bg-white rounded-xl border border-stone-200 p-4 mb-6 grid md:grid-cols-4 gap-3">
        <input
          type="text"
          name="action"
          defaultValue={sp.action ?? ''}
          placeholder="action (e.g. approve, mark_paid)"
          className="border border-stone-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500"
        />
        <input
          type="text"
          name="entity_type"
          defaultValue={sp.entity_type ?? ''}
          placeholder="entity type (e.g. coupon)"
          className="border border-stone-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500"
        />
        <input
          type="text"
          name="entity_id"
          defaultValue={sp.entity_id ?? ''}
          placeholder="entity id"
          className="border border-stone-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500"
        />
        <button
          type="submit"
          className="bg-stone-100 text-stone-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-stone-200"
        >
          Filter
        </button>
      </form>

      {loadError ? (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
          {loadError}
        </div>
      ) : data.items.length === 0 ? (
        <div className="bg-white rounded-xl border border-stone-200 p-8 text-center text-stone-500">
          No audit entries match the current filter.
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-stone-200 bg-stone-50">
                  <th className="text-left py-3 px-4 text-stone-500 font-medium">
                    When
                  </th>
                  <th className="text-left py-3 px-4 text-stone-500 font-medium">
                    Action
                  </th>
                  <th className="text-left py-3 px-4 text-stone-500 font-medium">
                    Entity
                  </th>
                  <th className="text-left py-3 px-4 text-stone-500 font-medium">
                    Admin
                  </th>
                  <th className="text-left py-3 px-4 text-stone-500 font-medium">
                    IP / Method
                  </th>
                  <th className="text-left py-3 px-4 text-stone-500 font-medium">
                    Details
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((e) => (
                  <tr
                    key={e.id}
                    className="border-b border-stone-100 hover:bg-stone-50 align-top"
                  >
                    <td className="py-3 px-4 text-stone-500 text-xs whitespace-nowrap">
                      {formatDate(e.created_at)}
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`px-2 py-1 rounded-full text-xs font-medium capitalize ${actionColor(
                          e.action
                        )}`}
                      >
                        {e.action}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-stone-700 text-xs">
                      <span className="font-mono">{e.entity_type}</span>
                      {e.entity_id != null && (
                        <span className="text-stone-500"> #{e.entity_id}</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-stone-600 text-xs">
                      #{e.admin_user_id}
                    </td>
                    <td className="py-3 px-4 text-stone-500 text-xs">
                      {e.ip && <div>{e.ip}</div>}
                      {e.method && (
                        <div className="font-mono">
                          {e.method} {e.path}
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4 text-stone-500 text-xs font-mono break-all max-w-md">
                      {e.details ? JSON.stringify(e.details) : '—'}
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
