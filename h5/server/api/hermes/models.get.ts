/** `GET /api/hermes/models` → `GET /v1/models` (list available models). */
export default defineEventHandler(async (event) => {
  return hermesFetch({ event, path: '/v1/models' })
})
