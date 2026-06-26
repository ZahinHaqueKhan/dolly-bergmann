import { redirect } from 'next/navigation'
import Link from 'next/link'
import { backendFetch, getWholesaleUser } from '@/lib/server-fetch'
import AddToQuoteButton from '@/components/wholesale/AddToQuoteButton'

export const dynamic = 'force-dynamic'

interface Variant {
  id: number
  size: string
  color: string
  sku: string
  stock: number
  b2b_min_order_qty?: number
}

interface Product {
  id: number
  name: string
  slug: string
  description: string
  images: string[]
  tags: string[]
  variants: Variant[]
  b2b_only: boolean
  b2b_min_order_qty: number
}

export const metadata = {
  title: 'Wholesale Catalog — ModestWear',
  robots: { index: false, follow: false },
}

export default async function WholesaleCatalogPage() {
  const user = await getWholesaleUser()
  if (!user) redirect('/account/login?next=/wholesale')

  // The layout already gates on auth, but we still need to know whether
  // the buyer is approved. Pending/rejected users get the pending page.
  const meRes = await backendFetch('/api/wholesale/me')
  if (meRes.ok) {
    const me = await meRes.json()
    if (me.user?.approved_at == null) {
      redirect('/wholesale/pending')
    }
  }

  // B2B catalog: show ALL active products (both b2b_only=true and
  // b2b_only=false). We pass include_inactive=0 (default) so the
  // public list is filtered to is_active=true.
  const productsRes = await backendFetch('/api/products?page_size=100')
  const products: Product[] = productsRes.ok ? await productsRes.json() : []

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-serif text-stone-800">Catalog</h2>
          <p className="text-sm text-stone-500 mt-1">
            {products.length} products. Click <em>Add to quote</em> to build
            your request, or{' '}
            <Link href="/wholesale/quote/new" className="text-rose-500 hover:underline">
              start a new quote
            </Link>
            .
          </p>
        </div>
        <Link
          href="/wholesale/quote/new"
          className="bg-stone-800 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-stone-700"
        >
          + New quote
        </Link>
      </div>

      {products.length === 0 ? (
        <div className="bg-white rounded-xl border border-stone-200 p-8 text-center text-stone-500">
          No products available right now.
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {products.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      )}
    </>
  )
}

function ProductCard({ product }: { product: Product }) {
  const minQty = product.b2b_min_order_qty || 1
  return (
    <div className="bg-white rounded-xl border border-stone-200 overflow-hidden group">
      <Link href={`/product/${product.slug}`} className="block">
        <div className="aspect-[3/4] relative bg-stone-100 overflow-hidden">
          {product.images[0] ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={product.images[0]}
              alt={product.name}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-stone-400 text-sm">
              No image
            </div>
          )}
          {product.b2b_only && (
            <span className="absolute top-3 left-3 bg-rose-500 text-white text-xs px-2 py-0.5 rounded-full">
              B2B only
            </span>
          )}
        </div>
      </Link>
      <div className="p-4">
        <h3 className="text-sm font-medium text-stone-800 line-clamp-2 mb-1">
          {product.name}
        </h3>
        <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-stone-100 text-stone-600 mb-3">
          Request quote
        </span>
        {minQty > 1 && (
          <p className="text-xs text-stone-500 mb-2">MOQ: {minQty} per variant</p>
        )}
        <AddToQuoteButton product={product} />
      </div>
    </div>
  )
}
