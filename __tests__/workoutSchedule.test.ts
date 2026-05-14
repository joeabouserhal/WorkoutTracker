import { setString, storage } from '../src/storage/mmkv'
import {
  getScheduledTemplateForToday,
  getWeeklyWorkoutSchedule,
  setScheduledTemplateForWeekday,
  WEEKDAYS,
  WORKOUT_SCHEDULE_STORAGE_KEY,
} from '../src/services/workoutSchedule'

beforeEach(() => {
  const testStorage = storage as unknown as { clearAll: () => void }
  testStorage.clearAll()
})

test('creates an empty weekly workout schedule by default', () => {
  const schedule = getWeeklyWorkoutSchedule()

  for (const day of WEEKDAYS) {
    expect(schedule[day.key]).toBeNull()
  }
})

test('stores and reads a scheduled template for a weekday', () => {
  setScheduledTemplateForWeekday('mon', 'template_1')

  expect(getWeeklyWorkoutSchedule().mon).toBe('template_1')
  expect(getWeeklyWorkoutSchedule().tue).toBeNull()
})

test('returns the scheduled template for a supplied date', () => {
  setScheduledTemplateForWeekday('thu', 'template_2')

  expect(getScheduledTemplateForToday(new Date('2026-05-14T12:00:00'))).toBe(
    'template_2',
  )
})

test('falls back to an empty schedule when stored data is invalid', () => {
  setString(WORKOUT_SCHEDULE_STORAGE_KEY, '{not-json')

  expect(getWeeklyWorkoutSchedule().mon).toBeNull()
})
