// lib/server-fetch.ts
//
// Server-only fetch helpers that read the httpOnly auth cookies via
// next/headers. Used by /admin/* server components for the auth-gate
// check, dashboard fetch, products list, etc.
//
// Do NOT import this from a client component — it uses next/headers.

import { cookies } from 'next/headers'

const API_BASE_URL = process.env.BACKEND_URL || process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000'

export interface AdminUser {
  id: number
  email: string
  first_name: string | null
  last_name: string | null
  role: 'customer' | 'wholesale' | 'admin'
  is_active: boolean
  created_at: string
}

export class ServerAuthError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
    this.name = 'ServerAuthError'
  }
}

export async function backendFetch(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const cookieStore = await cookies()
  const cookieHeader = cookieStore
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join('; ')
  return fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
      ...(cookieHeader ? { cookie: cookieHeader } : {}),
    },
    cache: 'no-store',
  })
}

/**
 * Return the current admin user, or null if the visitor is anonymous
 * or not an admin. Does NOT throw — the caller decides whether to
 * redirect to /account/login.
 */
export async function getAdminUser(): Promise<AdminUser | null> {
  const res = await backendFetch('/api/auth/me')
  if (res.status === 401 || res.status === 403) return null
  if (!res.ok) return null
  const user = (await res.json()) as AdminUser
  if (user.role !== 'admin' || !user.is_active) return null
  return user
}

/**
 * Return the current wholesale user (any state — pending/approved/rejected),
 * or null if not authenticated as a wholesale user. Caller decides what
 * to do based on `approved_at`.
 */
export async function getWholesaleUser(): Promise<AdminUser | null> {
  const res = await backendFetch('/api/auth/me')
  if (res.status === 401 || res.status === 403) return null
  if (!res.ok) return null
  const user = (await res.json()) as AdminUser
  if (user.role !== 'wholesale' || !user.is_active) return null
  return user
}

/**
 * Convenience: do a JSON GET and throw on non-2xx.
 */
export async function adminGet<T>(path: string): Promise<T> {
  const res = await backendFetch(path)
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new ServerAuthError(
      `GET ${path} -> ${res.status}: ${body || '(no body)'}`,
      res.status,
    )
  }
  return res.json() as Promise<T>
}
