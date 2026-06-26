import Link from 'next/link'
import { getAdminUser, adminGet, ServerAuthError } from '@/lib/server-fetch'

export const dynamic = 'force-dynamic'

interface DashboardData {
  total_products: number
  total_orders: number
  total_revenue: number
  low_stock_count: number
  recent_orders: { id: number; status: string; total: number; created_at: string }[]
  low_stock_products: {
    product_name: string
    variant_id: number
    size: string
    color: string
    stock: number
  }[]
}

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

export default async function AdminDashboardPage() {
  const user = await getAdminUser()
  if (!user) {
    return (
      <div className="bg-white rounded-xl border border-stone-200 p-6">
        <p className="text-stone-600">You need admin access to view this page.</p>
      </div>
    )
  }

  let data: DashboardData
  try {
    data = await adminGet<DashboardData>('/api/admin/dashboard')
  } catch (err) {
    if (err instanceof ServerAuthError) {
      return (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
          Could not load dashboard: {err.message}
        </div>
      )
    }
    throw err
  }

  return (
    <>
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-serif text-stone-800">Admin Dashboard</h1>
          <p className="text-stone-500 mt-1">
            Welcome back. Here&apos;s what&apos;s happening today.
          </p>
        </div>
        <div className="flex gap-3">
          <Link
            href="/admin/products/new"
            className="bg-stone-800 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-stone-700"
          >
            + Add Product
          </Link>
          <Link
            href="/admin/import"
            className="border border-stone-300 text-stone-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-stone-50"
          >
            Import JSON
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-8">
        {[
          { label: 'Total Products', value: data.total_products, color: 'bg-rose-50' },
          { label: 'Total Orders', value: data.total_orders, color: 'bg-blue-50' },
          { label: 'Total Revenue', value: formatMoney(data.total_revenue), color: 'bg-green-50' },
          { label: 'Low Stock', value: data.low_stock_count, color: 'bg-amber-50' },
        ].map((stat) => (
          <div key={stat.label} className={`${stat.color} rounded-xl p-6`}>
            <p className="text-3xl font-serif text-stone-800 mb-1">{stat.value}</p>
            <p className="text-sm text-stone-500">{stat.label}</p>
          </div>
        ))}
      </div>

      <div className="grid md:grid-cols-3 gap-6 mb-8">
        <div className="bg-white rounded-xl border border-stone-200 p-6">
          <h2 className="font-serif text-lg text-stone-800 mb-4">Quick Actions</h2>
          <div className="space-y-2">
            <Link
              href="/admin/products"
              className="flex items-center justify-between px-4 py-3 bg-stone-50 rounded-lg text-sm text-stone-700 hover:bg-stone-100"
            >
              Manage Products
              <span>→</span>
            </Link>
            <Link
              href="/admin/orders"
              className="flex items-center justify-between px-4 py-3 bg-stone-50 rounded-lg text-sm text-stone-700 hover:bg-stone-100"
            >
              View Orders
              <span>→</span>
            </Link>
            <Link
              href="/admin/import"
              className="flex items-center justify-between px-4 py-3 bg-stone-50 rounded-lg text-sm text-stone-700 hover:bg-stone-100"
            >
              Bulk Import
              <span>→</span>
            </Link>
            <Link
              href="/admin/coupons"
              className="flex items-center justify-between px-4 py-3 bg-stone-50 rounded-lg text-sm text-stone-700 hover:bg-stone-100"
            >
              Manage Coupons
              <span>→</span>
            </Link>
            <Link
              href="/admin/chatbot"
              className="flex items-center justify-between px-4 py-3 bg-stone-50 rounded-lg text-sm text-stone-700 hover:bg-stone-100"
            >
              Chatbot Logs
              <span>→</span>
            </Link>
          </div>
        </div>

        <div className="md:col-span-2 bg-white rounded-xl border border-stone-200 p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="font-serif text-lg text-stone-800">Recent Orders</h2>
            <Link href="/admin/orders" className="text-sm text-rose-500 hover:underline">
              View all
            </Link>
          </div>
          {data.recent_orders.length === 0 ? (
            <p className="text-sm text-stone-500">No orders yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-stone-200">
                    <th className="text-left py-3 px-2 text-stone-500 font-medium">Order</th>
                    <th className="text-left py-3 px-2 text-stone-500 font-medium">Total</th>
                    <th className="text-left py-3 px-2 text-stone-500 font-medium">Status</th>
                    <th className="text-left py-3 px-2 text-stone-500 font-medium">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recent_orders.map((o) => (
                    <tr key={o.id} className="border-b border-stone-100 hover:bg-stone-50">
                      <td className="py-3 px-2 text-stone-700 font-medium">
                        <Link href={`/admin/orders/${o.id}`} className="hover:underline">
                          #{o.id}
                        </Link>
                      </td>
                      <td className="py-3 px-2 text-stone-600">{formatMoney(o.total)}</td>
                      <td className="py-3 px-2">
                        <span
                          className={`px-2 py-1 rounded-full text-xs font-medium capitalize ${statusColor(o.status)}`}
                        >
                          {o.status}
                        </span>
                      </td>
                      <td className="py-3 px-2 text-stone-400">{formatDate(o.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-stone-200 p-6">
        <h2 className="font-serif text-lg text-stone-800 mb-4">Low Stock Alerts</h2>
        {data.low_stock_products.length === 0 ? (
          <p className="text-sm text-stone-500">All variants are above the 5-unit threshold.</p>
        ) : (
          <div className="space-y-2">
            {data.low_stock_products.map((item, i) => (
              <div
                key={i}
                className="flex justify-between items-center py-3 border-b border-stone-100 last:border-0"
              >
                <div>
                  <p className="text-sm font-medium text-stone-700">{item.product_name}</p>
                  <p className="text-xs text-stone-400">
                    {item.size} / {item.color}
                  </p>
                </div>
                <span
                  className={`text-sm font-medium ${
                    item.stock <= 2 ? 'text-red-500' : 'text-amber-500'
                  }`}
                >
                  {item.stock} left
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  )
}
