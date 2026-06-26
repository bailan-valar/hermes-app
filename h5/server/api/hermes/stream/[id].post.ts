import { sendWebResponse } from 'h3'

/**
 * `POST /api/hermes/stream/:id`
 *   → `POST /api/sessions/{id}/chat/stream` (SSE).
 *
 * Forwards the upstream SSE stream straight through to the browser so the
 * `run.started` / `assistant.delta` / `tool.progress` / `run.completed` events
 * reach the client untouched. The bearer key is injected here and never exposed.
 *
 * Uses h3's native `sendWebResponse` to relay the web `Response` (status,
 * headers, and streaming body) — the canonical way to proxy a `fetch` response.
 *
 * Route shape: the session id is a *terminal* path parameter (`/stream/:id`),
 * chosen deliberately. An earlier layout placed this as a static child of a
 * `:id` param (`/sessions/:id/chat-stream`); in this Nitro/rou3 version that
 * POST-method static child matched intermittently, so the param is now terminal
 * for reliable routing.
 */
export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'session id required' })

  const body = await readBody<{ input?: string; instructions?: string }>(event).catch(() => ({}))
  const input = body?.input
  if (typeof input !== 'string' || !input.trim()) {
    throw createError({ statusCode: 400, statusMessage: 'input required' })
  }

  let upstream: Response
  try {
    upstream = await fetch(
      `${config.hermesBaseUrl}/api/sessions/${encodeURIComponent(id)}/chat/stream`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.hermesApiKey}`,
          'Content-Type': 'application/json',
          Accept: 'text/event-stream'
        },
        body: JSON.stringify({
          input,
          ...(typeof body.instructions === 'string' && body.instructions.trim()
            ? { instructions: body.instructions }
            : {})
        })
      }
    )
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

  if (!upstream.ok || !upstream.body) {
    const text = await upstream.text().catch(() => '')
    throw createError({
      statusCode: upstream.status,
      statusMessage: upstream.statusText || 'Hermes Error',
      data: safeJson(text) ?? text
    })
  }

  return sendWebResponse(event, upstream)
})
