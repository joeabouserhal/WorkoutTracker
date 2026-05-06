import { db } from './client'

type ProgressSetRow = {
  setId: string
  exerciseTypeId: string
  exerciseName: string
  methodId: string
  methodName: string
  workoutId: string
  workoutStartedAt: number
  weightKg: number
  weightUnit: string | null
  reps: number
  completedAt: number
}

export type ProgressPoint = {
  timestamp: number
  weightKg: number
  estimatedOneRmKg: number
  reps: number
  methodName: string
}

export type ProgressPrPoint = {
  timestamp: number
  weightKg: number
  weightUnit: string
  reps: number
  methodName: string
}

export type ProgressExerciseSummary = {
  exerciseTypeId: string
  exerciseName: string
  setCount: number
  workoutCount: number
  methodCount: number
  firstSetAt: number
  latestSetAt: number
  currentPrKg: number
  currentPrUnit: string
  currentPrReps: number
  currentPrMethodName: string
  estimatedOneRmKg: number
  estimatedOneRmReps: number
  estimatedOneRmMethodName: string
  weightDeltaKg: number
  estimatedOneRmDeltaKg: number
  trend: ProgressPoint[]
  prHistory: ProgressPrPoint[]
}

export type ProgressOverview = {
  exercises: ProgressExerciseSummary[]
}

async function ensureProgressTables() {
  await db.$client.execute(`CREATE TABLE IF NOT EXISTS workouts (
    id TEXT PRIMARY KEY,
    name TEXT,
    started_at INTEGER NOT NULL,
    ended_at INTEGER,
    notes TEXT
  )`)
  await db.$client.execute(`CREATE TABLE IF NOT EXISTS exercises (
    id TEXT PRIMARY KEY, exercise_type_id TEXT NOT NULL, method_id TEXT NOT NULL,
    default_unit TEXT NOT NULL DEFAULT 'kg'
  )`)
  await db.$client.execute(`CREATE TABLE IF NOT EXISTS workout_exercises (
    id TEXT PRIMARY KEY, workout_id TEXT NOT NULL, exercise_id TEXT NOT NULL,
    order_index INTEGER NOT NULL DEFAULT 0
  )`)
  await db.$client.execute(`CREATE TABLE IF NOT EXISTS sets (
    id TEXT PRIMARY KEY, workout_exercise_id TEXT NOT NULL,
    set_type TEXT NOT NULL DEFAULT 'working', weight REAL NOT NULL,
    weight_unit TEXT NOT NULL DEFAULT 'kg', reps INTEGER NOT NULL,
    est_one_rm REAL, volume REAL,
    completed_at INTEGER NOT NULL
  )`)
  await db.$client.execute(`CREATE TABLE IF NOT EXISTS exercise_types (
    id TEXT PRIMARY KEY, section_id TEXT NOT NULL, name TEXT NOT NULL,
    is_custom INTEGER NOT NULL DEFAULT 0,
    method_locked INTEGER NOT NULL DEFAULT 0,
    locked_method_id TEXT
  )`)
  await db.$client.execute(`CREATE TABLE IF NOT EXISTS methods (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, is_custom INTEGER NOT NULL DEFAULT 0
  )`)
}

function estimateOneRmKg(weightKg: number, reps: number) {
  if (reps <= 1) return weightKg
  return weightKg * (1 + reps / 30)
}

function isGreater(a: number, b: number) {
  return a > b + 0.000001
}

function normalizeUnit(unit?: string | null) {
  return unit === 'lb' ? 'lb' : 'kg'
}

function chooseBestWorkoutPoint(rows: ProgressSetRow[]): ProgressPoint {
  const sorted = [...rows].sort((a, b) => {
    if (a.weightKg !== b.weightKg) return b.weightKg - a.weightKg
    return estimateOneRmKg(b.weightKg, b.reps) - estimateOneRmKg(a.weightKg, a.reps)
  })
  const best = sorted[0]
  return {
    timestamp: best.workoutStartedAt,
    weightKg: best.weightKg,
    estimatedOneRmKg: estimateOneRmKg(best.weightKg, best.reps),
    reps: best.reps,
    methodName: best.methodName,
  }
}

function buildPrHistory(rows: ProgressSetRow[]): ProgressPrPoint[] {
  let bestWeight = 0
  const history: ProgressPrPoint[] = []

  for (const row of rows) {
    if (!isGreater(row.weightKg, bestWeight)) continue
    bestWeight = row.weightKg
    history.push({
      timestamp: row.completedAt,
      weightKg: row.weightKg,
      weightUnit: normalizeUnit(row.weightUnit),
      reps: row.reps,
      methodName: row.methodName,
    })
  }

  return history
}

export async function getProgressOverview(limit = 6): Promise<ProgressOverview> {
  await ensureProgressTables()

  const result = await db.$client.execute(
    `SELECT
       s.id as setId,
       e.exercise_type_id as exerciseTypeId,
       et.name as exerciseName,
       e.method_id as methodId,
       m.name as methodName,
       w.id as workoutId,
       w.started_at as workoutStartedAt,
       s.weight as weightKg,
       s.weight_unit as weightUnit,
       s.reps as reps,
       s.completed_at as completedAt
     FROM sets s
     JOIN workout_exercises we ON we.id = s.workout_exercise_id
     JOIN workouts w ON w.id = we.workout_id
     JOIN exercises e ON e.id = we.exercise_id
     JOIN exercise_types et ON et.id = e.exercise_type_id
     JOIN methods m ON m.id = e.method_id
     WHERE w.ended_at IS NOT NULL
       AND s.weight > 0
       AND s.reps > 0
     ORDER BY s.completed_at ASC, s.id ASC`,
  )

  const rows = (result.rows as ProgressSetRow[]).map((row) => ({
    ...row,
    workoutStartedAt: Number(row.workoutStartedAt),
    weightKg: Number(row.weightKg),
    reps: Number(row.reps),
    completedAt: Number(row.completedAt),
  }))
  const grouped = rows.reduce<Record<string, ProgressSetRow[]>>((acc, row) => {
    acc[row.exerciseTypeId] = [...(acc[row.exerciseTypeId] ?? []), row]
    return acc
  }, {})

  const exercises = Object.entries(grouped).map(([exerciseTypeId, exerciseRows]) => {
    const sorted = [...exerciseRows].sort((a, b) =>
      a.completedAt === b.completedAt
        ? a.setId.localeCompare(b.setId)
        : a.completedAt - b.completedAt,
    )
    const workoutIds = new Set(sorted.map((row) => row.workoutId))
    const methodIds = new Set(sorted.map((row) => row.methodId))
    const byWorkout = sorted.reduce<Record<string, ProgressSetRow[]>>((acc, row) => {
      acc[row.workoutId] = [...(acc[row.workoutId] ?? []), row]
      return acc
    }, {})

    const trend = Object.values(byWorkout)
      .map(chooseBestWorkoutPoint)
      .sort((a, b) => a.timestamp - b.timestamp)

    const currentPrRow = [...sorted].sort((a, b) => {
      if (a.weightKg !== b.weightKg) return b.weightKg - a.weightKg
      return a.completedAt - b.completedAt
    })[0]
    const oneRmRow = [...sorted].sort((a, b) =>
      estimateOneRmKg(b.weightKg, b.reps) - estimateOneRmKg(a.weightKg, a.reps),
    )[0]
    const firstPoint = trend[0]
    const latestPoint = trend[trend.length - 1]

    return {
      exerciseTypeId,
      exerciseName: sorted[0]?.exerciseName ?? 'Exercise',
      setCount: sorted.length,
      workoutCount: workoutIds.size,
      methodCount: methodIds.size,
      firstSetAt: sorted[0]?.completedAt ?? Date.now(),
      latestSetAt: sorted[sorted.length - 1]?.completedAt ?? Date.now(),
      currentPrKg: currentPrRow?.weightKg ?? 0,
      currentPrUnit: normalizeUnit(currentPrRow?.weightUnit),
      currentPrReps: currentPrRow?.reps ?? 0,
      currentPrMethodName: currentPrRow?.methodName ?? 'Method',
      estimatedOneRmKg: oneRmRow ? estimateOneRmKg(oneRmRow.weightKg, oneRmRow.reps) : 0,
      estimatedOneRmReps: oneRmRow?.reps ?? 0,
      estimatedOneRmMethodName: oneRmRow?.methodName ?? 'Method',
      weightDeltaKg: latestPoint && firstPoint ? latestPoint.weightKg - firstPoint.weightKg : 0,
      estimatedOneRmDeltaKg: latestPoint && firstPoint
        ? latestPoint.estimatedOneRmKg - firstPoint.estimatedOneRmKg
        : 0,
      trend,
      prHistory: buildPrHistory(sorted),
    } satisfies ProgressExerciseSummary
  })

  return {
    exercises: exercises
      .sort((a, b) => {
        if (a.setCount !== b.setCount) return b.setCount - a.setCount
        if (a.workoutCount !== b.workoutCount) return b.workoutCount - a.workoutCount
        return b.latestSetAt - a.latestSetAt
      })
      .slice(0, limit),
  }
}
