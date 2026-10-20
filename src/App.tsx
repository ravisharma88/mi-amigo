import { useEffect, useRef, useState, type KeyboardEvent, type SubmitEvent } from 'react'
import './App.css'

type Role = 'user' | 'assistant'
type ChatMessage = {
  id: string
  role: Role
  content: string
}

type AuthState =
  | { status: 'loading' }
  | { status: 'authenticated'; email: string }
  | { status: 'unauthenticated' }
  | { status: 'error'; message: string }

type CurrentUser = {
  email: string
}

type CsrfResponse = {
  token: string
}

async function getCurrentUser(signal?: AbortSignal): Promise<CurrentUser | null> {
  const response = await fetch('/api/me', {
    credentials: 'include',
    signal,
  })

  if (response.status === 401) {
    return null
  }

  if (!response.ok) {
    throw new Error(`Could not check sign-in status (${response.status})`)
  }

  return response.json() as Promise<CurrentUser>
}

async function sendChatMessage(message: string) {
  const csrfResponse = await fetch('/csrf', { credentials: 'include' })
  if (csrfResponse.status === 401) {
    throw new Error('unauthenticated')
  }
  if (!csrfResponse.ok) {
    throw new Error(`Could not get a CSRF token (${csrfResponse.status})`)
  }

  const { token } = (await csrfResponse.json()) as CsrfResponse
  const response = await fetch('/chat', {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'text/plain',
      'X-XSRF-TOKEN': token,
    },
    body: message,
  })

  if (response.status === 401) {
    throw new Error('unauthenticated')
  }
  if (!response.ok) {
    throw new Error(`Chat request failed (${response.status})`)
  }

  return response.text()
}

function App() {
  const [auth, setAuth] = useState<AuthState>({ status: 'loading' })
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [draft, setDraft] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const controller = new AbortController()

    getCurrentUser(controller.signal)
      .then((user) => {
        setAuth(
          user
            ? { status: 'authenticated', email: user.email }
            : { status: 'unauthenticated' },
        )
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setAuth({
            status: 'error',
            message: 'Could not check your sign-in status. Please try again.',
          })
        }
      })

    return () => controller.abort()
  }, [])

  useEffect(() => {
    listRef.current?.scrollTo({
      top: listRef.current.scrollHeight,
      behavior: 'smooth',
    })
  }, [messages, isSending])

  async function checkSignIn() {
    setAuth({ status: 'loading' })
    try {
      const user = await getCurrentUser()
      setAuth(
        user
          ? { status: 'authenticated', email: user.email }
          : { status: 'unauthenticated' },
      )
    } catch {
      setAuth({
        status: 'error',
        message: 'Could not check your sign-in status. Please try again.',
      })
    }
  }

  async function handleSubmit(event?: SubmitEvent<HTMLFormElement>) {
    event?.preventDefault()

    const message = draft.trim()
    if (!message || auth.status !== 'authenticated' || isSending) {
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
      const reply = await sendChatMessage(message)
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: reply.trim() || 'No response from the agent.',
        },
      ])
    } catch (requestError) {
      if (
        requestError instanceof Error &&
        requestError.message === 'unauthenticated'
      ) {
        setAuth({ status: 'unauthenticated' })
        setMessages([])
        setError('Your session has expired. Sign in again to continue.')
        return
      }
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
        {auth.status === 'authenticated' && (
          <p className="account-email" aria-label="Signed in account">
            {auth.email}
          </p>
        )}
      </header>

      {auth.status === 'loading' && (
        <main className="auth-panel" role="status">
          Checking sign-in status…
        </main>
      )}

      {auth.status === 'unauthenticated' && (
        <main className="auth-panel">
          <h2>Sign in to chat</h2>
          <p>Continue with your Google account to talk with Mi Amigo.</p>
          {error && <p className="error">{error}</p>}
          <button
            type="button"
            className="sign-in-button"
            onClick={() =>
              window.location.assign('/oauth2/authorization/google')
            }
          >
            Sign in with Google
          </button>
        </main>
      )}

      {auth.status === 'error' && (
        <main className="auth-panel">
          <p className="error">{auth.message}</p>
          <button type="button" className="ghost" onClick={() => void checkSignIn()}>
            Try again
          </button>
        </main>
      )}

      {auth.status === 'authenticated' && (
        <>
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
        </>
      )}
    </div>
  )
}

export default App
