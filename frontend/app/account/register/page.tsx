'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { useAuthStore } from '@/store/auth'

export const dynamic = 'force-dynamic'

const PASSWORD_RE = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/

export default function RegisterPage() {
  const router = useRouter()
  const signUp = useAuthStore((s) => s.signUp)
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const passwordHints: string[] = []
  if (password.length > 0 && password.length < 8) {
    passwordHints.push('at least 8 characters')
  }
  if (password.length > 0 && !/[a-z]/.test(password)) {
    passwordHints.push('a lowercase letter')
  }
  if (password.length > 0 && !/[A-Z]/.test(password)) {
    passwordHints.push('an uppercase letter')
  }
  if (password.length > 0 && !/\d/.test(password)) {
    passwordHints.push('a digit')
  }
  const passwordValid = password.length === 0 || PASSWORD_RE.test(password)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!firstName.trim() || !lastName.trim()) {
      setError('Please enter your first and last name.')
      return
    }
    if (!PASSWORD_RE.test(password)) {
      setError('Password must be at least 8 characters with an uppercase, lowercase, and digit.')
      return
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setSubmitting(true)
    try {
      await signUp({ email, password, first_name: firstName, last_name: lastName })
      toast.success('Welcome to ModestWear!')
      router.push('/account')
      router.refresh()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Registration failed'
      setError(message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="max-w-md mx-auto px-4 py-12">
      <h1 className="text-3xl font-serif text-stone-800 mb-2">Create your account</h1>
      <p className="text-sm text-stone-500 mb-8">
        Save your wishlist, track orders, and check out faster.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="firstName" className="block text-sm font-medium text-stone-700 mb-1">
              First name
            </label>
            <input
              id="firstName"
              name="firstName"
              type="text"
              autoComplete="given-name"
              required
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              className="w-full border border-stone-300 rounded-lg px-4 py-3 text-stone-800 focus:outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500"
            />
          </div>
          <div>
            <label htmlFor="lastName" className="block text-sm font-medium text-stone-700 mb-1">
              Last name
            </label>
            <input
              id="lastName"
              name="lastName"
              type="text"
              autoComplete="family-name"
              required
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              className="w-full border border-stone-300 rounded-lg px-4 py-3 text-stone-800 focus:outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500"
            />
          </div>
        </div>

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
            autoComplete="new-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full border border-stone-300 rounded-lg px-4 py-3 text-stone-800 focus:outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500"
          />
          {passwordHints.length > 0 && !passwordValid && (
            <p className="text-xs text-amber-700 mt-1">
              Password needs: {passwordHints.join(', ')}.
            </p>
          )}
        </div>

        <div>
          <label htmlFor="confirmPassword" className="block text-sm font-medium text-stone-700 mb-1">
            Confirm password
          </label>
          <input
            id="confirmPassword"
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            required
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="w-full border border-stone-300 rounded-lg px-4 py-3 text-stone-800 focus:outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500"
          />
          {confirmPassword && confirmPassword !== password && (
            <p className="text-xs text-red-700 mt-1">Passwords do not match.</p>
          )}
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
          {submitting ? 'Creating account...' : 'Create account'}
        </button>

        <p className="text-xs text-stone-400 text-center">
          By creating an account, you agree to our terms and privacy policy.
        </p>
      </form>

      <p className="text-center text-sm text-stone-500 mt-6">
        Already have an account?{' '}
        <Link href="/account/login" className="text-rose-500 hover:text-rose-600 hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  )
}
