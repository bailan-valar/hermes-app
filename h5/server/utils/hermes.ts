import type { H3Event } from 'h3'

/**
 * Shared upstream call helper for the Hermes API server.
 *
 * Adds bearer auth, joins the base URL, forwards the JSON body, and normalizes
 * upstream errors into h3 `createError` so the client gets a clean envelope.
 */
interface HermesFetchOptions {
  event: H3Event
  /** Path beginning with `/`, e.g. `/api/sessions`. */
  path: string
  method?: string
  query?: Record<string, unknown>
  body?: unknown
  timeoutMs?: number
}

export async function hermesFetch<T = unknown>(opts: HermesFetchOptions): Promise<T> {
  const config = useRuntimeConfig()
  const url = buildUrl(config.hermesBaseUrl, opts.path, opts.query)

  let response: Response
  try {
    response = await fetch(url, {
      method: opts.method ?? 'GET',
      headers: {
        Authorization: `Bearer ${config.hermesApiKey}`,
        Accept: 'application/json',
        ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {})
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: opts.timeoutMs ? AbortSignal.timeout(opts.timeoutMs) : undefined
    })
  } catch (err) {
    throw createError({
      statusCode: 502,
      statusMessage: 'Upstream Unreachable',
      data: {
        message: `无法连接 Hermes API server (${config.hermesBaseUrl})`,
        detail: err instanceof Error ? err.message : String(err)
      }
    })
  }

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw createError({
      statusCode: response.status,
      statusMessage: response.statusText || 'Hermes Error',
      data: safeJson(text) ?? text
    })
  }

  const contentType = response.headers.get('content-type') || ''
  if (contentType.includes('application/json')) {
    return (await response.json()) as T
  }
  // Non-JSON success (e.g. 204 No Content) — return an empty object.
  return (await response.text()) as unknown as T
}

function buildUrl(base: string, path: string, query?: Record<string, unknown>): string {
  const trimmed = base.replace(/\/+$/, '')
  const p = path.startsWith('/') ? path : `/${path}`
  const url = new URL(trimmed + p)
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null) continue
      url.searchParams.set(key, String(value))
    }
  }
  return url.toString()
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

export { safeJson }
