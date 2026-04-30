import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core'

export const sections = sqliteTable('sections', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  isCustom: integer('is_custom').notNull().default(0),
})

export const methods = sqliteTable('methods', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  isCustom: integer('is_custom').notNull().default(0),
})

export const exerciseTypes = sqliteTable('exercise_types', {
  id: text('id').primaryKey(),
  sectionId: text('section_id').notNull(),
  name: text('name').notNull(),
  isCustom: integer('is_custom').notNull().default(0),
  methodLocked: integer('method_locked').notNull().default(0),
  lockedMethodId: text('locked_method_id'),
})

export const exerciseTypeMethodExclusions = sqliteTable('exercise_type_method_exclusions', {
  exerciseTypeId: text('exercise_type_id').notNull(),
  methodId: text('method_id').notNull(),
})

export const exercises = sqliteTable('exercises', {
  id: text('id').primaryKey(),
  exerciseTypeId: text('exercise_type_id').notNull(),
  methodId: text('method_id').notNull(),
  defaultUnit: text('default_unit').notNull().default('kg'),
})

export const workouts = sqliteTable('workouts', {
  id: text('id').primaryKey(),
  name: text('name'),
  startedAt: integer('started_at').notNull(),
  endedAt: integer('ended_at'),
  notes: text('notes'),
})

export const workoutExercises = sqliteTable('workout_exercises', {
  id: text('id').primaryKey(),
  workoutId: text('workout_id').notNull(),
  exerciseId: text('exercise_id').notNull(),
  orderIndex: integer('order_index').notNull().default(0),
})

export const sets = sqliteTable('sets', {
  id: text('id').primaryKey(),
  workoutExerciseId: text('workout_exercise_id').notNull(),
  setType: text('set_type').notNull().default('working'),
  weight: real('weight').notNull(),
  weightUnit: text('weight_unit').notNull().default('kg'),
  reps: integer('reps').notNull(),
  estOneRM: real('est_one_rm'),
  volume: real('volume'),
  completedAt: integer('completed_at').notNull(),
})

export const bodyWeightLogs = sqliteTable('body_weight_logs', {
  id: text('id').primaryKey(),
  weight: real('weight').notNull(),
  unit: text('unit').notNull().default('kg'),
  loggedAt: integer('logged_at').notNull(),
})

export const profile = sqliteTable('profile', {
  id: text('id').primaryKey(),
  name: text('name'),
  height: real('height'),
  heightUnit: text('height_unit').notNull().default('cm'),
  defaultWeightUnit: text('default_weight_unit').notNull().default('kg'),
})
