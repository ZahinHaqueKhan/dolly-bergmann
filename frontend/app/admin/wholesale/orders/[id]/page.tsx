import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { adminGet, getAdminUser } from '@/lib/server-fetch'
import { type WholesaleOrder } from '@/lib/api'
import OrderAdminActions from '@/components/admin/OrderAdminActions'
import StatusTimeline from '@/components/wholesale/StatusTimeline'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Wholesale order — Admin',
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
  return d.toLocaleString()
}

export default async function AdminWholesaleOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const admin = await getAdminUser()
  if (!admin) redirect('/account/login?next=/admin/wholesale/orders')

  let order: WholesaleOrder
  try {
    order = await adminGet<WholesaleOrder>(`/api/admin/wholesale/orders/${id}`)
  } catch {
    notFound()
  }

  return (
    <>
      <div className="mb-6">
        <Link
          href="/admin/wholesale/orders"
          className="text-sm text-stone-500 hover:text-stone-700"
        >
          ← All orders
        </Link>
        <div className="flex items-center justify-between mt-1">
          <h1 className="text-3xl font-serif text-stone-800">
            Order #{order.id}
          </h1>
          <span
            className={`px-3 py-1 rounded-full text-sm font-medium capitalize ${statusColor(
              order.status
            )}`}
          >
            {order.status.replace('_', ' ')}
          </span>
        </div>
        <p className="text-sm text-stone-500 mt-1">
          {order.user_company || order.user_email} · {order.user_email}
        </p>
        <p className="text-xs text-stone-400 mt-1">
          Created {formatDate(order.created_at)}
          {order.paid_at && ` · Paid ${formatDate(order.paid_at)}`}
        </p>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-6">
          <div className="bg-white rounded-xl border border-stone-200 p-6">
            <h2 className="font-serif text-lg text-stone-800 mb-4">
              Status timeline
            </h2>
            <StatusTimeline
              status={order.status}
              paidAt={order.paid_at}
              createdAt={order.created_at}
            />
            {order.tracking_number && (
              <div className="mt-4 bg-blue-50 border border-blue-200 text-blue-800 text-sm rounded-lg px-4 py-3">
                <strong>Tracking:</strong> {order.shipping_carrier} ·{' '}
                <span className="font-mono">{order.tracking_number}</span>
              </div>
            )}
          </div>

          <div className="bg-white rounded-xl border border-stone-200 p-6">
            <h2 className="font-serif text-lg text-stone-800 mb-4">
              Line items
            </h2>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-stone-200 text-stone-500">
                  <th className="text-left py-2 font-medium">Product</th>
                  <th className="text-left py-2 font-medium">Variant</th>
                  <th className="text-right py-2 font-medium">Qty</th>
                  <th className="text-right py-2 font-medium">Unit</th>
                  <th className="text-right py-2 font-medium">Line</th>
                </tr>
              </thead>
              <tbody>
                {order.line_items.map((li) => (
                  <tr key={li.id} className="border-b border-stone-100">
                    <td className="py-2 text-stone-700">{li.product_name}</td>
                    <td className="py-2 text-stone-600">
                      {li.size} / {li.color}
                    </td>
                    <td className="py-2 text-right text-stone-700">
                      {li.quantity}
                    </td>
                    <td className="py-2 text-right text-stone-600">
                      {li.unit_price !== null
                        ? formatMoney(li.unit_price)
                        : '—'}
                    </td>
                    <td className="py-2 text-right text-stone-700 font-medium">
                      {li.line_total !== null
                        ? formatMoney(li.line_total)
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={4} className="pt-3 text-right text-stone-500">
                    Subtotal
                  </td>
                  <td className="pt-3 text-right text-stone-700">
                    {formatMoney(
                      order.line_items.reduce(
                        (s, li) => s + (li.line_total ?? 0),
                        0
                      )
                    )}
                  </td>
                </tr>
                <tr>
                  <td colSpan={4} className="text-right text-stone-500">
                    Shipping
                  </td>
                  <td className="text-right text-stone-700">
                    {formatMoney(order.shipping_cost)}
                  </td>
                </tr>
                <tr>
                  <td colSpan={4} className="text-right text-stone-500">
                    Tax
                  </td>
                  <td className="text-right text-stone-700">
                    {formatMoney(order.tax)}
                  </td>
                </tr>
                <tr>
                  <td
                    colSpan={4}
                    className="pt-3 text-right text-stone-800 font-medium"
                  >
                    Total
                  </td>
                  <td className="pt-3 text-right text-stone-800 font-medium">
                    {formatMoney(order.total)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-stone-200 p-6">
            <h2 className="font-serif text-lg text-stone-800 mb-4">Actions</h2>
            <OrderAdminActions order={order} />
          </div>
          {order.pdf_path && (
            <div className="bg-white rounded-xl border border-stone-200 p-6">
              <h2 className="font-serif text-lg text-stone-800 mb-3">
                Original quote
              </h2>
              <a
                href={order.pdf_path}
                target="_blank"
                rel="noreferrer"
                className="text-rose-500 hover:underline text-sm"
              >
                View PDF
              </a>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
