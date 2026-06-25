import Link from 'next/link'
import { adminGet, ServerAuthError } from '@/lib/server-fetch'

export const dynamic = 'force-dynamic'

interface OrderRow {
  id: number
  user_id: number | null
  user_email: string | null
  status: string
  total: number
  created_at: string
}

interface OrdersPageProps {
  searchParams: Promise<{
    status?: string
    search?: string
    date_from?: string
    date_to?: string
  }>
}

const STATUS_OPTIONS = [
  '',
  'pending',
  'paid',
  'shipped',
  'delivered',
  'cancelled',
  'refunded',
]

const statusColor = (status: string) => {
  switch (status) {
    case 'delivered':
      return 'bg-green-100 text-green-700'
    case 'shipped':
      return 'bg-blue-100 text-blue-700'
    case 'paid':
      return 'bg-rose-100 text-rose-700'
    case 'pending':
      return 'bg-amber-100 text-amber-700'
    case 'cancelled':
    case 'refunded':
      return 'bg-red-100 text-red-700'
    default:
      return 'bg-stone-100 text-stone-700'
  }
}

const formatMoney = (cents: number) =>
  `$${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const formatDate = (iso: string) => {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  return d.toISOString().slice(0, 10)
}

export default async function AdminOrdersPage({ searchParams }: OrdersPageProps) {
  const sp = await searchParams
  const params = new URLSearchParams()
  if (sp.status) params.set('status_filter', sp.status)
  if (sp.search) params.set('search', sp.search)
  if (sp.date_from) params.set('date_from', sp.date_from)
  if (sp.date_to) params.set('date_to', sp.date_to)

  let orders: OrderRow[] = []
  let loadError: string | null = null
  try {
    orders = await adminGet<OrderRow[]>(`/api/orders/admin?${params.toString()}`)
  } catch (err) {
    if (err instanceof ServerAuthError) loadError = err.message
    else throw err
  }

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-serif text-stone-800">Orders</h1>
          <p className="text-stone-500 mt-1 text-sm">
            {orders.length} {orders.length === 1 ? 'order' : 'orders'} loaded
          </p>
        </div>
      </div>

      <form className="bg-white rounded-xl border border-stone-200 p-4 mb-6 grid md:grid-cols-4 gap-3">
        <input
          type="search"
          name="search"
          defaultValue={sp.search ?? ''}
          placeholder="Search by id or email"
          className="md:col-span-2 border border-stone-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500"
        />
        <select
          name="status"
          defaultValue={sp.status ?? ''}
          className="border border-stone-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500"
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s ? s : 'All statuses'}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="bg-stone-100 text-stone-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-stone-200"
        >
          Apply filters
        </button>
        <label className="md:col-span-1 text-xs text-stone-500 flex flex-col">
          From
          <input
            type="date"
            name="date_from"
            defaultValue={sp.date_from ?? ''}
            className="mt-1 border border-stone-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500"
          />
        </label>
        <label className="md:col-span-1 text-xs text-stone-500 flex flex-col">
          To
          <input
            type="date"
            name="date_to"
            defaultValue={sp.date_to ?? ''}
            className="mt-1 border border-stone-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500"
          />
        </label>
      </form>

      {loadError ? (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
          {loadError}
        </div>
      ) : orders.length === 0 ? (
        <div className="bg-white rounded-xl border border-stone-200 p-8 text-center text-stone-500">
          No orders match the current filters.
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-stone-200 bg-stone-50">
                  <th className="text-left py-3 px-4 text-stone-500 font-medium">Order</th>
                  <th className="text-left py-3 px-4 text-stone-500 font-medium">Customer</th>
                  <th className="text-left py-3 px-4 text-stone-500 font-medium">Total</th>
                  <th className="text-left py-3 px-4 text-stone-500 font-medium">Status</th>
                  <th className="text-left py-3 px-4 text-stone-500 font-medium">Date</th>
                  <th className="text-left py-3 px-4 text-stone-500 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.id} className="border-b border-stone-100 hover:bg-stone-50">
                    <td className="py-3 px-4 text-stone-700 font-medium">#{o.id}</td>
                    <td className="py-3 px-4 text-stone-600">
                      {o.user_email ?? (
                        <span className="text-stone-400">guest</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-stone-600">{formatMoney(o.total)}</td>
                    <td className="py-3 px-4">
                      <span
                        className={`px-2 py-1 rounded-full text-xs font-medium capitalize ${statusColor(o.status)}`}
                      >
                        {o.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-stone-400">{formatDate(o.created_at)}</td>
                    <td className="py-3 px-4">
                      <Link
                        href={`/admin/orders/${o.id}`}
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
