import { db } from './client'

async function ensureTable() {
  await db.$client.execute(`
    CREATE TABLE IF NOT EXISTS workouts (
      id TEXT PRIMARY KEY,
      started_at INTEGER NOT NULL,
      ended_at INTEGER,
      notes TEXT
    )
  `)
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
}

export async function createWorkout(): Promise<string> {
  await ensureTable()
  const id = `workout_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  await db.$client.execute(
    'INSERT INTO workouts (id, started_at) VALUES (?, ?)',
    [id, Date.now()],
  )
  return id
}

export async function finishWorkout(workoutId: string): Promise<void> {
  await ensureTable()
  await db.$client.execute(
    'UPDATE workouts SET ended_at = ? WHERE id = ?',
    [Date.now(), workoutId],
  )
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
    'SELECT id, name FROM sections ORDER BY name ASC',
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

export async function addExerciseToWorkout(params: {
  workoutId: string
  exerciseTypeId: string
  methodId: string
  weightUnit: string
  orderIndex: number
}): Promise<string> {
  await ensureExerciseTables()
  const exercise = await getOrCreateExercise(params.exerciseTypeId, params.methodId)
  const id = `we_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  await db.$client.execute(
    'INSERT INTO workout_exercises (id, workout_id, exercise_id, order_index) VALUES (?, ?, ?, ?)',
    [id, params.workoutId, exercise.id, params.orderIndex],
  )
  return id
}
