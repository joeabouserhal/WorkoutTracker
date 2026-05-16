import { setString, storage } from '../src/storage/mmkv'
import {
  getPinnedProgressExerciseIds,
  MAX_PINNED_PROGRESS_EXERCISES,
  PROGRESS_PINNED_EXERCISE_TYPE_IDS_KEY,
  setPinnedProgressExerciseIds,
} from '../src/services/progressPins'

beforeEach(() => {
  const testStorage = storage as unknown as { clearAll: () => void }
  testStorage.clearAll()
})

test('stores pinned progress exercise ids', () => {
  setPinnedProgressExerciseIds(['bench', 'squat'])

  expect(getPinnedProgressExerciseIds()).toEqual(['bench', 'squat'])
})

test('sanitizes invalid, duplicate, and excess pinned ids', () => {
  const ids = setPinnedProgressExerciseIds([
    'bench',
    '',
    'bench',
    ' squat ',
    'deadlift',
    'row',
    'press',
    'curl',
    'fly',
  ])

  expect(ids).toEqual(['bench', 'squat', 'deadlift', 'row', 'press', 'curl'])
  expect(ids).toHaveLength(MAX_PINNED_PROGRESS_EXERCISES)
})

test('falls back to no pinned ids when storage is invalid', () => {
  setString(PROGRESS_PINNED_EXERCISE_TYPE_IDS_KEY, '{bad-json')

  expect(getPinnedProgressExerciseIds()).toEqual([])
})
