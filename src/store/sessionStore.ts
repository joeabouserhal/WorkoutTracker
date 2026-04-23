import { create } from 'zustand'
import { setString, removeKey } from '@/storage/mmkv'

export const MMKV_WORKOUT_ID = 'active_workout_id'
export const MMKV_STARTED_AT = 'workout_started_at'

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
  elapsedSeconds: number
  isWorkoutSheetOpen: boolean

  startWorkout: (workoutId: string) => void
  endWorkout: () => void
  openWorkoutSheet: () => void
  closeWorkoutSheet: () => void
  addExercise: (entry: Omit<ExerciseEntry, 'sets'>) => void
  removeExercise: (workoutExerciseId: string) => void
  addSet: (workoutExerciseId: string, set: SetEntry) => void
  startRest: (seconds: number) => void
  tickRest: () => void
  tickElapsed: () => void
  adjustRest: (delta: number) => void
}

export const useSessionStore = create<SessionState>()((set) => ({
  activeWorkoutId: null,
  startedAt: null,
  exercises: [],
  isResting: false,
  restSecondsRemaining: 0,
  elapsedSeconds: 0,
  isWorkoutSheetOpen: false,

  startWorkout: (workoutId) => {
    const now = Date.now()
    setString(MMKV_WORKOUT_ID, workoutId)
    setString(MMKV_STARTED_AT, now.toString())
    set({
      activeWorkoutId: workoutId,
      startedAt: now,
      exercises: [],
      isResting: false,
      restSecondsRemaining: 0,
      elapsedSeconds: 0,
      isWorkoutSheetOpen: true,
    })
  },

  endWorkout: () => {
    removeKey(MMKV_WORKOUT_ID)
    removeKey(MMKV_STARTED_AT)
    set({
      activeWorkoutId: null,
      startedAt: null,
      exercises: [],
      isResting: false,
      restSecondsRemaining: 0,
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

  addSet: (workoutExerciseId, newSet) =>
    set((state) => ({
      exercises: state.exercises.map((ex) =>
        ex.workoutExerciseId === workoutExerciseId
          ? { ...ex, sets: [...ex.sets, newSet] }
          : ex,
      ),
    })),

  startRest: (seconds) =>
    set({ isResting: true, restSecondsRemaining: seconds }),

  tickRest: () =>
    set((state) => {
      const next = state.restSecondsRemaining - 1
      return next <= 0
        ? { isResting: false, restSecondsRemaining: 0 }
        : { restSecondsRemaining: next }
    }),

  tickElapsed: () =>
    set((state) => ({ elapsedSeconds: state.elapsedSeconds + 1 })),

  adjustRest: (delta) =>
    set((state) => ({
      restSecondsRemaining: Math.max(5, state.restSecondsRemaining + delta),
    })),
}))
