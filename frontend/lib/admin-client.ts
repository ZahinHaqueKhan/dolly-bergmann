// lib/admin-client.ts
//
// Client-side helpers for the admin form. The browser sends the
// httpOnly auth cookies automatically (credentials: 'include') so we
// don't need to read them ourselves.

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000'

export class AdminClientError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
    this.name = 'AdminClientError'
  }
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    credentials: 'include',
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new AdminClientError(
      `${init.method ?? 'GET'} ${path} -> ${res.status}: ${text || '(no body)'}`,
      res.status,
    )
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

export function adminClientPost<T>(path: string, body: unknown): Promise<T> {
  return call<T>(path, { method: 'POST', body: JSON.stringify(body) })
}

export function adminClientPut<T>(path: string, body: unknown): Promise<T> {
  return call<T>(path, { method: 'PUT', body: JSON.stringify(body) })
}

export function adminClientDelete(path: string): Promise<void> {
  return call<void>(path, { method: 'DELETE' })
}

export interface UploadResult {
  url: string
  bytes: number
  content_type: string
}

export async function adminClientUpload(file: File): Promise<UploadResult> {
  const form = new FormData()
  form.append('file', file)
  const res = await fetch(`${API_BASE_URL}/api/uploads`, {
    method: 'POST',
    credentials: 'include',
    body: form,
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new AdminClientError(
      `POST /api/uploads -> ${res.status}: ${text || '(no body)'}`,
      res.status,
    )
  }
  return res.json() as Promise<UploadResult>
}
