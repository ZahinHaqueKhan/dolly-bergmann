'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import toast from 'react-hot-toast'

import { useCartStore } from '@/store/cart'
import { useAuthStore } from '@/store/auth'
import { useWishlistStore } from '@/store/wishlist'

interface FirstVariant {
  id: number
  size: string
  color: string
  price: number
  stock: number
}

interface Product {
  id: number
  name: string
  slug: string
  price: number
  images: string[]
  category?: string
  firstVariant?: FirstVariant | null
}

export default function ProductCard({ product }: { product: Product }) {
  const addToCart = useCartStore((s) => s.add)
  const saved = useWishlistStore((s) => s.isSaved(product.id))
  const toggle = useWishlistStore((s) => s.toggle)
  const hydrateWishlist = useWishlistStore((s) => s.hydrate)
  const wishlistStatus = useWishlistStore((s) => s.status)
  const authUser = useAuthStore((s) => s.user)
  const authStatus = useAuthStore((s) => s.status)
  const router = useRouter()

  useEffect(() => {
    if (authStatus === 'authenticated' && wishlistStatus === 'idle') {
      void hydrateWishlist()
    }
  }, [authStatus, wishlistStatus, hydrateWishlist])

  const handleAddToCart = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const v = product.firstVariant
    if (!v) {
      // No variant selected yet — go to the product page.
      router.push(`/product/${product.slug}`)
      return
    }
    if (v.stock <= 0) {
      toast.error('Out of stock')
      return
    }
    try {
      await addToCart(v.id, 1)
      toast.success('Added to cart')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not add to cart')
    }
  }

  const handleToggleWishlist = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!authUser) {
      router.push(`/account/login?next=${encodeURIComponent(`/product/${product.slug}`)}`)
      return
    }
    try {
      const nowSaved = await toggle(product.id)
      toast.success(nowSaved ? 'Saved to wishlist' : 'Removed from wishlist')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not update wishlist'
      toast.error(message)
    }
  }

  const canQuickAdd = !!product.firstVariant && product.firstVariant.stock > 0

  return (
    <Link href={`/product/${product.slug}`} className="group block">
      <div className="aspect-[3/4] relative overflow-hidden rounded-lg bg-stone-100 mb-3">
        {product.images[0] ? (
          <Image
            src={product.images[0]}
            alt={product.name}
            fill
            className="object-cover group-hover:scale-105 transition-transform duration-300"
            sizes="(max-width: 768px) 50vw, 25vw"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-stone-400">
            No image
          </div>
        )}

        <button
          onClick={handleToggleWishlist}
          aria-label={saved ? 'Remove from wishlist' : 'Save to wishlist'}
          aria-pressed={saved}
          className="absolute top-3 right-3 bg-white/90 backdrop-blur p-2 rounded-full shadow hover:bg-white transition-colors"
        >
          <svg
            className={`w-5 h-5 ${saved ? 'text-rose-500' : 'text-stone-500'}`}
            fill={saved ? 'currentColor' : 'none'}
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"
            />
          </svg>
        </button>

        {canQuickAdd && (
          <button
            onClick={handleAddToCart}
            className="absolute bottom-3 right-3 bg-white/90 backdrop-blur p-2 rounded-full shadow opacity-0 group-hover:opacity-100 transition-opacity hover:bg-white"
            aria-label="Add to cart"
          >
            <svg
              className="w-5 h-5 text-stone-700"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M12 4v16m8-8H4"
              />
            </svg>
          </button>
        )}
      </div>
      <h3 className="text-stone-800 font-medium text-sm">{product.name}</h3>
      <p className="text-stone-600 text-sm">${product.price.toFixed(2)}</p>
      {!canQuickAdd && product.firstVariant && (
        <p className="text-xs text-stone-400">Out of stock</p>
      )}
    </Link>
  )
}
