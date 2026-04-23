import { create } from 'zustand'

interface SetEntry {
  id: string
  setType: string
  weight: number
  weightUnit: string
  reps: number
  completedAt: number
}

interface ExerciseEntry {
  exerciseId: string
  sets: SetEntry[]
}

interface SessionState {
  activeWorkoutId: string | null
  exercises: ExerciseEntry[]
  isResting: boolean
  restSecondsRemaining: number
  elapsedSeconds: number
  startWorkout: (workoutId: string) => void
  endWorkout: () => void
  addExercise: (exerciseId: string) => void
  addSet: (exerciseId: string, set: SetEntry) => void
  startRest: (seconds: number) => void
  tickRest: () => void
  tickElapsed: () => void
  adjustRest: (delta: number) => void
}

export const useSessionStore = create<SessionState>()((set) => ({
  activeWorkoutId: null,
  exercises: [],
  isResting: false,
  restSecondsRemaining: 0,
  elapsedSeconds: 0,

  startWorkout: (workoutId) =>
    set({
      activeWorkoutId: workoutId,
      exercises: [],
      isResting: false,
      restSecondsRemaining: 0,
      elapsedSeconds: 0,
    }),

  endWorkout: () =>
    set({
      activeWorkoutId: null,
      exercises: [],
      isResting: false,
      restSecondsRemaining: 0,
      elapsedSeconds: 0,
    }),

  addExercise: (exerciseId) =>
    set((state) => ({
      exercises: [...state.exercises, { exerciseId, sets: [] }],
    })),

  addSet: (exerciseId, newSet) =>
    set((state) => ({
      exercises: state.exercises.map((ex) =>
        ex.exerciseId === exerciseId
          ? { ...ex, sets: [...ex.sets, newSet] }
          : ex
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
