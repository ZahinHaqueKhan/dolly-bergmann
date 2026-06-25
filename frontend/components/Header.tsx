'use client'
import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { useCartStore } from '@/store/cart'
import { useAuthStore, type CurrentUser } from '@/store/auth'

export default function Header() {
  const items = useCartStore((s) => s.items)
  const itemCount = items.reduce((sum, i) => sum + i.quantity, 0)
  const user = useAuthStore((s) => s.user)
  const status = useAuthStore((s) => s.status)
  const hydrate = useAuthStore((s) => s.hydrate)
  const signOut = useAuthStore((s) => s.signOut)
  const router = useRouter()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (status === 'idle') {
      void hydrate()
    }
  }, [status, hydrate])

  useEffect(() => {
    if (!menuOpen) return
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [menuOpen])

  const handleSignOut = async () => {
    setMenuOpen(false)
    await signOut()
    toast.success('Signed out')
    router.push('/')
    router.refresh()
  }

  return (
    <header className="bg-stone-50 border-b border-stone-200 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
        <Link href="/" className="text-2xl font-serif text-stone-800">
          ModestWear
        </Link>
        <nav className="hidden md:flex gap-8 text-stone-600">
          <Link href="/shop" className="hover:text-stone-900">
            Shop
          </Link>
          <Link href="/shop?category=dresses" className="hover:text-stone-900">
            Dresses
          </Link>
          <Link href="/shop?category=khimar" className="hover:text-stone-900">
            Khimar
          </Link>
          <Link href="/about" className="hover:text-stone-900">
            About
          </Link>
        </nav>
        <div className="flex items-center gap-4">
          <Link href="/cart" className="relative p-2" aria-label="Cart">
            <svg
              className="w-6 h-6 text-stone-700"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"
              />
            </svg>
            {itemCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-rose-500 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center">
                {itemCount}
              </span>
            )}
          </Link>

          {status === 'loading' || status === 'idle' ? (
            <div className="w-10 h-10" aria-hidden="true" />
          ) : user ? (
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setMenuOpen((o) => !o)}
                className="flex items-center gap-2 p-1 rounded-lg hover:bg-stone-100"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
              >
                <span className="w-8 h-8 rounded-full bg-stone-200 text-stone-700 flex items-center justify-center text-sm font-medium">
                  {initials(user)}
                </span>
                <span className="hidden sm:inline text-sm text-stone-700">
                  {user.first_name || user.email.split('@')[0]}
                </span>
              </button>
              {menuOpen && (
                <div
                  role="menu"
                  className="absolute right-0 mt-2 w-56 bg-white border border-stone-200 rounded-lg shadow-sm py-2"
                >
                  <div className="px-4 py-2 border-b border-stone-100">
                    <p className="text-sm font-medium text-stone-800">
                      {user.first_name
                        ? `${user.first_name} ${user.last_name ?? ''}`.trim()
                        : user.email}
                    </p>
                    <p className="text-xs text-stone-500 truncate">{user.email}</p>
                  </div>
                  <Link
                    href="/account"
                    onClick={() => setMenuOpen(false)}
                    className="block px-4 py-2 text-sm text-stone-700 hover:bg-stone-50"
                    role="menuitem"
                  >
                    My account
                  </Link>
                  <Link
                    href="/account/orders"
                    onClick={() => setMenuOpen(false)}
                    className="block px-4 py-2 text-sm text-stone-700 hover:bg-stone-50"
                    role="menuitem"
                  >
                    Orders
                  </Link>
                  <Link
                    href="/account/wishlist"
                    onClick={() => setMenuOpen(false)}
                    className="block px-4 py-2 text-sm text-stone-700 hover:bg-stone-50"
                    role="menuitem"
                  >
                    Wishlist
                  </Link>
                  {user.role === 'admin' && (
                    <Link
                      href="/admin"
                      onClick={() => setMenuOpen(false)}
                      className="block px-4 py-2 text-sm text-stone-700 hover:bg-stone-50"
                      role="menuitem"
                    >
                      Admin
                    </Link>
                  )}
                  <button
                    onClick={handleSignOut}
                    className="w-full text-left block px-4 py-2 text-sm text-stone-700 hover:bg-stone-50 border-t border-stone-100 mt-1"
                    role="menuitem"
                  >
                    Sign out
                  </button>
                </div>
              )}
            </div>
          ) : (
            <Link
              href="/account/login"
              className="text-sm text-stone-700 hover:text-stone-900 px-3 py-2 rounded-lg hover:bg-stone-100"
            >
              Sign in
            </Link>
          )}
        </div>
      </div>
    </header>
  )
}

function initials(user: CurrentUser): string {
  const first = user.first_name?.trim()
  const last = user.last_name?.trim()
  if (first && last) return `${first[0]}${last[0]}`.toUpperCase()
  if (first) return first[0].toUpperCase()
  return user.email[0].toUpperCase()
}
