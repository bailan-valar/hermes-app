/**
 * Time formatting helpers for session/message timestamps.
 */

const MIN = 60_000
const HOUR = 60 * MIN
const DAY = 24 * HOUR

function toMs(value: unknown): number | null {
  if (typeof value === 'number') {
    // Assume seconds if the magnitude looks like unix seconds.
    return value > 1e12 ? value : value * 1000
  }
  if (typeof value === 'string') {
    const parsed = Date.parse(value)
    return Number.isNaN(parsed) ? null : parsed
  }
  return null
}

/** Relative time like "刚刚 / 5 分钟前 / 昨天 / 3 天前", falling back to a date. */
export function relativeTime(value: unknown): string {
  const ms = toMs(value)
  if (ms === null) return ''
  const diff = Date.now() - ms
  if (diff < -MIN) return absoluteTime(ms)
  if (diff < MIN) return '刚刚'
  if (diff < HOUR) return `${Math.floor(diff / MIN)} 分钟前`
  if (diff < DAY) return `${Math.floor(diff / HOUR)} 小时前`
  if (diff < 2 * DAY) return '昨天'
  if (diff < 7 * DAY) return `${Math.floor(diff / DAY)} 天前`
  return absoluteTime(ms)
}

/** Absolute time — "MM-DD HH:mm" (same year) or "YYYY-MM-DD" (older). */
export function absoluteTime(value: unknown): string {
  const ms = toMs(value)
  if (ms === null) return ''
  const d = new Date(ms)
  const now = new Date()
  const sameYear = d.getFullYear() === now.getFullYear()
  const pad = (n: number) => String(n).padStart(2, '0')
  const md = `${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  const hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`
  if (sameYear) return `${md} ${hm}`
  return `${d.getFullYear()}-${md}`
}

export function useTime() {
  return { relativeTime, absoluteTime }
}
