/**
 * Minimal transient toast notifications (glass-styled, rendered by <ToastHost/>).
 * Shared across the app via Nuxt's global useState.
 *
 * `useState` MUST be called inside the composable (during setup), not at module
 * top level — otherwise it runs outside the Nuxt instance context.
 */
export interface Toast {
  id: number
  message: string
  type: 'info' | 'success' | 'error'
}

let seq = 0

export function useToast() {
  const toasts = useState<Toast[]>('hermes:toasts', () => [])

  function dismiss(id: number): void {
    toasts.value = toasts.value.filter((t) => t.id !== id)
  }

  function push(message: string, type: Toast['type'], ttl = 3800): void {
    const id = ++seq
    toasts.value = [...toasts.value, { id, message, type }]
    if (import.meta.client) {
      window.setTimeout(() => dismiss(id), ttl)
    }
  }

  return {
    toasts,
    info: (m: string) => push(m, 'info'),
    success: (m: string) => push(m, 'success'),
    error: (m: string) => push(m, 'error'),
    dismiss
  }
}
