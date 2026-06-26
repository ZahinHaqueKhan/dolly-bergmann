import Link from 'next/link'
import { adminGet, getAdminUser } from '@/lib/server-fetch'
import { redirect } from 'next/navigation'
import { type WholesaleOrder } from '@/lib/api'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Wholesale orders — Admin',
}

const statusColor = (status: string) => {
  switch (status) {
    case 'delivered':
      return 'bg-green-100 text-green-700'
    case 'shipped':
      return 'bg-blue-100 text-blue-700'
    case 'paid':
    case 'processing':
      return 'bg-rose-100 text-rose-700'
    case 'awaiting_payment':
      return 'bg-amber-100 text-amber-700'
    case 'cancelled':
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

export default async function AdminWholesaleOrdersPage() {
  const admin = await getAdminUser()
  if (!admin) redirect('/account/login?next=/admin/wholesale/orders')

  let orders: WholesaleOrder[] = []
  let loadError: string | null = null
  try {
    orders = await adminGet<WholesaleOrder[]>('/api/admin/wholesale/orders')
  } catch (e) {
    loadError = e instanceof Error ? e.message : 'Failed to load'
  }

  return (
    <>
      <div className="mb-6">
        <h1 className="text-3xl font-serif text-stone-800">
          Wholesale orders
        </h1>
        <p className="text-sm text-stone-500 mt-1">
          {orders.length} {orders.length === 1 ? 'order' : 'orders'}
        </p>
      </div>

      {loadError ? (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
          {loadError}
        </div>
      ) : orders.length === 0 ? (
        <div className="bg-white rounded-xl border border-stone-200 p-8 text-center text-stone-500">
          No wholesale orders yet.
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-stone-200 bg-stone-50">
                  <th className="text-left py-3 px-4 text-stone-500 font-medium">
                    Order
                  </th>
                  <th className="text-left py-3 px-4 text-stone-500 font-medium">
                    Buyer
                  </th>
                  <th className="text-left py-3 px-4 text-stone-500 font-medium">
                    Status
                  </th>
                  <th className="text-left py-3 px-4 text-stone-500 font-medium">
                    Payment
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
                {orders.map((o) => (
                  <tr
                    key={o.id}
                    className="border-b border-stone-100 hover:bg-stone-50"
                  >
                    <td className="py-3 px-4 text-stone-700 font-medium">
                      #{o.id}
                    </td>
                    <td className="py-3 px-4 text-stone-600">
                      <div>{o.user_company || o.user_email}</div>
                      <div className="text-xs text-stone-400">
                        {o.user_email}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`px-2 py-1 rounded-full text-xs font-medium capitalize ${statusColor(
                          o.status
                        )}`}
                      >
                        {o.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={
                          'px-2 py-1 rounded-full text-xs font-medium capitalize ' +
                          (o.payment_status === 'paid'
                            ? 'bg-green-100 text-green-700'
                            : o.payment_status === 'partial'
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-stone-100 text-stone-700')
                        }
                      >
                        {o.payment_status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right text-stone-600">
                      {formatMoney(o.total)}
                    </td>
                    <td className="py-3 px-4 text-stone-400">
                      {formatDate(o.created_at)}
                    </td>
                    <td className="py-3 px-4">
                      <Link
                        href={`/admin/wholesale/orders/${o.id}`}
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
