import { create } from 'zustand'
import { setString, removeKey } from '@/storage/mmkv'

export const MMKV_WORKOUT_ID = 'active_workout_id'
export const MMKV_STARTED_AT = 'workout_started_at'
export const MMKV_REST_ENDS_AT = 'rest_ends_at'
export const MMKV_PENDING_WORKOUT_ACTION = 'pending_workout_action'

interface SetEntry {
  id: string
  setType: string
  weight: number
  weightUnit: string
  reps: number
  completedAt: number
}

interface ExerciseEntry {
  workoutExerciseId: string
  exerciseTypeId: string
  exerciseTypeName: string
  methodId: string
  methodName: string
  weightUnit: string
  sets: SetEntry[]
}

interface SessionState {
  activeWorkoutId: string | null
  startedAt: number | null
  exercises: ExerciseEntry[]
  isResting: boolean
  restSecondsRemaining: number
  restEndsAt: number | null
  elapsedSeconds: number
  isWorkoutSheetOpen: boolean

  startWorkout: (workoutId: string) => void
  endWorkout: () => void
  openWorkoutSheet: () => void
  closeWorkoutSheet: () => void
  addExercise: (entry: Omit<ExerciseEntry, 'sets'>) => void
  removeExercise: (workoutExerciseId: string) => void
  updateExerciseWeightUnit: (workoutExerciseId: string, weightUnit: string) => void
  addSet: (workoutExerciseId: string, set: SetEntry) => void
  startRest: (seconds: number) => void
  tickRest: () => void
  clearRest: () => void
  tickElapsed: () => void
  adjustRest: (delta: number) => void
}

export const useSessionStore = create<SessionState>()((set) => ({
  activeWorkoutId: null,
  startedAt: null,
  exercises: [],
  isResting: false,
  restSecondsRemaining: 0,
  restEndsAt: null,
  elapsedSeconds: 0,
  isWorkoutSheetOpen: false,

  startWorkout: (workoutId) => {
    const now = Date.now()
    setString(MMKV_WORKOUT_ID, workoutId)
    setString(MMKV_STARTED_AT, now.toString())
    removeKey(MMKV_REST_ENDS_AT)
    set({
      activeWorkoutId: workoutId,
      startedAt: now,
      exercises: [],
      isResting: false,
      restSecondsRemaining: 0,
      restEndsAt: null,
      elapsedSeconds: 0,
      isWorkoutSheetOpen: true,
    })
  },

  endWorkout: () => {
    removeKey(MMKV_WORKOUT_ID)
    removeKey(MMKV_STARTED_AT)
    removeKey(MMKV_REST_ENDS_AT)
    removeKey(MMKV_PENDING_WORKOUT_ACTION)
    set({
      activeWorkoutId: null,
      startedAt: null,
      exercises: [],
      isResting: false,
      restSecondsRemaining: 0,
      restEndsAt: null,
      elapsedSeconds: 0,
      isWorkoutSheetOpen: false,
    })
  },

  openWorkoutSheet: () => set({ isWorkoutSheetOpen: true }),
  closeWorkoutSheet: () => set({ isWorkoutSheetOpen: false }),

  addExercise: (entry) =>
    set((state) => ({
      exercises: [...state.exercises, { ...entry, sets: [] }],
    })),

  removeExercise: (workoutExerciseId) =>
    set((state) => ({
      exercises: state.exercises.filter((ex) => ex.workoutExerciseId !== workoutExerciseId),
    })),

  updateExerciseWeightUnit: (workoutExerciseId, weightUnit) =>
    set((state) => ({
      exercises: state.exercises.map((ex) =>
        ex.workoutExerciseId === workoutExerciseId
          ? { ...ex, weightUnit }
          : ex,
      ),
    })),

  addSet: (workoutExerciseId, newSet) =>
    set((state) => ({
      exercises: state.exercises.map((ex) =>
        ex.workoutExerciseId === workoutExerciseId
          ? { ...ex, sets: [...ex.sets, newSet] }
          : ex,
      ),
    })),

  startRest: (seconds) => {
    const safeSeconds = Math.max(1, seconds)
    const restEndsAt = Date.now() + safeSeconds * 1000
    setString(MMKV_REST_ENDS_AT, restEndsAt.toString())
    set({ isResting: true, restSecondsRemaining: safeSeconds, restEndsAt })
  },

  tickRest: () =>
    set((state) => {
      const restEndsAt = state.restEndsAt
      const next = restEndsAt
        ? Math.ceil((restEndsAt - Date.now()) / 1000)
        : state.restSecondsRemaining - 1
      if (next <= 0) {
        removeKey(MMKV_REST_ENDS_AT)
      }
      return next <= 0
        ? { isResting: false, restSecondsRemaining: 0, restEndsAt: null }
        : { restSecondsRemaining: next }
    }),

  clearRest: () => {
    removeKey(MMKV_REST_ENDS_AT)
    set({ isResting: false, restSecondsRemaining: 0, restEndsAt: null })
  },

  tickElapsed: () =>
    set((state) => ({ elapsedSeconds: state.elapsedSeconds + 1 })),

  adjustRest: (delta) =>
    set((state) => {
      const restSecondsRemaining = Math.max(5, state.restSecondsRemaining + delta)
      const restEndsAt = Date.now() + restSecondsRemaining * 1000
      setString(MMKV_REST_ENDS_AT, restEndsAt.toString())
      return { restSecondsRemaining, restEndsAt }
    }),
}))
