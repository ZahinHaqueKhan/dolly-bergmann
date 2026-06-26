import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Page Not Found — ModestWear',
  robots: { index: false, follow: true },
}

const FALLBACK_CATEGORIES: { name: string; slug: string }[] = [
  { name: 'Khimar', slug: 'khimar' },
  { name: 'Dresses', slug: 'dresses' },
  { name: 'Abaya', slug: 'abaya' },
]

export default function NotFound() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-16">
      <div className="text-center mb-12">
        <p className="text-rose-500 font-medium uppercase tracking-wider text-sm mb-3">
          Error 404
        </p>
        <h1 className="text-5xl md:text-6xl font-serif text-stone-800 mb-4">
          Page not found
        </h1>
        <p className="text-stone-600 max-w-md mx-auto mb-8">
          We couldn&apos;t find the page you&apos;re looking for. It may
          have moved or no longer exists.
        </p>

        <form
          action="/shop"
          method="get"
          className="flex gap-2 max-w-md mx-auto mb-8"
          role="search"
          aria-label="Search the catalog"
        >
          <label htmlFor="search-404" className="sr-only">
            Search the catalog
          </label>
          <input
            id="search-404"
            type="search"
            name="search"
            placeholder="Search the catalog…"
            className="flex-1 border border-stone-300 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500"
          />
          <button
            type="submit"
            className="bg-stone-800 text-white px-5 py-3 rounded-lg text-sm font-medium hover:bg-stone-700 transition-colors focus:outline-none focus:ring-2 focus:ring-rose-500"
          >
            Search
          </button>
        </form>

        <div className="flex flex-wrap gap-3 justify-center">
          <Link
            href="/"
            className="bg-stone-800 text-white px-6 py-3 rounded-lg font-medium hover:bg-stone-700 transition-colors"
          >
            Go home
          </Link>
          <Link
            href="/shop"
            className="border border-stone-300 text-stone-700 px-6 py-3 rounded-lg font-medium hover:bg-stone-50 transition-colors"
          >
            Browse the catalog
          </Link>
        </div>
      </div>

      <section aria-labelledby="popular-404" className="mt-12">
        <h2
          id="popular-404"
          className="text-2xl font-serif text-stone-800 mb-4 text-center"
        >
          Or start with a category
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {FALLBACK_CATEGORIES.map((c) => (
            <Link
              key={c.slug}
              href={`/shop?category=${c.slug}`}
              className="bg-white rounded-xl border border-stone-200 p-6 text-center hover:border-stone-300 transition-colors"
            >
              <p className="font-serif text-lg text-stone-800">{c.name}</p>
              <p className="text-sm text-stone-500 mt-1">Shop {c.name.toLowerCase()}</p>
            </Link>
          ))}
        </div>
      </section>
    </div>
  )
}
