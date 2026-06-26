import { adminGet, ServerAuthError } from '@/lib/server-fetch'
import ChatbotClient from './ChatbotClient'

export const dynamic = 'force-dynamic'

export interface ChatbotLogItem {
  id: number
  user_id: number | null
  session_id: string | null
  question: string
  response: string | null
  error: string | null
  created_at: string
  resolved_at: string | null
}

interface UnansweredResponse {
  items: ChatbotLogItem[]
  limit: number
  offset: number
}

export default async function AdminChatbotPage() {
  let initial: ChatbotLogItem[] = []
  let loadError: string | null = null
  try {
    const res = await adminGet<UnansweredResponse>('/api/admin/chatbot/unanswered')
    initial = res.items
  } catch (err) {
    if (err instanceof ServerAuthError) loadError = err.message
    else throw err
  }

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-serif text-stone-800">Chatbot logs</h1>
          <p className="text-stone-500 mt-1 text-sm">
            Errored exchanges and refusal-flagged responses from the
            SAIA-powered chatbot.
          </p>
        </div>
      </div>
      {loadError ? (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
          {loadError}
        </div>
      ) : (
        <ChatbotClient initial={initial} />
      )}
    </>
  )
}
