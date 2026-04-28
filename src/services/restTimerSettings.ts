import { getString, setString } from '@/storage/mmkv'

export const DEFAULT_REST_SECONDS = 90
export const REST_TIMER_DEFAULT_SECONDS_KEY = 'rest_timer_default_seconds'

export function formatRestTimer(seconds: number): string {
  const safeSeconds = Math.max(0, seconds)
  const minutes = Math.floor(safeSeconds / 60)
  const remainder = safeSeconds % 60
  return `${minutes}:${String(remainder).padStart(2, '0')}`
}

export function getDefaultRestSeconds(): number {
  const stored = getString(REST_TIMER_DEFAULT_SECONDS_KEY)
  const parsed = stored ? Number.parseInt(stored, 10) : NaN
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_REST_SECONDS
}

export function setDefaultRestSeconds(seconds: number): void {
  setString(REST_TIMER_DEFAULT_SECONDS_KEY, String(Math.max(10, seconds)))
}
