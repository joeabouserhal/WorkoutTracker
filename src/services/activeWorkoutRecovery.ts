import { getString, removeKey } from '@/storage/mmkv'
import {
  getActiveWorkoutSession,
  getLatestOpenWorkoutId,
} from '@/db/workoutHelpers'
import {
  MMKV_PENDING_WORKOUT_ACTION,
  MMKV_LOCAL_SETS,
  MMKV_REST_ENDS_AT,
  MMKV_STARTED_AT,
  MMKV_WORKOUT_ID,
  useSessionStore,
} from '@/store/sessionStore'
import { cancelWorkoutNotification } from './WorkoutNotification'

function parseStoredTimestamp(value?: string): number | null {
  if (!value) return null
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : null
}

function clearStaleWorkoutSession() {
  removeKey(MMKV_WORKOUT_ID)
  removeKey(MMKV_STARTED_AT)
  removeKey(MMKV_REST_ENDS_AT)
  removeKey(MMKV_PENDING_WORKOUT_ACTION)
  removeKey(MMKV_LOCAL_SETS)
}

export async function restoreActiveWorkoutSession(): Promise<boolean> {
  const storedWorkoutId = getString(MMKV_WORKOUT_ID)
  const fallbackWorkoutId = storedWorkoutId ? null : await getLatestOpenWorkoutId()
  const workoutId = storedWorkoutId ?? fallbackWorkoutId

  if (!workoutId) {
    clearStaleWorkoutSession()
    return false
  }

  const session = await getActiveWorkoutSession(workoutId)
  if (!session) {
    const latestOpenWorkoutId = await getLatestOpenWorkoutId()
    const fallbackSession =
      latestOpenWorkoutId && latestOpenWorkoutId !== workoutId
        ? await getActiveWorkoutSession(latestOpenWorkoutId)
        : null

    if (!fallbackSession) {
      clearStaleWorkoutSession()
      await cancelWorkoutNotification().catch(() => {})
      return false
    }

    const restEndsAt = parseStoredTimestamp(getString(MMKV_REST_ENDS_AT))
    useSessionStore.getState().restoreWorkoutSession({
      workoutId: fallbackSession.id,
      startedAt: fallbackSession.startedAt,
      exercises: fallbackSession.exercises,
      restEndsAt,
      openSheet: false,
    })
    return true
  }

  const restEndsAt = parseStoredTimestamp(getString(MMKV_REST_ENDS_AT))
  useSessionStore.getState().restoreWorkoutSession({
    workoutId: session.id,
    startedAt: session.startedAt,
    exercises: session.exercises,
    restEndsAt,
    openSheet: false,
  })
  return true
}
