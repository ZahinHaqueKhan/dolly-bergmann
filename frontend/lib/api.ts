const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  body?: unknown
  headers?: Record<string, string>
  requiresAuth?: boolean
}

async function fetchApi<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, headers = {}, requiresAuth = false } = options

  const requestHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    ...headers,
  }

  if (requiresAuth) {
    const token = localStorage.getItem('auth_token')
    if (token) {
      requestHeaders['Authorization'] = `Bearer ${token}`
    }
  }

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    method,
    headers: requestHeaders,
    body: body ? JSON.stringify(body) : undefined,
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'An error occurred' }))
    throw new Error(error.detail || `HTTP ${response.status}`)
  }

  return response.json()
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
export async function getCart(sessionId?: string) {
  const headers = sessionId ? { 'X-Session-Id': sessionId } : {}
  return fetchApi('/api/cart', { headers })
}

export async function addToCart(variantId: number, quantity: number = 1, sessionId?: string) {
  const headers = sessionId ? { 'X-Session-Id': sessionId } : {}
  return fetchApi('/api/cart/items', {
    method: 'POST',
    body: { variant_id: variantId, quantity },
    headers,
  })
}

export async function updateCartItem(itemId: number, quantity: number, sessionId?: string) {
  const headers = sessionId ? { 'X-Session-Id': sessionId } : {}
  return fetchApi(`/api/cart/items/${itemId}`, {
    method: 'PUT',
    body: { quantity },
    headers,
  })
}

export async function removeFromCart(itemId: number, sessionId?: string) {
  const headers = sessionId ? { 'X-Session-Id': sessionId } : {}
  return fetchApi(`/api/cart/items/${itemId}`, {
    method: 'DELETE',
    headers,
  })
}

export async function clearCart(sessionId?: string) {
  const headers = sessionId ? { 'X-Session-Id': sessionId } : {}
  return fetchApi('/api/cart', {
    method: 'DELETE',
    headers,
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
    requiresAuth: false,
  })
}

// Orders
export async function getOrders() {
  return fetchApi('/api/orders', { requiresAuth: true })
}

export async function getOrder(orderId: number) {
  return fetchApi(`/api/orders/${orderId}`, { requiresAuth: true })
}

// Auth
export async function login(email: string, password: string) {
  return fetchApi('/api/auth/login', {
    method: 'POST',
    body: { username: email, password },
  })
}

export async function register(data: {
  email: string
  password: string
  first_name: string
  last_name: string
}) {
  return fetchApi('/api/auth/register', {
    method: 'POST',
    body: data,
  })
}

export async function refreshToken() {
  return fetchApi('/api/auth/refresh', {
    method: 'POST',
  })
}

// Chatbot
export async function sendChatbotMessage(message: string, sessionId?: string) {
  const headers = sessionId ? { 'X-Session-Id': sessionId } : {}
  return fetchApi('/api/chatbot', {
    method: 'POST',
    body: { message },
    headers,
  })
}
