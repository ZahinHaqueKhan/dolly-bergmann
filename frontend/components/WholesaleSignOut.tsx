'use client'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/auth'

export default function WholesaleSignOut() {
  const router = useRouter()
  const signOut = useAuthStore((s) => s.signOut)
  return (
    <button
      type="button"
      onClick={async () => {
        await signOut()
        router.push('/')
        router.refresh()
      }}
      className="text-sm text-stone-500 hover:text-stone-700"
    >
      Sign out
    </button>
  )
}
