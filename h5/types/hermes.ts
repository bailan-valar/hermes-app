/**
 * Hermes Agent API types.
 *
 * The Sessions API (`/api/sessions/*`) is the primary surface used here.
 * Some field shapes are not exhaustively documented upstream, so message
 * payloads are kept permissive (extra fields allowed) and the render layer
 * degrades gracefully when optional fields are absent.
 */

/** A Hermes conversation session (from `GET /api/sessions`). */
export interface HermesSession {
  id: string
  title?: string | null
  source?: string | null
  model?: string | null
  /** Unix seconds (float) — session creation time. */
  started_at?: number | null
  /** Unix seconds (float) — session end time, null while active. */
  ended_at?: number | null
  /** Unix seconds (float) — last activity (best field for ordering/display). */
  last_active?: number | null
  end_reason?: string | null
  message_count?: number
  tool_call_count?: number
  parent_session_id?: string | null
  /** First-message preview text, used as a title fallback. */
  preview?: string
  created_at?: string
  updated_at?: string
  /** Allow any extra fields the upstream may add without breaking the UI. */
  [key: string]: unknown
}

/** Paginated list response wrapper (defensive — some servers return a bare array). */
export interface HermesSessionList {
  sessions?: HermesSession[]
  items?: HermesSession[]
  data?: HermesSession[]
  total?: number
  limit?: number
  offset?: number
}

/** A single message within a session transcript. */
export interface HermesMessage {
  id?: string | number
  session_id?: string
  role: 'user' | 'assistant' | 'system' | 'tool' | string
  /** Content may be a plain string or an OpenAI-style multimodal parts array. */
  content?: string | ContentPart[] | null
  /** Unix seconds (float). */
  timestamp?: number | null
  created_at?: string
  /** Tool calls the assistant requested, if any. */
  tool_calls?: ToolCall[] | null
  /** Tool result text (role: tool). */
  tool_call_id?: string | null
  tool_name?: string | null
  name?: string
  finish_reason?: string | null
  /** Model reasoning / chain-of-thought (optional, collapsible). */
  reasoning?: string | null
  reasoning_content?: string | null
  [key: string]: unknown
}

export interface ContentPart {
  type: string
  text?: string
  image_url?: { url: string; detail?: string }
  [key: string]: unknown
}

export interface ToolCall {
  id?: string
  name?: string
  function?: { name?: string; arguments?: string }
  arguments?: string | Record<string, unknown>
  call_id?: string
  [key: string]: unknown
}

export interface HermesMessageList {
  messages?: HermesMessage[]
  items?: HermesMessage[]
  data?: HermesMessage[]
  total?: number
}

/**
 * SSE event shapes emitted by `POST /api/sessions/{id}/chat/stream`.
 * Event names: `assistant.delta`, `tool.started`, `tool.completed`, `run.completed`.
 * The `data` payload is JSON in some releases and plain text in others, so each
 * variant keeps a `raw` escape hatch.
 */
export type StreamEventName =
  | 'assistant.delta'
  | 'tool.started'
  | 'tool.completed'
  | 'run.completed'
  | 'run.failed'
  | 'error'
  | string

export interface StreamEvent {
  event: StreamEventName
  /** Parsed JSON data when the payload is an object, else null. */
  data: Record<string, unknown> | null
  /** The raw data string exactly as received. */
  raw: string
}

/** Normalized tool-progress entry surfaced to the UI during a stream. */
export interface ToolProgress {
  id: string
  name: string
  status: 'running' | 'completed' | 'failed'
  detail?: string
}

/** A model available from `/v1/models`. */
export interface HermesModel {
  id: string
  object: string
  created?: number | null
  owned_by?: string | null
  [key: string]: unknown
}

/** Error returned by the proxy when the upstream Hermes call fails. */
export interface HermesApiError {
  statusCode: number
  statusMessage?: string
  message: string
  data?: unknown
}
