import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'

const API_BASE_URL =
  process.env.BACKEND_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  'http://127.0.0.1:8000'

function genSessionId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return 'sess-' + Math.random().toString(36).slice(2) + Date.now().toString(36)
}

export async function POST(req: NextRequest) {
  try {
    const { message } = await req.json()
    if (!message || typeof message !== 'string') {
      return NextResponse.json(
        { error: 'message is required' },
        { status: 400 }
      )
    }

    // Generate or reuse a session id, then persist it in a cookie
    // so successive requests from the same browser share a session.
    const cookieStore = await cookies()
    let sessionId = cookieStore.get('chatbot_session_id')?.value
    const isNewSession = !sessionId
    if (!sessionId) {
      sessionId = genSessionId()
    }

    // Forward the cookie header (for authenticated chat). The browser
    // will include both auth cookies AND the new chatbot_session_id
    // on the upstream request.
    const cookieHeader = cookieStore
      .getAll()
      .map((c) => `${c.name}=${c.value}`)
      .join('; ')

    const upstream = await fetch(`${API_BASE_URL}/api/chatbot`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(cookieHeader ? { cookie: cookieHeader } : {}),
        'X-Session-Id': sessionId,
      },
      body: JSON.stringify({ message }),
      // Don't follow redirects; pass through the status.
    })

    // Read the upstream body (once).
    const data = await upstream.json().catch(() => ({}))

    const response = NextResponse.json(
      {
        response: data.response ?? null,
        sources: data.sources ?? [],
        prompt_version: data.prompt_version,
        pii_detected: data.pii_detected,
        is_refusal: data.is_refusal,
        blocked_intent: data.blocked_intent,
        session_id: sessionId,
      },
      { status: upstream.ok ? 200 : upstream.status }
    )

    if (isNewSession) {
      response.cookies.set('chatbot_session_id', sessionId, {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        maxAge: 60 * 60 * 24 * 30, // 30 days
      })
    }

    return response
  } catch {
    return NextResponse.json(
      {
        response:
          "I'm sorry, our AI assistant is temporarily unavailable. Please email support@modestwear.com.",
        sources: [],
        pii_detected: false,
        is_refusal: false,
        blocked_intent: null,
      },
      { status: 200 }
    )
  }
}

export async function GET() {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 })
}
