import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getWholesaleUser } from '@/lib/server-fetch'
import { listMyOrders, type WholesaleOrder } from '@/lib/api'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'My orders — Wholesale Portal',
  robots: { index: false, follow: false },
}

const orderStatusColor = (status: string) => {
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

export default async function MyOrdersPage() {
  const user = await getWholesaleUser()
  if (!user) redirect('/account/login?next=/wholesale/orders')
  if (!user.approved_at) redirect('/wholesale/pending')

  let orders: WholesaleOrder[] = []
  let loadError: string | null = null
  try {
    orders = await listMyOrders()
  } catch (e) {
    loadError = e instanceof Error ? e.message : 'Failed to load orders'
  }

  return (
    <>
      <div className="mb-6">
        <h2 className="text-2xl font-serif text-stone-800">My orders</h2>
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
          You haven&apos;t placed any orders yet. Accept a quote to create
          one.
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
                    Status
                  </th>
                  <th className="text-left py-3 px-4 text-stone-500 font-medium">
                    Payment
                  </th>
                  <th className="text-right py-3 px-4 text-stone-500 font-medium">
                    Total
                  </th>
                  <th className="text-left py-3 px-4 text-stone-500 font-medium">
                    Tracking
                  </th>
                  <th className="text-left py-3 px-4 text-stone-500 font-medium">
                    Created
                  </th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.id} className="border-b border-stone-100 hover:bg-stone-50">
                    <td className="py-3 px-4 text-stone-700 font-medium">
                      #{o.id}
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`px-2 py-1 rounded-full text-xs font-medium capitalize ${orderStatusColor(
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
                    <td className="py-3 px-4 text-stone-600 text-xs">
                      {o.tracking_number
                        ? `${o.shipping_carrier ?? '—'} · ${o.tracking_number}`
                        : '—'}
                    </td>
                    <td className="py-3 px-4 text-stone-400">
                      {formatDate(o.created_at)}
                    </td>
                    <td className="py-3 px-4">
                      <Link
                        href={`/wholesale/orders/${o.id}`}
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
