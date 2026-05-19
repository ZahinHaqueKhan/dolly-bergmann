'use client'
import { useState } from 'react'
import Link from 'next/link'

const MOCK_STATS = {
  total_products: 248,
  total_orders: 1247,
  total_revenue: 156780,
  low_stock_count: 12,
}

const MOCK_RECENT_ORDERS = [
  { id: 1247, customer: 'Aisha M.', total: 178, status: 'pending', date: '2025-05-19' },
  { id: 1246, customer: 'Fatima K.', total: 89, status: 'shipped', date: '2025-05-19' },
  { id: 1245, customer: 'Sarah J.', total: 245, status: 'delivered', date: '2025-05-18' },
  { id: 1244, customer: 'Maryam A.', total: 59, status: 'paid', date: '2025-05-18' },
  { id: 1243, customer: 'Hana B.', total: 132, status: 'paid', date: '2025-05-17' },
]

export default function AdminPage() {
  const [stats] = useState(MOCK_STATS)
  const [recentOrders] = useState(MOCK_RECENT_ORDERS)

  const statusColor = (status: string) => {
    switch (status) {
      case 'delivered': return 'bg-green-100 text-green-700'
      case 'shipped': return 'bg-blue-100 text-blue-700'
      case 'paid': return 'bg-rose-100 text-rose-700'
      case 'pending': return 'bg-amber-100 text-amber-700'
      case 'cancelled': return 'bg-red-100 text-red-700'
      default: return 'bg-stone-100 text-stone-700'
    }
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-serif text-stone-800">Admin Dashboard</h1>
          <p className="text-stone-500 mt-1">Welcome back. Here&apos;s what&apos;s happening today.</p>
        </div>
        <div className="flex gap-3">
          <Link href="/admin/products/new" className="bg-stone-800 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-stone-700">
            + Add Product
          </Link>
          <Link href="/admin/import" className="border border-stone-300 text-stone-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-stone-50">
            Import JSON
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-8">
        {[
          { label: 'Total Products', value: stats.total_products, icon: '📦', color: 'bg-rose-50' },
          { label: 'Total Orders', value: stats.total_orders.toLocaleString(), icon: '🛒', color: 'bg-blue-50' },
          { label: 'Total Revenue', value: `$${(stats.total_revenue / 100).toLocaleString()}`, icon: '💰', color: 'bg-green-50' },
          { label: 'Low Stock', value: stats.low_stock_count, icon: '⚠️', color: 'bg-amber-50' },
        ].map(stat => (
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
            <Link href="/admin/products" className="flex items-center justify-between px-4 py-3 bg-stone-50 rounded-lg text-sm text-stone-700 hover:bg-stone-100">
              Manage Products
              <span>→</span>
            </Link>
            <Link href="/admin/orders" className="flex items-center justify-between px-4 py-3 bg-stone-50 rounded-lg text-sm text-stone-700 hover:bg-stone-100">
              View Orders
              <span>→</span>
            </Link>
            <Link href="/admin/import" className="flex items-center justify-between px-4 py-3 bg-stone-50 rounded-lg text-sm text-stone-700 hover:bg-stone-100">
              Bulk Import
              <span>→</span>
            </Link>
            <Link href="/admin/coupons" className="flex items-center justify-between px-4 py-3 bg-stone-50 rounded-lg text-sm text-stone-700 hover:bg-stone-100">
              Manage Coupons
              <span>→</span>
            </Link>
          </div>
        </div>

        <div className="md:col-span-2 bg-white rounded-xl border border-stone-200 p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="font-serif text-lg text-stone-800">Recent Orders</h2>
            <Link href="/admin/orders" className="text-sm text-rose-500 hover:underline">View all</Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-stone-200">
                  <th className="text-left py-3 px-2 text-stone-500 font-medium">Order</th>
                  <th className="text-left py-3 px-2 text-stone-500 font-medium">Customer</th>
                  <th className="text-left py-3 px-2 text-stone-500 font-medium">Total</th>
                  <th className="text-left py-3 px-2 text-stone-500 font-medium">Status</th>
                  <th className="text-left py-3 px-2 text-stone-500 font-medium">Date</th>
                </tr>
              </thead>
              <tbody>
                {recentOrders.map(order => (
                  <tr key={order.id} className="border-b border-stone-100 hover:bg-stone-50">
                    <td className="py-3 px-2 text-stone-700 font-medium">#{order.id}</td>
                    <td className="py-3 px-2 text-stone-600">{order.customer}</td>
                    <td className="py-3 px-2 text-stone-600">${order.total}</td>
                    <td className="py-3 px-2">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium capitalize ${statusColor(order.status)}`}>
                        {order.status}
                      </span>
                    </td>
                    <td className="py-3 px-2 text-stone-400">{order.date}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-stone-200 p-6">
        <h2 className="font-serif text-lg text-stone-800 mb-4">Low Stock Alerts</h2>
        <div className="space-y-2">
          {[
            { product: 'Classic Black Khimar', variant: 'M/L Navy', stock: 3 },
            { product: 'Beige Maxi Dress', variant: 'L/XL', stock: 2 },
            { product: 'Dusty Rose Abaya', variant: 'S/M', stock: 1 },
            { product: 'Navy Jersey Khimar', variant: 'S/M Black', stock: 4 },
          ].map((item, i) => (
            <div key={i} className="flex justify-between items-center py-3 border-b border-stone-100 last:border-0">
              <div>
                <p className="text-sm font-medium text-stone-700">{item.product}</p>
                <p className="text-xs text-stone-400">{item.variant}</p>
              </div>
              <span className={`text-sm font-medium ${item.stock <= 2 ? 'text-red-500' : 'text-amber-500'}`}>
                {item.stock} left
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}