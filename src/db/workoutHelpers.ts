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
    est_one_rm REAL, volume REAL,
    completed_at INTEGER NOT NULL
  )`)
}

async function ensureLibraryTables() {
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

export async function updateCompletedWorkout(params: {
  workoutId: string
  name: string
  startedAt: number
  sets: CompletedWorkoutSetUpdate[]
}): Promise<void> {
  await ensureTable()
  await ensureExerciseTables()

  const workoutResult = await db.$client.execute(
    'SELECT started_at as startedAt, ended_at as endedAt FROM workouts WHERE id = ? AND ended_at IS NOT NULL',
    [params.workoutId],
  )
  const workout = workoutResult.rows[0] as {
    startedAt?: number
    endedAt?: number | null
  } | undefined
  if (!workout?.startedAt || !workout.endedAt) {
    throw new Error('Workout is not available for editing')
  }

  const startedAt = Number.isFinite(params.startedAt)
    ? Math.trunc(params.startedAt)
    : workout.startedAt
  const delta = startedAt - workout.startedAt
  const endedAt = workout.endedAt + delta
  const trimmedName = params.name.trim()

  await db.$client.execute(
    'UPDATE workouts SET name = ?, started_at = ?, ended_at = ? WHERE id = ?',
    [trimmedName.length > 0 ? trimmedName : null, startedAt, endedAt, params.workoutId],
  )

  if (delta !== 0) {
    await db.$client.execute(
      `UPDATE sets
       SET completed_at = completed_at + ?
       WHERE workout_exercise_id IN (
         SELECT id FROM workout_exercises WHERE workout_id = ?
       )`,
      [delta, params.workoutId],
    )
  }

  for (const set of params.sets) {
    const weightKg = Number.isFinite(set.weightKg) ? set.weightKg : 0
    const weightUnit = set.weightUnit === 'lb' ? 'lb' : 'kg'
    const reps = Number.isFinite(set.reps) ? Math.max(0, Math.trunc(set.reps)) : 0
    const volume = weightKg * reps
    await db.$client.execute(
      `UPDATE sets
       SET weight = ?, weight_unit = ?, reps = ?, volume = ?
       WHERE id = ?
         AND workout_exercise_id IN (
           SELECT id FROM workout_exercises WHERE workout_id = ?
         )`,
      [weightKg, weightUnit, reps, volume, set.id, params.workoutId],
    )
  }
}

export async function finishWorkout(workoutId: string): Promise<void> {
  await ensureTable()
  await ensureExerciseTables()
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

export async function deleteWorkoutExercise(workoutExerciseId: string): Promise<void> {
  await ensureExerciseTables()
  await db.$client.execute(
    'DELETE FROM sets WHERE workout_exercise_id = ?',
    [workoutExerciseId],
  )
  await db.$client.execute(
    'DELETE FROM workout_exercises WHERE id = ?',
    [workoutExerciseId],
  )
}

export async function updateWorkoutExerciseOrder(
  workoutExerciseIds: string[],
): Promise<void> {
  await ensureExerciseTables()
  for (const [index, workoutExerciseId] of workoutExerciseIds.entries()) {
    await db.$client.execute(
      'UPDATE workout_exercises SET order_index = ? WHERE id = ?',
      [index, workoutExerciseId],
    )
  }
}

export type WorkoutSummary = {
  id: string
  name: string | null
  startedAt: number
  endedAt: number
  exerciseCount: number
  setCount: number
  volume: number
  weightPrCount: number
  currentWeightPrCount: number
}

export type WorkoutDetail = WorkoutSummary & {
  exercises: Array<{
    id: string
    exerciseName: string
    methodName: string
    defaultWeightUnit: string
    hasWeightPr: boolean
    hasCurrentWeightPr: boolean
    sets: Array<{
      id: string
      setType: string
      weightKg: number
      weightUnit: string
      reps: number
      volume: number
      isWeightPr: boolean
      isCurrentWeightPr: boolean
      completedAt: number
    }>
  }>
}

export type ActiveWorkoutSession = {
  id: string
  name: string | null
  startedAt: number
  exercises: Array<{
    workoutExerciseId: string
    exerciseTypeId: string
    exerciseTypeName: string
    methodLocked: number
    methodId: string
    methodName: string
    weightUnit: string
    plannedSetCount?: number
    sets: Array<{
      id: string
      setType: string
      weight: number
      weightUnit: string
      reps: number
      completedAt: number
    }>
  }>
}

export type WorkoutWeightPrAchievement = {
  setId: string
  exerciseName: string
  methodName: string
  previousWeightKg: number | null
  newWeightKg: number
  weightUnit: string
  reps: number
  isCurrentWeightPr: boolean
  hasPriorExerciseHistory: boolean
}

export type CompletedWorkoutSetUpdate = {
  id: string
  weightKg: number
  weightUnit: string
  reps: number
}

type WeightPrHistorySetRow = {
  setId: string
  exerciseTypeId: string
  methodId: string
  weightKg: number
  completedAt: number
}

type VisibleWeightPrSetRow = WeightPrHistorySetRow & {
  workoutId?: string
}

type WeightPrFlags = {
  isWeightPr: boolean
  isCurrentWeightPr: boolean
}

function weightPrKey(exerciseTypeId: string, methodId: string): string {
  return `${exerciseTypeId}::${methodId}`
}

function isGreaterWeight(a: number, b: number): boolean {
  return a > b + 0.000001
}

async function getWeightPrHistoryForExerciseTypes(
  exerciseTypeIds: string[],
): Promise<WeightPrHistorySetRow[]> {
  const uniqueIds = [...new Set(exerciseTypeIds)].filter(Boolean)
  if (uniqueIds.length === 0) return []

  const placeholders = uniqueIds.map(() => '?').join(', ')
  const result = await db.$client.execute(
    `SELECT
       s.id as setId,
       e.exercise_type_id as exerciseTypeId,
       e.method_id as methodId,
       s.weight as weightKg,
       s.completed_at as completedAt
     FROM sets s
     JOIN workout_exercises we ON we.id = s.workout_exercise_id
     JOIN exercises e ON e.id = we.exercise_id
     JOIN workouts w ON w.id = we.workout_id
     WHERE e.exercise_type_id IN (${placeholders})
       AND w.ended_at IS NOT NULL
       AND s.weight > 0
     ORDER BY s.completed_at ASC, s.id ASC`,
    uniqueIds,
  )
  return result.rows as WeightPrHistorySetRow[]
}

function buildWeightPrFlags(
  rows: WeightPrHistorySetRow[],
): Record<string, WeightPrFlags> {
  const grouped = rows.reduce<Record<string, WeightPrHistorySetRow[]>>((acc, row) => {
    const key = weightPrKey(row.exerciseTypeId, row.methodId)
    acc[key] = [...(acc[key] ?? []), row]
    return acc
  }, {})
  const flags: Record<string, WeightPrFlags> = {}

  for (const groupRows of Object.values(grouped)) {
    const sorted = [...groupRows].sort((a, b) =>
      a.completedAt === b.completedAt
        ? a.setId.localeCompare(b.setId)
        : a.completedAt - b.completedAt,
    )
    const maxWeight = sorted.reduce((max, row) => Math.max(max, row.weightKg), 0)
    let bestWeight = 0

    for (const row of sorted) {
      const isWeightPr = isGreaterWeight(row.weightKg, bestWeight)
      if (isWeightPr) {
        flags[row.setId] = {
          isWeightPr: true,
          isCurrentWeightPr: Math.abs(row.weightKg - maxWeight) < 0.000001,
        }
        bestWeight = row.weightKg
      }
    }
  }

  return flags
}

async function enrichWorkoutSummariesWithWeightPrs(
  summaries: WorkoutSummary[],
): Promise<WorkoutSummary[]> {
  if (summaries.length === 0) return summaries

  const workoutIds = summaries.map((workout) => workout.id)
  const placeholders = workoutIds.map(() => '?').join(', ')
  const visibleRows = (await db.$client.execute(
    `SELECT
       w.id as workoutId,
       s.id as setId,
       e.exercise_type_id as exerciseTypeId,
       e.method_id as methodId,
       s.weight as weightKg,
       s.completed_at as completedAt
     FROM workouts w
     JOIN workout_exercises we ON we.workout_id = w.id
     JOIN exercises e ON e.id = we.exercise_id
     JOIN sets s ON s.workout_exercise_id = we.id
     WHERE w.id IN (${placeholders})
       AND s.weight > 0`,
    workoutIds,
  )).rows as VisibleWeightPrSetRow[]

  const flags = buildWeightPrFlags(
    await getWeightPrHistoryForExerciseTypes(
      visibleRows.map((row) => row.exerciseTypeId),
    ),
  )
  const counts = visibleRows.reduce<Record<string, { weightPrCount: number; currentWeightPrCount: number }>>(
    (acc, row) => {
      const current = acc[row.workoutId ?? ''] ?? { weightPrCount: 0, currentWeightPrCount: 0 }
      const rowFlags = flags[row.setId]
      if (rowFlags?.isWeightPr) current.weightPrCount += 1
      if (rowFlags?.isCurrentWeightPr) current.currentWeightPrCount += 1
      if (row.workoutId) acc[row.workoutId] = current
      return acc
    },
    {},
  )

  return summaries.map((workout) => ({
    ...workout,
    weightPrCount: counts[workout.id]?.weightPrCount ?? 0,
    currentWeightPrCount: counts[workout.id]?.currentWeightPrCount ?? 0,
  }))
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
  return enrichWorkoutSummariesWithWeightPrs(result.rows as WorkoutSummary[])
}

export async function getRecentCompletedWorkouts(limit = 3): Promise<WorkoutSummary[]> {
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
     GROUP BY w.id
     ORDER BY w.started_at DESC
     LIMIT ?`,
    [limit],
  )
  return enrichWorkoutSummariesWithWeightPrs(result.rows as WorkoutSummary[])
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
       et.id as exerciseTypeId,
       et.name as exerciseName,
       m.name as methodName,
       e.method_id as methodId,
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
    exerciseTypeId: string
    exerciseName: string
    methodName: string
    methodId: string
    defaultWeightUnit: string | null
    setId: string | null
    setType: string | null
    weightKg: number | null
    weightUnit: string | null
    reps: number | null
    volume: number | null
    completedAt: number | null
  }>

  const weightPrFlags = buildWeightPrFlags(
    await getWeightPrHistoryForExerciseTypes(rows.map((row) => row.exerciseTypeId)),
  )

  const exercises = rows.reduce<WorkoutDetail['exercises']>((acc, row) => {
    let exercise = acc.find((item) => item.id === row.workoutExerciseId)
    if (!exercise) {
      exercise = {
        id: row.workoutExerciseId,
        exerciseName: row.exerciseName,
        methodName: row.methodName,
        defaultWeightUnit: row.defaultWeightUnit === 'lb' ? 'lb' : 'kg',
        hasWeightPr: false,
        hasCurrentWeightPr: false,
        sets: [],
      }
      acc.push(exercise)
    }
    if (row.setId) {
      const flags = weightPrFlags[row.setId] ?? {
        isWeightPr: false,
        isCurrentWeightPr: false,
      }
      exercise.hasWeightPr = exercise.hasWeightPr || flags.isWeightPr
      exercise.hasCurrentWeightPr =
        exercise.hasCurrentWeightPr || flags.isCurrentWeightPr
      exercise.sets.push({
        id: row.setId,
        setType: row.setType ?? 'working',
        weightKg: row.weightKg ?? 0,
        weightUnit: row.weightUnit === 'lb' ? 'lb' : 'kg',
        reps: row.reps ?? 0,
        volume: row.volume ?? 0,
        isWeightPr: flags.isWeightPr,
        isCurrentWeightPr: flags.isCurrentWeightPr,
        completedAt: row.completedAt ?? 0,
      })
    }
    return acc
  }, [])

  const prCounts = exercises.reduce(
    (acc, exercise) => {
      for (const set of exercise.sets) {
        if (set.isWeightPr) acc.weightPrCount += 1
        if (set.isCurrentWeightPr) acc.currentWeightPrCount += 1
      }
      return acc
    },
    { weightPrCount: 0, currentWeightPrCount: 0 },
  )

  return { ...workout, ...prCounts, exercises }
}

export async function getWorkoutWeightPrAchievements(
  workoutId: string,
): Promise<WorkoutWeightPrAchievement[]> {
  await ensureTable()
  await ensureExerciseTables()

  const workoutRows = (await db.$client.execute(
    `SELECT
       s.id as setId,
       et.name as exerciseName,
       m.name as methodName,
       e.exercise_type_id as exerciseTypeId,
       e.method_id as methodId,
       s.weight as weightKg,
       s.weight_unit as weightUnit,
       s.reps as reps,
       s.completed_at as completedAt
     FROM workout_exercises we
     JOIN exercises e ON e.id = we.exercise_id
     JOIN exercise_types et ON et.id = e.exercise_type_id
     JOIN methods m ON m.id = e.method_id
     JOIN sets s ON s.workout_exercise_id = we.id
     JOIN workouts w ON w.id = we.workout_id
     WHERE we.workout_id = ?
       AND w.ended_at IS NOT NULL
       AND s.weight > 0
     ORDER BY s.completed_at ASC, s.id ASC`,
    [workoutId],
  )).rows as Array<{
    setId: string
    exerciseName: string
    methodName: string
    exerciseTypeId: string
    methodId: string
    weightKg: number
    weightUnit: string | null
    reps: number
    completedAt: number
  }>

  if (workoutRows.length === 0) return []

  const workoutRowsBySetId = workoutRows.reduce<Record<string, typeof workoutRows[number]>>(
    (acc, row) => {
      acc[row.setId] = row
      return acc
    },
    {},
  )
  const workoutSetIds = new Set(workoutRows.map((row) => row.setId))
  const exerciseTypeIds = workoutRows.map((row) => row.exerciseTypeId)
  const uniqueExerciseTypeIds = [...new Set(exerciseTypeIds)].filter(Boolean)
  const priorExerciseTypeIds = new Set<string>()
  if (uniqueExerciseTypeIds.length > 0) {
    const placeholders = uniqueExerciseTypeIds.map(() => '?').join(', ')
    const priorRows = (await db.$client.execute(
      `SELECT DISTINCT e.exercise_type_id as exerciseTypeId
       FROM sets s
       JOIN workout_exercises we ON we.id = s.workout_exercise_id
       JOIN exercises e ON e.id = we.exercise_id
       JOIN workouts w ON w.id = we.workout_id
       WHERE e.exercise_type_id IN (${placeholders})
         AND w.id <> ?
         AND w.ended_at IS NOT NULL
         AND s.weight > 0`,
      [...uniqueExerciseTypeIds, workoutId],
    )).rows as Array<{ exerciseTypeId: string }>
    for (const row of priorRows) {
      priorExerciseTypeIds.add(row.exerciseTypeId)
    }
  }
  const historyRows = await getWeightPrHistoryForExerciseTypes(
    exerciseTypeIds,
  )
  const groupedRows = historyRows.reduce<Record<string, WeightPrHistorySetRow[]>>((acc, row) => {
    const key = weightPrKey(row.exerciseTypeId, row.methodId)
    acc[key] = [...(acc[key] ?? []), row]
    return acc
  }, {})
  const achievements: WorkoutWeightPrAchievement[] = []

  for (const groupRows of Object.values(groupedRows)) {
    const sorted = [...groupRows].sort((a, b) =>
      a.completedAt === b.completedAt
        ? a.setId.localeCompare(b.setId)
        : a.completedAt - b.completedAt,
    )
    const maxWeight = sorted.reduce((max, row) => Math.max(max, row.weightKg), 0)
    let bestWeight = 0

    for (const row of sorted) {
      const isWeightPr = isGreaterWeight(row.weightKg, bestWeight)
      if (isWeightPr && workoutSetIds.has(row.setId)) {
        const workoutRow = workoutRowsBySetId[row.setId]
        if (workoutRow) {
          achievements.push({
            setId: row.setId,
            exerciseName: workoutRow.exerciseName,
            methodName: workoutRow.methodName,
            previousWeightKg: bestWeight > 0 ? bestWeight : null,
            newWeightKg: row.weightKg,
            weightUnit: workoutRow.weightUnit === 'lb' ? 'lb' : 'kg',
            reps: workoutRow.reps,
            isCurrentWeightPr: Math.abs(row.weightKg - maxWeight) < 0.000001,
            hasPriorExerciseHistory: priorExerciseTypeIds.has(workoutRow.exerciseTypeId),
          })
        }
      }
      if (isWeightPr) {
        bestWeight = row.weightKg
      }
    }
  }

  return achievements.sort((a, b) => a.exerciseName.localeCompare(b.exerciseName))
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
export type MethodRow = { id: string; name: string; isCustom: number }
export type ExercisePrSummary = {
  weightKg: number | null
  weightUnit: string | null
  weightMethodName: string | null
}
export type MethodPrSummary = {
  weightKg: number | null
  weightUnit: string | null
}

type PrSetRow = {
  exerciseTypeId: string
  methodId: string
  methodName: string
  weightKg: number
  weightUnit: string | null
}

function genLibraryId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

function reduceExercisePrRows(rows: PrSetRow[]): Record<string, ExercisePrSummary> {
  return rows.reduce<Record<string, ExercisePrSummary>>((acc, row) => {
    const current = acc[row.exerciseTypeId] ?? {
      weightKg: null,
      weightUnit: null,
      weightMethodName: null,
    }
    if (current.weightKg === null || row.weightKg > current.weightKg) {
      current.weightKg = row.weightKg
      current.weightUnit = row.weightUnit === 'lb' ? 'lb' : 'kg'
      current.weightMethodName = row.methodName
    }
    acc[row.exerciseTypeId] = current
    return acc
  }, {})
}

function reduceMethodPrRows(rows: PrSetRow[]): Record<string, MethodPrSummary> {
  return rows.reduce<Record<string, MethodPrSummary>>((acc, row) => {
    const current = acc[row.methodId] ?? {
      weightKg: null,
      weightUnit: null,
    }
    if (current.weightKg === null || row.weightKg > current.weightKg) {
      current.weightKg = row.weightKg
      current.weightUnit = row.weightUnit === 'lb' ? 'lb' : 'kg'
    }
    acc[row.methodId] = current
    return acc
  }, {})
}

export async function getSections(): Promise<SectionRow[]> {
  await ensureLibraryTables()
  const result = await db.$client.execute(
    "SELECT id, name FROM sections WHERE name != 'Cardio' ORDER BY name ASC",
  )
  return result.rows as SectionRow[]
}

export async function getExerciseTypesBySection(sectionId: string): Promise<ExerciseTypeRow[]> {
  await ensureLibraryTables()
  const result = await db.$client.execute(
    'SELECT id, name, section_id as sectionId, is_custom as isCustom, method_locked as methodLocked, locked_method_id as lockedMethodId FROM exercise_types WHERE section_id = ? ORDER BY name ASC',
    [sectionId],
  )
  return result.rows as ExerciseTypeRow[]
}

export async function getExercisePrSummariesBySection(
  sectionId: string,
): Promise<Record<string, ExercisePrSummary>> {
  await ensureLibraryTables()
  await ensureExerciseTables()
  const rows = (await db.$client.execute(
    `SELECT
       et.id as exerciseTypeId,
       m.id as methodId,
       m.name as methodName,
       s.weight as weightKg,
       s.weight_unit as weightUnit
     FROM sets s
     JOIN workout_exercises we ON we.id = s.workout_exercise_id
     JOIN exercises e ON e.id = we.exercise_id
     JOIN exercise_types et ON et.id = e.exercise_type_id
     JOIN methods m ON m.id = e.method_id
     JOIN workouts w ON w.id = we.workout_id
     WHERE et.section_id = ?
       AND w.ended_at IS NOT NULL
     ORDER BY s.completed_at ASC`,
    [sectionId],
  )).rows as PrSetRow[]

  return reduceExercisePrRows(rows)
}

export async function getMethodPrSummariesForExerciseType(
  exerciseTypeId: string,
): Promise<Record<string, MethodPrSummary>> {
  await ensureLibraryTables()
  await ensureExerciseTables()
  const rows = (await db.$client.execute(
    `SELECT
       e.exercise_type_id as exerciseTypeId,
       m.id as methodId,
       m.name as methodName,
       s.weight as weightKg,
       s.weight_unit as weightUnit
     FROM sets s
     JOIN workout_exercises we ON we.id = s.workout_exercise_id
     JOIN exercises e ON e.id = we.exercise_id
     JOIN methods m ON m.id = e.method_id
     JOIN workouts w ON w.id = we.workout_id
     WHERE e.exercise_type_id = ?
       AND w.ended_at IS NOT NULL
     ORDER BY s.completed_at ASC`,
    [exerciseTypeId],
  )).rows as PrSetRow[]

  return reduceMethodPrRows(rows)
}

export async function isExerciseTypeMethodLocked(exerciseTypeId: string): Promise<boolean> {
  await ensureLibraryTables()
  const result = await db.$client.execute(
    'SELECT method_locked as methodLocked FROM exercise_types WHERE id = ?',
    [exerciseTypeId],
  )
  const row = result.rows[0] as { methodLocked?: number } | undefined
  return Boolean(row?.methodLocked)
}

export async function getMethods(): Promise<MethodRow[]> {
  await ensureLibraryTables()
  const result = await db.$client.execute(
    'SELECT id, name, is_custom as isCustom FROM methods ORDER BY name ASC',
  )
  return result.rows as MethodRow[]
}

export async function getMethodsForExerciseType(exerciseTypeId: string): Promise<MethodRow[]> {
  await ensureLibraryTables()
  const exerciseType = await db.$client.execute(
    'SELECT is_custom as isCustom FROM exercise_types WHERE id = ?',
    [exerciseTypeId],
  )
  const isCustom = Boolean((exerciseType.rows[0] as { isCustom?: number } | undefined)?.isCustom)
  if (!isCustom) return getMethods()

  const result = await db.$client.execute(
    `SELECT m.id, m.name, m.is_custom as isCustom
     FROM methods m
     WHERE NOT EXISTS (
       SELECT 1
       FROM exercise_type_method_exclusions ex
       WHERE ex.exercise_type_id = ? AND ex.method_id = m.id
     )
     ORDER BY m.name ASC`,
    [exerciseTypeId],
  )
  return result.rows as MethodRow[]
}

export async function hasHiddenDefaultMethods(exerciseTypeId: string): Promise<boolean> {
  await ensureLibraryTables()
  const result = await db.$client.execute(
    `SELECT 1
     FROM exercise_type_method_exclusions ex
     JOIN methods m ON m.id = ex.method_id
     JOIN exercise_types et ON et.id = ex.exercise_type_id
     WHERE ex.exercise_type_id = ?
       AND et.is_custom = 1
       AND m.is_custom = 0
     LIMIT 1`,
    [exerciseTypeId],
  )
  return result.rows.length > 0
}

export async function restoreDefaultMethodsForExerciseType(exerciseTypeId: string): Promise<void> {
  await ensureLibraryTables()
  const exerciseType = await db.$client.execute(
    'SELECT is_custom as isCustom FROM exercise_types WHERE id = ?',
    [exerciseTypeId],
  )
  const row = exerciseType.rows[0] as { isCustom?: number } | undefined
  if (!row?.isCustom) {
    throw new Error('Default methods can only be restored for custom exercises')
  }

  await db.$client.execute(
    `DELETE FROM exercise_type_method_exclusions
     WHERE exercise_type_id = ?
       AND method_id IN (
         SELECT id FROM methods WHERE is_custom = 0
       )`,
    [exerciseTypeId],
  )
}

export async function createCustomSection(name: string): Promise<SectionRow> {
  const trimmed = name.trim()
  if (!trimmed) throw new Error('Section name is required')
  await ensureLibraryTables()
  const id = genLibraryId('section')
  await db.$client.execute(
    'INSERT INTO sections (id, name, is_custom) VALUES (?, ?, ?)',
    [id, trimmed, 1],
  )
  return { id, name: trimmed }
}

export async function createCustomMethod(name: string): Promise<MethodRow> {
  const trimmed = name.trim()
  if (!trimmed) throw new Error('Method name is required')
  await ensureLibraryTables()
  const id = genLibraryId('method')
  await db.$client.execute(
    'INSERT INTO methods (id, name, is_custom) VALUES (?, ?, ?)',
    [id, trimmed, 1],
  )
  return { id, name: trimmed, isCustom: 1 }
}

export async function deleteCustomExerciseType(exerciseTypeId: string): Promise<void> {
  await ensureLibraryTables()
  await ensureExerciseTables()

  const exerciseType = await db.$client.execute(
    'SELECT id, is_custom as isCustom FROM exercise_types WHERE id = ?',
    [exerciseTypeId],
  )
  const row = exerciseType.rows[0] as { id: string; isCustom: number } | undefined
  if (!row?.isCustom) {
    throw new Error('Only custom exercises can be deleted')
  }

  const usage = await db.$client.execute(
    `SELECT COUNT(*) as count
     FROM workout_exercises we
     JOIN exercises e ON e.id = we.exercise_id
     WHERE e.exercise_type_id = ?`,
    [exerciseTypeId],
  )
  const count = Number((usage.rows[0] as { count?: number } | undefined)?.count ?? 0)
  if (count > 0) {
    throw new Error('This exercise is used in saved workouts')
  }

  await db.$client.execute('DELETE FROM exercises WHERE exercise_type_id = ?', [exerciseTypeId])
  await db.$client.execute('DELETE FROM exercise_types WHERE id = ?', [exerciseTypeId])
}

export async function deleteCustomMethodFromExercise(
  exerciseTypeId: string,
  methodId: string,
): Promise<void> {
  await ensureLibraryTables()
  await ensureExerciseTables()

  const exerciseType = await db.$client.execute(
    'SELECT id, is_custom as isCustom, locked_method_id as lockedMethodId FROM exercise_types WHERE id = ?',
    [exerciseTypeId],
  )
  const exerciseTypeRow = exerciseType.rows[0] as {
    id: string
    isCustom: number
    lockedMethodId: string | null
  } | undefined
  if (!exerciseTypeRow?.isCustom) {
    throw new Error('Methods can only be deleted from custom exercises')
  }

  const method = await db.$client.execute(
    'SELECT id FROM methods WHERE id = ?',
    [methodId],
  )
  if (method.rows.length === 0) {
    throw new Error('Unknown method')
  }

  const usage = await db.$client.execute(
    `SELECT COUNT(*) as count
     FROM workout_exercises we
     JOIN exercises e ON e.id = we.exercise_id
     WHERE e.exercise_type_id = ? AND e.method_id = ?`,
    [exerciseTypeId, methodId],
  )
  const count = Number((usage.rows[0] as { count?: number } | undefined)?.count ?? 0)
  if (count > 0) {
    throw new Error('This method is used in saved workouts')
  }

  await db.$client.execute(
    'DELETE FROM exercises WHERE exercise_type_id = ? AND method_id = ?',
    [exerciseTypeId, methodId],
  )
  await db.$client.execute(
    'INSERT OR IGNORE INTO exercise_type_method_exclusions (exercise_type_id, method_id) VALUES (?, ?)',
    [exerciseTypeId, methodId],
  )
  if (exerciseTypeRow.lockedMethodId === methodId) {
    await db.$client.execute(
      'UPDATE exercise_types SET method_locked = 0, locked_method_id = NULL WHERE id = ?',
      [exerciseTypeId],
    )
  }
}

export async function createCustomExerciseType(params: {
  sectionId: string
  name: string
  methodLocked: boolean
  lockedMethodId?: string | null
}): Promise<ExerciseTypeRow> {
  const trimmed = params.name.trim()
  if (!trimmed) throw new Error('Exercise name is required')
  if (params.methodLocked && !params.lockedMethodId) {
    throw new Error('A single-method exercise needs a method')
  }

  await ensureLibraryTables()
  const id = genLibraryId('exercise_type')
  await db.$client.execute(
    `INSERT INTO exercise_types (
      id,
      section_id,
      name,
      is_custom,
      method_locked,
      locked_method_id
    ) VALUES (?, ?, ?, ?, ?, ?)`,
    [
      id,
      params.sectionId,
      trimmed,
      1,
      params.methodLocked ? 1 : 0,
      params.methodLocked ? params.lockedMethodId ?? null : null,
    ],
  )
  return {
    id,
    sectionId: params.sectionId,
    name: trimmed,
    isCustom: 1,
    methodLocked: params.methodLocked ? 1 : 0,
    lockedMethodId: params.methodLocked ? params.lockedMethodId ?? null : null,
  }
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
  await ensureLibraryTables()
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
  await ensureLibraryTables()

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

  const excludedMethod = await db.$client.execute(
    `SELECT 1
     FROM exercise_type_method_exclusions
     WHERE exercise_type_id = ? AND method_id = ?`,
    [params.exerciseTypeId, params.methodId],
  )
  if (excludedMethod.rows.length > 0) {
    throw new Error(`Method is not available for exercise type: ${params.exerciseTypeId}`)
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
  const reps = Number.isFinite(params.reps) ? Math.max(0, Math.trunc(params.reps)) : 0
  const volume = weightKg * reps
  const exerciseResult = await db.$client.execute(
    'SELECT id FROM workout_exercises WHERE id = ?',
    [params.workoutExerciseId],
  )
  if (exerciseResult.rows.length === 0) {
    throw new Error(`Unknown workout exercise: ${params.workoutExerciseId}`)
  }

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

export async function getLatestOpenWorkoutId(): Promise<string | null> {
  await ensureTable()
  const result = await db.$client.execute(
    `SELECT id
     FROM workouts
     WHERE ended_at IS NULL
     ORDER BY started_at DESC
     LIMIT 1`,
  )
  const row = result.rows[0] as { id?: string } | undefined
  return row?.id ?? null
}

export async function getActiveWorkoutSession(
  workoutId: string,
): Promise<ActiveWorkoutSession | null> {
  await ensureTable()
  await ensureExerciseTables()
  await ensureLibraryTables()

  const workoutResult = await db.$client.execute(
    `SELECT id, name, started_at as startedAt
     FROM workouts
     WHERE id = ? AND ended_at IS NULL`,
    [workoutId],
  )
  const workout = workoutResult.rows[0] as {
    id: string
    name: string | null
    startedAt: number
  } | undefined

  if (!workout) return null

  const rows = (await db.$client.execute(
    `SELECT
       we.id as workoutExerciseId,
       we.order_index as orderIndex,
       et.id as exerciseTypeId,
       et.name as exerciseTypeName,
       et.method_locked as methodLocked,
       m.id as methodId,
       m.name as methodName,
       e.default_unit as defaultWeightUnit,
       s.id as setId,
       s.set_type as setType,
       s.weight as weight,
       s.weight_unit as setWeightUnit,
       s.reps as reps,
       s.completed_at as completedAt
     FROM workout_exercises we
     JOIN exercises e ON e.id = we.exercise_id
     JOIN exercise_types et ON et.id = e.exercise_type_id
     JOIN methods m ON m.id = e.method_id
     LEFT JOIN sets s ON s.workout_exercise_id = we.id
     WHERE we.workout_id = ?
     ORDER BY we.order_index ASC, s.completed_at ASC, s.id ASC`,
    [workoutId],
  )).rows as Array<{
    workoutExerciseId: string
    orderIndex: number
    exerciseTypeId: string
    exerciseTypeName: string
    methodLocked: number
    methodId: string
    methodName: string
    defaultWeightUnit: string | null
    setId: string | null
    setType: string | null
    weight: number | null
    setWeightUnit: string | null
    reps: number | null
    completedAt: number | null
  }>

  const exercises = rows.reduce<ActiveWorkoutSession['exercises']>((acc, row) => {
    let exercise = acc.find((item) => item.workoutExerciseId === row.workoutExerciseId)
    if (!exercise) {
      exercise = {
        workoutExerciseId: row.workoutExerciseId,
        exerciseTypeId: row.exerciseTypeId,
        exerciseTypeName: row.exerciseTypeName,
        methodLocked: row.methodLocked,
        methodId: row.methodId,
        methodName: row.methodName,
        weightUnit: row.defaultWeightUnit === 'lb' ? 'lb' : 'kg',
        sets: [],
      }
      acc.push(exercise)
    }

    if (row.setId) {
      const weightUnit = row.setWeightUnit === 'lb' ? 'lb' : 'kg'
      exercise.weightUnit = weightUnit
      exercise.sets.push({
        id: row.setId,
        setType: row.setType ?? 'working',
        weight: row.weight ?? 0,
        weightUnit,
        reps: row.reps ?? 0,
        completedAt: row.completedAt ?? 0,
      })
    }

    return acc
  }, [])

  return {
    id: workout.id,
    name: workout.name,
    startedAt: workout.startedAt,
    exercises,
  }
}

async function ensureTemplateTables() {
  await ensureLibraryTables()
  await ensureExerciseTables()
  await db.$client.execute(`CREATE TABLE IF NOT EXISTS workout_templates (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    is_favorite INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`)
  await db.$client.execute(`CREATE TABLE IF NOT EXISTS workout_template_exercises (
    id TEXT PRIMARY KEY,
    template_id TEXT NOT NULL,
    exercise_type_id TEXT NOT NULL,
    method_id TEXT NOT NULL,
    set_count INTEGER NOT NULL DEFAULT 3,
    order_index INTEGER NOT NULL DEFAULT 0
  )`)
}

export type WorkoutTemplateSummary = {
  id: string
  name: string
  isFavorite: number
  createdAt: number
  updatedAt: number
  exerciseCount: number
  totalSetCount: number
}

export type WorkoutTemplateExercise = {
  id: string
  templateId: string
  exerciseTypeId: string
  exerciseTypeName: string
  methodLocked: number
  methodId: string
  methodName: string
  setCount: number
  orderIndex: number
}

export type WorkoutTemplateDetail = WorkoutTemplateSummary & {
  exercises: WorkoutTemplateExercise[]
}

function genTemplateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

export async function createWorkoutTemplate(name: string): Promise<string> {
  const trimmed = name.trim()
  if (!trimmed) throw new Error('Template name is required')
  await ensureTemplateTables()
  const id = genTemplateId('template')
  const now = Date.now()
  await db.$client.execute(
    'INSERT INTO workout_templates (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)',
    [id, trimmed, now, now],
  )
  return id
}

export async function updateWorkoutTemplateName(templateId: string, name: string): Promise<void> {
  const trimmed = name.trim()
  if (!trimmed) throw new Error('Template name is required')
  await ensureTemplateTables()
  await db.$client.execute(
    'UPDATE workout_templates SET name = ?, updated_at = ? WHERE id = ?',
    [trimmed, Date.now(), templateId],
  )
}

export async function getWorkoutTemplates(): Promise<WorkoutTemplateSummary[]> {
  await ensureTemplateTables()
  const result = await db.$client.execute(
    `SELECT
       t.id,
       t.name,
       t.is_favorite as isFavorite,
       t.created_at as createdAt,
       t.updated_at as updatedAt,
       COUNT(te.id) as exerciseCount,
       COALESCE(SUM(te.set_count), 0) as totalSetCount
     FROM workout_templates t
     LEFT JOIN workout_template_exercises te ON te.template_id = t.id
     GROUP BY t.id
     ORDER BY t.is_favorite DESC, t.updated_at DESC`,
  )
  return result.rows as WorkoutTemplateSummary[]
}

export async function getFavoriteWorkoutTemplates(): Promise<WorkoutTemplateSummary[]> {
  await ensureTemplateTables()
  const result = await db.$client.execute(
    `SELECT
       t.id,
       t.name,
       t.is_favorite as isFavorite,
       t.created_at as createdAt,
       t.updated_at as updatedAt,
       COUNT(te.id) as exerciseCount,
       COALESCE(SUM(te.set_count), 0) as totalSetCount
     FROM workout_templates t
     LEFT JOIN workout_template_exercises te ON te.template_id = t.id
     WHERE t.is_favorite = 1
     GROUP BY t.id
     ORDER BY t.updated_at DESC
     LIMIT 6`,
  )
  return result.rows as WorkoutTemplateSummary[]
}

export async function getWorkoutTemplateDetail(
  templateId: string,
): Promise<WorkoutTemplateDetail | null> {
  await ensureTemplateTables()
  const summary = (await db.$client.execute(
    `SELECT
       t.id,
       t.name,
       t.is_favorite as isFavorite,
       t.created_at as createdAt,
       t.updated_at as updatedAt,
       COUNT(te.id) as exerciseCount,
       COALESCE(SUM(te.set_count), 0) as totalSetCount
     FROM workout_templates t
     LEFT JOIN workout_template_exercises te ON te.template_id = t.id
     WHERE t.id = ?
     GROUP BY t.id`,
    [templateId],
  )).rows[0] as WorkoutTemplateSummary | undefined
  if (!summary) return null

  const exercises = (await db.$client.execute(
    `SELECT
       te.id,
       te.template_id as templateId,
       et.id as exerciseTypeId,
       et.name as exerciseTypeName,
       et.method_locked as methodLocked,
       m.id as methodId,
       m.name as methodName,
       te.set_count as setCount,
       te.order_index as orderIndex
     FROM workout_template_exercises te
     JOIN exercise_types et ON et.id = te.exercise_type_id
     JOIN methods m ON m.id = te.method_id
     WHERE te.template_id = ?
     ORDER BY te.order_index ASC, te.id ASC`,
    [templateId],
  )).rows as WorkoutTemplateExercise[]

  return { ...summary, exercises }
}

export async function setWorkoutTemplateFavorite(
  templateId: string,
  favorite: boolean,
): Promise<void> {
  await ensureTemplateTables()
  if (favorite) {
    const countRow = (await db.$client.execute(
      'SELECT COUNT(*) as count FROM workout_templates WHERE is_favorite = 1 AND id != ?',
      [templateId],
    )).rows[0] as { count?: number } | undefined
    const favoriteCount = Number(countRow?.count ?? 0)
    if (favoriteCount >= 6) {
      throw new Error('You can favorite up to 6 templates.')
    }
  }
  await db.$client.execute(
    'UPDATE workout_templates SET is_favorite = ?, updated_at = ? WHERE id = ?',
    [favorite ? 1 : 0, Date.now(), templateId],
  )
}

export async function deleteWorkoutTemplate(templateId: string): Promise<void> {
  await ensureTemplateTables()
  await db.$client.execute('DELETE FROM workout_template_exercises WHERE template_id = ?', [templateId])
  await db.$client.execute('DELETE FROM workout_templates WHERE id = ?', [templateId])
}

export async function addExerciseToWorkoutTemplate(params: {
  templateId: string
  exerciseTypeId: string
  methodId: string
  setCount: number
}): Promise<void> {
  await ensureTemplateTables()
  const setCount = Math.max(1, Math.min(12, Math.trunc(params.setCount)))
  const orderRow = (await db.$client.execute(
    'SELECT COALESCE(MAX(order_index), -1) + 1 as nextOrder FROM workout_template_exercises WHERE template_id = ?',
    [params.templateId],
  )).rows[0] as { nextOrder?: number } | undefined
  const nextOrder = Number(orderRow?.nextOrder ?? 0)
  const id = genTemplateId('template_exercise')
  await db.$client.execute(
    `INSERT INTO workout_template_exercises (
      id,
      template_id,
      exercise_type_id,
      method_id,
      set_count,
      order_index
    ) VALUES (?, ?, ?, ?, ?, ?)`,
    [id, params.templateId, params.exerciseTypeId, params.methodId, setCount, nextOrder],
  )
  await db.$client.execute(
    'UPDATE workout_templates SET updated_at = ? WHERE id = ?',
    [Date.now(), params.templateId],
  )
}

export async function updateWorkoutTemplateExerciseSetCount(
  templateExerciseId: string,
  setCount: number,
): Promise<void> {
  await ensureTemplateTables()
  const safeSetCount = Math.max(1, Math.min(12, Math.trunc(setCount)))
  await db.$client.execute(
    `UPDATE workout_template_exercises
     SET set_count = ?
     WHERE id = ?`,
    [safeSetCount, templateExerciseId],
  )
  await db.$client.execute(
    `UPDATE workout_templates
     SET updated_at = ?
     WHERE id = (
       SELECT template_id FROM workout_template_exercises WHERE id = ?
     )`,
    [Date.now(), templateExerciseId],
  )
}

export async function removeExerciseFromWorkoutTemplate(
  templateExerciseId: string,
): Promise<void> {
  await ensureTemplateTables()
  const row = (await db.$client.execute(
    'SELECT template_id as templateId FROM workout_template_exercises WHERE id = ?',
    [templateExerciseId],
  )).rows[0] as { templateId?: string } | undefined
  await db.$client.execute('DELETE FROM workout_template_exercises WHERE id = ?', [templateExerciseId])
  if (row?.templateId) {
    await db.$client.execute(
      'UPDATE workout_templates SET updated_at = ? WHERE id = ?',
      [Date.now(), row.templateId],
    )
  }
}

export async function replaceWorkoutTemplateExercises(
  templateId: string,
  exercises: WorkoutTemplateExercise[],
): Promise<void> {
  await ensureTemplateTables()
  await db.$client.execute('DELETE FROM workout_template_exercises WHERE template_id = ?', [templateId])
  for (const [index, exercise] of exercises.entries()) {
    await db.$client.execute(
      `INSERT INTO workout_template_exercises (
        id,
        template_id,
        exercise_type_id,
        method_id,
        set_count,
        order_index
      ) VALUES (?, ?, ?, ?, ?, ?)`,
      [
        exercise.id,
        templateId,
        exercise.exerciseTypeId,
        exercise.methodId,
        Math.max(1, Math.min(12, Math.trunc(exercise.setCount))),
        index,
      ],
    )
  }
  await db.$client.execute(
    'UPDATE workout_templates SET updated_at = ? WHERE id = ?',
    [Date.now(), templateId],
  )
}

export async function createWorkoutFromTemplate(
  templateId: string,
): Promise<ActiveWorkoutSession> {
  const template = await getWorkoutTemplateDetail(templateId)
  if (!template) throw new Error('Template not found')
  if (template.exercises.length === 0) {
    throw new Error('Add exercises before starting this template.')
  }

  const workoutId = await createWorkout()
  await updateWorkoutName(workoutId, template.name)
  const startedAt = Date.now()
  const exercises: ActiveWorkoutSession['exercises'] = []

  for (const [index, exercise] of template.exercises.entries()) {
    const workoutExerciseId = await addExerciseToWorkout({
      workoutId,
      exerciseTypeId: exercise.exerciseTypeId,
      methodId: exercise.methodId,
      weightUnit: 'kg',
      orderIndex: index,
    })
    exercises.push({
      workoutExerciseId,
      exerciseTypeId: exercise.exerciseTypeId,
      exerciseTypeName: exercise.exerciseTypeName,
      methodLocked: exercise.methodLocked,
      methodId: exercise.methodId,
      methodName: exercise.methodName,
      weightUnit: 'kg',
      plannedSetCount: exercise.setCount,
      sets: [],
    })
  }

  return {
    id: workoutId,
    name: template.name,
    startedAt,
    exercises,
  }
}
