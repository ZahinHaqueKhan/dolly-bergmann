'use client'
import Link from 'next/link'
import Image from 'next/image'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { useAuthStore } from '@/store/auth'
import { useWishlistStore } from '@/store/wishlist'
import { getWishlist, type WishlistItem as WishlistItemApi } from '@/lib/api'

export const dynamic = 'force-dynamic'

export default function WishlistPage() {
  const router = useRouter()
  const user = useAuthStore((s) => s.user)
  const authStatus = useAuthStore((s) => s.status)
  const hydrateAuth = useAuthStore((s) => s.hydrate)
  const hydrateWishlist = useWishlistStore((s) => s.hydrate)
  const wishlistStatus = useWishlistStore((s) => s.status)
  const removeFromLocal = useWishlistStore((s) => s.remove)
  const [items, setItems] = useState<WishlistItemApi[] | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (authStatus === 'idle') {
      void hydrateAuth()
    }
  }, [authStatus, hydrateAuth])

  useEffect(() => {
    if (authStatus === 'unauthenticated') {
      router.replace('/account/login?next=/account/wishlist')
    }
  }, [authStatus, router])

  useEffect(() => {
    if (authStatus !== 'authenticated') return
    let cancelled = false
    const load = async () => {
      setLoading(true)
      try {
        const { items } = await getWishlist()
        if (!cancelled) setItems(items)
      } catch {
        if (!cancelled) setItems([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    // Also trigger the store hydration so the heart icons on /shop reflect
    // the loaded list immediately.
    if (wishlistStatus === 'idle') {
      void hydrateWishlist()
    }
    return () => {
      cancelled = true
    }
  }, [authStatus, wishlistStatus, hydrateWishlist])

  const handleRemove = async (productId: number) => {
    try {
      await removeFromLocal(productId)
      setItems((prev) => (prev ? prev.filter((i) => i.product_id !== productId) : prev))
      toast.success('Removed from wishlist')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not remove item'
      toast.error(message)
    }
  }

  if (authStatus === 'loading' || authStatus === 'idle' || !user) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-12">
        <p className="text-stone-500">Loading...</p>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-12">
        <p className="text-stone-500">Loading your wishlist...</p>
      </div>
    )
  }

  const list = items ?? []

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-serif text-stone-800">Wishlist</h1>
        <p className="text-stone-500 text-sm mt-1">
          {list.length === 0
            ? 'You have not saved any items yet.'
            : `${list.length} item${list.length === 1 ? '' : 's'} saved.`}
        </p>
      </div>

      {list.length === 0 ? (
        <div className="bg-white rounded-xl border border-stone-200 p-12 text-center">
          <svg
            className="w-12 h-12 text-stone-300 mx-auto mb-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.5"
              d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"
            />
          </svg>
          <h2 className="font-serif text-lg text-stone-800 mb-2">No saved items</h2>
          <p className="text-stone-500 text-sm mb-6">
            Tap the heart on any product to save it for later.
          </p>
          <Link
            href="/shop"
            className="inline-block bg-stone-800 text-white px-6 py-3 rounded-lg font-medium hover:bg-stone-700 transition-colors"
          >
            Browse the shop
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {list.map((item) => (
            <div key={item.id} className="group">
              <Link
                href={`/product/${item.slug}`}
                className="block aspect-[3/4] relative overflow-hidden rounded-lg bg-stone-100 mb-3"
              >
                {item.image ? (
                  <Image
                    src={item.image}
                    alt={item.name}
                    fill
                    className="object-cover group-hover:scale-105 transition-transform duration-300"
                    sizes="(max-width: 768px) 50vw, 25vw"
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center text-stone-400">
                    No image
                  </div>
                )}
              </Link>
              <h3 className="text-stone-800 font-medium text-sm">
                <Link href={`/product/${item.slug}`} className="hover:text-stone-900">
                  {item.name}
                </Link>
              </h3>
              <p className="text-stone-600 text-sm">${item.min_price.toFixed(2)}</p>
              <button
                onClick={() => void handleRemove(item.product_id)}
                className="mt-2 text-xs text-stone-400 hover:text-stone-600 transition-colors"
                type="button"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
