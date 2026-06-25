import { adminGet, ServerAuthError } from '@/lib/server-fetch'
import CouponsClient from './CouponsClient'

export const dynamic = 'force-dynamic'

export interface AdminCoupon {
  id: number
  code: string
  discount_type: string
  discount_value: number
  min_order_value: number
  starts_at: string
  ends_at: string | null
  usage_limit: number | null
  per_user_limit: number | null
  used_count: number
  is_active: boolean
  created_at: string
  is_valid: boolean
}

export default async function AdminCouponsPage() {
  let coupons: AdminCoupon[] = []
  let loadError: string | null = null
  try {
    coupons = await adminGet<AdminCoupon[]>('/api/admin/coupons')
  } catch (err) {
    if (err instanceof ServerAuthError) loadError = err.message
    else throw err
  }

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-serif text-stone-800">Coupons</h1>
      </div>
      {loadError ? (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
          {loadError}
        </div>
      ) : (
        <CouponsClient initial={coupons} />
      )}
    </>
  )
}
