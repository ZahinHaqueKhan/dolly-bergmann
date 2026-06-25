'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import {
  adminClientPost,
  adminClientPut,
  adminClientDelete,
  AdminClientError,
} from '@/lib/admin-client'
import type { AdminCoupon } from './page'

const DISCOUNT_TYPES = [
  { value: 'percent', label: 'Percent (%)' },
  { value: 'fixed_amount', label: 'Fixed amount (cents)' },
  { value: 'free_shipping', label: 'Free shipping' },
]

type Mode = 'list' | 'create' | 'edit'

export default function CouponsClient({ initial }: { initial: AdminCoupon[] }) {
  const router = useRouter()
  const [mode, setMode] = useState<Mode>('list')
  const [editing, setEditing] = useState<AdminCoupon | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Form state
  const [code, setCode] = useState('')
  const [discountType, setDiscountType] = useState<'percent' | 'fixed_amount' | 'free_shipping'>('percent')
  const [discountValue, setDiscountValue] = useState('')
  const [minOrderValue, setMinOrderValue] = useState('0')
  const [startsAt, setStartsAt] = useState(new Date().toISOString().slice(0, 16))
  const [endsAt, setEndsAt] = useState('')
  const [usageLimit, setUsageLimit] = useState('')
  const [perUserLimit, setPerUserLimit] = useState('')
  const [isActive, setIsActive] = useState(true)

  const startCreate = () => {
    setEditing(null)
    setCode('')
    setDiscountType('percent')
    setDiscountValue('')
    setMinOrderValue('0')
    setStartsAt(new Date().toISOString().slice(0, 16))
    setEndsAt('')
    setUsageLimit('')
    setPerUserLimit('')
    setIsActive(true)
    setError(null)
    setMode('create')
  }

  const startEdit = (c: AdminCoupon) => {
    setEditing(c)
    setCode(c.code)
    setDiscountType(c.discount_type as 'percent' | 'fixed_amount' | 'free_shipping')
    setDiscountValue(String(c.discount_value))
    setMinOrderValue(String(c.min_order_value / 100))
    setStartsAt(c.starts_at.slice(0, 16))
    setEndsAt(c.ends_at ? c.ends_at.slice(0, 16) : '')
    setUsageLimit(c.usage_limit ? String(c.usage_limit) : '')
    setPerUserLimit(c.per_user_limit ? String(c.per_user_limit) : '')
    setIsActive(c.is_active)
    setError(null)
    setMode('edit')
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const valueNum = discountType === 'free_shipping' ? 0 : Number(discountValue)
      const body: Record<string, unknown> = {
        code: code.trim(),
        discount_type: discountType,
        discount_value: valueNum,
        min_order_value: Math.round(Number(minOrderValue || '0') * 100),
        starts_at: new Date(startsAt).toISOString(),
        ends_at: endsAt ? new Date(endsAt).toISOString() : null,
        usage_limit: usageLimit ? Number(usageLimit) : null,
        per_user_limit: perUserLimit ? Number(perUserLimit) : null,
        is_active: isActive,
      }
      if (editing) {
        await adminClientPut(`/api/admin/coupons/${editing.id}`, body)
        toast.success('Coupon updated')
      } else {
        await adminClientPost('/api/admin/coupons', body)
        toast.success('Coupon created')
      }
      setMode('list')
      router.refresh()
    } catch (e) {
      const msg = e instanceof AdminClientError ? e.message : String(e)
      setError(msg)
    } finally {
      setSubmitting(false)
    }
  }

  const del = async (c: AdminCoupon) => {
    if (!confirm(`Delete coupon ${c.code}? This cannot be undone.`)) return
    try {
      await adminClientDelete(`/api/admin/coupons/${c.id}`)
      toast.success('Coupon deleted')
      router.refresh()
    } catch (e) {
      const msg = e instanceof AdminClientError ? e.message : String(e)
      toast.error(msg)
    }
  }

  if (mode === 'create' || mode === 'edit') {
    return (
      <form onSubmit={submit} className="space-y-4 max-w-2xl" noValidate>
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
            {error}
          </div>
        )}
        <div className="bg-white rounded-xl border border-stone-200 p-6 space-y-4">
          <h2 className="font-serif text-lg text-stone-800">
            {mode === 'edit' ? `Edit ${editing?.code}` : 'New coupon'}
          </h2>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1">Code</label>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                required
                className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500"
                placeholder="SUMMER20"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1">Type</label>
              <select
                value={discountType}
                onChange={(e) => setDiscountType(e.target.value as typeof discountType)}
                className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500"
              >
                {DISCOUNT_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            {discountType !== 'free_shipping' && (
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-1">
                  Value {discountType === 'percent' ? '(%)' : '(cents)'}
                </label>
                <input
                  type="number"
                  min={discountType === 'percent' ? 1 : 1}
                  max={discountType === 'percent' ? 100 : 1_000_000}
                  value={discountValue}
                  onChange={(e) => setDiscountValue(e.target.value)}
                  required
                  className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500"
                />
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1">
                Min order (USD)
              </label>
              <input
                type="number"
                min={0}
                step="0.01"
                value={minOrderValue}
                onChange={(e) => setMinOrderValue(e.target.value)}
                className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1">Starts at</label>
              <input
                type="datetime-local"
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
                required
                className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1">
                Ends at <span className="text-stone-400 font-normal">(optional)</span>
              </label>
              <input
                type="datetime-local"
                value={endsAt}
                onChange={(e) => setEndsAt(e.target.value)}
                className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1">
                Usage limit <span className="text-stone-400 font-normal">(global, optional)</span>
              </label>
              <input
                type="number"
                min={1}
                value={usageLimit}
                onChange={(e) => setUsageLimit(e.target.value)}
                className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1">
                Per-user limit <span className="text-stone-400 font-normal">(optional)</span>
              </label>
              <input
                type="number"
                min={1}
                value={perUserLimit}
                onChange={(e) => setPerUserLimit(e.target.value)}
                className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500"
              />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-stone-700">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="rounded border-stone-300"
            />
            <span>Active</span>
          </label>
        </div>
        <div className="flex gap-3 justify-end">
          <button
            type="button"
            onClick={() => setMode('list')}
            className="px-4 py-2 border border-stone-300 text-stone-700 rounded-lg text-sm font-medium hover:bg-stone-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="px-4 py-2 bg-stone-800 text-white rounded-lg text-sm font-medium hover:bg-stone-700 disabled:opacity-50"
          >
            {submitting ? 'Saving…' : mode === 'edit' ? 'Save changes' : 'Create coupon'}
          </button>
        </div>
      </form>
    )
  }

  return (
    <>
      <div className="flex justify-end mb-4">
        <button
          onClick={startCreate}
          className="bg-stone-800 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-stone-700"
        >
          + New coupon
        </button>
      </div>
      {initial.length === 0 ? (
        <div className="bg-white rounded-xl border border-stone-200 p-8 text-center text-stone-500">
          No coupons yet. Create your first one.
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-stone-200 bg-stone-50">
                  <th className="text-left py-3 px-4 text-stone-500 font-medium">Code</th>
                  <th className="text-left py-3 px-4 text-stone-500 font-medium">Type</th>
                  <th className="text-left py-3 px-4 text-stone-500 font-medium">Value</th>
                  <th className="text-left py-3 px-4 text-stone-500 font-medium">Window</th>
                  <th className="text-left py-3 px-4 text-stone-500 font-medium">Used / limit</th>
                  <th className="text-left py-3 px-4 text-stone-500 font-medium">Status</th>
                  <th className="text-left py-3 px-4 text-stone-500 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {initial.map((c) => (
                  <tr key={c.id} className="border-b border-stone-100 hover:bg-stone-50">
                    <td className="py-3 px-4 font-mono text-stone-800 font-medium">{c.code}</td>
                    <td className="py-3 px-4 text-stone-600">
                      {c.discount_type === 'percent'
                        ? 'Percent'
                        : c.discount_type === 'fixed_amount'
                        ? 'Fixed amount'
                        : c.discount_type === 'free_shipping'
                        ? 'Free shipping'
                        : c.discount_type}
                    </td>
                    <td className="py-3 px-4 text-stone-600">
                      {c.discount_type === 'percent'
                        ? `${c.discount_value}%`
                        : c.discount_type === 'fixed_amount'
                        ? `$${(c.discount_value / 100).toFixed(2)}`
                        : '—'}
                    </td>
                    <td className="py-3 px-4 text-stone-600 text-xs">
                      {c.starts_at.slice(0, 10)} → {c.ends_at ? c.ends_at.slice(0, 10) : '∞'}
                    </td>
                    <td className="py-3 px-4 text-stone-600">
                      {c.used_count}
                      {c.usage_limit ? ` / ${c.usage_limit}` : ''}
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`px-2 py-1 rounded-full text-xs font-medium ${
                          c.is_valid
                            ? 'bg-green-100 text-green-700'
                            : c.is_active
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-stone-100 text-stone-600'
                        }`}
                      >
                        {c.is_valid ? 'valid' : c.is_active ? 'scheduled/expired' : 'disabled'}
                      </span>
                    </td>
                    <td className="py-3 px-4 flex gap-3">
                      <button
                        onClick={() => startEdit(c)}
                        className="text-rose-500 hover:underline text-sm"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => del(c)}
                        className="text-stone-500 hover:text-red-500 text-sm"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  )
}
