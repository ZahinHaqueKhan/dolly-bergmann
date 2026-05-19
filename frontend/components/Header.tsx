'use client'
import Link from 'next/link'
import { useCartStore } from '@/store/cart'

export default function Header() {
  const items = useCartStore((s) => s.items)
  const itemCount = items.reduce((sum, i) => sum + i.quantity, 0)

  return (
    <header className="bg-stone-50 border-b border-stone-200 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
        <Link href="/" className="text-2xl font-serif text-stone-800">ModestWear</Link>
        <nav className="hidden md:flex gap-8 text-stone-600">
          <Link href="/shop" className="hover:text-stone-900">Shop</Link>
          <Link href="/shop?category=dresses" className="hover:text-stone-900">Dresses</Link>
          <Link href="/shop?category=khimar" className="hover:text-stone-900">Khimar</Link>
          <Link href="/about" className="hover:text-stone-900">About</Link>
        </nav>
        <div className="flex items-center gap-4">
          <Link href="/cart" className="relative p-2">
            <svg className="w-6 h-6 text-stone-700" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"/></svg>
            {itemCount > 0 && <span className="absolute -top-1 -right-1 bg-rose-500 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center">{itemCount}</span>}
          </Link>
          <Link href="/account" className="p-2">
            <svg className="w-6 h-6 text-stone-700" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>
          </Link>
        </div>
      </div>
    </header>
  )
}