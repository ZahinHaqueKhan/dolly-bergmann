'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'

interface Variant {
  id: number
  size: string
  color: string
  sku: string
  stock: number
}

interface Product {
  id: number
  name: string
  slug: string
  b2b_min_order_qty: number
  variants: Variant[]
}

const STORAGE_KEY = 'modestwear.wholesale.quote.v1'

interface LocalLine {
  variant_id: number
  quantity: number
  product_name: string
  size: string
  color: string
  sku: string
}

function readLocalQuote(): LocalLine[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as LocalLine[]) : []
  } catch {
    return []
  }
}

function writeLocalQuote(lines: LocalLine[]): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(lines))
}

export function readAndClearLocalQuote(): LocalLine[] {
  const lines = readLocalQuote()
  writeLocalQuote([])
  return lines
}

export default function AddToQuoteButton({ product }: { product: Product }) {
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState<Variant | null>(
    product.variants[0] ?? null
  )
  const [qty, setQty] = useState(product.b2b_min_order_qty || 1)
  const router = useRouter()

  if (product.variants.length === 0) {
    return (
      <p className="text-xs text-stone-400">No variants available</p>
    )
  }

  const minQty = product.b2b_min_order_qty || 1

  const addToQuote = () => {
    if (!selected) return
    if (qty < minQty) {
      toast.error(`Minimum order quantity is ${minQty}`)
      return
    }
    const lines = readLocalQuote()
    const existing = lines.find((l) => l.variant_id === selected.id)
    if (existing) {
      existing.quantity += qty
    } else {
      lines.push({
        variant_id: selected.id,
        quantity: qty,
        product_name: product.name,
        size: selected.size,
        color: selected.color,
        sku: selected.sku,
      })
    }
    writeLocalQuote(lines)
    toast.success('Added to quote')
    setOpen(false)
    // Refresh Header count if we add a global count later. For v1 we
    // just close the modal — the user sees the cart on /wholesale/quote/new.
  }

  const goToNewQuote = () => {
    router.push('/wholesale/quote/new')
  }

  return (
    <>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex-1 bg-stone-800 text-white text-sm font-medium px-3 py-2 rounded-lg hover:bg-stone-700"
        >
          Add to quote
        </button>
        <button
          type="button"
          onClick={goToNewQuote}
          className="text-sm text-stone-500 hover:text-stone-700 px-2"
          title="Open new-quote builder"
        >
          ↗
        </button>
      </div>

      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="bg-white rounded-xl border border-stone-200 max-w-md w-full p-6"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Add to quote"
          >
            <h3 className="font-serif text-lg text-stone-800 mb-1">
              {product.name}
            </h3>
            <p className="text-xs text-stone-500 mb-4">
              Pick a variant and quantity{minQty > 1 ? ` (MOQ ${minQty})` : ''}.
            </p>
            <label className="block text-sm font-medium text-stone-700 mb-1">
              Variant
            </label>
            <select
              value={selected?.id ?? ''}
              onChange={(e) => {
                const v = product.variants.find((vv) => vv.id === Number(e.target.value))
                setSelected(v ?? null)
              }}
              className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm bg-white mb-4 focus:outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500"
            >
              {product.variants.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.size} / {v.color} — SKU {v.sku}
                </option>
              ))}
            </select>
            <label className="block text-sm font-medium text-stone-700 mb-1">
              Quantity
            </label>
            <input
              type="number"
              min={minQty}
              value={qty}
              onChange={(e) => setQty(Math.max(1, Number(e.target.value)))}
              className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm mb-4 focus:outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500"
            />
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="px-3 py-2 border border-stone-300 text-stone-700 text-sm rounded-lg hover:bg-stone-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={addToQuote}
                className="px-3 py-2 bg-stone-800 text-white text-sm rounded-lg hover:bg-stone-700"
              >
                Add
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
