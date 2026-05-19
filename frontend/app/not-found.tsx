import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: "Page Not Found — ModestWear",
}

export default function NotFound() {
  return (
    <div className="max-w-7xl mx-auto px-4 py-24 text-center">
      <h1 className="text-8xl font-serif text-rose-300 mb-4">404</h1>
      <h2 className="text-3xl font-serif text-stone-800 mb-4">Page Not Found</h2>
      <p className="text-stone-500 mb-8 max-w-md mx-auto">
        Sorry, we couldn&apos;t find the page you&apos;re looking for. It may have moved or no longer exists.
      </p>
      <div className="flex gap-4 justify-center">
        <Link href="/" className="bg-stone-800 text-white px-6 py-3 rounded-full font-medium hover:bg-stone-700">
          Go Home
        </Link>
        <Link href="/shop" className="border border-stone-300 text-stone-700 px-6 py-3 rounded-full font-medium hover:bg-stone-50">
          Browse Shop
        </Link>
      </div>
    </div>
  )
}