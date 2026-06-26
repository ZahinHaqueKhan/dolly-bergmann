'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

type Role = 'user' | 'bot'

interface Message {
  id: string
  role: Role
  text: string
  ts: number
}

const STORAGE_KEY = 'modestwear.chatbot.history.v1'
const MAX_HISTORY = 50
const SESSION_STORAGE_KEY = 'modestwear.chatbot.session.v1'

function genId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return 'msg-' + Math.random().toString(36).slice(2) + Date.now().toString(36)
}

function genSessionId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return 'sess-' + Math.random().toString(36).slice(2) + Date.now().toString(36)
}

function readHistory(): Message[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as Message[]
    if (!Array.isArray(parsed)) return []
    return parsed.slice(-MAX_HISTORY)
  } catch {
    return []
  }
}

function writeHistory(msgs: Message[]): void {
  if (typeof window === 'undefined') return
  try {
    const trimmed = msgs.slice(-MAX_HISTORY)
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed))
  } catch {
    // localStorage may be full or disabled; silently ignore.
  }
}

function readSessionId(): string | null {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage.getItem(SESSION_STORAGE_KEY)
  } catch {
    return null
  }
}

function writeSessionId(s: string): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(SESSION_STORAGE_KEY, s)
  } catch {
    // ignore
  }
}

const GREETING: Message = {
  id: 'greeting',
  role: 'bot',
  text: "Assalamu Alaikum! I'm the ModestWear assistant. Ask me about products, sizing, shipping, returns, or your order status.",
  ts: 0,
}

export default function ChatbotWidget() {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([GREETING])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [sessionId, setSessionId] = useState<string>('')
  const inputRef = useRef<HTMLInputElement | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)
  const closeBtnRef = useRef<HTMLButtonElement | null>(null)
  const messagesEndRef = useRef<HTMLDivElement | null>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)

  // Hydrate from localStorage on mount.
  useEffect(() => {
    const hist = readHistory()
    if (hist.length > 0) {
      setMessages([GREETING, ...hist])
    }
    let sid = readSessionId()
    if (!sid) {
      sid = genSessionId()
      writeSessionId(sid)
    }
    setSessionId(sid)
  }, [])

  // Persist on every change.
  useEffect(() => {
    const persistable = messages.filter((m) => m.id !== 'greeting')
    writeHistory(persistable)
  }, [messages])

  // Auto-scroll to bottom on new messages.
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  // Focus management + escape-to-close when open.
  useEffect(() => {
    if (!open) return
    previousFocusRef.current = document.activeElement as HTMLElement | null
    // Focus the close button so screen readers land on a labeled control.
    setTimeout(() => closeBtnRef.current?.focus(), 0)

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        setOpen(false)
      } else if (e.key === 'Tab' && panelRef.current) {
        // Simple focus trap: cycle within the panel.
        const focusables = panelRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, [tabindex]:not([tabindex="-1"])'
        )
        if (focusables.length === 0) return
        const first = focusables[0]
        const last = focusables[focusables.length - 1]
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      // Restore focus to whatever opened the panel.
      previousFocusRef.current?.focus?.()
    }
  }, [open])

  // Focus the input when the panel finishes its slide-up.
  useEffect(() => {
    if (open) {
      const t = setTimeout(() => inputRef.current?.focus(), 150)
      return () => clearTimeout(t)
    }
  }, [open])

  const sendMessage = useCallback(async () => {
    const text = input.trim()
    if (!text || loading) return
    const userMsg: Message = { id: genId(), role: 'user', text, ts: Date.now() }
    setMessages((m) => [...m, userMsg])
    setInput('')
    setLoading(true)
    try {
      const res = await fetch('/api/chatbot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text }),
        credentials: 'include',
      })
      const data = await res.json().catch(() => ({}))
      const botText =
        data.response ||
        "I'm sorry, I could not understand that. Please try again or email support@modestwear.com."
      const botMsg: Message = {
        id: genId(),
        role: 'bot',
        text: botText,
        ts: Date.now(),
      }
      setMessages((m) => [...m, botMsg])
      if (data.session_id && data.session_id !== sessionId) {
        setSessionId(data.session_id)
        writeSessionId(data.session_id)
      }
    } catch {
      setMessages((m) => [
        ...m,
        {
          id: genId(),
          role: 'bot',
          text: "I'm sorry, I'm having trouble reaching the server. Please try again or email support@modestwear.com.",
          ts: Date.now(),
        },
      ])
    }
    setLoading(false)
  }, [input, loading, sessionId])

  const clearHistory = () => {
    setMessages([GREETING])
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(STORAGE_KEY)
    }
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void sendMessage()
    }
  }

  // Detect prefers-reduced-motion so we can drop transitions.
  const [reduceMotion, setReduceMotion] = useState(false)
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReduceMotion(mq.matches)
    const onChange = () => setReduceMotion(mq.matches)
    mq.addEventListener?.('change', onChange)
    return () => mq.removeEventListener?.('change', onChange)
  }, [])

  // Close on outside click for desktop only.
  const onPanelClick = (e: React.MouseEvent) => {
    // Stop propagation so the panel click doesn't bubble to anything.
    e.stopPropagation()
  }

  return (
    <div className="fixed bottom-6 right-6 z-50">
      {open && (
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="chatbot-title"
          onClick={onPanelClick}
          className={
            // Mobile: full-screen. Desktop: floating panel.
            'bg-white flex flex-col border border-stone-200 shadow-2xl ' +
            'rounded-xl ' +
            (reduceMotion ? '' : 'transition-all') +
            ' ' +
            // Full-screen on <md, panel on md+
            'fixed inset-0 md:inset-auto md:bottom-24 md:right-6 ' +
            'md:w-96 md:h-[36rem] md:mb-0'
          }
        >
          <div className="bg-stone-800 text-white px-4 py-3 md:rounded-t-xl flex justify-between items-center flex-shrink-0">
            <div>
              <h2 id="chatbot-title" className="font-medium text-sm">
                ModestWear Assistant
              </h2>
              <p className="text-[10px] text-stone-300 mt-0.5">
                AI-powered · responses may vary
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={clearHistory}
                className="text-white/70 hover:text-white text-xs px-2 py-1 rounded focus:outline-none focus:ring-1 focus:ring-white"
                aria-label="Clear conversation history"
                title="Clear history"
              >
                Clear
              </button>
              <button
                ref={closeBtnRef}
                type="button"
                onClick={() => setOpen(false)}
                className="text-white/70 hover:text-white focus:outline-none focus:ring-1 focus:ring-white rounded p-1"
                aria-label="Close chat"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
          </div>

          <div
            className="flex-1 overflow-y-auto p-4 space-y-3 bg-stone-50"
            aria-live="polite"
            aria-relevant="additions"
          >
            {messages.map((m) => (
              <div
                key={m.id}
                className={`flex ${
                  m.role === 'user' ? 'justify-end' : 'justify-start'
                }`}
              >
                <div
                  className={
                    'max-w-[85%] px-3 py-2 rounded-lg text-sm ' +
                    (m.role === 'user'
                      ? 'bg-rose-100 text-stone-800'
                      : 'bg-white text-stone-700 border border-stone-200')
                  }
                >
                  {m.role === 'bot' ? (
                    <div className="chatbot-prose text-sm text-stone-700">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {m.text}
                      </ReactMarkdown>
                    </div>
                  ) : (
                    <span className="whitespace-pre-wrap">{m.text}</span>
                  )}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-white border border-stone-200 px-3 py-2 rounded-lg text-sm text-stone-500">
                  <span aria-label="Assistant is typing">
                    <span className="inline-block animate-pulse">●</span>
                    <span
                      className="inline-block animate-pulse ml-0.5"
                      style={{ animationDelay: '0.15s' }}
                    >
                      ●
                    </span>
                    <span
                      className="inline-block animate-pulse ml-0.5"
                      style={{ animationDelay: '0.3s' }}
                    >
                      ●
                    </span>
                  </span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault()
              void sendMessage()
            }}
            className="p-3 border-t border-stone-200 flex gap-2 bg-white md:rounded-b-xl flex-shrink-0"
          >
            <label htmlFor="chatbot-input" className="sr-only">
              Message
            </label>
            <input
              id="chatbot-input"
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Ask about products, orders, sizing…"
              maxLength={500}
              className="flex-1 px-3 py-2 border border-stone-300 rounded-lg text-sm focus:outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500"
              disabled={loading}
              aria-label="Type your message"
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="bg-stone-800 text-white px-3 py-2 rounded-lg text-sm hover:bg-stone-700 disabled:opacity-50 transition-colors"
              aria-label="Send message"
            >
              Send
            </button>
          </form>
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? 'Close chat' : 'Open chat'}
        aria-expanded={open}
        aria-controls={open ? 'chatbot-title' : undefined}
        className={
          'w-14 h-14 bg-rose-500 text-white rounded-full shadow-lg flex items-center justify-center hover:bg-rose-600 focus:outline-none focus:ring-2 focus:ring-rose-500 focus:ring-offset-2 ' +
          (reduceMotion ? '' : 'transition-colors')
        }
      >
        {open ? (
          <svg
            className="w-6 h-6"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        ) : (
          <svg
            className="w-6 h-6"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
            />
          </svg>
        )}
      </button>
    </div>
  )
}
