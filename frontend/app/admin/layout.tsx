import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getAdminUser } from '@/lib/server-fetch'

const NAV: { label: string; href: string }[] = [
  { label: 'Dashboard', href: '/admin' },
  { label: 'Products', href: '/admin/products' },
  { label: 'Orders', href: '/admin/orders' },
  { label: 'Import', href: '/admin/import' },
  { label: 'Coupons', href: '/admin/coupons' },
  { label: 'Wholesale', href: '/admin/wholesale/applications' },
  { label: 'Chatbot Logs', href: '/admin/chatbot' },
  { label: 'Settings', href: '/admin/settings' },
]

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getAdminUser()
  if (!user) {
    // Server-side redirect for unauthenticated or non-admin visitors.
    redirect('/account/login?next=/admin')
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="grid md:grid-cols-[14rem_1fr] gap-8">
        <aside className="md:sticky md:top-24 md:self-start">
          <div className="bg-white rounded-xl border border-stone-200 p-4">
            <p className="text-xs uppercase tracking-wider text-stone-400 mb-1">
              Admin
            </p>
            <p className="text-sm font-medium text-stone-800 mb-4 truncate">
              {user.email}
            </p>
            <nav className="space-y-1">
              {NAV.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="block px-3 py-2 rounded-lg text-sm text-stone-600 hover:bg-stone-50 hover:text-stone-800 transition-colors"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
        </aside>
        <div>{children}</div>
      </div>
    </div>
  )
}
