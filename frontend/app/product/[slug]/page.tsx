import Image from 'next/image'
import Link from 'next/link'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import AddToCartButton from '@/components/AddToCartButton'
import WishlistHeart from '@/components/WishlistHeart'

const API_BASE_URL =
  process.env.BACKEND_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  'http://127.0.0.1:8000'

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || 'https://modestwear.com'

interface Variant {
  id: number
  size: string
  color: string
  price: number
  stock: number
  sku: string
}

interface Product {
  id: number
  name: string
  slug: string
  description: string
  category_id: number
  images: string[]
  tags: string[]
  meta_title: string | null
  meta_description: string | null
  is_active: boolean
  created_at: string | null
  updated_at: string | null
  variants: Variant[]
}

interface Category {
  id: number
  name: string
  slug: string
}

async function fetchProduct(slug: string): Promise<Product | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/products/${slug}`, {
      next: { revalidate: 60 }, // ISR: 60s (PLAN §6.1)
    })
    if (!res.ok) return null
    return (await res.json()) as Product
  } catch {
    return null
  }
}

async function fetchCategories(): Promise<Category[]> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/categories`, {
      next: { revalidate: 300 },
    })
    if (!res.ok) return []
    return (await res.json()) as Category[]
  } catch {
    return []
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const product = await fetchProduct(slug)
  if (!product) {
    return { title: 'Product not found — ModestWear' }
  }
  const title = product.meta_title || `${product.name} — ModestWear`
  const description =
    product.meta_description || product.description.slice(0, 160)
  const ogImages = product.images.length
    ? product.images
    : [`${SITE_URL}/og-default.png`]
  return {
    title,
    description,
    alternates: {
      canonical: `${SITE_URL}/product/${product.slug}`,
    },
    openGraph: {
      type: 'website',
      title: product.name,
      description,
      url: `${SITE_URL}/product/${product.slug}`,
      siteName: 'ModestWear',
      images: ogImages.map((img) => ({
        url: img,
        alt: product.name,
      })),
    },
    twitter: {
      card: 'summary_large_image',
      title: product.name,
      description,
      images: [ogImages[0]],
    },
  }
}

export default async function ProductPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const [product, categories] = await Promise.all([
    fetchProduct(slug),
    fetchCategories(),
  ])
  if (!product) notFound()

  const category = categories.find((c) => c.id === product.category_id)
  const minPriceCents = product.variants.length
    ? Math.min(...product.variants.map((v) => v.price))
    : 0
  const maxPriceCents = product.variants.length
    ? Math.max(...product.variants.map((v) => v.price))
    : 0
  const inStock = product.variants.some((v) => v.stock > 0)
  const ogImages = product.images.length
    ? product.images
    : [`${SITE_URL}/og-default.png`]

  // JSON-LD: Product + Offer + BreadcrumbList (PLAN §6.1)
  const productLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    description: product.description,
    image: ogImages,
    sku: product.variants[0]?.sku,
    brand: { '@type': 'Brand', name: 'ModestWear' },
    offers: {
      '@type': 'AggregateOffer',
      priceCurrency: 'USD',
      lowPrice: (minPriceCents / 100).toFixed(2),
      highPrice: (maxPriceCents / 100).toFixed(2),
      offerCount: product.variants.length,
      availability: inStock
        ? 'https://schema.org/InStock'
        : 'https://schema.org/OutOfStock',
    },
  }
  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: 'Home',
        item: `${SITE_URL}/`,
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: 'Shop',
        item: `${SITE_URL}/shop`,
      },
      ...(category
        ? [
            {
              '@type': 'ListItem',
              position: 3,
              name: category.name,
              item: `${SITE_URL}/shop?category=${category.slug}`,
            },
          ]
        : []),
      {
        '@type': 'ListItem',
        position: category ? 4 : 3,
        name: product.name,
        item: `${SITE_URL}/product/${product.slug}`,
      },
    ],
  }

  return (
    <div>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(productLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }}
      />
      <div className="max-w-7xl mx-auto px-4 py-8">
        <nav aria-label="Breadcrumb" className="text-sm text-stone-500 mb-6">
          <ol className="flex items-center gap-1 flex-wrap">
            <li>
              <Link href="/" className="hover:text-stone-700">
                Home
              </Link>
            </li>
            <li aria-hidden="true">/</li>
            <li>
              <Link href="/shop" className="hover:text-stone-700">
                Shop
              </Link>
            </li>
            {category && (
              <>
                <li aria-hidden="true">/</li>
                <li>
                  <Link
                    href={`/shop?category=${category.slug}`}
                    className="hover:text-stone-700 capitalize"
                  >
                    {category.name}
                  </Link>
                </li>
              </>
            )}
            <li aria-hidden="true">/</li>
            <li className="text-stone-800" aria-current="page">
              {product.name}
            </li>
          </ol>
        </nav>

        <div className="grid md:grid-cols-2 gap-12">
          <div className="space-y-4">
            <div className="relative aspect-square rounded-xl overflow-hidden bg-stone-100">
              {product.images[0] ? (
                <Image
                  src={product.images[0]}
                  alt={product.name}
                  fill
                  className="object-cover"
                  priority
                  sizes="(max-width: 768px) 100vw, 50vw"
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center text-stone-400">
                  No image
                </div>
              )}
            </div>
            {product.images.length > 1 && (
              <div className="grid grid-cols-4 gap-2">
                {product.images.slice(1, 5).map((img, i) => (
                  <button
                    key={i}
                    type="button"
                    aria-label={`View image ${i + 2}`}
                    className="relative aspect-square rounded-lg overflow-hidden bg-stone-100 border-2 border-transparent hover:border-stone-300 focus:outline-none focus:ring-2 focus:ring-rose-500"
                  >
                    <Image
                      src={img}
                      alt={`${product.name} view ${i + 2}`}
                      fill
                      className="object-cover"
                      sizes="100px"
                    />
                  </button>
                ))}
              </div>
            )}
          </div>

          <div>
            <h1 className="text-3xl font-serif text-stone-800 mb-3">
              {product.name}
            </h1>
            <p className="text-2xl text-stone-700 mb-6">
              ${(minPriceCents / 100).toFixed(2)}
              {maxPriceCents !== minPriceCents && (
                <span className="text-sm text-stone-500 ml-2">
                  {' '}
                  – ${(maxPriceCents / 100).toFixed(2)}
                </span>
              )}
            </p>

            <div className="mb-6">
              <p className="font-medium text-stone-700 mb-2">Variants</p>
              <ul
                className="flex gap-2 flex-wrap"
                aria-label="Available variants"
              >
                {product.variants.map((v) => (
                  <li key={v.id}>
                    <button
                      type="button"
                      className="px-4 py-2 border border-stone-300 rounded-lg text-sm hover:border-stone-500 focus:outline-none focus:ring-2 focus:ring-rose-500 transition-colors disabled:opacity-50"
                      disabled={v.stock <= 0}
                      aria-label={`${v.size}, ${v.color}, ${
                        v.stock > 0 ? 'in stock' : 'out of stock'
                      }`}
                    >
                      {v.size}{' '}
                      <span className="text-stone-500">/ {v.color}</span>
                      {v.stock <= 0 && (
                        <span className="text-stone-400 text-xs ml-1">
                          (out of stock)
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            <AddToCartButton variants={product.variants} />
            <WishlistHeart productId={product.id} />

            <div className="mt-8 space-y-4">
              {[
                { label: 'Free shipping on orders over $100', icon: '🚚' },
                { label: '30-day easy returns', icon: '↩' },
                { label: 'Secure checkout', icon: '🔒' },
              ].map((item) => (
                <div
                  key={item.label}
                  className="flex items-center gap-3 text-sm text-stone-600"
                >
                  <span aria-hidden="true">{item.icon}</span>
                  <span>{item.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-16 border-t border-stone-200 pt-8">
          <h2 className="text-xl font-serif text-stone-800 mb-4">Details</h2>
          <div className="prose prose-stone max-w-2xl text-stone-600">
            <p className="whitespace-pre-line">{product.description}</p>
          </div>
        </div>
      </div>
    </div>
  )
}
