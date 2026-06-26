/** `PATCH /api/hermes/sessions/:id` → `PATCH /api/sessions/{id}` (rename / end_reason). */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'session id required' })
  const body = await readBody<{ title?: string; end_reason?: string }>(event)
  return hermesFetch({
    event,
    path: `/api/sessions/${encodeURIComponent(id)}`,
    method: 'PATCH',
    body
  })
})
