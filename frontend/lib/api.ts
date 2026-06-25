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
function cartHeaders(sessionId?: string): Record<string, string> {
  return sessionId ? { 'X-Session-Id': sessionId } : {}
}

export async function getCart(sessionId?: string) {
  return fetchApi('/api/cart', { headers: cartHeaders(sessionId) })
}

export async function addToCart(variantId: number, quantity: number = 1, sessionId?: string) {
  return fetchApi('/api/cart/items', {
    method: 'POST',
    body: { variant_id: variantId, quantity },
    headers: cartHeaders(sessionId),
  })
}

export async function updateCartItem(itemId: number, quantity: number, sessionId?: string) {
  return fetchApi(`/api/cart/items/${itemId}`, {
    method: 'PUT',
    body: { quantity },
    headers: cartHeaders(sessionId),
  })
}

export async function removeFromCart(itemId: number, sessionId?: string) {
  return fetchApi(`/api/cart/items/${itemId}`, {
    method: 'DELETE',
    headers: cartHeaders(sessionId),
  })
}

export async function clearCart(sessionId?: string) {
  return fetchApi('/api/cart', {
    method: 'DELETE',
    headers: cartHeaders(sessionId),
  })
}

// Checkout
export async function createCheckoutSession(data: {
  shipping_address: Record<string, unknown>
  coupon_code?: string
}) {
  return fetchApi('/api/checkout', {
    method: 'POST',
    body: data,
  })
}

// Orders
export async function getOrders() {
  return fetchApi('/api/orders')
}

export async function getOrder(orderId: number) {
  return fetchApi(`/api/orders/${orderId}`)
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
