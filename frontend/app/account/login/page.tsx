'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import toast from 'react-hot-toast'
import { useAuthStore } from '@/store/auth'

export const dynamic = 'force-dynamic'

export default function LoginPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const signIn = useAuthStore((s) => s.signIn)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const redirectTo = searchParams.get('next') || '/account'

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await signIn(email, password)
      toast.success('Welcome back!')
      router.push(redirectTo)
      router.refresh()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Sign in failed'
      setError(message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="max-w-md mx-auto px-4 py-12">
      <h1 className="text-3xl font-serif text-stone-800 mb-2">Sign in</h1>
      <p className="text-sm text-stone-500 mb-8">
        Welcome back. Sign in to view orders, your wishlist, and check out faster.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-stone-700 mb-1">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full border border-stone-300 rounded-lg px-4 py-3 text-stone-800 focus:outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500"
            placeholder="you@example.com"
          />
        </div>

        <div>
          <label htmlFor="password" className="block text-sm font-medium text-stone-700 mb-1">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full border border-stone-300 rounded-lg px-4 py-3 text-stone-800 focus:outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500"
          />
        </div>

        {error && (
          <div role="alert" className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="w-full bg-stone-800 text-white py-3 rounded-lg font-medium hover:bg-stone-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {submitting ? 'Signing in...' : 'Sign in'}
        </button>
      </form>

      <p className="text-center text-sm text-stone-500 mt-6">
        New to ModestWear?{' '}
        <Link href="/account/register" className="text-rose-500 hover:text-rose-600 hover:underline">
          Create an account
        </Link>
      </p>
    </div>
  )
}
