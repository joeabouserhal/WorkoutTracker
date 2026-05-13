export type MuscleSubsection = {
  id: string
  label: string
}

export const MUSCLE_SUBSECTIONS_BY_SECTION: Record<string, MuscleSubsection[]> = {
  Chest: [
    { id: 'chest-upper', label: 'Upper Chest' },
    { id: 'chest-mid', label: 'Mid Chest' },
  ],
  Back: [
    { id: 'back-lats', label: 'Lats' },
    { id: 'back-upper', label: 'Upper Back' },
    { id: 'back-traps', label: 'Traps' },
    { id: 'back-lower', label: 'Lower Back' },
  ],
  Shoulders: [
    { id: 'shoulders-front-delts', label: 'Front Delts' },
    { id: 'shoulders-side-delts', label: 'Side Delts' },
    { id: 'shoulders-rear-delts', label: 'Rear Delts' },
  ],
  Biceps: [],
  Triceps: [],
  Forearms: [],
  Legs: [
    { id: 'legs-quads', label: 'Quads' },
    { id: 'legs-hamstrings', label: 'Hamstrings' },
    { id: 'legs-adductors', label: 'Adductors' },
    { id: 'legs-abductors', label: 'Abductors' },
    { id: 'legs-calves', label: 'Calves' },
  ],
  Glutes: [],
  Core: [
    { id: 'core-abs', label: 'Abs' },
    { id: 'core-obliques', label: 'Obliques' },
  ],
}

export const MUSCLE_SUBSECTION_LABEL_BY_ID = Object.values(MUSCLE_SUBSECTIONS_BY_SECTION)
  .flat()
  .reduce<Record<string, string>>((acc, subsection) => {
    acc[subsection.id] = subsection.label
    return acc
  }, {})

export const FATIGUE_TARGET_ORDER = Object.values(MUSCLE_SUBSECTIONS_BY_SECTION)
  .flat()
  .map((subsection) => subsection.label)

const SUB_MUSCLE_ID_ALIASES: Record<string, string> = {
  'chest-lower': 'chest-mid',
  'core-lower-abs': 'core-abs',
}

const DEFAULT_SUB_MUSCLES_BY_EXERCISE_NAME: Record<string, string[]> = {
  'Bench Press': ['chest-mid', 'chest-upper'],
  'Incline Bench Press': ['chest-upper'],
  'Decline Bench Press': ['chest-mid'],
  'Chest Fly': ['chest-mid'],
  'Cable Crossover': ['chest-mid'],
  'Push Up': ['chest-mid'],

  Deadlift: ['back-lower', 'back-upper', 'back-traps'],
  'Pull Up': ['back-lats'],
  'Lat Pulldown': ['back-lats'],
  'Seated Row': ['back-lats', 'back-upper'],
  'T-Bar Row': ['back-upper', 'back-lats'],
  'Single Arm Row': ['back-lats', 'back-upper'],
  'Face Pull': ['back-upper', 'back-traps'],
  Shrug: ['back-traps'],

  'Overhead Press': ['shoulders-front-delts', 'shoulders-side-delts'],
  'Lateral Raise': ['shoulders-side-delts'],
  'Front Raise': ['shoulders-front-delts'],
  'Rear Delt Fly': ['shoulders-rear-delts'],

  Squat: ['legs-quads', 'legs-hamstrings', 'legs-adductors'],
  'Leg Press': ['legs-quads'],
  'Romanian Deadlift': ['legs-hamstrings'],
  'Leg Extension': ['legs-quads'],
  'Leg Curl': ['legs-hamstrings'],
  'Calf Raise': ['legs-calves'],
  'Bulgarian Split Squat': ['legs-quads', 'legs-hamstrings', 'legs-adductors'],
  'Hack Squat': ['legs-quads'],
  'Walking Lunge': ['legs-quads', 'legs-hamstrings', 'legs-adductors'],
  'Abductor Machine': ['legs-abductors'],

  Plank: ['core-abs', 'core-obliques'],
  Crunch: ['core-abs'],
  'Hanging Leg Raise': ['core-abs'],
  'Ab Rollout': ['core-abs'],
  'Russian Twist': ['core-obliques'],
  'Side Plank': ['core-obliques'],
}

export function getSubsectionsForSection(sectionName: string): MuscleSubsection[] {
  return MUSCLE_SUBSECTIONS_BY_SECTION[sectionName] ?? []
}

export function parseSubMuscleIds(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string')
  }
  if (typeof value !== 'string' || value.trim().length === 0) return []

  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string')
      : []
  } catch {
    return []
  }
}

export function stringifySubMuscleIds(ids: string[]): string {
  return JSON.stringify([...new Set(ids)])
}

function normalizeSubMuscleId(id: string): string {
  return SUB_MUSCLE_ID_ALIASES[id] ?? id
}

export function sanitizeSubMuscleIds(sectionName: string, ids: string[]): string[] {
  const allowedIds = new Set(getSubsectionsForSection(sectionName).map((item) => item.id))
  return [...new Set(ids.map(normalizeSubMuscleId))].filter((id) => allowedIds.has(id))
}

export function getDefaultSubMuscleIdsForExercise(exerciseName: string): string[] {
  return DEFAULT_SUB_MUSCLES_BY_EXERCISE_NAME[exerciseName] ?? []
}

export function getSubMuscleLabels(ids: string[]): string[] {
  return ids
    .map((id) => MUSCLE_SUBSECTION_LABEL_BY_ID[normalizeSubMuscleId(id)])
    .filter((label): label is string => Boolean(label))
}

export function getFatigueTargetNames(sectionName: string, subMuscleIds: string[]): string[] {
  const labels = getSubMuscleLabels(sanitizeSubMuscleIds(sectionName, subMuscleIds))
  return labels.length > 0 ? labels : [sectionName]
}
