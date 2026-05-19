'use client'
import Link from 'next/link'
import Image from 'next/image'
import { useCartStore } from '@/store/cart'
import toast from 'react-hot-toast'

interface Product {
  id: number
  name: string
  slug: string
  price: number
  images: string[]
  category?: string
}

export default function ProductCard({ product }: { product: Product }) {
  const addItem = useCartStore((s) => s.addItem)

  const handleAddToCart = (e: React.MouseEvent) => {
    e.preventDefault()
    addItem({ variant_id: product.id, product_name: product.name, size: '', color: '', price: product.price, quantity: 1, image: product.images[0] || '' })
    toast.success('Added to cart')
  }

  return (
    <Link href={`/product/${product.slug}`} className="group block">
      <div className="aspect-[3/4] relative overflow-hidden rounded-lg bg-stone-100 mb-3">
        {product.images[0] ? (
          <Image src={product.images[0]} alt={product.name} fill className="object-cover group-hover:scale-105 transition-transform duration-300" sizes="(max-width: 768px) 50vw, 25vw" />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-stone-400">No image</div>
        )}
        <button onClick={handleAddToCart} className="absolute bottom-3 right-3 bg-white/90 backdrop-blur p-2 rounded-full shadow opacity-0 group-hover:opacity-100 transition-opacity hover:bg-white">
          <svg className="w-5 h-5 text-stone-700" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"/></svg>
        </button>
      </div>
      <h3 className="text-stone-800 font-medium text-sm">{product.name}</h3>
      <p className="text-stone-600 text-sm">${product.price}</p>
    </Link>
  )
}