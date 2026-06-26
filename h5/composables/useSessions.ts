import type { HermesSession } from '~/types/hermes'

/**
 * Shared session-list state.
 *
 * Uses Nuxt's `useState` so the list is preserved across route changes
 * (e.g. returning from a chat keeps the history view warm) and is SSR-safe.
 */
export function useSessions() {
  const hermes = useHermes()

  const sessions = useState<HermesSession[]>('hermes:sessions', () => [])
  const loading = useState<boolean>('hermes:sessions:loading', () => false)
  const error = useState<string | null>('hermes:sessions:error', () => null)
  const loadedAt = useState<number>('hermes:sessions:loadedAt', () => 0)

  const PAGE_SIZE = 60

  async function refresh(force = false): Promise<void> {
    // Avoid hammering the API on rapid navigation; 5s stale window unless forced.
    if (!force && loading.value) return
    if (!force && sessions.value.length && Date.now() - loadedAt.value < 5000) return

    loading.value = true
    error.value = null
    try {
      sessions.value = await hermes.listSessions({ limit: PAGE_SIZE, offset: 0 })
      loadedAt.value = Date.now()
    } catch (e) {
      error.value = errorMessage(e)
      sessions.value = []
    } finally {
      loading.value = false
    }
  }

  async function create(title?: string, model?: string): Promise<HermesSession> {
    const opts: { title?: string; model?: string } = title ? { title } : {}
    if (model) {
      opts.model = model
    }
    const session = await hermes.createSession(Object.keys(opts).length > 0 ? opts : undefined)
    // Optimistically prepend; refresh will reconcile ordering.
    sessions.value = [session, ...sessions.value.filter((s) => s.id !== session.id)]
    return session
  }

  async function remove(id: string): Promise<void> {
    await hermes.deleteSession(id)
    sessions.value = sessions.value.filter((s) => s.id !== id)
  }

  async function rename(id: string, title: string): Promise<void> {
    const updated = await hermes.updateSession(id, { title })
    sessions.value = sessions.value.map((s) => (s.id === id ? { ...s, ...updated } : s))
  }

  function findById(id: string): HermesSession | undefined {
    return sessions.value.find((s) => s.id === id)
  }

  return {
    sessions,
    loading,
    error,
    refresh,
    create,
    remove,
    rename,
    findById
  }
}

function errorMessage(e: unknown): string {
  if (e && typeof e === 'object' && 'data' in e) {
    const data = (e as Record<string, unknown>).data
    if (data && typeof data === 'object' && 'message' in data) {
      return String((data as Record<string, unknown>).message)
    }
  }
  if (e instanceof Error) return e.message
  return '请求失败'
}
