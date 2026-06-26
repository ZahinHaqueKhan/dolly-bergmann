'use client'

import { useEffect } from 'react'
import Link from 'next/link'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Surface the error to the browser console for debugging.
    console.error('Unhandled error:', error)
  }, [error])

  return (
    <div className="max-w-2xl mx-auto px-4 py-16 text-center">
      <p className="text-rose-500 font-medium uppercase tracking-wider text-sm mb-3">
        Something went wrong
      </p>
      <h1 className="text-3xl font-serif text-stone-800 mb-3">
        We hit an unexpected error
      </h1>
      <p className="text-stone-600 mb-6">
        We&apos;ve been notified. You can try again, or head back to the
        homepage.
      </p>
      {error.digest && (
        <p className="text-xs text-stone-400 mb-6 font-mono">
          Reference: {error.digest}
        </p>
      )}
      <div className="flex flex-wrap gap-3 justify-center">
        <button
          type="button"
          onClick={reset}
          className="bg-stone-800 text-white px-6 py-3 rounded-lg font-medium hover:bg-stone-700 transition-colors"
        >
          Try again
        </button>
        <Link
          href="/"
          className="border border-stone-300 text-stone-700 px-6 py-3 rounded-lg font-medium hover:bg-stone-50 transition-colors"
        >
          Go home
        </Link>
      </div>
    </div>
  )
}
