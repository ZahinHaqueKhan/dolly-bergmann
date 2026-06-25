import Link from 'next/link'
import { adminGet, ServerAuthError } from '@/lib/server-fetch'

export const dynamic = 'force-dynamic'

interface ProductRow {
  id: number
  name: string
  slug: string
  category_id: number
  is_active: boolean
  images: string[]
  variants: { id: number; size: string; color: string; price: number; stock: number }[]
  tags: string[]
}

interface Category {
  id: number
  name: string
  slug: string
}

interface ProductsPageProps {
  searchParams: Promise<{ page?: string; search?: string; category?: string; status?: string }>
}

export default async function AdminProductsPage({ searchParams }: ProductsPageProps) {
  const sp = await searchParams
  const page = Math.max(1, Number(sp.page ?? '1'))
  const search = sp.search ?? ''
  const category = sp.category ?? ''
  const status = sp.status ?? '' // 'active' | 'inactive' | ''

  const params = new URLSearchParams()
  params.set('include_inactive', '1')
  params.set('page', String(page))
  params.set('page_size', '20')
  if (search) params.set('search', search)
  if (category) params.set('category', category)

  let products: ProductRow[] = []
  let categories: Category[] = []
  let loadError: string | null = null
  try {
    const [pRes, cRes] = await Promise.all([
      adminGet<ProductRow[]>(`/api/products?${params.toString()}`),
      adminGet<Category[]>('/api/categories'),
    ])
    products = pRes
    categories = cRes
  } catch (err) {
    if (err instanceof ServerAuthError) {
      loadError = err.message
    } else {
      throw err
    }
  }

  const filtered = products.filter((p) => {
    if (status === 'active' && !p.is_active) return false
    if (status === 'inactive' && p.is_active) return false
    return true
  })

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-serif text-stone-800">Products</h1>
          <p className="text-stone-500 mt-1 text-sm">
            {filtered.length} of {products.length} loaded
          </p>
        </div>
        <Link
          href="/admin/products/new"
          className="bg-stone-800 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-stone-700"
        >
          + Add Product
        </Link>
      </div>

      <form className="bg-white rounded-xl border border-stone-200 p-4 mb-6 grid md:grid-cols-4 gap-3">
        <input
          type="search"
          name="search"
          defaultValue={search}
          placeholder="Search name or description"
          className="md:col-span-2 border border-stone-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500"
        />
        <select
          name="category"
          defaultValue={category}
          className="border border-stone-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500"
        >
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.slug}>
              {c.name}
            </option>
          ))}
        </select>
        <select
          name="status"
          defaultValue={status}
          className="border border-stone-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500"
        >
          <option value="">All status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
        <button
          type="submit"
          className="md:col-span-4 md:w-auto md:justify-self-start bg-stone-100 text-stone-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-stone-200"
        >
          Apply filters
        </button>
      </form>

      {loadError ? (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
          {loadError}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-stone-200 p-8 text-center text-stone-500">
          No products match the current filters.
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-stone-200 bg-stone-50">
                  <th className="text-left py-3 px-4 text-stone-500 font-medium">Product</th>
                  <th className="text-left py-3 px-4 text-stone-500 font-medium">Category</th>
                  <th className="text-left py-3 px-4 text-stone-500 font-medium">Variants</th>
                  <th className="text-left py-3 px-4 text-stone-500 font-medium">Price</th>
                  <th className="text-left py-3 px-4 text-stone-500 font-medium">Status</th>
                  <th className="text-left py-3 px-4 text-stone-500 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => {
                  const cat = categories.find((c) => c.id === p.category_id)
                  const minPrice = p.variants.length
                    ? Math.min(...p.variants.map((v) => v.price))
                    : 0
                  const totalStock = p.variants.reduce((s, v) => s + v.stock, 0)
                  return (
                    <tr key={p.id} className="border-b border-stone-100 hover:bg-stone-50">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-12 bg-stone-100 rounded overflow-hidden flex-shrink-0">
                            {p.images[0] ? (
                              /* eslint-disable-next-line @next/next/no-img-element */
                              <img
                                src={p.images[0]}
                                alt={p.name}
                                className="w-full h-full object-cover"
                              />
                            ) : null}
                          </div>
                          <div>
                            <p className="font-medium text-stone-800">{p.name}</p>
                            <p className="text-xs text-stone-400">{p.slug}</p>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-stone-600">{cat?.name ?? '—'}</td>
                      <td className="py-3 px-4 text-stone-600">
                        {p.variants.length} ({totalStock} in stock)
                      </td>
                      <td className="py-3 px-4 text-stone-600">
                        {minPrice > 0 ? `$${(minPrice / 100).toFixed(2)}` : '—'}
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`px-2 py-1 rounded-full text-xs font-medium ${
                            p.is_active
                              ? 'bg-green-100 text-green-700'
                              : 'bg-stone-100 text-stone-600'
                          }`}
                        >
                          {p.is_active ? 'active' : 'inactive'}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <Link
                          href={`/admin/products/${p.id}/edit`}
                          className="text-rose-500 hover:underline text-sm"
                        >
                          Edit
                        </Link>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="flex justify-between items-center px-4 py-3 border-t border-stone-100 text-sm text-stone-500">
            <span>Page {page}</span>
            <div className="flex gap-2">
              {page > 1 && (
                <Link
                  href={{
                    pathname: '/admin/products',
                    query: { ...sp, page: String(page - 1) },
                  }}
                  className="px-3 py-1 border border-stone-200 rounded-lg hover:bg-stone-50"
                >
                  ← Prev
                </Link>
              )}
              {products.length === 20 && (
                <Link
                  href={{
                    pathname: '/admin/products',
                    query: { ...sp, page: String(page + 1) },
                  }}
                  className="px-3 py-1 border border-stone-200 rounded-lg hover:bg-stone-50"
                >
                  Next →
                </Link>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
