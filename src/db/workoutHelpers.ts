import { and, asc, desc, eq, gt, inArray, isNotNull, isNull, lt, ne, notInArray, or, sql } from 'drizzle-orm'
import { db } from './client'
import {
  exerciseTypeMethodExclusions as exerciseTypeMethodExclusionsTable,
  exerciseTypes as exerciseTypesTable,
  exercises as exercisesTable,
  methods as methodsTable,
  sections as sectionsTable,
  sets as setsTable,
  workoutExercises as workoutExercisesTable,
  workoutTemplateExercises as workoutTemplateExercisesTable,
  workoutTemplates as workoutTemplatesTable,
  workouts as workoutsTable,
} from './schema'

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
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    is_custom INTEGER NOT NULL DEFAULT 0,
    is_hidden INTEGER NOT NULL DEFAULT 0,
    owner_exercise_type_id TEXT
  )`)
  await db.$client.execute(`CREATE TABLE IF NOT EXISTS exercise_types (
    id TEXT PRIMARY KEY, section_id TEXT NOT NULL, name TEXT NOT NULL,
    is_custom INTEGER NOT NULL DEFAULT 0,
    is_hidden INTEGER NOT NULL DEFAULT 0,
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
  const hasMethodOwnerExerciseTypeId = methodColumns.rows.some(
    (row: { name?: unknown }) => row.name === 'owner_exercise_type_id',
  )
  const hasMethodHidden = methodColumns.rows.some(
    (row: { name?: unknown }) => row.name === 'is_hidden',
  )
  if (!hasMethodCustom) {
    await db.$client.execute('ALTER TABLE methods ADD COLUMN is_custom INTEGER NOT NULL DEFAULT 0')
  }
  if (!hasMethodOwnerExerciseTypeId) {
    await db.$client.execute('ALTER TABLE methods ADD COLUMN owner_exercise_type_id TEXT')
  }
  if (!hasMethodHidden) {
    await db.$client.execute('ALTER TABLE methods ADD COLUMN is_hidden INTEGER NOT NULL DEFAULT 0')
  }

  const exerciseTypeColumns = await db.$client.execute('PRAGMA table_info(exercise_types)')
  const hasExerciseTypeCustom = exerciseTypeColumns.rows.some(
    (row: { name?: unknown }) => row.name === 'is_custom',
  )
  const hasExerciseTypeHidden = exerciseTypeColumns.rows.some(
    (row: { name?: unknown }) => row.name === 'is_hidden',
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
  if (!hasExerciseTypeHidden) {
    await db.$client.execute('ALTER TABLE exercise_types ADD COLUMN is_hidden INTEGER NOT NULL DEFAULT 0')
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
  await db.insert(workoutsTable).values({
    id,
    name: 'Workout',
    startedAt: Date.now(),
  })
  return id
}

export async function getWorkoutName(workoutId: string): Promise<string> {
  await ensureTable()
  const row = (await db
    .select({ name: workoutsTable.name })
    .from(workoutsTable)
    .where(eq(workoutsTable.id, workoutId))
    .limit(1))[0]
  return row?.name ?? ''
}

export async function updateWorkoutName(workoutId: string, name: string): Promise<void> {
  await ensureTable()
  const trimmed = name.trim()
  await db
    .update(workoutsTable)
    .set({ name: trimmed.length > 0 ? trimmed : null })
    .where(eq(workoutsTable.id, workoutId))
}

export async function updateCompletedWorkout(params: {
  workoutId: string
  name: string
  startedAt: number
  sets: CompletedWorkoutSetUpdate[]
}): Promise<void> {
  await ensureTable()
  await ensureExerciseTables()

  const workout = (await db
    .select({
      startedAt: workoutsTable.startedAt,
      endedAt: workoutsTable.endedAt,
    })
    .from(workoutsTable)
    .where(and(
      eq(workoutsTable.id, params.workoutId),
      isNotNull(workoutsTable.endedAt),
    ))
    .limit(1))[0] as {
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

  await db
    .update(workoutsTable)
    .set({
      name: trimmedName.length > 0 ? trimmedName : null,
      startedAt,
      endedAt,
    })
    .where(eq(workoutsTable.id, params.workoutId))

  if (delta !== 0) {
    const workoutExerciseIds = (await db
      .select({ id: workoutExercisesTable.id })
      .from(workoutExercisesTable)
      .where(eq(workoutExercisesTable.workoutId, params.workoutId)))
      .map((row) => row.id)
    if (workoutExerciseIds.length > 0) {
      await db
        .update(setsTable)
        .set({ completedAt: sql`${setsTable.completedAt} + ${delta}` })
        .where(inArray(setsTable.workoutExerciseId, workoutExerciseIds))
    }
  }

  const workoutExerciseIds = (await db
    .select({ id: workoutExercisesTable.id })
    .from(workoutExercisesTable)
    .where(eq(workoutExercisesTable.workoutId, params.workoutId)))
    .map((row) => row.id)

  for (const set of params.sets) {
    if (workoutExerciseIds.length === 0) break
    const weightKg = Number.isFinite(set.weightKg) ? set.weightKg : 0
    const weightUnit = set.weightUnit === 'lb' ? 'lb' : 'kg'
    const reps = Number.isFinite(set.reps) ? Math.max(0, Math.trunc(set.reps)) : 0
    const volume = weightKg * reps
    await db
      .update(setsTable)
      .set({
        weight: weightKg,
        weightUnit,
        reps,
        volume,
      })
      .where(and(
        eq(setsTable.id, set.id),
        inArray(setsTable.workoutExerciseId, workoutExerciseIds),
      ))
  }
}

export async function finishWorkout(workoutId: string): Promise<void> {
  await ensureTable()
  await ensureExerciseTables()
  await db
    .update(workoutsTable)
    .set({ endedAt: Date.now() })
    .where(eq(workoutsTable.id, workoutId))
}

export async function deleteWorkout(workoutId: string): Promise<void> {
  await ensureTable()
  await ensureExerciseTables()
  const workoutExerciseIds = (await db
    .select({ id: workoutExercisesTable.id })
    .from(workoutExercisesTable)
    .where(eq(workoutExercisesTable.workoutId, workoutId)))
    .map((row) => row.id)
  if (workoutExerciseIds.length > 0) {
    await db.delete(setsTable).where(inArray(setsTable.workoutExerciseId, workoutExerciseIds))
  }
  await db.delete(workoutExercisesTable).where(eq(workoutExercisesTable.workoutId, workoutId))
  await db.delete(workoutsTable).where(eq(workoutsTable.id, workoutId))
}

export async function deleteWorkoutExercise(workoutExerciseId: string): Promise<void> {
  await ensureExerciseTables()
  await db.delete(setsTable).where(eq(setsTable.workoutExerciseId, workoutExerciseId))
  await db.delete(workoutExercisesTable).where(eq(workoutExercisesTable.id, workoutExerciseId))
}

export async function updateWorkoutExerciseOrder(
  workoutExerciseIds: string[],
): Promise<void> {
  await ensureExerciseTables()
  for (const [index, workoutExerciseId] of workoutExerciseIds.entries()) {
    await db
      .update(workoutExercisesTable)
      .set({ orderIndex: index })
      .where(eq(workoutExercisesTable.id, workoutExerciseId))
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

  return db
    .select({
      setId: setsTable.id,
      exerciseTypeId: exercisesTable.exerciseTypeId,
      methodId: exercisesTable.methodId,
      weightKg: setsTable.weight,
      completedAt: setsTable.completedAt,
    })
    .from(setsTable)
    .innerJoin(workoutExercisesTable, eq(workoutExercisesTable.id, setsTable.workoutExerciseId))
    .innerJoin(exercisesTable, eq(exercisesTable.id, workoutExercisesTable.exerciseId))
    .innerJoin(workoutsTable, eq(workoutsTable.id, workoutExercisesTable.workoutId))
    .where(and(
      inArray(exercisesTable.exerciseTypeId, uniqueIds),
      isNotNull(workoutsTable.endedAt),
      gt(setsTable.weight, 0),
    ))
    .orderBy(asc(setsTable.completedAt), asc(setsTable.id))
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
  const visibleRows = await db
    .select({
      workoutId: workoutsTable.id,
      setId: setsTable.id,
      exerciseTypeId: exercisesTable.exerciseTypeId,
      methodId: exercisesTable.methodId,
      weightKg: setsTable.weight,
      completedAt: setsTable.completedAt,
    })
    .from(workoutsTable)
    .innerJoin(workoutExercisesTable, eq(workoutExercisesTable.workoutId, workoutsTable.id))
    .innerJoin(exercisesTable, eq(exercisesTable.id, workoutExercisesTable.exerciseId))
    .innerJoin(setsTable, eq(setsTable.workoutExerciseId, workoutExercisesTable.id))
    .where(and(
      inArray(workoutsTable.id, workoutIds),
      gt(setsTable.weight, 0),
    )) as VisibleWeightPrSetRow[]

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
  const rows = await db
    .select({
      id: workoutsTable.id,
      name: workoutsTable.name,
      startedAt: workoutsTable.startedAt,
      endedAt: workoutsTable.endedAt,
      exerciseCount: sql<number>`COUNT(DISTINCT ${workoutExercisesTable.id})`,
      setCount: sql<number>`COUNT(${setsTable.id})`,
      volume: sql<number>`COALESCE(SUM(${setsTable.volume}), 0)`,
    })
    .from(workoutsTable)
    .leftJoin(workoutExercisesTable, eq(workoutExercisesTable.workoutId, workoutsTable.id))
    .leftJoin(setsTable, eq(setsTable.workoutExerciseId, workoutExercisesTable.id))
    .where(and(
      isNotNull(workoutsTable.endedAt),
      sql`${workoutsTable.startedAt} >= ${startAt}`,
      lt(workoutsTable.startedAt, endAt),
    ))
    .groupBy(workoutsTable.id)
    .orderBy(desc(workoutsTable.startedAt))
  return enrichWorkoutSummariesWithWeightPrs(rows as WorkoutSummary[])
}

export async function getRecentCompletedWorkouts(limit = 3): Promise<WorkoutSummary[]> {
  await ensureTable()
  await ensureExerciseTables()
  const rows = await db
    .select({
      id: workoutsTable.id,
      name: workoutsTable.name,
      startedAt: workoutsTable.startedAt,
      endedAt: workoutsTable.endedAt,
      exerciseCount: sql<number>`COUNT(DISTINCT ${workoutExercisesTable.id})`,
      setCount: sql<number>`COUNT(${setsTable.id})`,
      volume: sql<number>`COALESCE(SUM(${setsTable.volume}), 0)`,
    })
    .from(workoutsTable)
    .leftJoin(workoutExercisesTable, eq(workoutExercisesTable.workoutId, workoutsTable.id))
    .leftJoin(setsTable, eq(setsTable.workoutExerciseId, workoutExercisesTable.id))
    .where(isNotNull(workoutsTable.endedAt))
    .groupBy(workoutsTable.id)
    .orderBy(desc(workoutsTable.startedAt))
    .limit(limit)
  return enrichWorkoutSummariesWithWeightPrs(rows as WorkoutSummary[])
}

export async function getCompletedWorkoutsPage(
  limit = 10,
  offset = 0,
): Promise<WorkoutSummary[]> {
  await ensureTable()
  await ensureExerciseTables()
  const safeLimit = Math.max(1, Math.trunc(limit))
  const safeOffset = Math.max(0, Math.trunc(offset))
  const rows = await db
    .select({
      id: workoutsTable.id,
      name: workoutsTable.name,
      startedAt: workoutsTable.startedAt,
      endedAt: workoutsTable.endedAt,
      exerciseCount: sql<number>`COUNT(DISTINCT ${workoutExercisesTable.id})`,
      setCount: sql<number>`COUNT(${setsTable.id})`,
      volume: sql<number>`COALESCE(SUM(${setsTable.volume}), 0)`,
    })
    .from(workoutsTable)
    .leftJoin(workoutExercisesTable, eq(workoutExercisesTable.workoutId, workoutsTable.id))
    .leftJoin(setsTable, eq(setsTable.workoutExerciseId, workoutExercisesTable.id))
    .where(isNotNull(workoutsTable.endedAt))
    .groupBy(workoutsTable.id)
    .orderBy(desc(workoutsTable.startedAt))
    .limit(safeLimit)
    .offset(safeOffset)
  return enrichWorkoutSummariesWithWeightPrs(rows as WorkoutSummary[])
}

export async function getWorkoutDetail(workoutId: string): Promise<WorkoutDetail | null> {
  await ensureTable()
  await ensureExerciseTables()
  const workout = (await db
    .select({
      id: workoutsTable.id,
      name: workoutsTable.name,
      startedAt: workoutsTable.startedAt,
      endedAt: workoutsTable.endedAt,
      exerciseCount: sql<number>`COUNT(DISTINCT ${workoutExercisesTable.id})`,
      setCount: sql<number>`COUNT(${setsTable.id})`,
      volume: sql<number>`COALESCE(SUM(${setsTable.volume}), 0)`,
    })
    .from(workoutsTable)
    .leftJoin(workoutExercisesTable, eq(workoutExercisesTable.workoutId, workoutsTable.id))
    .leftJoin(setsTable, eq(setsTable.workoutExerciseId, workoutExercisesTable.id))
    .where(eq(workoutsTable.id, workoutId))
    .groupBy(workoutsTable.id)
    .limit(1))[0] as WorkoutSummary | undefined
  if (!workout?.endedAt) return null

  const rows = await db
    .select({
      workoutExerciseId: workoutExercisesTable.id,
      exerciseTypeId: exerciseTypesTable.id,
      exerciseName: exerciseTypesTable.name,
      methodName: methodsTable.name,
      methodId: exercisesTable.methodId,
      defaultWeightUnit: exercisesTable.defaultUnit,
      setId: setsTable.id,
      setType: setsTable.setType,
      weightKg: setsTable.weight,
      weightUnit: setsTable.weightUnit,
      reps: setsTable.reps,
      volume: setsTable.volume,
      completedAt: setsTable.completedAt,
    })
    .from(workoutExercisesTable)
    .innerJoin(exercisesTable, eq(exercisesTable.id, workoutExercisesTable.exerciseId))
    .innerJoin(exerciseTypesTable, eq(exerciseTypesTable.id, exercisesTable.exerciseTypeId))
    .innerJoin(methodsTable, eq(methodsTable.id, exercisesTable.methodId))
    .leftJoin(setsTable, eq(setsTable.workoutExerciseId, workoutExercisesTable.id))
    .where(eq(workoutExercisesTable.workoutId, workoutId))
    .orderBy(asc(workoutExercisesTable.orderIndex), asc(setsTable.completedAt)) as Array<{
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

  const workoutRows = await db
    .select({
      setId: setsTable.id,
      exerciseName: exerciseTypesTable.name,
      methodName: methodsTable.name,
      exerciseTypeId: exercisesTable.exerciseTypeId,
      methodId: exercisesTable.methodId,
      weightKg: setsTable.weight,
      weightUnit: setsTable.weightUnit,
      reps: setsTable.reps,
      completedAt: setsTable.completedAt,
    })
    .from(workoutExercisesTable)
    .innerJoin(exercisesTable, eq(exercisesTable.id, workoutExercisesTable.exerciseId))
    .innerJoin(exerciseTypesTable, eq(exerciseTypesTable.id, exercisesTable.exerciseTypeId))
    .innerJoin(methodsTable, eq(methodsTable.id, exercisesTable.methodId))
    .innerJoin(setsTable, eq(setsTable.workoutExerciseId, workoutExercisesTable.id))
    .innerJoin(workoutsTable, eq(workoutsTable.id, workoutExercisesTable.workoutId))
    .where(and(
      eq(workoutExercisesTable.workoutId, workoutId),
      isNotNull(workoutsTable.endedAt),
      gt(setsTable.weight, 0),
    ))
    .orderBy(asc(setsTable.completedAt), asc(setsTable.id)) as Array<{
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
    const priorRows = await db
      .selectDistinct({ exerciseTypeId: exercisesTable.exerciseTypeId })
      .from(setsTable)
      .innerJoin(workoutExercisesTable, eq(workoutExercisesTable.id, setsTable.workoutExerciseId))
      .innerJoin(exercisesTable, eq(exercisesTable.id, workoutExercisesTable.exerciseId))
      .innerJoin(workoutsTable, eq(workoutsTable.id, workoutExercisesTable.workoutId))
      .where(and(
        inArray(exercisesTable.exerciseTypeId, uniqueExerciseTypeIds),
        ne(workoutsTable.id, workoutId),
        isNotNull(workoutsTable.endedAt),
        gt(setsTable.weight, 0),
      )) as Array<{ exerciseTypeId: string }>
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
  isHidden?: number
  methodLocked: number
  lockedMethodId: string | null
}
export type MethodRow = {
  id: string
  name: string
  isCustom: number
  isHidden?: number
  ownerExerciseTypeId: string | null
}
export type ExercisePrSummary = {
  weightKg: number | null
  weightUnit: string | null
  weightMethodName: string | null
}
export type MethodPrSummary = {
  weightKg: number | null
  weightUnit: string | null
}

const DEFAULT_LOCKED_METHOD_BY_EXERCISE_NAME: Record<string, string> = {
  'Push Up': 'Bodyweight',
  'Pull Up': 'Bodyweight',
  'T-Bar Row': 'Machine',
  Dip: 'Bodyweight',
  'Leg Press': 'Machine',
  'Leg Extension': 'Machine',
  'Leg Curl': 'Machine',
  'Abductor Machine': 'Machine',
  Plank: 'Bodyweight',
  'Side Plank': 'Bodyweight',
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
  return db
    .select({
      id: sectionsTable.id,
      name: sectionsTable.name,
    })
    .from(sectionsTable)
    .where(ne(sectionsTable.name, 'Cardio'))
    .orderBy(asc(sectionsTable.name))
}

export async function getExerciseTypesBySection(sectionId: string): Promise<ExerciseTypeRow[]> {
  await ensureLibraryTables()
  return db
    .select({
      id: exerciseTypesTable.id,
      name: exerciseTypesTable.name,
      sectionId: exerciseTypesTable.sectionId,
      isCustom: exerciseTypesTable.isCustom,
      isHidden: exerciseTypesTable.isHidden,
      methodLocked: exerciseTypesTable.methodLocked,
      lockedMethodId: exerciseTypesTable.lockedMethodId,
    })
    .from(exerciseTypesTable)
    .where(and(
      eq(exerciseTypesTable.sectionId, sectionId),
      sql`COALESCE(${exerciseTypesTable.isHidden}, 0) = 0`,
    ))
    .orderBy(asc(exerciseTypesTable.name))
}

export async function getExercisePrSummariesBySection(
  sectionId: string,
): Promise<Record<string, ExercisePrSummary>> {
  await ensureLibraryTables()
  await ensureExerciseTables()
  const rows = await db
    .select({
      exerciseTypeId: exerciseTypesTable.id,
      methodId: methodsTable.id,
      methodName: methodsTable.name,
      weightKg: setsTable.weight,
      weightUnit: setsTable.weightUnit,
    })
    .from(setsTable)
    .innerJoin(workoutExercisesTable, eq(workoutExercisesTable.id, setsTable.workoutExerciseId))
    .innerJoin(exercisesTable, eq(exercisesTable.id, workoutExercisesTable.exerciseId))
    .innerJoin(exerciseTypesTable, eq(exerciseTypesTable.id, exercisesTable.exerciseTypeId))
    .innerJoin(methodsTable, eq(methodsTable.id, exercisesTable.methodId))
    .innerJoin(workoutsTable, eq(workoutsTable.id, workoutExercisesTable.workoutId))
    .where(and(
      eq(exerciseTypesTable.sectionId, sectionId),
      isNotNull(workoutsTable.endedAt),
    ))
    .orderBy(asc(setsTable.completedAt)) as PrSetRow[]

  return reduceExercisePrRows(rows)
}

export async function getMethodPrSummariesForExerciseType(
  exerciseTypeId: string,
): Promise<Record<string, MethodPrSummary>> {
  await ensureLibraryTables()
  await ensureExerciseTables()
  const rows = await db
    .select({
      exerciseTypeId: exercisesTable.exerciseTypeId,
      methodId: methodsTable.id,
      methodName: methodsTable.name,
      weightKg: setsTable.weight,
      weightUnit: setsTable.weightUnit,
    })
    .from(setsTable)
    .innerJoin(workoutExercisesTable, eq(workoutExercisesTable.id, setsTable.workoutExerciseId))
    .innerJoin(exercisesTable, eq(exercisesTable.id, workoutExercisesTable.exerciseId))
    .innerJoin(methodsTable, eq(methodsTable.id, exercisesTable.methodId))
    .innerJoin(workoutsTable, eq(workoutsTable.id, workoutExercisesTable.workoutId))
    .where(and(
      eq(exercisesTable.exerciseTypeId, exerciseTypeId),
      isNotNull(workoutsTable.endedAt),
    ))
    .orderBy(asc(setsTable.completedAt)) as PrSetRow[]

  return reduceMethodPrRows(rows)
}

export async function isExerciseTypeMethodLocked(exerciseTypeId: string): Promise<boolean> {
  await ensureLibraryTables()
  const row = (await db
    .select({ methodLocked: exerciseTypesTable.methodLocked })
    .from(exerciseTypesTable)
    .where(eq(exerciseTypesTable.id, exerciseTypeId))
    .limit(1))[0]
  return Boolean(row?.methodLocked)
}

export async function getMethods(): Promise<MethodRow[]> {
  await ensureLibraryTables()
  return db
    .select({
      id: methodsTable.id,
      name: methodsTable.name,
      isCustom: methodsTable.isCustom,
      isHidden: methodsTable.isHidden,
      ownerExerciseTypeId: methodsTable.ownerExerciseTypeId,
    })
    .from(methodsTable)
    .where(and(
      isNull(methodsTable.ownerExerciseTypeId),
      sql`COALESCE(${methodsTable.isHidden}, 0) = 0`,
    ))
    .orderBy(asc(methodsTable.name))
}

export async function getMethodsForExerciseType(exerciseTypeId: string): Promise<MethodRow[]> {
  await ensureLibraryTables()
  const excludedMethodIds = (await db
    .select({ methodId: exerciseTypeMethodExclusionsTable.methodId })
    .from(exerciseTypeMethodExclusionsTable)
    .where(eq(exerciseTypeMethodExclusionsTable.exerciseTypeId, exerciseTypeId)))
    .map((row) => row.methodId)

  return db
    .select({
      id: methodsTable.id,
      name: methodsTable.name,
      isCustom: methodsTable.isCustom,
      isHidden: methodsTable.isHidden,
      ownerExerciseTypeId: methodsTable.ownerExerciseTypeId,
    })
    .from(methodsTable)
    .where(and(
      or(
        isNull(methodsTable.ownerExerciseTypeId),
        eq(methodsTable.ownerExerciseTypeId, exerciseTypeId),
      ),
      sql`COALESCE(${methodsTable.isHidden}, 0) = 0`,
      excludedMethodIds.length > 0
        ? notInArray(methodsTable.id, excludedMethodIds)
        : undefined,
    ))
    .orderBy(asc(methodsTable.name))
}

export async function hasHiddenDefaultMethods(exerciseTypeId: string): Promise<boolean> {
  await ensureLibraryTables()
  const exerciseType = (await db
    .select({
      id: exerciseTypesTable.id,
      name: exerciseTypesTable.name,
      isCustom: exerciseTypesTable.isCustom,
      methodLocked: exerciseTypesTable.methodLocked,
      lockedMethodId: exerciseTypesTable.lockedMethodId,
    })
    .from(exerciseTypesTable)
    .where(eq(exerciseTypesTable.id, exerciseTypeId))
    .limit(1))[0] as {
    id: string
    name: string
    isCustom: number
    methodLocked: number
    lockedMethodId: string | null
  } | undefined
  if (!exerciseType) return false

  const hiddenDefaultMethod = (await db
    .select({ id: exerciseTypeMethodExclusionsTable.methodId })
    .from(exerciseTypeMethodExclusionsTable)
    .innerJoin(methodsTable, eq(methodsTable.id, exerciseTypeMethodExclusionsTable.methodId))
    .where(and(
      eq(exerciseTypeMethodExclusionsTable.exerciseTypeId, exerciseTypeId),
      eq(methodsTable.isCustom, 0),
    ))
    .limit(1))[0]
  if (hiddenDefaultMethod) return true

  if (exerciseType.isCustom) return false

  const excludedMethodIds = (await db
    .select({ methodId: exerciseTypeMethodExclusionsTable.methodId })
    .from(exerciseTypeMethodExclusionsTable)
    .where(eq(exerciseTypeMethodExclusionsTable.exerciseTypeId, exerciseTypeId)))
    .map((row) => row.methodId)
  const visibleOwnedMethod = (await db
    .select({ id: methodsTable.id })
    .from(methodsTable)
    .where(and(
      eq(methodsTable.ownerExerciseTypeId, exerciseTypeId),
      sql`COALESCE(${methodsTable.isHidden}, 0) = 0`,
      excludedMethodIds.length > 0
        ? notInArray(methodsTable.id, excludedMethodIds)
        : undefined,
    ))
    .limit(1))[0]
  if (visibleOwnedMethod) return true

  const expectedLockedMethodName = DEFAULT_LOCKED_METHOD_BY_EXERCISE_NAME[exerciseType.name]
  if (!expectedLockedMethodName) {
    return Boolean(exerciseType.methodLocked || exerciseType.lockedMethodId)
  }

  const expectedMethod = (await db
    .select({ id: methodsTable.id })
    .from(methodsTable)
    .where(and(
      eq(methodsTable.name, expectedLockedMethodName),
      eq(methodsTable.isCustom, 0),
    ))
    .limit(1))[0]
  const expectedMethodId = expectedMethod?.id ?? null
  return !exerciseType.methodLocked || exerciseType.lockedMethodId !== expectedMethodId
}

export async function restoreDefaultMethodsForExerciseType(
  exerciseTypeId: string,
): Promise<ExerciseTypeRow> {
  await ensureLibraryTables()
  await ensureExerciseTables()
  await ensureTemplateTables()
  const row = (await db
    .select({
      id: exerciseTypesTable.id,
      name: exerciseTypesTable.name,
      sectionId: exerciseTypesTable.sectionId,
      isCustom: exerciseTypesTable.isCustom,
      isHidden: exerciseTypesTable.isHidden,
      methodLocked: exerciseTypesTable.methodLocked,
      lockedMethodId: exerciseTypesTable.lockedMethodId,
    })
    .from(exerciseTypesTable)
    .where(eq(exerciseTypesTable.id, exerciseTypeId))
    .limit(1))[0] as ExerciseTypeRow | undefined
  if (!row) {
    throw new Error('Unknown exercise')
  }

  const defaultMethodIds = (await db
    .select({ id: methodsTable.id })
    .from(methodsTable)
    .where(eq(methodsTable.isCustom, 0)))
    .map((method) => method.id)
  if (defaultMethodIds.length > 0) {
    await db
      .delete(exerciseTypeMethodExclusionsTable)
      .where(and(
        eq(exerciseTypeMethodExclusionsTable.exerciseTypeId, exerciseTypeId),
        inArray(exerciseTypeMethodExclusionsTable.methodId, defaultMethodIds),
      ))
  }

  if (!row.isCustom) {
    const ownedMethodIds = (await db
      .select({ id: methodsTable.id })
      .from(methodsTable)
      .where(eq(methodsTable.ownerExerciseTypeId, exerciseTypeId)))
      .map((method) => method.id)

    if (ownedMethodIds.length > 0) {
      const workoutUsedMethodIds = (await db
        .selectDistinct({ methodId: exercisesTable.methodId })
        .from(workoutExercisesTable)
        .innerJoin(exercisesTable, eq(exercisesTable.id, workoutExercisesTable.exerciseId))
        .where(and(
          eq(exercisesTable.exerciseTypeId, exerciseTypeId),
          inArray(exercisesTable.methodId, ownedMethodIds),
        )))
        .map((item) => item.methodId)
      const templateUsedMethodIds = (await db
        .selectDistinct({ methodId: workoutTemplateExercisesTable.methodId })
        .from(workoutTemplateExercisesTable)
        .where(and(
          eq(workoutTemplateExercisesTable.exerciseTypeId, exerciseTypeId),
          inArray(workoutTemplateExercisesTable.methodId, ownedMethodIds),
        )))
        .map((item) => item.methodId)
      const usedMethodIds = new Set([...workoutUsedMethodIds, ...templateUsedMethodIds])
      const unusedOwnedMethodIds = ownedMethodIds.filter((id) => !usedMethodIds.has(id))

      if (unusedOwnedMethodIds.length > 0) {
        await db
          .delete(exercisesTable)
          .where(and(
            eq(exercisesTable.exerciseTypeId, exerciseTypeId),
            inArray(exercisesTable.methodId, unusedOwnedMethodIds),
          ))
        await db.delete(methodsTable).where(inArray(methodsTable.id, unusedOwnedMethodIds))
      }

      const remainingOwnedMethodIds = ownedMethodIds.filter((id) => !unusedOwnedMethodIds.includes(id))
      if (remainingOwnedMethodIds.length > 0) {
        await db
          .insert(exerciseTypeMethodExclusionsTable)
          .values(remainingOwnedMethodIds.map((methodId) => ({
            exerciseTypeId,
            methodId,
          })))
          .onConflictDoNothing()
      }
    }

    const expectedLockedMethodName = DEFAULT_LOCKED_METHOD_BY_EXERCISE_NAME[row.name]
    const expectedLockedMethodId = expectedLockedMethodName
      ? (await db
        .select({ id: methodsTable.id })
        .from(methodsTable)
        .where(and(
          eq(methodsTable.name, expectedLockedMethodName),
          eq(methodsTable.isCustom, 0),
        ))
        .limit(1))[0]
      : null

    await db
      .update(exerciseTypesTable)
      .set({
        methodLocked: expectedLockedMethodId?.id ? 1 : 0,
        lockedMethodId: expectedLockedMethodId?.id ?? null,
      })
      .where(eq(exerciseTypesTable.id, exerciseTypeId))
  }

  const refreshedRow = (await db
    .select({
      id: exerciseTypesTable.id,
      name: exerciseTypesTable.name,
      sectionId: exerciseTypesTable.sectionId,
      isCustom: exerciseTypesTable.isCustom,
      isHidden: exerciseTypesTable.isHidden,
      methodLocked: exerciseTypesTable.methodLocked,
      lockedMethodId: exerciseTypesTable.lockedMethodId,
    })
    .from(exerciseTypesTable)
    .where(eq(exerciseTypesTable.id, exerciseTypeId))
    .limit(1))[0] as ExerciseTypeRow | undefined
  if (!refreshedRow) throw new Error('Unknown exercise')
  return refreshedRow
}

export async function createCustomSection(name: string): Promise<SectionRow> {
  const trimmed = name.trim()
  if (!trimmed) throw new Error('Section name is required')
  await ensureLibraryTables()
  const id = genLibraryId('section')
  await db.insert(sectionsTable).values({
    id,
    name: trimmed,
    isCustom: 1,
  })
  return { id, name: trimmed }
}

export async function createCustomMethod(
  name: string,
  ownerExerciseTypeId?: string | null,
): Promise<MethodRow> {
  const trimmed = name.trim()
  if (!trimmed) throw new Error('Method name is required')
  await ensureLibraryTables()
  const ownerId = ownerExerciseTypeId ?? null
  if (ownerId) {
    const owner = (await db
      .select({ id: exerciseTypesTable.id })
      .from(exerciseTypesTable)
      .where(eq(exerciseTypesTable.id, ownerId))
      .limit(1))[0]
    if (!owner) {
      throw new Error('Unknown exercise for custom method')
    }
    await db
      .update(exerciseTypesTable)
      .set({ methodLocked: 0, lockedMethodId: null })
      .where(eq(exerciseTypesTable.id, ownerId))
  }
  const id = genLibraryId('method')
  await db.insert(methodsTable).values({
    id,
    name: trimmed,
    isCustom: 1,
    ownerExerciseTypeId: ownerId,
  })
  return { id, name: trimmed, isCustom: 1, isHidden: 0, ownerExerciseTypeId: ownerId }
}

export async function deleteCustomExerciseType(exerciseTypeId: string): Promise<void> {
  await ensureLibraryTables()
  await ensureExerciseTables()
  await ensureTemplateTables()

  const row = (await db
    .select({
      id: exerciseTypesTable.id,
      isCustom: exerciseTypesTable.isCustom,
    })
    .from(exerciseTypesTable)
    .where(eq(exerciseTypesTable.id, exerciseTypeId))
    .limit(1))[0]
  if (!row?.isCustom) {
    throw new Error('Only custom exercises can be deleted')
  }

  const usage = (await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(workoutExercisesTable)
    .innerJoin(exercisesTable, eq(exercisesTable.id, workoutExercisesTable.exerciseId))
    .where(eq(exercisesTable.exerciseTypeId, exerciseTypeId))
    .limit(1))[0]
  const count = Number(usage?.count ?? 0)
  if (count > 0) {
    throw new Error('This exercise is used in saved workouts')
  }

  const templateUsage = (await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(workoutTemplateExercisesTable)
    .where(eq(workoutTemplateExercisesTable.exerciseTypeId, exerciseTypeId))
    .limit(1))[0]
  const templateCount = Number(templateUsage?.count ?? 0)
  if (templateCount > 0) {
    throw new Error('This exercise is used in templates')
  }

  const ownedMethodIds = (await db
    .select({ id: methodsTable.id })
    .from(methodsTable)
    .where(eq(methodsTable.ownerExerciseTypeId, exerciseTypeId)))
    .map((method) => method.id)
  await db.delete(exercisesTable).where(eq(exercisesTable.exerciseTypeId, exerciseTypeId))
  await db
    .delete(exerciseTypeMethodExclusionsTable)
    .where(or(
      eq(exerciseTypeMethodExclusionsTable.exerciseTypeId, exerciseTypeId),
      ownedMethodIds.length > 0
        ? inArray(exerciseTypeMethodExclusionsTable.methodId, ownedMethodIds)
        : undefined,
    ))
  await db.delete(methodsTable).where(eq(methodsTable.ownerExerciseTypeId, exerciseTypeId))
  await db.delete(exerciseTypesTable).where(eq(exerciseTypesTable.id, exerciseTypeId))
}

type DebugDeleteCustomMethodsResult = {
  deleted: number
  hidden: number
}

type DebugDeleteCustomExercisesResult = {
  deleted: number
  hidden: number
}

export async function deleteAllCustomMethods(): Promise<DebugDeleteCustomMethodsResult> {
  await ensureLibraryTables()
  await ensureExerciseTables()
  await ensureTemplateTables()

  const methodIds = (await db
    .select({ id: methodsTable.id })
    .from(methodsTable)
    .where(and(
      eq(methodsTable.isCustom, 1),
      sql`COALESCE(${methodsTable.isHidden}, 0) = 0`,
    )))
    .map((row) => row.id)

  if (methodIds.length === 0) {
    return { deleted: 0, hidden: 0 }
  }

  const workoutUsedMethodIds = (await db
    .selectDistinct({ methodId: exercisesTable.methodId })
    .from(workoutExercisesTable)
    .innerJoin(exercisesTable, eq(exercisesTable.id, workoutExercisesTable.exerciseId))
    .where(inArray(exercisesTable.methodId, methodIds)))
    .map((row) => row.methodId)
  const templateUsedMethodIds = (await db
    .selectDistinct({ methodId: workoutTemplateExercisesTable.methodId })
    .from(workoutTemplateExercisesTable)
    .where(inArray(workoutTemplateExercisesTable.methodId, methodIds)))
    .map((row) => row.methodId)
  const usedMethodSet = new Set([...workoutUsedMethodIds, ...templateUsedMethodIds])
  const unusedMethodIds = methodIds.filter((id) => !usedMethodSet.has(id))
  const usedMethodIds = methodIds.filter((id) => usedMethodSet.has(id))

  if (unusedMethodIds.length === 0 && usedMethodIds.length === 0) {
    return { deleted: 0, hidden: 0 }
  }

  await db.$client.execute('BEGIN IMMEDIATE TRANSACTION')
  try {
    const allMethodIds = [...unusedMethodIds, ...usedMethodIds]
    await db
      .update(exerciseTypesTable)
      .set({ methodLocked: 0, lockedMethodId: null })
      .where(inArray(exerciseTypesTable.lockedMethodId, allMethodIds))

    if (unusedMethodIds.length > 0) {
      await db.delete(exercisesTable).where(inArray(exercisesTable.methodId, unusedMethodIds))
      await db
        .delete(exerciseTypeMethodExclusionsTable)
        .where(inArray(exerciseTypeMethodExclusionsTable.methodId, unusedMethodIds))
      await db.delete(methodsTable).where(inArray(methodsTable.id, unusedMethodIds))
    }

    if (usedMethodIds.length > 0) {
      await db
        .update(methodsTable)
        .set({ isHidden: 1 })
        .where(inArray(methodsTable.id, usedMethodIds))
    }

    await db.$client.execute('COMMIT')
  } catch (error) {
    await db.$client.execute('ROLLBACK')
    throw error
  }

  return { deleted: unusedMethodIds.length, hidden: usedMethodIds.length }
}

export async function deleteAllCustomExercises(): Promise<DebugDeleteCustomExercisesResult> {
  await ensureLibraryTables()
  await ensureExerciseTables()
  await ensureTemplateTables()

  const exerciseTypeIds = (await db
    .select({ id: exerciseTypesTable.id })
    .from(exerciseTypesTable)
    .where(and(
      eq(exerciseTypesTable.isCustom, 1),
      sql`COALESCE(${exerciseTypesTable.isHidden}, 0) = 0`,
    )))
    .map((row) => row.id)

  if (exerciseTypeIds.length === 0) {
    return { deleted: 0, hidden: 0 }
  }

  const workoutUsedExerciseTypeIds = (await db
    .selectDistinct({ exerciseTypeId: exercisesTable.exerciseTypeId })
    .from(workoutExercisesTable)
    .innerJoin(exercisesTable, eq(exercisesTable.id, workoutExercisesTable.exerciseId))
    .where(inArray(exercisesTable.exerciseTypeId, exerciseTypeIds)))
    .map((row) => row.exerciseTypeId)
  const templateUsedExerciseTypeIds = (await db
    .selectDistinct({ exerciseTypeId: workoutTemplateExercisesTable.exerciseTypeId })
    .from(workoutTemplateExercisesTable)
    .where(inArray(workoutTemplateExercisesTable.exerciseTypeId, exerciseTypeIds)))
    .map((row) => row.exerciseTypeId)
  const usedExerciseTypeSet = new Set([...workoutUsedExerciseTypeIds, ...templateUsedExerciseTypeIds])
  const unusedExerciseTypeIds = exerciseTypeIds.filter((id) => !usedExerciseTypeSet.has(id))
  const usedExerciseTypeIds = exerciseTypeIds.filter((id) => usedExerciseTypeSet.has(id))

  if (unusedExerciseTypeIds.length === 0 && usedExerciseTypeIds.length === 0) {
    return { deleted: 0, hidden: 0 }
  }

  await db.$client.execute('BEGIN IMMEDIATE TRANSACTION')
  try {
    if (unusedExerciseTypeIds.length > 0) {
      const unusedOwnedMethodIds = (await db
        .select({ id: methodsTable.id })
        .from(methodsTable)
        .where(inArray(methodsTable.ownerExerciseTypeId, unusedExerciseTypeIds)))
        .map((method) => method.id)
      await db.delete(exercisesTable).where(inArray(exercisesTable.exerciseTypeId, unusedExerciseTypeIds))
      await db
        .delete(exerciseTypeMethodExclusionsTable)
        .where(or(
          inArray(exerciseTypeMethodExclusionsTable.exerciseTypeId, unusedExerciseTypeIds),
          unusedOwnedMethodIds.length > 0
            ? inArray(exerciseTypeMethodExclusionsTable.methodId, unusedOwnedMethodIds)
            : undefined,
        ))
      await db.delete(methodsTable).where(inArray(methodsTable.ownerExerciseTypeId, unusedExerciseTypeIds))
      await db.delete(exerciseTypesTable).where(inArray(exerciseTypesTable.id, unusedExerciseTypeIds))
    }

    if (usedExerciseTypeIds.length > 0) {
      const ownedMethodIds = (await db
        .select({ id: methodsTable.id })
        .from(methodsTable)
        .where(inArray(methodsTable.ownerExerciseTypeId, usedExerciseTypeIds)))
        .map((method) => method.id)
      if (ownedMethodIds.length > 0) {
        const workoutUsedMethodIds = (await db
          .selectDistinct({ methodId: exercisesTable.methodId })
          .from(workoutExercisesTable)
          .innerJoin(exercisesTable, eq(exercisesTable.id, workoutExercisesTable.exerciseId))
          .where(inArray(exercisesTable.methodId, ownedMethodIds)))
          .map((row) => row.methodId)
        const templateUsedMethodIds = (await db
          .selectDistinct({ methodId: workoutTemplateExercisesTable.methodId })
          .from(workoutTemplateExercisesTable)
          .where(inArray(workoutTemplateExercisesTable.methodId, ownedMethodIds)))
          .map((row) => row.methodId)
        const usedMethodSet = new Set([...workoutUsedMethodIds, ...templateUsedMethodIds])
        const unusedOwnedMethodIds = ownedMethodIds.filter((id) => !usedMethodSet.has(id))

        if (unusedOwnedMethodIds.length > 0) {
          await db
            .delete(exercisesTable)
            .where(and(
              inArray(exercisesTable.exerciseTypeId, usedExerciseTypeIds),
              inArray(exercisesTable.methodId, unusedOwnedMethodIds),
            ))
          await db
            .delete(exerciseTypeMethodExclusionsTable)
            .where(inArray(exerciseTypeMethodExclusionsTable.methodId, unusedOwnedMethodIds))
          await db.delete(methodsTable).where(inArray(methodsTable.id, unusedOwnedMethodIds))
        }
      }
      await db
        .update(methodsTable)
        .set({ isHidden: 1 })
        .where(inArray(methodsTable.ownerExerciseTypeId, usedExerciseTypeIds))
      await db
        .update(exerciseTypesTable)
        .set({
          isHidden: 1,
          methodLocked: 0,
          lockedMethodId: null,
        })
        .where(inArray(exerciseTypesTable.id, usedExerciseTypeIds))
    }

    await db.$client.execute('COMMIT')
  } catch (error) {
    await db.$client.execute('ROLLBACK')
    throw error
  }

  return { deleted: unusedExerciseTypeIds.length, hidden: usedExerciseTypeIds.length }
}

export async function deleteCustomMethodFromExercise(
  exerciseTypeId: string,
  methodId: string,
): Promise<void> {
  await ensureLibraryTables()
  await ensureExerciseTables()
  await ensureTemplateTables()

  const exerciseTypeRow = (await db
    .select({
      id: exerciseTypesTable.id,
      isCustom: exerciseTypesTable.isCustom,
      lockedMethodId: exerciseTypesTable.lockedMethodId,
    })
    .from(exerciseTypesTable)
    .where(eq(exerciseTypesTable.id, exerciseTypeId))
    .limit(1))[0] as {
    id: string
    isCustom: number
    lockedMethodId: string | null
  } | undefined
  if (!exerciseTypeRow) {
    throw new Error('Unknown exercise')
  }
  const methodRow = (await db
    .select({
      id: methodsTable.id,
      isCustom: methodsTable.isCustom,
      ownerExerciseTypeId: methodsTable.ownerExerciseTypeId,
    })
    .from(methodsTable)
    .where(eq(methodsTable.id, methodId))
    .limit(1))[0] as {
    id: string
    isCustom: number
    ownerExerciseTypeId: string | null
  } | undefined
  if (!methodRow) {
    throw new Error('Unknown method')
  }
  if (methodRow.ownerExerciseTypeId && methodRow.ownerExerciseTypeId !== exerciseTypeId) {
    throw new Error('This method belongs to another exercise')
  }

  const usage = (await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(workoutExercisesTable)
    .innerJoin(exercisesTable, eq(exercisesTable.id, workoutExercisesTable.exerciseId))
    .where(and(
      eq(exercisesTable.exerciseTypeId, exerciseTypeId),
      eq(exercisesTable.methodId, methodId),
    ))
    .limit(1))[0]
  const workoutCount = Number(usage?.count ?? 0)

  const templateUsage = (await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(workoutTemplateExercisesTable)
    .where(and(
      eq(workoutTemplateExercisesTable.exerciseTypeId, exerciseTypeId),
      eq(workoutTemplateExercisesTable.methodId, methodId),
    ))
    .limit(1))[0]
  const templateCount = Number(templateUsage?.count ?? 0)
  const hasUsage = workoutCount > 0 || templateCount > 0

  if (!hasUsage) {
    await db
      .delete(exercisesTable)
      .where(and(
        eq(exercisesTable.exerciseTypeId, exerciseTypeId),
        eq(exercisesTable.methodId, methodId),
      ))
  }

  if (exerciseTypeRow.lockedMethodId === methodId) {
    await db
      .update(exerciseTypesTable)
      .set({ methodLocked: 0, lockedMethodId: null })
      .where(eq(exerciseTypesTable.id, exerciseTypeId))
  }

  if (methodRow.ownerExerciseTypeId === exerciseTypeId && !hasUsage) {
    await db
      .delete(exerciseTypeMethodExclusionsTable)
      .where(eq(exerciseTypeMethodExclusionsTable.methodId, methodId))
    await db.delete(methodsTable).where(eq(methodsTable.id, methodId))
    return
  }

  await db
    .insert(exerciseTypeMethodExclusionsTable)
    .values({ exerciseTypeId, methodId })
    .onConflictDoNothing()
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
  await db.insert(exerciseTypesTable).values({
    id,
    sectionId: params.sectionId,
    name: trimmed,
    isCustom: 1,
    methodLocked: params.methodLocked ? 1 : 0,
    lockedMethodId: params.methodLocked ? params.lockedMethodId ?? null : null,
  })
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
  const existing = (await db
    .select({
      id: exercisesTable.id,
      defaultUnit: exercisesTable.defaultUnit,
    })
    .from(exercisesTable)
    .where(and(
      eq(exercisesTable.exerciseTypeId, exerciseTypeId),
      eq(exercisesTable.methodId, methodId),
    ))
    .limit(1))[0]
  if (existing) {
    return existing
  }
  const id = `ex_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  await db.insert(exercisesTable).values({
    id,
    exerciseTypeId,
    methodId,
    defaultUnit: 'kg',
  })
  return { id, defaultUnit: 'kg' }
}

export async function getMethodName(methodId: string): Promise<string> {
  await ensureLibraryTables()
  const row = (await db
    .select({ name: methodsTable.name })
    .from(methodsTable)
    .where(eq(methodsTable.id, methodId))
    .limit(1))[0]
  return row?.name ?? ''
}

async function assertCanAddExerciseToWorkout(params: {
  workoutId: string
  exerciseTypeId: string
  methodId: string
}) {
  await ensureTable()
  await ensureLibraryTables()

  const workout = (await db
    .select({ id: workoutsTable.id })
    .from(workoutsTable)
    .where(and(
      eq(workoutsTable.id, params.workoutId),
      isNull(workoutsTable.endedAt),
    ))
    .limit(1))[0]
  if (!workout) {
    throw new Error(`Cannot add exercise to missing or ended workout: ${params.workoutId}`)
  }

  await assertMethodAvailableForExerciseType(params.exerciseTypeId, params.methodId)
}

async function assertMethodAvailableForExerciseType(
  exerciseTypeId: string,
  methodId: string,
) {
  await ensureLibraryTables()

  const exerciseTypeRow = (await db
    .select({
      id: exerciseTypesTable.id,
      isHidden: exerciseTypesTable.isHidden,
    })
    .from(exerciseTypesTable)
    .where(eq(exerciseTypesTable.id, exerciseTypeId))
    .limit(1))[0] as { id: string; isHidden: number } | undefined
  if (!exerciseTypeRow) {
    throw new Error(`Unknown exercise type: ${exerciseTypeId}`)
  }
  if (exerciseTypeRow.isHidden) {
    throw new Error(`Exercise type is not available: ${exerciseTypeId}`)
  }

  const methodRow = (await db
    .select({
      id: methodsTable.id,
      isHidden: methodsTable.isHidden,
      ownerExerciseTypeId: methodsTable.ownerExerciseTypeId,
    })
    .from(methodsTable)
    .where(eq(methodsTable.id, methodId))
    .limit(1))[0] as {
    id: string
    isHidden: number
    ownerExerciseTypeId: string | null
  } | undefined
  if (!methodRow) {
    throw new Error(`Unknown exercise method: ${methodId}`)
  }
  if (methodRow.isHidden) {
    throw new Error(`Method is not available for exercise type: ${exerciseTypeId}`)
  }
  if (methodRow.ownerExerciseTypeId && methodRow.ownerExerciseTypeId !== exerciseTypeId) {
    throw new Error(`Method is not available for exercise type: ${exerciseTypeId}`)
  }

  const excludedMethod = (await db
    .select({ methodId: exerciseTypeMethodExclusionsTable.methodId })
    .from(exerciseTypeMethodExclusionsTable)
    .where(and(
      eq(exerciseTypeMethodExclusionsTable.exerciseTypeId, exerciseTypeId),
      eq(exerciseTypeMethodExclusionsTable.methodId, methodId),
    ))
    .limit(1))[0]
  if (excludedMethod) {
    throw new Error(`Method is not available for exercise type: ${exerciseTypeId}`)
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
  await db.insert(workoutExercisesTable).values({
    id,
    workoutId: params.workoutId,
    exerciseId: exercise.id,
    orderIndex: params.orderIndex,
  })
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
  const exercise = (await db
    .select({ id: workoutExercisesTable.id })
    .from(workoutExercisesTable)
    .where(eq(workoutExercisesTable.id, params.workoutExerciseId))
    .limit(1))[0]
  if (!exercise) {
    throw new Error(`Unknown workout exercise: ${params.workoutExerciseId}`)
  }

  await db.insert(setsTable).values({
    id,
    workoutExerciseId: params.workoutExerciseId,
    setType: params.setType ?? 'working',
    weight: weightKg,
    weightUnit,
    reps,
    volume,
    completedAt: Date.now(),
  })
  return id
}

export async function deleteCompletedSet(setId: string): Promise<void> {
  await ensureExerciseTables()
  await db.delete(setsTable).where(eq(setsTable.id, setId))
}

export async function getLatestOpenWorkoutId(): Promise<string | null> {
  await ensureTable()
  const row = (await db
    .select({ id: workoutsTable.id })
    .from(workoutsTable)
    .where(isNull(workoutsTable.endedAt))
    .orderBy(desc(workoutsTable.startedAt))
    .limit(1))[0]
  return row?.id ?? null
}

export async function getActiveWorkoutSession(
  workoutId: string,
): Promise<ActiveWorkoutSession | null> {
  await ensureTable()
  await ensureExerciseTables()
  await ensureLibraryTables()

  const workout = (await db
    .select({
      id: workoutsTable.id,
      name: workoutsTable.name,
      startedAt: workoutsTable.startedAt,
    })
    .from(workoutsTable)
    .where(and(
      eq(workoutsTable.id, workoutId),
      isNull(workoutsTable.endedAt),
    ))
    .limit(1))[0] as {
    id: string
    name: string | null
    startedAt: number
  } | undefined

  if (!workout) return null

  const rows = await db
    .select({
      workoutExerciseId: workoutExercisesTable.id,
      orderIndex: workoutExercisesTable.orderIndex,
      exerciseTypeId: exerciseTypesTable.id,
      exerciseTypeName: exerciseTypesTable.name,
      methodLocked: exerciseTypesTable.methodLocked,
      methodId: methodsTable.id,
      methodName: methodsTable.name,
      defaultWeightUnit: exercisesTable.defaultUnit,
      setId: setsTable.id,
      setType: setsTable.setType,
      weight: setsTable.weight,
      setWeightUnit: setsTable.weightUnit,
      reps: setsTable.reps,
      completedAt: setsTable.completedAt,
    })
    .from(workoutExercisesTable)
    .innerJoin(exercisesTable, eq(exercisesTable.id, workoutExercisesTable.exerciseId))
    .innerJoin(exerciseTypesTable, eq(exerciseTypesTable.id, exercisesTable.exerciseTypeId))
    .innerJoin(methodsTable, eq(methodsTable.id, exercisesTable.methodId))
    .leftJoin(setsTable, eq(setsTable.workoutExerciseId, workoutExercisesTable.id))
    .where(eq(workoutExercisesTable.workoutId, workoutId))
    .orderBy(
      asc(workoutExercisesTable.orderIndex),
      asc(setsTable.completedAt),
      asc(setsTable.id),
    ) as Array<{
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
  await db.insert(workoutTemplatesTable).values({
    id,
    name: trimmed,
    createdAt: now,
    updatedAt: now,
  })
  return id
}

export async function updateWorkoutTemplateName(templateId: string, name: string): Promise<void> {
  const trimmed = name.trim()
  if (!trimmed) throw new Error('Template name is required')
  await ensureTemplateTables()
  await db
    .update(workoutTemplatesTable)
    .set({ name: trimmed, updatedAt: Date.now() })
    .where(eq(workoutTemplatesTable.id, templateId))
}

export async function getWorkoutTemplates(): Promise<WorkoutTemplateSummary[]> {
  await ensureTemplateTables()
  return db
    .select({
      id: workoutTemplatesTable.id,
      name: workoutTemplatesTable.name,
      isFavorite: workoutTemplatesTable.isFavorite,
      createdAt: workoutTemplatesTable.createdAt,
      updatedAt: workoutTemplatesTable.updatedAt,
      exerciseCount: sql<number>`COUNT(${workoutTemplateExercisesTable.id})`,
      totalSetCount: sql<number>`COALESCE(SUM(${workoutTemplateExercisesTable.setCount}), 0)`,
    })
    .from(workoutTemplatesTable)
    .leftJoin(
      workoutTemplateExercisesTable,
      eq(workoutTemplateExercisesTable.templateId, workoutTemplatesTable.id),
    )
    .groupBy(workoutTemplatesTable.id)
    .orderBy(desc(workoutTemplatesTable.isFavorite), desc(workoutTemplatesTable.updatedAt)) as Promise<WorkoutTemplateSummary[]>
}

export async function getFavoriteWorkoutTemplates(): Promise<WorkoutTemplateSummary[]> {
  await ensureTemplateTables()
  return db
    .select({
      id: workoutTemplatesTable.id,
      name: workoutTemplatesTable.name,
      isFavorite: workoutTemplatesTable.isFavorite,
      createdAt: workoutTemplatesTable.createdAt,
      updatedAt: workoutTemplatesTable.updatedAt,
      exerciseCount: sql<number>`COUNT(${workoutTemplateExercisesTable.id})`,
      totalSetCount: sql<number>`COALESCE(SUM(${workoutTemplateExercisesTable.setCount}), 0)`,
    })
    .from(workoutTemplatesTable)
    .leftJoin(
      workoutTemplateExercisesTable,
      eq(workoutTemplateExercisesTable.templateId, workoutTemplatesTable.id),
    )
    .where(eq(workoutTemplatesTable.isFavorite, 1))
    .groupBy(workoutTemplatesTable.id)
    .orderBy(desc(workoutTemplatesTable.updatedAt))
    .limit(6) as Promise<WorkoutTemplateSummary[]>
}

export async function getWorkoutTemplateDetail(
  templateId: string,
): Promise<WorkoutTemplateDetail | null> {
  await ensureTemplateTables()
  const summary = (await db
    .select({
      id: workoutTemplatesTable.id,
      name: workoutTemplatesTable.name,
      isFavorite: workoutTemplatesTable.isFavorite,
      createdAt: workoutTemplatesTable.createdAt,
      updatedAt: workoutTemplatesTable.updatedAt,
      exerciseCount: sql<number>`COUNT(${workoutTemplateExercisesTable.id})`,
      totalSetCount: sql<number>`COALESCE(SUM(${workoutTemplateExercisesTable.setCount}), 0)`,
    })
    .from(workoutTemplatesTable)
    .leftJoin(
      workoutTemplateExercisesTable,
      eq(workoutTemplateExercisesTable.templateId, workoutTemplatesTable.id),
    )
    .where(eq(workoutTemplatesTable.id, templateId))
    .groupBy(workoutTemplatesTable.id)
    .limit(1))[0] as WorkoutTemplateSummary | undefined
  if (!summary) return null

  const exercises = await db
    .select({
      id: workoutTemplateExercisesTable.id,
      templateId: workoutTemplateExercisesTable.templateId,
      exerciseTypeId: exerciseTypesTable.id,
      exerciseTypeName: exerciseTypesTable.name,
      methodLocked: exerciseTypesTable.methodLocked,
      methodId: methodsTable.id,
      methodName: methodsTable.name,
      setCount: workoutTemplateExercisesTable.setCount,
      orderIndex: workoutTemplateExercisesTable.orderIndex,
    })
    .from(workoutTemplateExercisesTable)
    .innerJoin(
      exerciseTypesTable,
      eq(exerciseTypesTable.id, workoutTemplateExercisesTable.exerciseTypeId),
    )
    .innerJoin(methodsTable, eq(methodsTable.id, workoutTemplateExercisesTable.methodId))
    .where(eq(workoutTemplateExercisesTable.templateId, templateId))
    .orderBy(asc(workoutTemplateExercisesTable.orderIndex), asc(workoutTemplateExercisesTable.id)) as WorkoutTemplateExercise[]

  return { ...summary, exercises }
}

export async function setWorkoutTemplateFavorite(
  templateId: string,
  favorite: boolean,
): Promise<void> {
  await ensureTemplateTables()
  if (favorite) {
    const countRow = (await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(workoutTemplatesTable)
      .where(and(
        eq(workoutTemplatesTable.isFavorite, 1),
        ne(workoutTemplatesTable.id, templateId),
      ))
      .limit(1))[0]
    const favoriteCount = Number(countRow?.count ?? 0)
    if (favoriteCount >= 6) {
      throw new Error('You can favorite up to 6 templates.')
    }
  }
  await db
    .update(workoutTemplatesTable)
    .set({ isFavorite: favorite ? 1 : 0, updatedAt: Date.now() })
    .where(eq(workoutTemplatesTable.id, templateId))
}

export async function deleteWorkoutTemplate(templateId: string): Promise<void> {
  await ensureTemplateTables()
  await db
    .delete(workoutTemplateExercisesTable)
    .where(eq(workoutTemplateExercisesTable.templateId, templateId))
  await db.delete(workoutTemplatesTable).where(eq(workoutTemplatesTable.id, templateId))
}

export async function addExerciseToWorkoutTemplate(params: {
  templateId: string
  exerciseTypeId: string
  methodId: string
  setCount: number
}): Promise<void> {
  await ensureTemplateTables()
  await assertMethodAvailableForExerciseType(params.exerciseTypeId, params.methodId)
  const setCount = Math.max(1, Math.min(12, Math.trunc(params.setCount)))
  const orderRow = (await db
    .select({
      nextOrder: sql<number>`COALESCE(MAX(${workoutTemplateExercisesTable.orderIndex}), -1) + 1`,
    })
    .from(workoutTemplateExercisesTable)
    .where(eq(workoutTemplateExercisesTable.templateId, params.templateId))
    .limit(1))[0]
  const nextOrder = Number(orderRow?.nextOrder ?? 0)
  const id = genTemplateId('template_exercise')
  await db.insert(workoutTemplateExercisesTable).values({
    id,
    templateId: params.templateId,
    exerciseTypeId: params.exerciseTypeId,
    methodId: params.methodId,
    setCount,
    orderIndex: nextOrder,
  })
  await db
    .update(workoutTemplatesTable)
    .set({ updatedAt: Date.now() })
    .where(eq(workoutTemplatesTable.id, params.templateId))
}

export async function updateWorkoutTemplateExerciseSetCount(
  templateExerciseId: string,
  setCount: number,
): Promise<void> {
  await ensureTemplateTables()
  const safeSetCount = Math.max(1, Math.min(12, Math.trunc(setCount)))
  await db
    .update(workoutTemplateExercisesTable)
    .set({ setCount: safeSetCount })
    .where(eq(workoutTemplateExercisesTable.id, templateExerciseId))
  const row = (await db
    .select({ templateId: workoutTemplateExercisesTable.templateId })
    .from(workoutTemplateExercisesTable)
    .where(eq(workoutTemplateExercisesTable.id, templateExerciseId))
    .limit(1))[0]
  if (row?.templateId) {
    await db
      .update(workoutTemplatesTable)
      .set({ updatedAt: Date.now() })
      .where(eq(workoutTemplatesTable.id, row.templateId))
  }
}

export async function removeExerciseFromWorkoutTemplate(
  templateExerciseId: string,
): Promise<void> {
  await ensureTemplateTables()
  const row = (await db
    .select({ templateId: workoutTemplateExercisesTable.templateId })
    .from(workoutTemplateExercisesTable)
    .where(eq(workoutTemplateExercisesTable.id, templateExerciseId))
    .limit(1))[0]
  await db
    .delete(workoutTemplateExercisesTable)
    .where(eq(workoutTemplateExercisesTable.id, templateExerciseId))
  if (row?.templateId) {
    await db
      .update(workoutTemplatesTable)
      .set({ updatedAt: Date.now() })
      .where(eq(workoutTemplatesTable.id, row.templateId))
  }
}

export async function replaceWorkoutTemplateExercises(
  templateId: string,
  exercises: WorkoutTemplateExercise[],
): Promise<void> {
  await ensureTemplateTables()
  await db
    .delete(workoutTemplateExercisesTable)
    .where(eq(workoutTemplateExercisesTable.templateId, templateId))
  for (const [index, exercise] of exercises.entries()) {
    await db.insert(workoutTemplateExercisesTable).values({
      id: exercise.id,
      templateId,
      exerciseTypeId: exercise.exerciseTypeId,
      methodId: exercise.methodId,
      setCount: Math.max(1, Math.min(12, Math.trunc(exercise.setCount))),
      orderIndex: index,
    })
  }
  await db
    .update(workoutTemplatesTable)
    .set({ updatedAt: Date.now() })
    .where(eq(workoutTemplatesTable.id, templateId))
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
