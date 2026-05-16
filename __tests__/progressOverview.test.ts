jest.mock('../src/db/client', () => ({ db: {} }))

import {
  buildProgressOverviewFromRows,
  type ProgressSetRow,
} from '../src/db/progressHelpers'

function row(overrides: Partial<ProgressSetRow>): ProgressSetRow {
  return {
    setId: 'set',
    exerciseTypeId: 'bench',
    exerciseName: 'Bench Press',
    methodId: 'barbell',
    methodName: 'Barbell',
    workoutId: 'workout',
    workoutStartedAt: 1,
    weightKg: 80,
    weightUnit: 'kg',
    reps: 5,
    completedAt: 1,
    ...overrides,
  }
}

const DAY_MS = 24 * 60 * 60 * 1000

test('builds progress overview summary candidates from mixed exercises', () => {
  const overview = buildProgressOverviewFromRows([
    row({
      setId: 'bench-1',
      workoutId: 'workout-1',
      workoutStartedAt: 1000,
      weightKg: 80,
      reps: 5,
      completedAt: 1000,
    }),
    row({
      setId: 'bench-2',
      workoutId: 'workout-2',
      workoutStartedAt: 2000,
      weightKg: 92.5,
      reps: 5,
      completedAt: 2000,
    }),
    row({
      setId: 'deadlift-1',
      exerciseTypeId: 'deadlift',
      exerciseName: 'Deadlift',
      methodId: 'barbell',
      methodName: 'Barbell',
      workoutId: 'workout-3',
      workoutStartedAt: 3000,
      weightKg: 140,
      reps: 3,
      completedAt: 3000,
    }),
    row({
      setId: 'curl-1',
      exerciseTypeId: 'curl',
      exerciseName: 'Curl',
      methodId: 'dumbbell',
      methodName: 'Dumbbell',
      workoutId: 'workout-4',
      workoutStartedAt: 4000,
      weightKg: 20,
      reps: 10,
      completedAt: 4000,
    }),
  ])

  expect(overview.exercises).toHaveLength(3)
  expect(overview.summary.latestPr?.exerciseName).toBe('Curl')
  expect(overview.summary.latestRecentPr).toBeNull()
  expect(overview.summary.bestRecentImprovement).toBeNull()
  expect(overview.summary.recentPrCount).toBe(0)
  expect(overview.summary.recentImprovedLiftCount).toBe(0)
})

test('builds recent progress momentum from same-lift PR improvements', () => {
  const now = 100 * DAY_MS
  const overview = buildProgressOverviewFromRows(
    [
      row({
        setId: 'bench-1',
        workoutId: 'bench-workout-1',
        workoutStartedAt: now - 45 * DAY_MS,
        weightKg: 80,
        reps: 5,
        completedAt: now - 45 * DAY_MS,
      }),
      row({
        setId: 'bench-2',
        workoutId: 'bench-workout-2',
        workoutStartedAt: now - 10 * DAY_MS,
        weightKg: 90,
        reps: 5,
        completedAt: now - 10 * DAY_MS,
      }),
      row({
        setId: 'bench-3',
        workoutId: 'bench-workout-3',
        workoutStartedAt: now - 2 * DAY_MS,
        weightKg: 95,
        reps: 5,
        completedAt: now - 2 * DAY_MS,
      }),
      row({
        setId: 'deadlift-1',
        exerciseTypeId: 'deadlift',
        exerciseName: 'Deadlift',
        workoutId: 'deadlift-workout-1',
        workoutStartedAt: now - 5 * DAY_MS,
        weightKg: 140,
        reps: 3,
        completedAt: now - 5 * DAY_MS,
      }),
      row({
        setId: 'curl-1',
        exerciseTypeId: 'curl',
        exerciseName: 'Curl',
        methodId: 'dumbbell',
        methodName: 'Dumbbell',
        workoutId: 'curl-workout-1',
        workoutStartedAt: now - 60 * DAY_MS,
        weightKg: 20,
        reps: 10,
        completedAt: now - 60 * DAY_MS,
      }),
      row({
        setId: 'curl-2',
        exerciseTypeId: 'curl',
        exerciseName: 'Curl',
        methodId: 'dumbbell',
        methodName: 'Dumbbell',
        workoutId: 'curl-workout-2',
        workoutStartedAt: now - 20 * DAY_MS,
        weightKg: 24,
        reps: 10,
        completedAt: now - 20 * DAY_MS,
      }),
      row({
        setId: 'press-1',
        exerciseTypeId: 'press',
        exerciseName: 'Overhead Press',
        workoutId: 'press-workout-1',
        workoutStartedAt: now - 70 * DAY_MS,
        weightKg: 50,
        reps: 5,
        completedAt: now - 70 * DAY_MS,
      }),
      row({
        setId: 'press-2',
        exerciseTypeId: 'press',
        exerciseName: 'Overhead Press',
        workoutId: 'press-workout-2',
        workoutStartedAt: now - 31 * DAY_MS,
        weightKg: 55,
        reps: 5,
        completedAt: now - 31 * DAY_MS,
      }),
    ],
    undefined,
    now,
  )

  expect(overview.summary.recentWindowDays).toBe(30)
  expect(overview.summary.recentPrCount).toBe(3)
  expect(overview.summary.recentImprovedLiftCount).toBe(2)
  expect(overview.summary.latestRecentPr?.exerciseName).toBe('Bench Press')
  expect(overview.summary.latestRecentPr?.deltaKg).toBeCloseTo(5)
  expect(overview.summary.bestRecentImprovement?.exerciseName).toBe('Bench Press')
  expect(overview.summary.bestRecentImprovement?.deltaKg).toBeCloseTo(10)
})

test('respects an optional exercise limit after ranking', () => {
  const overview = buildProgressOverviewFromRows(
    [
      row({ exerciseTypeId: 'bench', exerciseName: 'Bench Press' }),
      row({
        exerciseTypeId: 'deadlift',
        exerciseName: 'Deadlift',
        setId: 'deadlift-1',
      }),
      row({ exerciseTypeId: 'curl', exerciseName: 'Curl', setId: 'curl-1' }),
    ],
    2,
  )

  expect(overview.exercises).toHaveLength(2)
})
