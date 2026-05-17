import { getString, setString } from '@/storage/mmkv'

export type WeekStartDay = 0 | 1 | 2 | 3 | 4 | 5 | 6

export const DEFAULT_FIRST_DAY_OF_WEEK: WeekStartDay = 0
export const FIRST_DAY_OF_WEEK_KEY = 'calendar_first_day_of_week'

export const WEEKDAY_SHORT_LABELS = [
  'Sun',
  'Mon',
  'Tue',
  'Wed',
  'Thu',
  'Fri',
  'Sat',
] as const

export const WEEK_START_OPTIONS: Array<{
  value: WeekStartDay
  label: string
  shortLabel: string
}> = [
  { value: 6, label: 'Saturday', shortLabel: 'Sat' },
  { value: 0, label: 'Sunday', shortLabel: 'Sun' },
  { value: 1, label: 'Monday', shortLabel: 'Mon' },
]

const WEEK_START_VALUES = new Set<WeekStartDay>(
  WEEK_START_OPTIONS.map(option => option.value),
)

function isWeekStartDay(value: number): value is WeekStartDay {
  return (
    Number.isInteger(value) &&
    WEEK_START_VALUES.has(value as WeekStartDay)
  )
}

export function getFirstDayOfWeek(): WeekStartDay {
  const stored = getString(FIRST_DAY_OF_WEEK_KEY)
  const parsed = stored ? Number.parseInt(stored, 10) : NaN
  return isWeekStartDay(parsed) ? parsed : DEFAULT_FIRST_DAY_OF_WEEK
}

export function setFirstDayOfWeek(day: WeekStartDay): void {
  setString(FIRST_DAY_OF_WEEK_KEY, String(day))
}
