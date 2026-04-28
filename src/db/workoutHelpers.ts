import { db } from './client'

async function ensureTable() {
  await db.$client.execute(`
    CREATE TABLE IF NOT EXISTS workouts (
      id TEXT PRIMARY KEY,
      name TEXT,
      started_at INTEGER NOT NULL,
      ended_at INTEGER,
      notes TEXT
    )
  `)

  const result = await db.$client.execute('PRAGMA table_info(workouts)')
  const hasNameColumn = result.rows.some(
    (row: { name?: unknown }) => row.name === 'name',
  )
  if (!hasNameColumn) {
    await db.$client.execute('ALTER TABLE workouts ADD COLUMN name TEXT')
  }
}

async function ensureExerciseTables() {
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
    est_one_rm REAL, volume REAL, completed_at INTEGER NOT NULL
  )`)
}

export async function createWorkout(): Promise<string> {
  await ensureTable()
  const id = `workout_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  await db.$client.execute(
    'INSERT INTO workouts (id, name, started_at) VALUES (?, ?, ?)',
    [id, 'Workout', Date.now()],
  )
  return id
}

export async function getWorkoutName(workoutId: string): Promise<string> {
  await ensureTable()
  const result = await db.$client.execute(
    'SELECT name FROM workouts WHERE id = ?',
    [workoutId],
  )
  const row = result.rows[0] as { name?: string | null } | undefined
  return row?.name ?? ''
}

export async function updateWorkoutName(workoutId: string, name: string): Promise<void> {
  await ensureTable()
  const trimmed = name.trim()
  await db.$client.execute(
    'UPDATE workouts SET name = ? WHERE id = ?',
    [trimmed.length > 0 ? trimmed : null, workoutId],
  )
}

export async function finishWorkout(workoutId: string): Promise<void> {
  await ensureTable()
  await db.$client.execute(
    'UPDATE workouts SET ended_at = ? WHERE id = ?',
    [Date.now(), workoutId],
  )
}

export async function deleteWorkout(workoutId: string): Promise<void> {
  await ensureTable()
  await ensureExerciseTables()
  await db.$client.execute(
    `DELETE FROM sets
     WHERE workout_exercise_id IN (
       SELECT id FROM workout_exercises WHERE workout_id = ?
     )`,
    [workoutId],
  )
  await db.$client.execute('DELETE FROM workout_exercises WHERE workout_id = ?', [workoutId])
  await db.$client.execute('DELETE FROM workouts WHERE id = ?', [workoutId])
}

export type WorkoutSummary = {
  id: string
  name: string | null
  startedAt: number
  endedAt: number
  exerciseCount: number
  setCount: number
  volume: number
}

export type WorkoutDetail = WorkoutSummary & {
  exercises: Array<{
    id: string
    exerciseName: string
    methodName: string
    defaultWeightUnit: string
    sets: Array<{
      id: string
      setType: string
      weightKg: number
      weightUnit: string
      reps: number
      volume: number
      completedAt: number
    }>
  }>
}

export async function getCompletedWorkoutsInRange(
  startAt: number,
  endAt: number,
): Promise<WorkoutSummary[]> {
  await ensureTable()
  await ensureExerciseTables()
  const result = await db.$client.execute(
    `SELECT
       w.id,
       w.name,
       w.started_at as startedAt,
       w.ended_at as endedAt,
       COUNT(DISTINCT we.id) as exerciseCount,
       COUNT(s.id) as setCount,
       COALESCE(SUM(s.volume), 0) as volume
     FROM workouts w
     LEFT JOIN workout_exercises we ON we.workout_id = w.id
     LEFT JOIN sets s ON s.workout_exercise_id = we.id
     WHERE w.ended_at IS NOT NULL
       AND w.started_at >= ?
       AND w.started_at < ?
     GROUP BY w.id
     ORDER BY w.started_at DESC`,
    [startAt, endAt],
  )
  return result.rows as WorkoutSummary[]
}

export async function getWorkoutDetail(workoutId: string): Promise<WorkoutDetail | null> {
  await ensureTable()
  await ensureExerciseTables()
  const workoutResult = await db.$client.execute(
    `SELECT
       w.id,
       w.name,
       w.started_at as startedAt,
       w.ended_at as endedAt,
       COUNT(DISTINCT we.id) as exerciseCount,
       COUNT(s.id) as setCount,
       COALESCE(SUM(s.volume), 0) as volume
     FROM workouts w
     LEFT JOIN workout_exercises we ON we.workout_id = w.id
     LEFT JOIN sets s ON s.workout_exercise_id = we.id
     WHERE w.id = ?
     GROUP BY w.id`,
    [workoutId],
  )
  const workout = workoutResult.rows[0] as WorkoutSummary | undefined
  if (!workout?.endedAt) return null

  const rows = (await db.$client.execute(
    `SELECT
       we.id as workoutExerciseId,
       et.name as exerciseName,
       m.name as methodName,
       e.default_unit as defaultWeightUnit,
       s.id as setId,
       s.set_type as setType,
       s.weight as weightKg,
       s.weight_unit as weightUnit,
       s.reps as reps,
       s.volume as volume,
       s.completed_at as completedAt
     FROM workout_exercises we
     JOIN exercises e ON e.id = we.exercise_id
     JOIN exercise_types et ON et.id = e.exercise_type_id
     JOIN methods m ON m.id = e.method_id
     LEFT JOIN sets s ON s.workout_exercise_id = we.id
     WHERE we.workout_id = ?
     ORDER BY we.order_index ASC, s.completed_at ASC`,
    [workoutId],
  )).rows as Array<{
    workoutExerciseId: string
    exerciseName: string
    methodName: string
    defaultWeightUnit: string | null
    setId: string | null
    setType: string | null
    weightKg: number | null
    weightUnit: string | null
    reps: number | null
    volume: number | null
    completedAt: number | null
  }>

  const exercises = rows.reduce<WorkoutDetail['exercises']>((acc, row) => {
    let exercise = acc.find((item) => item.id === row.workoutExerciseId)
    if (!exercise) {
      exercise = {
        id: row.workoutExerciseId,
        exerciseName: row.exerciseName,
        methodName: row.methodName,
        defaultWeightUnit: row.defaultWeightUnit === 'lb' ? 'lb' : 'kg',
        sets: [],
      }
      acc.push(exercise)
    }
    if (row.setId) {
      exercise.sets.push({
        id: row.setId,
        setType: row.setType ?? 'working',
        weightKg: row.weightKg ?? 0,
        weightUnit: row.weightUnit === 'lb' ? 'lb' : 'kg',
        reps: row.reps ?? 0,
        volume: row.volume ?? 0,
        completedAt: row.completedAt ?? 0,
      })
    }
    return acc
  }, [])

  return { ...workout, exercises }
}

export type SectionRow = { id: string; name: string }
export type ExerciseTypeRow = {
  id: string
  name: string
  sectionId: string
  isCustom: number
  methodLocked: number
  lockedMethodId: string | null
}
export type MethodRow = { id: string; name: string }

export async function getSections(): Promise<SectionRow[]> {
  const result = await db.$client.execute(
    "SELECT id, name FROM sections WHERE name != 'Cardio' ORDER BY name ASC",
  )
  return result.rows as SectionRow[]
}

export async function getExerciseTypesBySection(sectionId: string): Promise<ExerciseTypeRow[]> {
  const result = await db.$client.execute(
    'SELECT id, name, section_id as sectionId, is_custom as isCustom, method_locked as methodLocked, locked_method_id as lockedMethodId FROM exercise_types WHERE section_id = ? ORDER BY name ASC',
    [sectionId],
  )
  return result.rows as ExerciseTypeRow[]
}

export async function getMethods(): Promise<MethodRow[]> {
  const result = await db.$client.execute(
    'SELECT id, name FROM methods ORDER BY name ASC',
  )
  return result.rows as MethodRow[]
}

export async function getOrCreateExercise(
  exerciseTypeId: string,
  methodId: string,
): Promise<{ id: string; defaultUnit: string }> {
  await ensureExerciseTables()
  const existing = await db.$client.execute(
    'SELECT id, default_unit as defaultUnit FROM exercises WHERE exercise_type_id = ? AND method_id = ?',
    [exerciseTypeId, methodId],
  )
  if (existing.rows.length > 0) {
    return existing.rows[0] as { id: string; defaultUnit: string }
  }
  const id = `ex_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  await db.$client.execute(
    'INSERT INTO exercises (id, exercise_type_id, method_id, default_unit) VALUES (?, ?, ?, ?)',
    [id, exerciseTypeId, methodId, 'kg'],
  )
  return { id, defaultUnit: 'kg' }
}

export async function getMethodName(methodId: string): Promise<string> {
  const result = await db.$client.execute(
    'SELECT name FROM methods WHERE id = ?',
    [methodId],
  )
  return (result.rows[0] as any)?.name ?? ''
}

async function assertCanAddExerciseToWorkout(params: {
  workoutId: string
  exerciseTypeId: string
  methodId: string
}) {
  await ensureTable()

  const workout = await db.$client.execute(
    'SELECT id FROM workouts WHERE id = ? AND ended_at IS NULL',
    [params.workoutId],
  )
  if (workout.rows.length === 0) {
    throw new Error(`Cannot add exercise to missing or ended workout: ${params.workoutId}`)
  }

  const exerciseType = await db.$client.execute(
    'SELECT id FROM exercise_types WHERE id = ?',
    [params.exerciseTypeId],
  )
  if (exerciseType.rows.length === 0) {
    throw new Error(`Unknown exercise type: ${params.exerciseTypeId}`)
  }

  const method = await db.$client.execute(
    'SELECT id FROM methods WHERE id = ?',
    [params.methodId],
  )
  if (method.rows.length === 0) {
    throw new Error(`Unknown exercise method: ${params.methodId}`)
  }
}

export async function addExerciseToWorkout(params: {
  workoutId: string
  exerciseTypeId: string
  methodId: string
  weightUnit: string
  orderIndex: number
}): Promise<string> {
  await ensureExerciseTables()
  await assertCanAddExerciseToWorkout(params)
  const exercise = await getOrCreateExercise(params.exerciseTypeId, params.methodId)
  const id = `we_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  await db.$client.execute(
    'INSERT INTO workout_exercises (id, workout_id, exercise_id, order_index) VALUES (?, ?, ?, ?)',
    [id, params.workoutId, exercise.id, params.orderIndex],
  )
  return id
}

export async function addCompletedSetToWorkout(params: {
  workoutExerciseId: string
  weightKg: number
  reps: number
  weightUnit?: string
  setType?: string
}): Promise<string> {
  await ensureExerciseTables()
  const id = `set_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  const weightKg = Number.isFinite(params.weightKg) ? params.weightKg : 0
  const weightUnit = params.weightUnit === 'lb' ? 'lb' : 'kg'
  const reps = Number.isFinite(params.reps) ? params.reps : 0
  const volume = weightKg * reps

  await db.$client.execute(
    `INSERT INTO sets (
      id,
      workout_exercise_id,
      set_type,
      weight,
      weight_unit,
      reps,
      volume,
      completed_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      params.workoutExerciseId,
      params.setType ?? 'working',
      weightKg,
      weightUnit,
      reps,
      volume,
      Date.now(),
    ],
  )
  return id
}

export async function deleteCompletedSet(setId: string): Promise<void> {
  await ensureExerciseTables()
  await db.$client.execute('DELETE FROM sets WHERE id = ?', [setId])
}
