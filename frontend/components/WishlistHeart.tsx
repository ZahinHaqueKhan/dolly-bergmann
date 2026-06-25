'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { useAuthStore } from '@/store/auth'
import { useWishlistStore } from '@/store/wishlist'

export default function WishlistHeart({ productId }: { productId: number }) {
  const router = useRouter()
  const user = useAuthStore((s) => s.user)
  const authStatus = useAuthStore((s) => s.status)
  const saved = useWishlistStore((s) => s.isSaved(productId))
  const toggle = useWishlistStore((s) => s.toggle)
  const status = useWishlistStore((s) => s.status)
  const hydrate = useWishlistStore((s) => s.hydrate)

  useEffect(() => {
    if (authStatus === 'authenticated' && status === 'idle') {
      void hydrate()
    }
  }, [authStatus, status, hydrate])

  const onClick = async () => {
    if (!user) {
      router.push('/account/login?next=' + encodeURIComponent(window.location.pathname))
      return
    }
    try {
      const nowSaved = await toggle(productId)
      toast.success(nowSaved ? 'Saved to wishlist' : 'Removed from wishlist')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not update wishlist'
      toast.error(message)
    }
  }

  return (
    <button
      onClick={onClick}
      type="button"
      aria-label={saved ? 'Remove from wishlist' : 'Save to wishlist'}
      aria-pressed={saved}
      className="w-full border border-stone-300 text-stone-700 py-4 rounded-full font-medium hover:bg-stone-50 transition-colors flex items-center justify-center gap-2"
    >
      <svg
        className={`w-5 h-5 ${saved ? 'text-rose-500' : 'text-stone-700'}`}
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
      {saved ? 'Saved to wishlist' : 'Add to Wishlist'}
    </button>
  )
}
