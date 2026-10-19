import { useEffect, useRef, useState, type KeyboardEvent, type SubmitEvent } from 'react'
import './App.css'

type Role = 'user' | 'assistant'
type ChatMessage = {
  id: string
  role: Role
  content: string
}

const CONVERSATION_KEY = 'mi-amigo.conversationId'

function getOrCreateConversationId() {
  const existing = sessionStorage.getItem(CONVERSATION_KEY)
  if (existing) {
    return existing
  }

  const id = crypto.randomUUID()
  sessionStorage.setItem(CONVERSATION_KEY, id)
  return id
}

async function sendChatMessage(conversationId: string, message: string) {
  const response = await fetch(
    `/chat?conversationId=${encodeURIComponent(conversationId)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: message,
    },
  )

  if (!response.ok) {
    throw new Error(`Chat request failed (${response.status})`)
  }

  return response.text()
}

function App() {
  const [conversationId, setConversationId] = useState(getOrCreateConversationId)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [draft, setDraft] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    listRef.current?.scrollTo({
      top: listRef.current.scrollHeight,
      behavior: 'smooth',
    })
  }, [messages, isSending])

  function startNewConversation() {
    const id = crypto.randomUUID()
    sessionStorage.setItem(CONVERSATION_KEY, id)
    setConversationId(id)
    setMessages([])
    setDraft('')
    setError(null)
  }

  async function handleSubmit(event?: SubmitEvent<HTMLFormElement>) {
    event?.preventDefault()

    const message = draft.trim()
    if (!message || isSending) {
      return
    }

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: message,
    }

    setMessages((current) => [...current, userMessage])
    setDraft('')
    setIsSending(true)
    setError(null)

    try {
      const reply = await sendChatMessage(conversationId, message)
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: reply.trim() || 'No response from the agent.',
        },
      ])
    } catch {
      setError('Could not reach the agent. Make sure it is running on localhost:8080.')
    } finally {
      setIsSending(false)
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      void handleSubmit()
    }
  }

  return (
    <div className="chat-app">
      <header className="chat-header">
        <div>
          <h1>Mi Amigo</h1>
          <p>Chat with your local AI agent</p>
        </div>
        <button type="button" className="ghost" onClick={startNewConversation}>
          New chat
        </button>
      </header>

      <div className="message-list" ref={listRef}>
        {messages.length === 0 && !isSending && (
          <p className="empty">Send a message to start the conversation.</p>
        )}

        {messages.map((message) => (
          <article key={message.id} className={`bubble ${message.role}`}>
            <span className="role">
              {message.role === 'user' ? 'You' : 'Amigo'}
            </span>
            <p>{message.content}</p>
          </article>
        ))}

        {isSending && (
          <article className="bubble assistant pending">
            <span className="role">Amigo</span>
            <p>Thinking…</p>
          </article>
        )}
      </div>

      {error && <p className="error">{error}</p>}

      <form className="composer" onSubmit={handleSubmit}>
        <label className="sr-only" htmlFor="message">
          Message
        </label>
        <textarea
          id="message"
          rows={1}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Write a message…"
          disabled={isSending}
        />
        <button type="submit" disabled={isSending || !draft.trim()}>
          Send
        </button>
      </form>
    </div>
  )
}

export default App
