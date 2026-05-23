import 'react-native-gesture-handler'

/**
 * @format
 */

import { AppRegistry } from 'react-native'
import App from './App'
import { name as appName } from './app.json'
import notifee, { EventType } from '@notifee/react-native'
import { storage, removeKey, setString } from './src/storage/mmkv'
import {
  cancelRestDoneTrigger,
  showRestDoneAlertNotification,
  showWorkoutNotification,
  WORKOUT_NOTIFICATION_ID,
  WORKOUT_REST_DONE_NOTIFICATION_ID,
} from './src/services/WorkoutNotification'
import {
  MMKV_PENDING_WORKOUT_ACTION,
  MMKV_REST_ENDS_AT,
  MMKV_STARTED_AT,
} from './src/store/sessionStore'

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const SERVICE_IDLE_CHECK_MS = 5000
const SERVICE_REST_CHECK_MS = 1000

function parseStoredTimestamp(value) {
  if (!value) return null
  const parsed = parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : null
}

async function showActiveWorkoutNotification(options = {}) {
  const startedAt = parseStoredTimestamp(storage.getString(MMKV_STARTED_AT))
  if (!startedAt) return

  const storedRestEndsAt = parseStoredTimestamp(storage.getString(MMKV_REST_ENDS_AT))

  if (
    !options.restDone &&
    storedRestEndsAt &&
    storedRestEndsAt <= Date.now()
  ) {
    await completeRestIfCurrent(storedRestEndsAt)
    return
  }

  const elapsed = Math.floor((Date.now() - startedAt) / 1000)
  const restDoneAt = parseStoredTimestamp(options.restEndsAt) ?? storedRestEndsAt
  const restEndsAt = options.restDone ? restDoneAt : storedRestEndsAt
  const restRemaining = restEndsAt && restEndsAt > Date.now()
    ? Math.ceil((restEndsAt - Date.now()) / 1000)
    : 0
  await showWorkoutNotification(
    elapsed,
    restRemaining,
    startedAt,
    { restEndsAt, restDone: options.restDone },
  )
}

async function completeRestIfCurrent(restEndsAt, options = {}) {
  const storedRestEndsAt = parseStoredTimestamp(storage.getString(MMKV_REST_ENDS_AT))
  if (!storedRestEndsAt || storedRestEndsAt !== restEndsAt) return false

  const startedAt = parseStoredTimestamp(storage.getString(MMKV_STARTED_AT))
  if (!startedAt) return false

  await showWorkoutNotification(
    Math.floor((Date.now() - startedAt) / 1000),
    0,
    startedAt,
    { restDone: true, restEndsAt },
  )

  if (options.playAlert) {
    await showRestDoneAlertNotification(startedAt, restEndsAt)
  }

  const latestRestEndsAt = parseStoredTimestamp(storage.getString(MMKV_REST_ENDS_AT))
  if (latestRestEndsAt === restEndsAt) {
    removeKey(MMKV_REST_ENDS_AT)
  }
  await cancelRestDoneTrigger()
  return true
}

// Runs inside the Android foreground service. It keeps the notification
// alive while the app is backgrounded. Android's native chronometer handles
// the live timer; this task only wakes for state transitions.
notifee.registerForegroundService(() => {
  return new Promise((resolve) => {
    async function run() {
      while (true) {
        const startedAtStr = storage.getString(MMKV_STARTED_AT)
        if (!startedAtStr) {
          resolve()
          return
        }

        const restEndsAt = parseStoredTimestamp(storage.getString(MMKV_REST_ENDS_AT))

        const now = Date.now()
        if (restEndsAt && restEndsAt <= now) {
          await completeRestIfCurrent(restEndsAt, { playAlert: true })
          await sleep(SERVICE_IDLE_CHECK_MS)
          continue
        }

        const nextDelay = restEndsAt
          ? Math.min(
              SERVICE_REST_CHECK_MS,
              Math.max(250, restEndsAt - now),
            )
          : SERVICE_IDLE_CHECK_MS
        await sleep(nextDelay)
      }
    }

    run().catch((error) => {
      console.error('Workout foreground service failed', error)
      resolve()
    })
  })
})

// Handles notification button presses while the app is backgrounded or killed.
notifee.onBackgroundEvent(async ({ type, detail }) => {
  if (
    type === EventType.DELIVERED &&
    (
      detail.notification?.id === WORKOUT_NOTIFICATION_ID ||
      detail.notification?.id === WORKOUT_REST_DONE_NOTIFICATION_ID
    ) &&
    detail.notification?.data?.event === 'rest_done'
  ) {
    const deliveredRestEndsAt = parseStoredTimestamp(
      detail.notification?.data?.restEndsAt,
    )
    const storedRestEndsAt = parseStoredTimestamp(storage.getString(MMKV_REST_ENDS_AT))
    if (deliveredRestEndsAt && storedRestEndsAt && deliveredRestEndsAt !== storedRestEndsAt) {
      if (detail.notification?.id === WORKOUT_REST_DONE_NOTIFICATION_ID) {
        await notifee.cancelNotification(WORKOUT_REST_DONE_NOTIFICATION_ID)
      }
      await showActiveWorkoutNotification()
      return
    }
    if (storedRestEndsAt && !deliveredRestEndsAt && storedRestEndsAt > Date.now()) {
      if (detail.notification?.id === WORKOUT_REST_DONE_NOTIFICATION_ID) {
        await notifee.cancelNotification(WORKOUT_REST_DONE_NOTIFICATION_ID)
      }
      await showActiveWorkoutNotification()
      return
    }
    if (deliveredRestEndsAt) {
      await completeRestIfCurrent(deliveredRestEndsAt)
    } else {
      removeKey(MMKV_REST_ENDS_AT)
      await cancelRestDoneTrigger()
    }
  }

  if (
    type === EventType.DISMISSED &&
    detail.notification?.id === WORKOUT_NOTIFICATION_ID
  ) {
    const dismissedEvent = detail.notification?.data?.event
    const hasStoredRest = Boolean(storage.getString(MMKV_REST_ENDS_AT))
    if (dismissedEvent !== 'active' || hasStoredRest) {
      return
    }
    await sleep(750)
    await showActiveWorkoutNotification()
  }

  if (type === EventType.PRESS) {
    setString(MMKV_PENDING_WORKOUT_ACTION, 'open')
  }

  if (type === EventType.ACTION_PRESS && detail.pressAction?.id === 'end_workout') {
    setString(MMKV_PENDING_WORKOUT_ACTION, 'end_workout')
  }

  if (type === EventType.ACTION_PRESS && detail.pressAction?.id === 'skip_rest') {
    removeKey(MMKV_REST_ENDS_AT)
    await cancelRestDoneTrigger()
    await showActiveWorkoutNotification()
    setString(MMKV_PENDING_WORKOUT_ACTION, 'skip_rest')
  }
})

AppRegistry.registerComponent(appName, () => App)
