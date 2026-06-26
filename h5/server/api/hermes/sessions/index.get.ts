/** `GET /api/hermes/sessions` → `GET /api/sessions` (paginated). */
export default defineEventHandler((event) => {
  const query = getQuery(event)
  return hermesFetch({
    event,
    path: '/api/sessions',
    query: {
      limit: query.limit ?? 60,
      offset: query.offset ?? 0,
      source: query.source,
      include_children: query.include_children
    }
  })
})
