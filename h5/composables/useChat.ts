import type { HermesMessage, ToolProgress } from '~/types/hermes'

/**
 * Reactive chat state for a single session detail view.
 *
 * Loads the persisted transcript, then appends user turns and streams the
 * assistant reply event-by-event from `POST /api/sessions/{id}/chat/stream`.
 */
export function useChat() {
  const hermes = useHermes()

  const sessionId = useState<string | null>('hermes:chat:sessionId', () => null)
  const messages = useState<HermesMessage[]>('hermes:chat:messages', () => [])
  const loading = useState<boolean>('hermes:chat:loading', () => false)
  const pending = useState<boolean>('hermes:chat:pending', () => false)
  const error = useState<string | null>('hermes:chat:error', () => null)
  const tools = useState<ToolProgress[]>('hermes:chat:tools', () => [])

  // Streaming assistant accumulator — flushed into `messages` on completion.
  const draftContent = useState<string>('hermes:chat:draft', () => '')

  let controller: AbortController | null = null

  async function load(id: string): Promise<void> {
    sessionId.value = id
    loading.value = true
    error.value = null
    try {
      messages.value = await hermes.getMessages(id)
    } catch (e) {
      error.value = humanError(e)
      messages.value = []
    } finally {
      loading.value = false
    }
  }

  function reset(): void {
    controller?.abort()
    controller = null
    sessionId.value = null
    messages.value = []
    tools.value = []
    draftContent.value = ''
    pending.value = false
    error.value = null
  }

  async function send(id: string, input: string): Promise<void> {
    const text = input.trim()
    if (!text || pending.value) return

    controller?.abort()
    controller = new AbortController()

    error.value = null
    tools.value = []
    draftContent.value = ''
    pending.value = true

    // Optimistically render the user's message immediately.
    const userMsg: HermesMessage = {
      id: `local-${Math.random().toString(36).slice(2)}`,
      role: 'user',
      content: text,
      created_at: new Date().toISOString()
    }
    messages.value = [...messages.value, userMsg]

    try {
      await hermes.streamChat(
        id,
        { input: text },
        (ev) => handleEvent(ev),
        controller.signal
      )
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') {
        // User stopped — keep whatever was streamed so far.
      } else {
        error.value = humanError(e)
      }
    } finally {
      finalizeDraft()
      pending.value = false
      controller = null
    }
  }

  function stop(): void {
    controller?.abort()
  }

  /* ── event handling ────────────────────────────────────────────── */

  function handleEvent(ev: { event: string; data: Record<string, unknown> | null; raw: string }): void {
    switch (ev.event) {
      case 'assistant.delta':
      case 'delta':
      case 'message.delta':
        draftContent.value += extractDelta(ev.data, ev.raw)
        break
      case 'tool.started':
      case 'tool.start':
      case 'tool.progress':
        addTool(ev.data, 'running')
        break
      case 'tool.completed':
      case 'tool.complete':
        addTool(ev.data, 'completed')
        break
      case 'run.completed':
      case 'done':
      case 'message.completed':
      case 'assistant.completed':
        // run.completed / assistant.completed embed the final text — adopt it
        // if we somehow missed the deltas (e.g. non-streaming fallback).
        if (!draftContent.value) {
          draftContent.value = extractDelta(ev.data, ev.raw)
        }
        break
      case 'run.failed':
      case 'error':
        error.value = extractError(ev.data, ev.raw)
        break
    }
  }

  function finalizeDraft(): void {
    if (draftContent.value.trim()) {
      messages.value = [
        ...messages.value,
        {
          id: `ai-${Math.random().toString(36).slice(2)}`,
          role: 'assistant',
          content: draftContent.value,
          created_at: new Date().toISOString()
        }
      ]
    }
    draftContent.value = ''
    tools.value = []
  }

  function addTool(data: Record<string, unknown> | null, status: ToolProgress['status']): void {
    if (!data) return
    const name = String(
      data.tool_name ||
        data.name ||
        data.tool ||
        (data as { function?: { name?: string } }).function?.name ||
        'tool'
    )
    const id = String(data.id || data.call_id || data.tool_call_id || data.message_id || name)
    const detail =
      typeof data.detail === 'string'
        ? data.detail
        : typeof data.arguments === 'string'
          ? data.arguments
          : undefined

    const idx = tools.value.findIndex((t) => t.id === id)
    if (idx >= 0) {
      const next = [...tools.value]
      next[idx] = { ...next[idx], status, detail: detail ?? next[idx].detail }
      tools.value = next
    } else {
      tools.value = [...tools.value, { id, name, status, detail }]
    }
  }

  return {
    sessionId,
    messages,
    loading,
    pending,
    error,
    tools,
    draftContent,
    load,
    send,
    stop,
    reset
  }
}

/* ── payload extractors (defensive against variant shapes) ───────── */

function extractDelta(data: Record<string, unknown> | null, raw: string): string {
  if (!data) return ''
  for (const key of ['delta', 'text', 'content', 'chunk', 'value']) {
    const v = data[key]
    if (typeof v === 'string') return v
  }
  // OpenAI-style nested: { choices: [{ delta: { content } }] }
  const choices = data.choices as Array<{ delta?: { content?: string } }> | undefined
  if (Array.isArray(choices) && choices[0]?.delta?.content) {
    return choices[0].delta.content
  }
  // Fallback: the raw payload itself might be the delta text.
  if (!raw.startsWith('{') && !raw.startsWith('[')) return raw
  return ''
}

function extractError(data: Record<string, unknown> | null, raw: string): string {
  if (data) {
    for (const key of ['message', 'error', 'detail']) {
      const v = data[key]
      if (typeof v === 'string') return v
    }
  }
  return raw || '生成失败'
}

function humanError(e: unknown): string {
  if (e && typeof e === 'object' && 'data' in e) {
    const data = (e as Record<string, unknown>).data
    if (data && typeof data === 'object' && 'message' in data) {
      return String((data as Record<string, unknown>).message)
    }
    if (typeof data === 'string') return data
  }
  if (e instanceof Error) return e.message
  return '请求失败'
}
