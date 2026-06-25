'use client'

import { useState } from 'react'
import toast from 'react-hot-toast'

import { useCartStore } from '@/store/cart'

interface Variant {
  id: number
  size: string
  color: string
  price: number
  stock: number
}

export default function AddToCartButton({ variants }: { variants: Variant[] }) {
  const [selectedId, setSelectedId] = useState<number | null>(variants[0]?.id ?? null)
  const [submitting, setSubmitting] = useState(false)
  const add = useCartStore((s) => s.add)

  const selected = variants.find((v) => v.id === selectedId) ?? null

  async function onAdd() {
    if (!selected) {
      toast.error('Please select a size and color')
      return
    }
    if (selected.stock <= 0) {
      toast.error('Out of stock')
      return
    }
    setSubmitting(true)
    try {
      await add(selected.id, 1)
      toast.success('Added to cart')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not add to cart')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <select
        value={selectedId ?? ''}
        onChange={(e) => setSelectedId(Number(e.target.value))}
        className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm mb-4 focus:border-rose-500 focus:ring-1 focus:ring-rose-500"
        aria-label="Choose a variant"
      >
        {variants.map((v) => (
          <option
            key={v.id}
            value={v.id}
            disabled={v.stock <= 0}
          >
            {v.size} / {v.color} — ${(v.price / 100).toFixed(2)}
            {v.stock <= 0 ? ' (out of stock)' : ''}
          </option>
        ))}
      </select>
      <button
        onClick={onAdd}
        disabled={submitting || !selected || selected.stock <= 0}
        className="w-full bg-stone-800 text-white py-4 rounded-lg font-medium text-lg hover:bg-stone-700 transition-colors disabled:opacity-50"
      >
        {submitting ? 'Adding...' : 'Add to Cart'}
      </button>
    </>
  )
}
