/** `GET /api/hermes/sessions/:id/messages` → `GET /api/sessions/{id}/messages`. */
export default defineEventHandler((event) => {
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'session id required' })
  return hermesFetch({ event, path: `/api/sessions/${encodeURIComponent(id)}/messages` })
})
