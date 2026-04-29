import { db } from './client'
import { sections, methods, exerciseTypes } from './schema'

async function ensureTables() {
  await db.$client.execute(`CREATE TABLE IF NOT EXISTS sections (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, is_custom INTEGER NOT NULL DEFAULT 0
  )`)
  await db.$client.execute(`CREATE TABLE IF NOT EXISTS methods (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, is_custom INTEGER NOT NULL DEFAULT 0
  )`)
  await db.$client.execute(`CREATE TABLE IF NOT EXISTS exercise_types (
    id TEXT PRIMARY KEY, section_id TEXT NOT NULL, name TEXT NOT NULL,
    is_custom INTEGER NOT NULL DEFAULT 0,
    method_locked INTEGER NOT NULL DEFAULT 0,
    locked_method_id TEXT
  )`)
  await db.$client.execute(`CREATE TABLE IF NOT EXISTS exercise_type_method_exclusions (
    exercise_type_id TEXT NOT NULL,
    method_id TEXT NOT NULL,
    PRIMARY KEY (exercise_type_id, method_id)
  )`)

  const sectionColumns = await db.$client.execute('PRAGMA table_info(sections)')
  const hasSectionCustom = sectionColumns.rows.some(
    (row: { name?: unknown }) => row.name === 'is_custom',
  )
  if (!hasSectionCustom) {
    await db.$client.execute('ALTER TABLE sections ADD COLUMN is_custom INTEGER NOT NULL DEFAULT 0')
  }

  const methodColumns = await db.$client.execute('PRAGMA table_info(methods)')
  const hasMethodCustom = methodColumns.rows.some(
    (row: { name?: unknown }) => row.name === 'is_custom',
  )
  if (!hasMethodCustom) {
    await db.$client.execute('ALTER TABLE methods ADD COLUMN is_custom INTEGER NOT NULL DEFAULT 0')
  }

  const exerciseTypeColumns = await db.$client.execute('PRAGMA table_info(exercise_types)')
  const hasExerciseTypeCustom = exerciseTypeColumns.rows.some(
    (row: { name?: unknown }) => row.name === 'is_custom',
  )
  const hasMethodLocked = exerciseTypeColumns.rows.some(
    (row: { name?: unknown }) => row.name === 'method_locked',
  )
  const hasLockedMethodId = exerciseTypeColumns.rows.some(
    (row: { name?: unknown }) => row.name === 'locked_method_id',
  )
  if (!hasExerciseTypeCustom) {
    await db.$client.execute('ALTER TABLE exercise_types ADD COLUMN is_custom INTEGER NOT NULL DEFAULT 0')
  }
  if (!hasMethodLocked) {
    await db.$client.execute('ALTER TABLE exercise_types ADD COLUMN method_locked INTEGER NOT NULL DEFAULT 0')
  }
  if (!hasLockedMethodId) {
    await db.$client.execute('ALTER TABLE exercise_types ADD COLUMN locked_method_id TEXT')
  }

  await db.$client.execute(`CREATE TABLE IF NOT EXISTS exercises (
    id TEXT PRIMARY KEY, exercise_type_id TEXT NOT NULL, method_id TEXT NOT NULL,
    default_unit TEXT NOT NULL DEFAULT 'kg'
  )`)
  await db.$client.execute(`CREATE TABLE IF NOT EXISTS workouts (
    id TEXT PRIMARY KEY, name TEXT, started_at INTEGER NOT NULL, ended_at INTEGER, notes TEXT
  )`)
  const workoutColumns = await db.$client.execute('PRAGMA table_info(workouts)')
  const hasWorkoutNameColumn = workoutColumns.rows.some(
    (row: { name?: unknown }) => row.name === 'name',
  )
  if (!hasWorkoutNameColumn) {
    await db.$client.execute('ALTER TABLE workouts ADD COLUMN name TEXT')
  }
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

function genId(index: number): string {
  return (Date.now() + index).toString() + Math.random().toString(36).slice(2, 8)
}

type ExerciseDef = {
  section: string
  name: string
  methodLocked?: boolean
  lockedMethod?: string
}

const EXERCISE_DEFS: ExerciseDef[] = [
  { section: 'Chest', name: 'Bench Press' },
  { section: 'Chest', name: 'Incline Bench Press' },
  { section: 'Chest', name: 'Decline Bench Press' },
  { section: 'Chest', name: 'Chest Fly' },
  { section: 'Chest', name: 'Cable Crossover' },
  { section: 'Chest', name: 'Push Up', methodLocked: true, lockedMethod: 'Bodyweight' },
  { section: 'Back', name: 'Deadlift' },
  { section: 'Back', name: 'Pull Up', methodLocked: true, lockedMethod: 'Bodyweight' },
  { section: 'Back', name: 'Lat Pulldown' },
  { section: 'Back', name: 'Seated Row' },
  { section: 'Back', name: 'T-Bar Row', methodLocked: true, lockedMethod: 'Machine' },
  { section: 'Back', name: 'Single Arm Row' },
  { section: 'Back', name: 'Face Pull' },
  { section: 'Shoulders', name: 'Overhead Press' },
  { section: 'Shoulders', name: 'Lateral Raise' },
  { section: 'Shoulders', name: 'Front Raise' },
  { section: 'Shoulders', name: 'Rear Delt Fly' },
  { section: 'Shoulders', name: 'Shrug' },
  { section: 'Biceps', name: 'Bicep Curl' },
  { section: 'Biceps', name: 'Hammer Curl' },
  { section: 'Biceps', name: 'Preacher Curl' },
  { section: 'Biceps', name: 'Concentration Curl' },
  { section: 'Biceps', name: 'Reverse Curl' },
  { section: 'Biceps', name: 'Spider Curl' },
  { section: 'Triceps', name: 'Tricep Pushdown' },
  { section: 'Triceps', name: 'Overhead Tricep Extension' },
  { section: 'Triceps', name: 'Skull Crusher' },
  { section: 'Triceps', name: 'Close Grip Bench Press' },
  { section: 'Triceps', name: 'Dip', methodLocked: true, lockedMethod: 'Bodyweight' },
  { section: 'Triceps', name: 'Kickback' },
  { section: 'Forearms', name: 'Wrist Curl' },
  { section: 'Forearms', name: 'Reverse Wrist Curl' },
  { section: 'Forearms', name: 'Farmers Carry' },
  { section: 'Legs', name: 'Squat' },
  { section: 'Legs', name: 'Leg Press', methodLocked: true, lockedMethod: 'Machine' },
  { section: 'Legs', name: 'Romanian Deadlift' },
  { section: 'Legs', name: 'Leg Extension', methodLocked: true, lockedMethod: 'Machine' },
  { section: 'Legs', name: 'Leg Curl', methodLocked: true, lockedMethod: 'Machine' },
  { section: 'Legs', name: 'Calf Raise' },
  { section: 'Legs', name: 'Bulgarian Split Squat' },
  { section: 'Legs', name: 'Hack Squat' },
  { section: 'Legs', name: 'Walking Lunge' },
  { section: 'Glutes', name: 'Hip Thrust' },
  { section: 'Glutes', name: 'Glute Bridge' },
  { section: 'Glutes', name: 'Cable Kickback' },
  { section: 'Glutes', name: 'Abductor Machine', methodLocked: true, lockedMethod: 'Machine' },
  { section: 'Core', name: 'Plank', methodLocked: true, lockedMethod: 'Bodyweight' },
  { section: 'Core', name: 'Crunch', methodLocked: true, lockedMethod: 'Bodyweight' },
  { section: 'Core', name: 'Hanging Leg Raise' },
  { section: 'Core', name: 'Cable Crunch' },
  { section: 'Core', name: 'Ab Rollout' },
  { section: 'Core', name: 'Russian Twist' },
  { section: 'Core', name: 'Side Plank', methodLocked: true, lockedMethod: 'Bodyweight' },
]

export async function seedDatabaseIfEmpty(): Promise<void> {
  await ensureTables()

  const sectionNames = ['Chest', 'Back', 'Shoulders', 'Biceps', 'Triceps', 'Forearms', 'Legs', 'Glutes', 'Core']
  const sectionRows = []
  for (const [i, name] of sectionNames.entries()) {
    const existing = await db.$client.execute(
      'SELECT id, name, is_custom as isCustom FROM sections WHERE name = ? LIMIT 1',
      [name],
    )
    if (existing.rows.length > 0) {
      sectionRows.push(existing.rows[0] as { id: string; name: string; isCustom: number })
      continue
    }
    const row = {
      id: genId(i),
      name,
      isCustom: 0,
    }
    await db.insert(sections).values(row)
    sectionRows.push(row)
  }

  const methodNames = ['Barbell', 'Dumbbell', 'Cable', 'Machine', 'Bodyweight']
  const methodRows = []
  for (const [i, name] of methodNames.entries()) {
    const existing = await db.$client.execute(
      'SELECT id, name FROM methods WHERE name = ? LIMIT 1',
      [name],
    )
    if (existing.rows.length > 0) {
      methodRows.push(existing.rows[0] as { id: string; name: string })
      continue
    }
    const row = {
      id: genId(100 + i),
      name,
      isCustom: 0,
    }
    await db.insert(methods).values(row)
    methodRows.push(row)
  }

  const sectionMap: Record<string, string> = Object.fromEntries(sectionRows.map((s) => [s.name, s.id]))
  const methodMap: Record<string, string> = Object.fromEntries(methodRows.map((m) => [m.name, m.id]))

  for (const [i, def] of EXERCISE_DEFS.entries()) {
    const sectionId = sectionMap[def.section]
    const lockedMethodId = def.lockedMethod ? methodMap[def.lockedMethod] ?? null : null
    const existing = await db.$client.execute(
      'SELECT id FROM exercise_types WHERE section_id = ? AND name = ? LIMIT 1',
      [sectionId, def.name],
    )
    if (existing.rows.length > 0) {
      await db.$client.execute(
        'UPDATE exercise_types SET method_locked = ?, locked_method_id = ? WHERE id = ?',
        [def.methodLocked ? 1 : 0, lockedMethodId, (existing.rows[0] as { id: string }).id],
      )
      continue
    }
    await db.insert(exerciseTypes).values({
      id: genId(200 + i),
      sectionId,
      name: def.name,
      isCustom: 0,
      methodLocked: def.methodLocked ? 1 : 0,
      lockedMethodId,
    })
  }
}
