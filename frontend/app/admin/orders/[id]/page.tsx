import { notFound } from 'next/navigation'
import { adminGet, ServerAuthError } from '@/lib/server-fetch'
import OrderActions from './OrderActions'

export const dynamic = 'force-dynamic'

interface OrderItem {
  id: number
  variant_id: number
  product_name: string
  size: string
  color: string
  quantity: number
  unit_price: number
  subtotal: number
}

interface OrderDetail {
  id: number
  user_id: number | null
  user_email: string | null
  status: string
  total: number
  shipping_address: Record<string, string | null> | null
  stripe_session_id: string | null
  stripe_payment_intent_id: string | null
  created_at: string | null
  updated_at: string | null
  items: OrderItem[]
}

const STATUS_OPTIONS = ['pending', 'paid', 'shipped', 'delivered', 'cancelled', 'refunded']

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

const formatDate = (iso: string | null) => {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  return d.toLocaleString()
}

const formatAddr = (a: Record<string, string | null> | null) => {
  if (!a) return null
  const order = ['name', 'line1', 'line2', 'city', 'state', 'postal_code', 'country']
  const lines: string[] = []
  for (const key of order) {
    const v = a[key]
    if (v) lines.push(v)
  }
  return lines
}

export default async function AdminOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  let order: OrderDetail
  try {
    order = await adminGet<OrderDetail>(`/api/orders/admin/${id}`)
  } catch (err) {
    if (err instanceof ServerAuthError && err.status === 404) notFound()
    throw err
  }

  const addrLines = formatAddr(order.shipping_address)

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-serif text-stone-800">Order #{order.id}</h1>
          <p className="text-stone-500 mt-1 text-sm">{formatDate(order.created_at)}</p>
        </div>
        <span
          className={`px-3 py-1 rounded-full text-sm font-medium capitalize ${statusColor(order.status)}`}
        >
          {order.status}
        </span>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-6">
          <div className="bg-white rounded-xl border border-stone-200 p-6">
            <h2 className="font-serif text-lg text-stone-800 mb-4">Line items</h2>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-stone-200 text-stone-500">
                  <th className="text-left py-2 font-medium">Product</th>
                  <th className="text-left py-2 font-medium">Size</th>
                  <th className="text-left py-2 font-medium">Color</th>
                  <th className="text-right py-2 font-medium">Qty</th>
                  <th className="text-right py-2 font-medium">Unit</th>
                  <th className="text-right py-2 font-medium">Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {order.items.map((it) => (
                  <tr key={it.id} className="border-b border-stone-100">
                    <td className="py-2 text-stone-700">{it.product_name}</td>
                    <td className="py-2 text-stone-600">{it.size}</td>
                    <td className="py-2 text-stone-600">{it.color}</td>
                    <td className="py-2 text-stone-600 text-right">{it.quantity}</td>
                    <td className="py-2 text-stone-600 text-right">
                      {formatMoney(it.unit_price)}
                    </td>
                    <td className="py-2 text-stone-700 text-right font-medium">
                      {formatMoney(it.subtotal)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={5} className="pt-3 text-right text-stone-500">
                    Total
                  </td>
                  <td className="pt-3 text-right text-stone-800 font-medium">
                    {formatMoney(order.total)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="bg-white rounded-xl border border-stone-200 p-6">
            <h2 className="font-serif text-lg text-stone-800 mb-4">Payment</h2>
            <dl className="text-sm space-y-2">
              <div className="flex gap-3">
                <dt className="text-stone-500 w-44">Stripe session</dt>
                <dd className="text-stone-700 font-mono text-xs break-all">
                  {order.stripe_session_id ?? '—'}
                </dd>
              </div>
              <div className="flex gap-3">
                <dt className="text-stone-500 w-44">Stripe payment intent</dt>
                <dd className="text-stone-700 font-mono text-xs break-all">
                  {order.stripe_payment_intent_id ?? '—'}
                </dd>
              </div>
            </dl>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-stone-200 p-6">
            <h2 className="font-serif text-lg text-stone-800 mb-4">Customer</h2>
            <dl className="text-sm space-y-2">
              <div>
                <dt className="text-stone-500 text-xs">Email</dt>
                <dd className="text-stone-700">{order.user_email ?? <span className="text-stone-400">guest</span>}</dd>
              </div>
              {order.shipping_address?.email && order.shipping_address.email !== order.user_email && (
                <div>
                  <dt className="text-stone-500 text-xs">Receipt email</dt>
                  <dd className="text-stone-700">{order.shipping_address.email}</dd>
                </div>
              )}
            </dl>
          </div>

          <div className="bg-white rounded-xl border border-stone-200 p-6">
            <h2 className="font-serif text-lg text-stone-800 mb-4">Ship to</h2>
            {addrLines && addrLines.length > 0 ? (
              <address className="not-italic text-sm text-stone-700 leading-relaxed">
                {addrLines.map((line, i) => (
                  <div key={i}>{line}</div>
                ))}
              </address>
            ) : (
              <p className="text-sm text-stone-400">No shipping address on file.</p>
            )}
          </div>

          <div className="bg-white rounded-xl border border-stone-200 p-6">
            <h2 className="font-serif text-lg text-stone-800 mb-4">Actions</h2>
            <OrderActions
              orderId={order.id}
              currentStatus={order.status}
              statusOptions={STATUS_OPTIONS}
              hasPaymentIntent={!!order.stripe_payment_intent_id}
            />
          </div>
        </div>
      </div>
    </>
  )
}
