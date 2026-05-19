'use client'
import { useState } from 'react'

export default function ChatbotWidget() {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<{role: string; text: string}[]>([{ role: 'bot', text: 'Assalamu Alaikum! How can I help you today?' }])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)

  const sendMessage = async () => {
    if (!input.trim() || loading) return
    const userMsg = input
    setInput('')
    setMessages((m) => [...m, { role: 'user', text: userMsg }])
    setLoading(true)
    try {
      const res = await fetch('/api/chatbot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMsg }),
      })
      const data = await res.json()
      setMessages((m) => [...m, { role: 'bot', text: data.response || 'Sorry, I could not understand that.' }])
    } catch {
      setMessages((m) => [...m, { role: 'bot', text: 'Something went wrong. Please try again.' }])
    }
    setLoading(false)
  }

  return (
    <div className="fixed bottom-6 right-6 z-50">
      {open && (
        <div className="bg-white rounded-xl shadow-2xl w-80 h-96 flex flex-col mb-4 border border-stone-200">
          <div className="bg-stone-800 text-white px-4 py-3 rounded-t-xl flex justify-between items-center">
            <span className="font-medium">AI Assistant</span>
            <button onClick={() => setOpen(false)} className="text-white/70 hover:text-white">&times;</button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] px-3 py-2 rounded-lg text-sm ${m.role === 'user' ? 'bg-rose-100 text-stone-800' : 'bg-stone-100 text-stone-700'}`}>{m.text}</div>
              </div>
            ))}
            {loading && <div className="text-sm text-stone-400">Typing...</div>}
          </div>
          <div className="p-3 border-t border-stone-200 flex gap-2">
            <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && sendMessage()} placeholder="Ask a question..." className="flex-1 px-3 py-2 border border-stone-300 rounded-lg text-sm" />
            <button onClick={sendMessage} disabled={loading} className="bg-stone-800 text-white px-3 py-2 rounded-lg text-sm hover:bg-stone-700 disabled:opacity-50">Send</button>
          </div>
        </div>
      )}
      <button onClick={() => setOpen(!open)} className="w-14 h-14 bg-rose-500 text-white rounded-full shadow-lg flex items-center justify-center hover:bg-rose-600 transition-colors">
        {open ? <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"/></svg> : <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"/></svg>}
      </button>
    </div>
  )
}