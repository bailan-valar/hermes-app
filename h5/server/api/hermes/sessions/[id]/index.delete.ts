/** `DELETE /api/hermes/sessions/:id` → `DELETE /api/sessions/{id}`. */
export default defineEventHandler((event) => {
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'session id required' })
  return hermesFetch({
    event,
    path: `/api/sessions/${encodeURIComponent(id)}`,
    method: 'DELETE'
  })
})
