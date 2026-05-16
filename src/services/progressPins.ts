import { getString, setString } from '@/storage/mmkv'

export const PROGRESS_PINNED_EXERCISE_TYPE_IDS_KEY =
  'progress_pinned_exercise_type_ids'
export const MAX_PINNED_PROGRESS_EXERCISES = 6

function normalizePinnedIds(ids: unknown): string[] {
  if (!Array.isArray(ids)) return []

  const uniqueIds: string[] = []
  for (const id of ids) {
    if (typeof id !== 'string') continue
    const trimmed = id.trim()
    if (!trimmed || uniqueIds.includes(trimmed)) continue
    uniqueIds.push(trimmed)
    if (uniqueIds.length >= MAX_PINNED_PROGRESS_EXERCISES) break
  }
  return uniqueIds
}

export function getPinnedProgressExerciseIds(): string[] {
  const raw = getString(PROGRESS_PINNED_EXERCISE_TYPE_IDS_KEY)
  if (!raw) return []

  try {
    return normalizePinnedIds(JSON.parse(raw))
  } catch {
    return []
  }
}

export function setPinnedProgressExerciseIds(ids: string[]): string[] {
  const normalizedIds = normalizePinnedIds(ids)
  setString(PROGRESS_PINNED_EXERCISE_TYPE_IDS_KEY, JSON.stringify(normalizedIds))
  return normalizedIds
}
