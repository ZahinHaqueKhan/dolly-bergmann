'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { wholesaleSignup, getMe } from '@/lib/api'
import { useAuthStore } from '@/store/auth'

export default function WholesaleSignupClient() {
  const router = useRouter()
  const setUser = useAuthStore((s) => s.setUser)
  const [form, setForm] = useState({
    email: '',
    password: '',
    first_name: '',
    last_name: '',
    company_name: '',
    tax_id: '',
    country: '',
    phone: '',
    website: '',
    notes: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const update =
    (key: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value }))

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await wholesaleSignup(form)
      // Pull fresh /me and seed the auth store. The signup endpoint
      // sets the httpOnly cookies for us, so this hydrates the UI.
      const me = await getMe()
      setUser(me)
      toast.success('Application submitted!')
      router.push('/wholesale/pending')
      router.refresh()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Sign up failed'
      setError(msg)
      toast.error(msg)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <div className="grid md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-stone-700 mb-1">
            First name
          </label>
          <input
            type="text"
            required
            value={form.first_name}
            onChange={update('first_name')}
            className="w-full border border-stone-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-stone-700 mb-1">
            Last name
          </label>
          <input
            type="text"
            required
            value={form.last_name}
            onChange={update('last_name')}
            className="w-full border border-stone-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500"
          />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-stone-700 mb-1">
          Email
        </label>
        <input
          type="email"
          autoComplete="email"
          required
          value={form.email}
          onChange={update('email')}
          className="w-full border border-stone-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-stone-700 mb-1">
          Password
        </label>
        <input
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          value={form.password}
          onChange={update('password')}
          className="w-full border border-stone-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500"
        />
        <p className="text-xs text-stone-500 mt-1">
          8+ characters, with at least one uppercase letter, one lowercase
          letter, and one digit.
        </p>
      </div>
      <div>
        <label className="block text-sm font-medium text-stone-700 mb-1">
          Company name
        </label>
        <input
          type="text"
          required
          value={form.company_name}
          onChange={update('company_name')}
          className="w-full border border-stone-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500"
        />
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-stone-700 mb-1">
            Country
          </label>
          <input
            type="text"
            required
            value={form.country}
            onChange={update('country')}
            className="w-full border border-stone-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-stone-700 mb-1">
            Tax ID (optional)
          </label>
          <input
            type="text"
            value={form.tax_id}
            onChange={update('tax_id')}
            className="w-full border border-stone-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500"
          />
        </div>
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-stone-700 mb-1">
            Phone (optional)
          </label>
          <input
            type="tel"
            value={form.phone}
            onChange={update('phone')}
            className="w-full border border-stone-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-stone-700 mb-1">
            Website (optional)
          </label>
          <input
            type="url"
            value={form.website}
            onChange={update('website')}
            placeholder="https://"
            className="w-full border border-stone-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500"
          />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-stone-700 mb-1">
          Notes (optional)
        </label>
        <textarea
          rows={3}
          value={form.notes}
          onChange={update('notes')}
          placeholder="Tell us about your business and the kind of partnership you're looking for."
          className="w-full border border-stone-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500"
        />
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="w-full bg-stone-800 text-white py-3 rounded-lg font-medium hover:bg-stone-700 disabled:opacity-50"
      >
        {submitting ? 'Submitting…' : 'Submit application'}
      </button>

      <p className="text-center text-sm text-stone-500">
        Already a customer?{' '}
        <Link
          href="/account/login"
          className="text-rose-500 hover:text-rose-600 hover:underline"
        >
          Sign in
        </Link>
      </p>
    </form>
  )
}
