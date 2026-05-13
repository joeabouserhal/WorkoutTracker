import { getString, setString } from '@/storage/mmkv'

export const DEFAULT_MUSCLE_RECOVERY_HOURS = 48
export const MUSCLE_RECOVERY_HOURS_KEY = 'muscle_recovery_hours'

export function getDefaultMuscleRecoveryHours(): number {
  const stored = getString(MUSCLE_RECOVERY_HOURS_KEY)
  const parsed = stored ? Number.parseInt(stored, 10) : NaN
  return Number.isFinite(parsed) && parsed > 0
    ? parsed
    : DEFAULT_MUSCLE_RECOVERY_HOURS
}

export function setDefaultMuscleRecoveryHours(hours: number): void {
  const safeHours = Math.max(12, Math.min(168, Math.trunc(hours)))
  setString(MUSCLE_RECOVERY_HOURS_KEY, String(safeHours))
}
