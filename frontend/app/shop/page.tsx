import ShopClient, { type ShopProduct } from './ShopClient'

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

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
      cache: 'no-store',
    })
    if (!res.ok) return []
    const data = (await res.json()) as ApiProduct[]
    return data.map((p) => {
      const prices = p.variants.map((v) => v.price).filter((n) => typeof n === 'number')
      const minPriceCents = prices.length ? Math.min(...prices) : 0
      // Pick the first variant with stock > 0 as the "default" variant
      // the ProductCard can add to cart in one click. If none are in
      // stock, the card will not show the quick-add button.
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

export default async function ShopPage() {
  const products = await fetchProducts()
  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      {products.length === 0 ? (
        <p className="text-stone-500">No products available right now.</p>
      ) : (
        <ShopClient products={products} />
      )}
    </div>
  )
}
