'use client'

import { useState } from 'react'

export interface VariantDraft {
  id?: number
  size: string
  color: string
  price: number // integer cents
  stock: number
  sku: string
  images: string[]
}

const SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL']

export default function VariantEditor({
  value,
  onChange,
}: {
  value: VariantDraft[]
  onChange: (v: VariantDraft[]) => void
}) {
  const [newSize, setNewSize] = useState('M')
  const [newColor, setNewColor] = useState('')
  const [newPrice, setNewPrice] = useState('')
  const [newStock, setNewStock] = useState('')

  const addRow = () => {
    if (!newSize || !newColor || !newPrice) return
    const price = Number(newPrice)
    const stock = Number(newStock || '0')
    if (Number.isNaN(price) || price < 1 || price > 1_000_000) return
    if (Number.isNaN(stock) || stock < 0 || stock > 100_000) return
    onChange([
      ...value,
      { size: newSize, color: newColor, price, stock, sku: '', images: [] },
    ])
    setNewColor('')
    setNewPrice('')
    setNewStock('')
  }

  const updateRow = (idx: number, patch: Partial<VariantDraft>) => {
    onChange(value.map((v, i) => (i === idx ? { ...v, ...patch } : v)))
  }

  const removeRow = (idx: number) => {
    onChange(value.filter((_, i) => i !== idx))
  }

  return (
    <div className="space-y-4">
      {value.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-stone-200 text-stone-500">
                <th className="text-left py-2 px-2 font-medium">Size</th>
                <th className="text-left py-2 px-2 font-medium">Color</th>
                <th className="text-left py-2 px-2 font-medium">Price (cents)</th>
                <th className="text-left py-2 px-2 font-medium">Stock</th>
                <th className="text-left py-2 px-2 font-medium">SKU</th>
                <th className="text-left py-2 px-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {value.map((v, idx) => (
                <tr key={idx} className="border-b border-stone-100">
                  <td className="py-2 px-2">
                    <select
                      value={v.size}
                      onChange={(e) => updateRow(idx, { size: e.target.value })}
                      className="border border-stone-200 rounded px-2 py-1 text-sm bg-white"
                    >
                      {SIZES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-2 px-2">
                    <input
                      type="text"
                      value={v.color}
                      onChange={(e) => updateRow(idx, { color: e.target.value })}
                      className="border border-stone-200 rounded px-2 py-1 text-sm w-24"
                    />
                  </td>
                  <td className="py-2 px-2">
                    <input
                      type="number"
                      min={1}
                      value={v.price}
                      onChange={(e) => updateRow(idx, { price: Number(e.target.value) })}
                      className="border border-stone-200 rounded px-2 py-1 text-sm w-24"
                    />
                  </td>
                  <td className="py-2 px-2">
                    <input
                      type="number"
                      min={0}
                      value={v.stock}
                      onChange={(e) => updateRow(idx, { stock: Number(e.target.value) })}
                      className="border border-stone-200 rounded px-2 py-1 text-sm w-20"
                    />
                  </td>
                  <td className="py-2 px-2">
                    <input
                      type="text"
                      value={v.sku}
                      placeholder="auto"
                      onChange={(e) => updateRow(idx, { sku: e.target.value })}
                      className="border border-stone-200 rounded px-2 py-1 text-sm w-32"
                    />
                  </td>
                  <td className="py-2 px-2">
                    <button
                      type="button"
                      onClick={() => removeRow(idx)}
                      className="text-stone-400 hover:text-red-500"
                      aria-label="Remove variant"
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="grid md:grid-cols-5 gap-2 items-end bg-stone-50 rounded-lg p-3">
        <div>
          <label className="block text-xs text-stone-500 mb-1">Size</label>
          <select
            value={newSize}
            onChange={(e) => setNewSize(e.target.value)}
            className="w-full border border-stone-200 rounded px-2 py-1 text-sm bg-white"
          >
            {SIZES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-stone-500 mb-1">Color</label>
          <input
            type="text"
            value={newColor}
            onChange={(e) => setNewColor(e.target.value)}
            className="w-full border border-stone-200 rounded px-2 py-1 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-stone-500 mb-1">Price (cents)</label>
          <input
            type="number"
            min={1}
            value={newPrice}
            onChange={(e) => setNewPrice(e.target.value)}
            className="w-full border border-stone-200 rounded px-2 py-1 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-stone-500 mb-1">Stock</label>
          <input
            type="number"
            min={0}
            value={newStock}
            onChange={(e) => setNewStock(e.target.value)}
            className="w-full border border-stone-200 rounded px-2 py-1 text-sm"
          />
        </div>
        <button
          type="button"
          onClick={addRow}
          className="px-3 py-1 border border-stone-300 text-stone-700 rounded text-sm font-medium hover:bg-stone-100"
        >
          + Add variant
        </button>
      </div>
    </div>
  )
}
