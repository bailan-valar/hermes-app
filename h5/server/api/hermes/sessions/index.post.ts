/** `POST /api/hermes/sessions` → `POST /api/sessions` (create empty session). */
export default defineEventHandler(async (event) => {
  const body = await readBody<{ title?: string }>(event).catch(() => ({}))
  return hermesFetch({
    event,
    path: '/api/sessions',
    method: 'POST',
    body: body && typeof body === 'object' ? body : {}
  })
})
