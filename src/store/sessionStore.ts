import { create } from 'zustand'
import { setString, removeKey } from '@/storage/mmkv'

export const MMKV_WORKOUT_ID = 'active_workout_id'
export const MMKV_STARTED_AT = 'workout_started_at'
export const MMKV_REST_ENDS_AT = 'rest_ends_at'
export const MMKV_PENDING_WORKOUT_ACTION = 'pending_workout_action'
export const MMKV_LOCAL_SETS = 'active_workout_local_sets'

export interface SetEntry {
  id: string
  setType: string
  weight: number
  weightUnit: string
  reps: number
  completedAt: number
}

export interface ExerciseEntry {
  workoutExerciseId: string
  exerciseTypeId: string
  exerciseTypeName: string
  methodLocked?: number
  methodId: string
  methodName: string
  weightUnit: string
  plannedSetCount?: number
  sets: SetEntry[]
}

type RestoreWorkoutSessionParams = {
  workoutId: string
  startedAt: number
  exercises: ExerciseEntry[]
  restEndsAt?: number | null
  openSheet?: boolean
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
  endWorkoutRequestId: number

  startWorkout: (workoutId: string) => void
  restoreWorkoutSession: (params: RestoreWorkoutSessionParams) => void
  endWorkout: () => void
  openWorkoutSheet: () => void
  closeWorkoutSheet: () => void
  requestEndWorkout: () => void
  addExercise: (entry: Omit<ExerciseEntry, 'sets'>) => void
  removeExercise: (workoutExerciseId: string) => void
  reorderExercises: (workoutExerciseIds: string[]) => void
  updateExerciseWeightUnit: (workoutExerciseId: string, weightUnit: string) => void
  addSet: (workoutExerciseId: string, set: SetEntry) => void
  updateSet: (
    workoutExerciseId: string,
    setId: string,
    updates: Pick<SetEntry, 'weight' | 'weightUnit' | 'reps'>,
  ) => void
  removeSet: (workoutExerciseId: string, setId: string) => void
  startRest: (seconds: number) => void
  tickRest: () => void
  clearRest: () => void
  tickElapsed: () => void
  adjustRest: (delta: number) => void
}

export const useSessionStore = create<SessionState>()((set, get) => ({
  activeWorkoutId: null,
  startedAt: null,
  exercises: [],
  isResting: false,
  restSecondsRemaining: 0,
  restEndsAt: null,
  elapsedSeconds: 0,
  isWorkoutSheetOpen: false,
  endWorkoutRequestId: 0,

  startWorkout: (workoutId) => {
    const now = Date.now()
    setString(MMKV_WORKOUT_ID, workoutId)
    setString(MMKV_STARTED_AT, now.toString())
    removeKey(MMKV_REST_ENDS_AT)
    removeKey(MMKV_LOCAL_SETS)
    set({
      activeWorkoutId: workoutId,
      startedAt: now,
      exercises: [],
      isResting: false,
      restSecondsRemaining: 0,
      restEndsAt: null,
      elapsedSeconds: 0,
      isWorkoutSheetOpen: true,
      endWorkoutRequestId: 0,
    })
  },

  restoreWorkoutSession: ({
    workoutId,
    startedAt,
    exercises,
    restEndsAt = null,
    openSheet = false,
  }) => {
    const safeStartedAt = Number.isFinite(startedAt) ? startedAt : Date.now()
    const safeRestEndsAt =
      typeof restEndsAt === 'number' && restEndsAt > Date.now()
        ? restEndsAt
        : null
    const restSecondsRemaining = safeRestEndsAt
      ? Math.max(1, Math.ceil((safeRestEndsAt - Date.now()) / 1000))
      : 0

    setString(MMKV_WORKOUT_ID, workoutId)
    setString(MMKV_STARTED_AT, safeStartedAt.toString())
    if (safeRestEndsAt) {
      setString(MMKV_REST_ENDS_AT, safeRestEndsAt.toString())
    } else {
      removeKey(MMKV_REST_ENDS_AT)
    }

    set({
      activeWorkoutId: workoutId,
      startedAt: safeStartedAt,
      exercises,
      isResting: Boolean(safeRestEndsAt),
      restSecondsRemaining,
      restEndsAt: safeRestEndsAt,
      elapsedSeconds: Math.max(0, Math.floor((Date.now() - safeStartedAt) / 1000)),
      isWorkoutSheetOpen: openSheet,
      endWorkoutRequestId: 0,
    })
  },

  endWorkout: () => {
    removeKey(MMKV_WORKOUT_ID)
    removeKey(MMKV_STARTED_AT)
    removeKey(MMKV_REST_ENDS_AT)
    removeKey(MMKV_PENDING_WORKOUT_ACTION)
    removeKey(MMKV_LOCAL_SETS)
    set({
      activeWorkoutId: null,
      startedAt: null,
      exercises: [],
      isResting: false,
      restSecondsRemaining: 0,
      restEndsAt: null,
      elapsedSeconds: 0,
      isWorkoutSheetOpen: false,
      endWorkoutRequestId: 0,
    })
  },

  openWorkoutSheet: () =>
    set({
      isWorkoutSheetOpen: true,
    }),
  closeWorkoutSheet: () => set({ isWorkoutSheetOpen: false }),
  requestEndWorkout: () =>
    set((state) => ({
      isWorkoutSheetOpen: true,
      endWorkoutRequestId: state.endWorkoutRequestId + 1,
    })),

  addExercise: (entry) =>
    set((state) => ({
      exercises: [...state.exercises, { ...entry, sets: [] }],
    })),

  removeExercise: (workoutExerciseId) =>
    set((state) => ({
      exercises: state.exercises.filter((ex) => ex.workoutExerciseId !== workoutExerciseId),
    })),

  reorderExercises: (workoutExerciseIds) =>
    set((state) => {
      const byId = new Map(state.exercises.map((exercise) => [exercise.workoutExerciseId, exercise]))
      return {
        exercises: workoutExerciseIds
          .map((id) => byId.get(id))
          .filter((exercise): exercise is ExerciseEntry => Boolean(exercise)),
      }
    }),

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

  updateSet: (workoutExerciseId, setId, updates) =>
    set((state) => ({
      exercises: state.exercises.map((ex) =>
        ex.workoutExerciseId === workoutExerciseId
          ? {
              ...ex,
              sets: ex.sets.map((setEntry) =>
                setEntry.id === setId ? { ...setEntry, ...updates } : setEntry,
              ),
            }
          : ex,
      ),
    })),

  removeSet: (workoutExerciseId, setId) =>
    set((state) => ({
      exercises: state.exercises.map((ex) =>
        ex.workoutExerciseId === workoutExerciseId
          ? { ...ex, sets: ex.sets.filter((setEntry) => setEntry.id !== setId) }
          : ex,
      ),
    })),

  startRest: (seconds) => {
    const safeSeconds = Math.max(1, seconds)
    const restEndsAt = Date.now() + safeSeconds * 1000
    setString(MMKV_REST_ENDS_AT, restEndsAt.toString())
    set({ isResting: true, restSecondsRemaining: safeSeconds, restEndsAt })
  },

  tickRest: () => {
    const state = get()
    if (!state.isResting) return

    if (state.restEndsAt) {
      const next = Math.ceil((state.restEndsAt - Date.now()) / 1000)
      if (next <= 0) {
        removeKey(MMKV_REST_ENDS_AT)
        set({ isResting: false, restSecondsRemaining: 0, restEndsAt: null })
      }
      return
    }

    const next = state.restSecondsRemaining - 1
    if (next <= 0) {
      removeKey(MMKV_REST_ENDS_AT)
      set({ isResting: false, restSecondsRemaining: 0, restEndsAt: null })
      return
    }
    set({ restSecondsRemaining: next })
  },

  clearRest: () => {
    removeKey(MMKV_REST_ENDS_AT)
    set({ isResting: false, restSecondsRemaining: 0, restEndsAt: null })
  },

  tickElapsed: () =>
    set((state) => ({ elapsedSeconds: state.elapsedSeconds + 1 })),

  adjustRest: (delta) =>
    set((state) => {
      const currentRestSeconds = state.restEndsAt
        ? Math.max(0, Math.ceil((state.restEndsAt - Date.now()) / 1000))
        : state.restSecondsRemaining
      const restSecondsRemaining = Math.max(5, currentRestSeconds + delta)
      const restEndsAt = Date.now() + restSecondsRemaining * 1000
      setString(MMKV_REST_ENDS_AT, restEndsAt.toString())
      return { restSecondsRemaining, restEndsAt }
    }),
}))
