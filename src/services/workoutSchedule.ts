import { getString, setString } from '@/storage/mmkv'

export const WORKOUT_SCHEDULE_STORAGE_KEY = 'weekly_workout_schedule_v1'

export const WEEKDAYS = [
  { key: 'sun', shortLabel: 'Sun', label: 'Sunday' },
  { key: 'mon', shortLabel: 'Mon', label: 'Monday' },
  { key: 'tue', shortLabel: 'Tue', label: 'Tuesday' },
  { key: 'wed', shortLabel: 'Wed', label: 'Wednesday' },
  { key: 'thu', shortLabel: 'Thu', label: 'Thursday' },
  { key: 'fri', shortLabel: 'Fri', label: 'Friday' },
  { key: 'sat', shortLabel: 'Sat', label: 'Saturday' },
] as const

export type WeekdayKey = typeof WEEKDAYS[number]['key']
export type WeeklyWorkoutSchedule = Record<WeekdayKey, string | null>

function emptySchedule(): WeeklyWorkoutSchedule {
  return WEEKDAYS.reduce((schedule, day) => {
    schedule[day.key] = null
    return schedule
  }, {} as WeeklyWorkoutSchedule)
}

export function getWeeklyWorkoutSchedule(): WeeklyWorkoutSchedule {
  const fallback = emptySchedule()
  const raw = getString(WORKOUT_SCHEDULE_STORAGE_KEY)
  if (!raw) return fallback

  try {
    const parsed = JSON.parse(raw) as Partial<Record<WeekdayKey, unknown>>
    return WEEKDAYS.reduce((schedule, day) => {
      const value = parsed[day.key]
      schedule[day.key] = typeof value === 'string' && value.length > 0
        ? value
        : null
      return schedule
    }, fallback)
  } catch {
    return fallback
  }
}

export function setScheduledTemplateForWeekday(
  dayKey: WeekdayKey,
  templateId: string | null,
): WeeklyWorkoutSchedule {
  const schedule = getWeeklyWorkoutSchedule()
  schedule[dayKey] = templateId
  setString(WORKOUT_SCHEDULE_STORAGE_KEY, JSON.stringify(schedule))
  return schedule
}

export function getTodayWeekdayKey(date = new Date()): WeekdayKey {
  return WEEKDAYS[date.getDay()].key
}

export function getScheduledTemplateForToday(date = new Date()): string | null {
  return getWeeklyWorkoutSchedule()[getTodayWeekdayKey(date)]
}
