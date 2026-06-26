/** `GET /api/hermes/health` → proxies `GET /health` on the Hermes API server. */
export default defineEventHandler((event) => {
  return hermesFetch({ event, path: '/health', timeoutMs: 4000 })
})
