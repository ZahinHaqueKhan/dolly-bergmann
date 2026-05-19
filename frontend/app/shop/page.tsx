'use client'
import { useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import ProductCard from '@/components/ProductCard'

const MOCK_PRODUCTS = [
  { id: 1, name: "Classic Black Khimar", slug: "classic-black-khimar", price: 49, images: ["/products/khimar-black.jpg"], category: "khimar" },
  { id: 2, name: "Beige Maxi Dress", slug: "beige-maxi-dress", price: 129, images: ["/products/dress-beige.jpg"], category: "dresses" },
  { id: 3, name: "Navy Jersey Khimar", slug: "navy-jersey-khimar", price: 39, images: ["/products/khimar-navy.jpg"], category: "khimar" },
  { id: 4, name: "Dusty Rose Abaya", slug: "dusty-rose-abaya", price: 159, images: ["/products/abaya-rose.jpg"], category: "abaya" },
  { id: 5, name: "Sage Green Wrap Dress", slug: "sage-wrap-dress", price: 119, images: ["/products/dress-sage.jpg"], category: "dresses" },
  { id: 6, name: "Chocolate Chiffon Khimar", slug: "chocolate-chiffon-khimar", price: 55, images: ["/products/khimar-chocolate.jpg"], category: "khimar" },
  { id: 7, name: "Olive Casual Dress", slug: "olive-casual-dress", price: 99, images: ["/products/dress-olive.jpg"], category: "dresses" },
  { id: 8, name: "Burgundy Jersey Khimar", slug: "burgundy-jersey-khimar", price: 45, images: ["/products/khimar-burgundy.jpg"], category: "khimar" },
]

function ShopContent() {
  const [products] = useState(MOCK_PRODUCTS)
  const [category, setCategory] = useState('')
  const [sort, setSort] = useState('newest')
  const [page, setPage] = useState(1)
  const searchParams = useSearchParams()

  const initialCategory = searchParams.get('category') || ''
  const [filteredCategory] = useState(initialCategory)

  const displayCategory = filteredCategory || category
  const filtered = displayCategory ? products.filter(p => p.category === displayCategory) : products

  const sorted = [...filtered].sort((a, b) => {
    if (sort === 'price-low') return a.price - b.price
    if (sort === 'price-high') return b.price - a.price
    return b.id - a.id
  })

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="flex flex-col md:flex-row gap-8">
        <aside className="md:w-48 flex-shrink-0">
          <h3 className="font-serif text-lg text-stone-800 mb-4">Categories</h3>
          <ul className="space-y-2">
            <li>
              <button onClick={() => setCategory('')} className={`text-sm ${!displayCategory ? 'text-rose-500 font-medium' : 'text-stone-500 hover:text-stone-700'}`}>
                All Products
              </button>
            </li>
            {['dresses', 'khimar', 'abaya', 'sets'].map(cat => (
              <li key={cat}>
                <button onClick={() => setCategory(cat)} className={`text-sm capitalize ${displayCategory === cat ? 'text-rose-500 font-medium' : 'text-stone-500 hover:text-stone-700'}`}>
                  {cat}
                </button>
              </li>
            ))}
          </ul>
        </aside>

        <div className="flex-1">
          <div className="flex justify-between items-center mb-6">
            <p className="text-stone-500 text-sm">{sorted.length} products</p>
            <select value={sort} onChange={e => setSort(e.target.value)} className="border border-stone-200 rounded-lg px-3 py-2 text-sm">
              <option value="newest">Newest</option>
              <option value="price-low">Price: Low to High</option>
              <option value="price-high">Price: High to Low</option>
            </select>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {sorted.map(p => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>

          <div className="flex justify-center gap-2 mt-12">
            {page > 1 && (
              <button onClick={() => setPage(p => p - 1)} className="px-4 py-2 border border-stone-200 rounded-lg text-sm hover:bg-stone-100">Previous</button>
            )}
            <span className="px-4 py-2 text-sm text-stone-500">Page {page}</span>
            {sorted.length === 8 && (
              <button onClick={() => setPage(p => p + 1)} className="px-4 py-2 border border-stone-200 rounded-lg text-sm hover:bg-stone-100">Next</button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function ShopPage() {
  return (
    <Suspense fallback={<div className="max-w-7xl mx-auto px-4 py-8">Loading...</div>}>
      <ShopContent />
    </Suspense>
  )
}