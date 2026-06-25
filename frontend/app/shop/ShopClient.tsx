'use client'
import { useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import ProductCard from '@/components/ProductCard'

export interface ShopProduct {
  id: number
  name: string
  slug: string
  price: number
  images: string[]
  variantCount?: number
  firstVariant?: {
    id: number
    size: string
    color: string
    price: number
    stock: number
  } | null
}

const STATIC_CATEGORIES = ['dresses', 'khimar', 'abaya', 'sets']

function ShopContent({ products }: { products: ShopProduct[] }) {
  const [category, setCategory] = useState('')
  const [sort, setSort] = useState('newest')
  const [page, setPage] = useState(1)
  const searchParams = useSearchParams()

  const initialCategory = searchParams.get('category') || ''
  const [filteredCategory] = useState(initialCategory)
  const displayCategory = filteredCategory || category

  const filtered = displayCategory
    ? products.filter((p) => {
        const name = p.name.toLowerCase()
        if (displayCategory === 'dresses') return name.includes('dress') || name.includes('abaya')
        if (displayCategory === 'khimar') return name.includes('khimar') || name.includes('hijab')
        if (displayCategory === 'abaya') return name.includes('abaya')
        if (displayCategory === 'sets') return name.includes('set')
        return true
      })
    : products

  const sorted = [...filtered].sort((a, b) => {
    if (sort === 'price-low') return a.price - b.price
    if (sort === 'price-high') return b.price - a.price
    return b.id - a.id
  })

  return (
    <div className="flex flex-col md:flex-row gap-8">
      <aside className="md:w-48 flex-shrink-0">
        <h3 className="font-serif text-lg text-stone-800 mb-4">Categories</h3>
        <ul className="space-y-2">
          <li>
            <button
              onClick={() => setCategory('')}
              className={`text-sm ${!displayCategory ? 'text-rose-500 font-medium' : 'text-stone-500 hover:text-stone-700'}`}
            >
              All Products
            </button>
          </li>
          {STATIC_CATEGORIES.map((cat) => (
            <li key={cat}>
              <button
                onClick={() => setCategory(cat)}
                className={`text-sm capitalize ${displayCategory === cat ? 'text-rose-500 font-medium' : 'text-stone-500 hover:text-stone-700'}`}
              >
                {cat}
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <div className="flex-1">
        <div className="flex justify-between items-center mb-6">
          <p className="text-stone-500 text-sm">{sorted.length} products</p>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            className="border border-stone-200 rounded-lg px-3 py-2 text-sm"
          >
            <option value="newest">Newest</option>
            <option value="price-low">Price: Low to High</option>
            <option value="price-high">Price: High to High</option>
          </select>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {sorted.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>

        <div className="flex justify-center gap-2 mt-12">
          {page > 1 && (
            <button
              onClick={() => setPage((p) => p - 1)}
              className="px-4 py-2 border border-stone-200 rounded-lg text-sm hover:bg-stone-100"
            >
              Previous
            </button>
          )}
          <span className="px-4 py-2 text-sm text-stone-500">Page {page}</span>
          {sorted.length === products.length && sorted.length > 0 && (
            <button
              onClick={() => setPage((p) => p + 1)}
              className="px-4 py-2 border border-stone-200 rounded-lg text-sm hover:bg-stone-100"
            >
              Next
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default function ShopClient({ products }: { products: ShopProduct[] }) {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <ShopContent products={products} />
    </Suspense>
  )
}
