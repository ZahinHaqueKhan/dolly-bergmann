import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const { message } = await req.json()
    if (!message || typeof message !== 'string') {
      return NextResponse.json({ error: 'message is required' }, { status: 400 })
    }

    const sanitized = message.slice(0, 500).replace(/[<>]/g, '')

    const saiaUrl = process.env.SAIA_API_URL || process.env.NEXT_PUBLIC_SAIA_API_URL || 'http://localhost:8001/api'
    const saiaKey = process.env.SAIA_API_KEY || 'dev-key'

    let response = 'Thank you for your message! Our team will respond shortly. For immediate help, please email us at support@modestwear.com'
    let sources: string[] = []

    try {
      const saiaRes = await fetch(`${saiaUrl}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${saiaKey}`,
        },
        body: JSON.stringify({
          message: sanitized,
          context: 'modest_fashion_ecommerce',
        }),
        signal: AbortSignal.timeout(5000),
      })

      if (saiaRes.ok) {
        const data = await saiaRes.json()
        response = data.response || response
        sources = data.sources || []
      }
    } catch {
      response = 'Our AI assistant is temporarily unavailable. For questions about shipping, returns, or sizing, please email support@modestwear.com. We typically respond within 24 hours.'
    }

    return NextResponse.json({ response, sources })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 })
}