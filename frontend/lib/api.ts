const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  body?: unknown
  headers?: Record<string, string>
  requiresAuth?: boolean
  // Internal: signal to fetchWithAuth that this is the refresh request itself
  // (so it does not recurse when the refresh call itself 401s).
  _isRefresh?: boolean
}

class AuthError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
    this.name = 'AuthError'
  }
}

let isRefreshing = false
let refreshSubscribers: Array<() => void> = []

function onRefreshed() {
  refreshSubscribers.forEach((cb) => cb())
  refreshSubscribers = []
}

function subscribeToRefresh(cb: () => void) {
  refreshSubscribers.push(cb)
}

async function attemptRefresh(): Promise<boolean> {
  if (isRefreshing) {
    // Another request is already refreshing — wait for it to finish then
    // retry the original request (which will now have fresh cookies).
    await new Promise<void>((resolve) => subscribeToRefresh(resolve))
    return true
  }
  isRefreshing = true
  try {
    const res = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
    })
    if (!res.ok) return false
    onRefreshed()
    return true
  } catch {
    return false
  } finally {
    isRefreshing = false
  }
}

async function rawFetch<T>(
  endpoint: string,
  options: RequestOptions = {},
  retryOn401: boolean = true
): Promise<T> {
  const { method = 'GET', body, headers = {} } = options

  const requestHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    ...headers,
  }

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    method,
    headers: requestHeaders,
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'include',
  })

  if (response.status === 401 && retryOn401 && !options._isRefresh) {
    // Attempt one silent refresh, then retry. The auth cookies travel in
    // both directions, so a successful refresh sets new cookies and the
    // retry picks them up.
    const refreshed = await attemptRefresh()
    if (refreshed) {
      return rawFetch<T>(endpoint, options, false)
    }
    // Refresh failed — surface as a real 401 so callers can clear state.
  }

  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ detail: 'An error occurred' }))
    throw new AuthError(error.detail || `HTTP ${response.status}`, response.status)
  }

  if (response.status === 204) return undefined as T
  return response.json()
}

async function fetchApi<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
  return rawFetch<T>(endpoint, options, true)
}

// Products
export async function getProducts(params?: {
  category?: string
  min_price?: number
  max_price?: number
  size?: string
  color?: string
  search?: string
  page?: number
  page_size?: number
}) {
  const searchParams = new URLSearchParams()
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        searchParams.append(key, String(value))
      }
    })
  }
  return fetchApi(`/api/products${searchParams.toString() ? `?${searchParams}` : ''}`)
}

export async function getProduct(slug: string) {
  return fetchApi(`/api/products/${slug}`)
}

// Categories
export async function getCategories() {
  return fetchApi('/api/categories')
}

// Cart
export interface CartItem {
  id: number
  variant_id: number
  quantity: number
  product_name: string
  size: string
  color: string
  price: number
  subtotal: number
  stock: number
  image: string | null
}

export interface Cart {
  items: CartItem[]
  total: number
  item_count: number
  session_id: string | null
}

function cartHeaders(sessionId?: string): Record<string, string> {
  return sessionId ? { 'X-Session-Id': sessionId } : {}
}

export async function getCart(sessionId?: string) {
  return fetchApi<Cart>('/api/cart', { headers: cartHeaders(sessionId) })
}

export async function addToCart(variantId: number, quantity: number = 1, sessionId?: string) {
  return fetchApi<Cart>('/api/cart/items', {
    method: 'POST',
    body: { variant_id: variantId, quantity },
    headers: cartHeaders(sessionId),
  })
}

export async function updateCartItem(itemId: number, quantity: number, sessionId?: string) {
  return fetchApi<Cart>(`/api/cart/items/${itemId}`, {
    method: 'PUT',
    body: { quantity },
    headers: cartHeaders(sessionId),
  })
}

export async function removeFromCart(itemId: number, sessionId?: string) {
  return fetchApi<Cart>(`/api/cart/items/${itemId}`, {
    method: 'DELETE',
    headers: cartHeaders(sessionId),
  })
}

export async function clearCart(sessionId?: string) {
  return fetchApi<Cart>('/api/cart', {
    method: 'DELETE',
    headers: cartHeaders(sessionId),
  })
}

// Checkout
export interface CheckoutResponse {
  checkout_url: string
  session_id: string
  total: number
}

export async function createCheckoutSession(data: {
  shipping_address: Record<string, unknown>
  coupon_code?: string
}) {
  return fetchApi<CheckoutResponse>('/api/checkout', {
    method: 'POST',
    body: data,
  })
}

// Orders
export interface OrderListItem {
  id: number
  status: string
  total: number
  created_at: string
  items_count?: number
  items?: { quantity: number }[]
}

export interface OrderDetail extends OrderListItem {
  shipping_address: {
    name?: string
    line1?: string
    line2?: string
    city?: string
    state?: string
    postal_code?: string
    country?: string
    phone?: string
  }
  stripe_session_id: string | null
  stripe_payment_intent_id: string | null
  items: {
    product_name: string
    size: string
    color: string
    quantity: number
    unit_price: number
    subtotal: number
  }[]
}

export async function getOrders() {
  return fetchApi<OrderListItem[]>('/api/orders')
}

export async function getOrder(orderId: number) {
  return fetchApi<OrderDetail>(`/api/orders/${orderId}`)
}

export async function getOrderByStripeSession(stripeSessionId: string) {
  return fetchApi<OrderDetail>(`/api/orders/by-stripe/${stripeSessionId}`)
}

// Auth
//
// These do NOT need credentials: 'include' on the request because
// credentials: 'include' is set unconditionally in rawFetch. They also
// do NOT need any special handling on 401 — auto-refresh runs by
// default, and if /me 401s after a failed refresh that's the correct
// signal that the user is logged out.
export async function login(email: string, password: string) {
  return fetchApi<{
    access_token: string
    refresh_token: string
    token_type: string
    expires_in: number
  }>('/api/auth/login', {
    method: 'POST',
    body: { email, password },
  })
}

export async function register(data: {
  email: string
  password: string
  first_name: string
  last_name: string
}) {
  return fetchApi<{
    access_token: string
    refresh_token: string
    token_type: string
    expires_in: number
  }>('/api/auth/register', {
    method: 'POST',
    body: data,
  })
}

export async function logout() {
  return fetchApi<void>('/api/auth/logout', {
    method: 'POST',
  })
}

export async function getMe() {
  return fetchApi<{
    id: number
    email: string
    first_name: string | null
    last_name: string | null
    role: 'customer' | 'wholesale' | 'admin'
    is_active: boolean
    created_at: string
  }>('/api/auth/me')
}

// Wishlist
export interface WishlistItem {
  id: number
  product_id: number
  name: string
  slug: string
  image: string | null
  min_price: number
  created_at: string
}

export async function getWishlist() {
  return fetchApi<{ items: WishlistItem[] }>('/api/wishlist')
}

export async function toggleWishlist(productId: number) {
  return fetchApi<{ product_id: number; saved: boolean }>('/api/wishlist', {
    method: 'POST',
    body: { product_id: productId },
  })
}

export async function removeFromWishlist(productId: number) {
  return fetchApi<void>(`/api/wishlist/${productId}`, {
    method: 'DELETE',
  })
}

// Chatbot
export async function sendChatbotMessage(message: string, sessionId?: string) {
  return fetchApi('/api/chatbot', {
    method: 'POST',
    body: { message },
    headers: cartHeaders(sessionId),
  })
}

// ---- Wholesale (B2B) ----
//
// Wholesale uses the same auth cookies as the rest of the app, so
// the generic fetchApi() works — no extra headers needed.

export interface WholesaleMe {
  user: {
    id: number
    email: string
    first_name: string | null
    last_name: string | null
    role: 'wholesale'
    company_name: string | null
    tax_id: string | null
    approved_at: string | null
  }
  application: {
    id: number
    status: 'pending' | 'approved' | 'rejected' | 'info_requested'
    rejection_reason: string | null
    created_at: string
  } | null
}

export interface WholesaleQuoteLine {
  id: number
  variant_id: number
  product_name: string
  product_slug: string
  size: string
  color: string
  sku: string
  quantity: number
  unit_price: number | null
  b2b_min_order_qty: number
  line_total: number | null
}

export interface WholesaleQuote {
  id: number
  user_id: number
  user_email: string | null
  user_company: string | null
  status: 'draft' | 'submitted' | 'sent' | 'accepted' | 'declined' | 'expired'
  valid_until: string | null
  shipping_cost: number
  tax: number
  notes: string | null
  admin_notes: string | null
  pdf_path: string | null
  created_at: string
  sent_at: string | null
  responded_at: string | null
  line_items: WholesaleQuoteLine[]
  subtotal: number
  grand_total: number
}

export interface WholesaleOrder {
  id: number
  quote_id: number
  user_id: number
  user_email: string | null
  user_company: string | null
  status:
    | 'awaiting_payment'
    | 'paid'
    | 'processing'
    | 'shipped'
    | 'delivered'
    | 'cancelled'
  payment_status: 'pending' | 'paid' | 'partial'
  paid_at: string | null
  tracking_number: string | null
  shipping_carrier: string | null
  total: number
  created_at: string
  line_items: WholesaleQuoteLine[]
  shipping_cost: number
  tax: number
  valid_until: string | null
  pdf_path: string | null
}

export interface WholesaleApplication {
  id: number
  user_id: number
  user_email: string | null
  company_name: string
  tax_id: string | null
  country: string
  phone: string | null
  website: string | null
  notes: string | null
  status: 'pending' | 'approved' | 'rejected' | 'info_requested'
  rejection_reason: string | null
  decided_by: number | null
  decided_at: string | null
  created_at: string
}

export async function wholesaleSignup(data: {
  email: string
  password: string
  first_name: string
  last_name: string
  company_name: string
  tax_id?: string
  country: string
  phone?: string
  website?: string
  notes?: string
}) {
  return fetchApi<{
    access_token: string
    refresh_token: string
    token_type: string
    expires_in: number
  }>('/api/wholesale/signup', {
    method: 'POST',
    body: data,
  })
}

export async function wholesaleMe() {
  return fetchApi<WholesaleMe>('/api/wholesale/me')
}

export async function listMyQuotes() {
  return fetchApi<WholesaleQuote[]>('/api/wholesale/quotes')
}

export async function createQuote(data: {
  line_items: { variant_id: number; quantity: number }[]
  csv?: string
  notes?: string
}) {
  return fetchApi<WholesaleQuote>('/api/wholesale/quotes', {
    method: 'POST',
    body: data,
  })
}

export async function getQuote(id: number) {
  return fetchApi<WholesaleQuote>(`/api/wholesale/quotes/${id}`)
}

export async function acceptQuote(id: number) {
  return fetchApi<{ order_id: number; status: string; payment_status: string; total: number }>(
    `/api/wholesale/quotes/${id}/accept`,
    { method: 'POST' }
  )
}

export async function declineQuote(id: number) {
  return fetchApi<{ id: number; status: string }>(
    `/api/wholesale/quotes/${id}/decline`,
    { method: 'POST' }
  )
}

export async function listMyOrders() {
  return fetchApi<WholesaleOrder[]>('/api/wholesale/orders')
}

export async function getMyOrder(id: number) {
  return fetchApi<WholesaleOrder>(`/api/wholesale/orders/${id}`)
}

// Admin wholesale helpers
export async function adminListApplications() {
  return fetchApi<WholesaleApplication[]>('/api/admin/wholesale/applications')
}

export async function adminApproveApplication(id: number) {
  return fetchApi<WholesaleApplication>(`/api/admin/wholesale/applications/${id}/approve`, {
    method: 'POST',
  })
}

export async function adminRejectApplication(id: number, reason: string) {
  return fetchApi<WholesaleApplication>(`/api/admin/wholesale/applications/${id}/reject`, {
    method: 'POST',
    body: { reason },
  })
}

export async function adminRequestInfo(id: number, reason: string) {
  return fetchApi<WholesaleApplication>(`/api/admin/wholesale/applications/${id}/request-info`, {
    method: 'POST',
    body: { reason },
  })
}

export async function adminListAllQuotes() {
  return fetchApi<WholesaleQuote[]>('/api/admin/wholesale/quotes')
}

export async function adminGetQuote(id: number) {
  return fetchApi<WholesaleQuote>(`/api/admin/wholesale/quotes/${id}`)
}

export async function adminUpdateQuote(
  id: number,
  data: {
    line_items?: { id: number; unit_price_cents: number }[]
    shipping_cost?: number
    tax?: number
    notes?: string
    admin_notes?: string
    valid_until?: string
  }
) {
  return fetchApi<WholesaleQuote>(`/api/admin/wholesale/quotes/${id}`, {
    method: 'PUT',
    body: data,
  })
}

export async function adminSendQuote(id: number) {
  return fetchApi<{
    id: number
    status: string
    sent_at: string
    valid_until: string
    pdf_path: string
    pdf_is_real_pdf: boolean
  }>(`/api/admin/wholesale/quotes/${id}/send`, { method: 'POST' })
}

export async function adminListAllOrders() {
  return fetchApi<WholesaleOrder[]>('/api/admin/wholesale/orders')
}

export async function adminGetOrder(id: number) {
  return fetchApi<WholesaleOrder>(`/api/admin/wholesale/orders/${id}`)
}

export async function adminMarkOrderPaid(id: number) {
  return fetchApi<WholesaleOrder>(`/api/admin/wholesale/orders/${id}/mark-paid`, {
    method: 'POST',
  })
}

export async function adminUpdateOrderStatus(
  id: number,
  data: {
    status: 'awaiting_payment' | 'paid' | 'processing' | 'shipped' | 'delivered' | 'cancelled'
    tracking_number?: string
    shipping_carrier?: string
  }
) {
  return fetchApi<WholesaleOrder>(`/api/admin/wholesale/orders/${id}/status`, {
    method: 'PUT',
    body: data,
  })
}
