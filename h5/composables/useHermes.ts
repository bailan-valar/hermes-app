import type {
  HermesMessage,
  HermesModel,
  HermesSession,
  StreamEvent
} from '~/types/hermes'

/**
 * Client-side Hermes API facade.
 *
 * Every call goes through the Nuxt server proxy at `/api/hermes/**`, so the
 * `HERMES_API_KEY` stays server-side and no CORS configuration is needed.
 *
 * The upstream Sessions API is not strictly typed in the public docs, so the
 * list helpers normalize a few common response envelopes (array vs wrapped).
 */

const PROXY = '/api/hermes'

function asArray<T>(res: unknown, keys: string[] = ['sessions', 'items', 'data']): T[] {
  if (Array.isArray(res)) return res as T[]
  if (res && typeof res === 'object') {
    for (const k of keys) {
      const v = (res as Record<string, unknown>)[k]
      if (Array.isArray(v)) return v as T[]
    }
  }
  return []
}

/** Single-session endpoints wrap the payload as `{ object, session: {...} }`. */
function unwrapSession(res: unknown): HermesSession {
  if (res && typeof res === 'object' && 'session' in res) {
    const inner = (res as Record<string, unknown>).session
    if (inner && typeof inner === 'object') return inner as HermesSession
  }
  return res as HermesSession
}

export function useHermes() {
  const headers = { 'Content-Type': 'application/json' }

  /** `GET /api/sessions` */
  async function listSessions(params?: {
    limit?: number
    offset?: number
    source?: string
    include_children?: boolean
  }): Promise<HermesSession[]> {
    const data = await $fetch<unknown>(`${PROXY}/sessions`, { params })
    const list = asArray<HermesSession>(data)
    // Newest first — upstream ordering is not guaranteed.
    return sortSessions(list)
  }

  /** `POST /api/sessions` */
  async function createSession(opts?: { title?: string; model?: string }): Promise<HermesSession> {
    const res = await $fetch<unknown>(`${PROXY}/sessions`, {
      method: 'POST',
      headers,
      body: opts ?? {}
    })
    return unwrapSession(res)
  }

  /** `GET /v1/models` */
  async function listModels(): Promise<HermesModel[]> {
    const data = await $fetch<unknown>(`${PROXY}/models`)
    // OpenAI-style models response wraps list in `data`
    if (data && typeof data === 'object' && 'data' in data) {
      const arr = (data as Record<string, unknown>).data
      if (Array.isArray(arr)) return arr as HermesModel[]
    }
    // Fallback: bare array
    if (Array.isArray(data)) return data as HermesModel[]
    return []
  }

  /** `GET /api/sessions/{id}` */
  async function getSession(id: string): Promise<HermesSession> {
    const res = await $fetch<unknown>(`${PROXY}/sessions/${encodeURIComponent(id)}`)
    return unwrapSession(res)
  }

  /** `PATCH /api/sessions/{id}` */
  async function updateSession(
    id: string,
    patch: { title?: string; end_reason?: string }
  ): Promise<HermesSession> {
    const res = await $fetch<unknown>(`${PROXY}/sessions/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers,
      body: patch
    })
    return unwrapSession(res)
  }

  /** `DELETE /api/sessions/{id}` */
  async function deleteSession(id: string): Promise<void> {
    await $fetch(`${PROXY}/sessions/${encodeURIComponent(id)}`, { method: 'DELETE' })
  }

  /** `GET /api/sessions/{id}/messages` */
  async function getMessages(id: string): Promise<HermesMessage[]> {
    const data = await $fetch<unknown>(`${PROXY}/sessions/${encodeURIComponent(id)}/messages`)
    return asArray<HermesMessage>(data, ['messages', 'items', 'data'])
  }

  /** Health probe of the proxy → upstream. */
  async function health(): Promise<{ ok: boolean; detail?: unknown }> {
    try {
      const data = await $fetch<unknown>(`${PROXY}/health`, { timeout: 4000 })
      return { ok: true, detail: data }
    } catch (err) {
      return { ok: false, detail: err }
    }
  }

  /**
   * Stream one agent turn over SSE (`POST /api/sessions/{id}/chat/stream`).
   *
   * POST + SSE can't use EventSource, so we read the response body manually and
   * split on SSE frame boundaries (`\n\n`). Returns a handle whose `.abort()`
   * cancels the in-flight request.
   */
  async function streamChat(
    id: string,
    payload: { input: string; instructions?: string },
    onEvent: (ev: StreamEvent) => void,
    signal?: AbortSignal
  ): Promise<void> {
    const res = await fetch(`${PROXY}/stream/${encodeURIComponent(id)}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal
    })

    if (!res.ok || !res.body) {
      const text = await res.text().catch(() => '')
      throw new Error(text || `upstream error ${res.status}`)
    }

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })

      // SSE frames are separated by a blank line.
      let sep: number
      while ((sep = buffer.indexOf('\n\n')) !== -1) {
        const frame = buffer.slice(0, sep)
        buffer = buffer.slice(sep + 2)
        const ev = parseSseFrame(frame)
        if (ev) onEvent(ev)
      }
    }
    // Flush any trailing frame.
    if (buffer.trim()) {
      const ev = parseSseFrame(buffer)
      if (ev) onEvent(ev)
    }
  }

  return {
    listSessions,
    createSession,
    getSession,
    updateSession,
    deleteSession,
    getMessages,
    listModels,
    health,
    streamChat
  }
}

/* ── helpers ─────────────────────────────────────────────────────── */

function sortSessions(list: HermesSession[]): HermesSession[] {
  return [...list].sort((a, b) => ts(b) - ts(a))

  function ts(s: HermesSession): number {
    // Prefer last_active (unix seconds), then started_at, then ISO timestamps.
    if (typeof s.last_active === 'number') return s.last_active * 1000
    if (typeof s.started_at === 'number') return s.started_at * 1000
    if (s.updated_at) return Date.parse(s.updated_at) || 0
    if (s.created_at) return Date.parse(s.created_at) || 0
    return 0
  }
}

function parseSseFrame(frame: string): StreamEvent | null {
  const lines = frame.split('\n')
  let event = 'message'
  const dataLines: string[] = []
  for (const line of lines) {
    if (!line || line.startsWith(':')) continue // comment / heartbeat
    const colon = line.indexOf(':')
    const field = colon === -1 ? line : line.slice(0, colon)
    let value = colon === -1 ? '' : line.slice(colon + 1)
    if (value.startsWith(' ')) value = value.slice(1)
    if (field === 'event') event = value
    else if (field === 'data') dataLines.push(value)
  }
  if (dataLines.length === 0) return null
  const raw = dataLines.join('\n')
  let data: Record<string, unknown> | null = null
  try {
    const parsed = JSON.parse(raw)
    data = parsed && typeof parsed === 'object' ? parsed : { value: parsed }
  } catch {
    // Plain-text payloads (e.g. bare delta strings).
    data = { value: raw }
  }
  return { event, data, raw }
}
