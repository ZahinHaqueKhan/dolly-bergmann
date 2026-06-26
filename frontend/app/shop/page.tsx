import type { Metadata } from 'next'
import ShopClient, { type ShopProduct } from './ShopClient'

const API_BASE_URL =
  process.env.BACKEND_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  'http://127.0.0.1:8000'

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || 'https://modestwear.com'

interface ApiVariant {
  id: number
  size: string
  color: string
  price: number
  stock: number
  sku: string
}

interface ApiProduct {
  id: number
  name: string
  slug: string
  description: string
  category_id: number
  images: string[]
  tags: string[]
  variants: ApiVariant[]
}

async function fetchProducts(): Promise<ShopProduct[]> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/products?page_size=100`, {
      next: { revalidate: 60 },
    })
    if (!res.ok) return []
    const data = (await res.json()) as ApiProduct[]
    return data.map((p) => {
      const prices = p.variants.map((v) => v.price).filter((n) => typeof n === 'number')
      const minPriceCents = prices.length ? Math.min(...prices) : 0
      const firstAvailable = p.variants.find((v) => v.stock > 0) ?? p.variants[0]
      return {
        id: p.id,
        name: p.name,
        slug: p.slug,
        price: minPriceCents / 100,
        images: p.images,
        variantCount: p.variants.length,
        firstVariant: firstAvailable
          ? {
              id: firstAvailable.id,
              size: firstAvailable.size,
              color: firstAvailable.color,
              price: firstAvailable.price,
              stock: firstAvailable.stock,
            }
          : null,
      }
    })
  } catch {
    return []
  }
}

export const metadata: Metadata = {
  title: 'Shop Modest Fashion — ModestWear',
  description:
    'Browse our collection of modest dresses, khimar, abaya, and accessories. Free shipping on US orders over $100.',
  alternates: { canonical: `${SITE_URL}/shop` },
  openGraph: {
    title: 'Shop Modest Fashion — ModestWear',
    description:
      'Browse our collection of modest dresses, khimar, abaya, and accessories.',
    type: 'website',
    url: `${SITE_URL}/shop`,
    siteName: 'ModestWear',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Shop Modest Fashion — ModestWear',
    description:
      'Browse our collection of modest dresses, khimar, abaya, and accessories.',
  },
}

export default async function ShopPage() {
  const products = await fetchProducts()

  // JSON-LD ItemList (PLAN §6.2). Limits to first 20 to keep payload
  // reasonable.
  const itemListLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    itemListElement: products.slice(0, 20).map((p, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      url: `${SITE_URL}/product/${p.slug}`,
      name: p.name,
    })),
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      {products.length === 0 ? (
        <section
          aria-live="polite"
          className="bg-white rounded-xl border border-stone-200 p-8 text-center"
        >
          <h1 className="text-2xl font-serif text-stone-800 mb-2">
            No products available right now
          </h1>
          <p className="text-sm text-stone-500">
            Please check back soon — we&apos;re restocking.
          </p>
        </section>
      ) : (
        <>
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListLd) }}
          />
          <ShopClient products={products} />
        </>
      )}
    </div>
  )
}
