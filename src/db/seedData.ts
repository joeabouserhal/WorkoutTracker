import { db } from './client'
import { sections, methods, exerciseTypes } from './schema'

async function ensureTables() {
  await db.$client.execute(`CREATE TABLE IF NOT EXISTS sections (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, is_custom INTEGER NOT NULL DEFAULT 0
  )`)
  await db.$client.execute(`CREATE TABLE IF NOT EXISTS methods (
    id TEXT PRIMARY KEY, name TEXT NOT NULL
  )`)
  await db.$client.execute(`CREATE TABLE IF NOT EXISTS exercise_types (
    id TEXT PRIMARY KEY, section_id TEXT NOT NULL, name TEXT NOT NULL,
    is_custom INTEGER NOT NULL DEFAULT 0,
    method_locked INTEGER NOT NULL DEFAULT 0,
    locked_method_id TEXT
  )`)
  await db.$client.execute(`CREATE TABLE IF NOT EXISTS exercises (
    id TEXT PRIMARY KEY, exercise_type_id TEXT NOT NULL, method_id TEXT NOT NULL,
    default_unit TEXT NOT NULL DEFAULT 'kg'
  )`)
  await db.$client.execute(`CREATE TABLE IF NOT EXISTS workouts (
    id TEXT PRIMARY KEY, started_at INTEGER NOT NULL, ended_at INTEGER, notes TEXT
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
  { section: 'Cardio', name: 'Treadmill Run', methodLocked: true, lockedMethod: 'Machine' },
  { section: 'Cardio', name: 'Cycling', methodLocked: true, lockedMethod: 'Machine' },
  { section: 'Cardio', name: 'Rowing Machine', methodLocked: true, lockedMethod: 'Machine' },
  { section: 'Cardio', name: 'Jump Rope', methodLocked: true, lockedMethod: 'Bodyweight' },
  { section: 'Cardio', name: 'Stair Climber', methodLocked: true, lockedMethod: 'Machine' },
]

export async function seedDatabaseIfEmpty(): Promise<void> {
  await ensureTables()

  const result = await db.$client.execute('SELECT COUNT(*) as count FROM sections')
  const count = (result.rows[0] as any)?.count ?? 0
  if (count > 0) return

  const sectionNames = ['Chest', 'Back', 'Shoulders', 'Biceps', 'Triceps', 'Forearms', 'Legs', 'Glutes', 'Core', 'Cardio']
  const sectionRows = sectionNames.map((name, i) => ({
    id: genId(i),
    name,
    isCustom: 0,
  }))
  await db.insert(sections).values(sectionRows)

  const methodNames = ['Barbell', 'Dumbbell', 'Cable', 'Machine', 'Bodyweight']
  const methodRows = methodNames.map((name, i) => ({
    id: genId(100 + i),
    name,
  }))
  await db.insert(methods).values(methodRows)

  const sectionMap: Record<string, string> = Object.fromEntries(sectionRows.map((s) => [s.name, s.id]))
  const methodMap: Record<string, string> = Object.fromEntries(methodRows.map((m) => [m.name, m.id]))

  const exerciseTypeRows = EXERCISE_DEFS.map((def, i) => ({
    id: genId(200 + i),
    sectionId: sectionMap[def.section],
    name: def.name,
    isCustom: 0,
    methodLocked: def.methodLocked ? 1 : 0,
    lockedMethodId: def.lockedMethod ? methodMap[def.lockedMethod] ?? null : null,
  }))
  await db.insert(exerciseTypes).values(exerciseTypeRows)
}
