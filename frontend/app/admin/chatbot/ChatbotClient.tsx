'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { adminClientPost, AdminClientError } from '@/lib/admin-client'
import type { ChatbotLogItem } from './page'

export default function ChatbotClient({ initial }: { initial: ChatbotLogItem[] }) {
  const router = useRouter()
  const [items, setItems] = useState<ChatbotLogItem[]>(initial)
  const [expanded, setExpanded] = useState<number | null>(null)
  const [resolving, setResolving] = useState<number | null>(null)
  const [showResolved, setShowResolved] = useState(true)

  const resolve = async (id: number) => {
    setResolving(id)
    try {
      await adminClientPost(`/api/admin/chatbot/${id}/resolve`, {})
      setItems((cur) =>
        cur.map((it) =>
          it.id === id
            ? { ...it, resolved_at: new Date().toISOString() }
            : it,
        ),
      )
      toast.success('Marked as resolved')
      router.refresh()
    } catch (e) {
      const msg = e instanceof AdminClientError ? e.message : String(e)
      toast.error(msg)
    } finally {
      setResolving(null)
    }
  }

  const visible = showResolved ? items : items.filter((i) => !i.resolved_at)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-sm text-stone-500">
        <span>
          {items.filter((i) => !i.resolved_at).length} unresolved
          {showResolved && items.some((i) => i.resolved_at) && (
            <span> · {items.filter((i) => i.resolved_at).length} resolved</span>
          )}
        </span>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={showResolved}
            onChange={(e) => setShowResolved(e.target.checked)}
            className="rounded border-stone-300"
          />
          <span>Show resolved</span>
        </label>
      </div>

      {visible.length === 0 ? (
        <div className="bg-white rounded-xl border border-stone-200 p-8 text-center text-stone-500">
          No chatbot logs to review.
        </div>
      ) : (
        <div className="space-y-2">
          {visible.map((it) => {
            const isOpen = expanded === it.id
            const isResolved = !!it.resolved_at
            return (
              <div
                key={it.id}
                className={`bg-white rounded-xl border ${
                  isResolved ? 'border-stone-100 opacity-60' : 'border-stone-200'
                }`}
              >
                <button
                  onClick={() => setExpanded(isOpen ? null : it.id)}
                  className="w-full text-left px-4 py-3 flex justify-between items-start gap-4"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      {it.error ? (
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
                          errored
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
                          refused
                        </span>
                      )}
                      {isResolved && (
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-stone-100 text-stone-600">
                          resolved
                        </span>
                      )}
                      <span className="text-xs text-stone-400">
                        {new Date(it.created_at).toLocaleString()}
                      </span>
                    </div>
                    <p className="text-sm text-stone-800 line-clamp-1">
                      {it.question}
                    </p>
                  </div>
                  <span className="text-stone-400 text-xs">{isOpen ? '▲' : '▼'}</span>
                </button>

                {isOpen && (
                  <div className="px-4 pb-4 space-y-3 border-t border-stone-100 pt-3">
                    <div>
                      <p className="text-xs uppercase tracking-wider text-stone-400 mb-1">
                        Question
                      </p>
                      <p className="text-sm text-stone-800 whitespace-pre-wrap">
                        {it.question}
                      </p>
                    </div>
                    {it.response && (
                      <div>
                        <p className="text-xs uppercase tracking-wider text-stone-400 mb-1">
                          Response
                        </p>
                        <p className="text-sm text-stone-700 whitespace-pre-wrap">
                          {it.response}
                        </p>
                      </div>
                    )}
                    {it.error && (
                      <div>
                        <p className="text-xs uppercase tracking-wider text-stone-400 mb-1">
                          Error
                        </p>
                        <pre className="text-xs text-red-700 bg-red-50 border border-red-200 rounded p-2 overflow-x-auto">
                          {it.error}
                        </pre>
                      </div>
                    )}
                    {it.user_id && (
                      <p className="text-xs text-stone-400">user_id: {it.user_id}</p>
                    )}
                    {it.session_id && (
                      <p className="text-xs text-stone-400">session: {it.session_id}</p>
                    )}
                    {!isResolved && (
                      <div className="pt-2">
                        <button
                          onClick={() => resolve(it.id)}
                          disabled={resolving === it.id}
                          className="px-3 py-1.5 bg-stone-800 text-white rounded-lg text-sm font-medium hover:bg-stone-700 disabled:opacity-50"
                        >
                          {resolving === it.id ? 'Saving…' : 'Mark as resolved'}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
