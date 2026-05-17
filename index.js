import 'react-native-gesture-handler'
import { registerWidgetTaskHandler } from 'react-native-android-widget'

/**
 * @format
 */

import { AppRegistry } from 'react-native'
import App from './App'
import { name as appName } from './app.json'
import notifee, { EventType } from '@notifee/react-native'
import { storage, removeKey, setString } from './src/storage/mmkv'
import {
  buildWorkoutNotification,
  cancelRestDoneTrigger,
  WORKOUT_NOTIFICATION_ID,
} from './src/services/WorkoutNotification'
import {
  MMKV_PENDING_WORKOUT_ACTION,
  MMKV_REST_ENDS_AT,
  MMKV_STARTED_AT,
} from './src/store/sessionStore'
import { widgetTaskHandler } from './src/widgets/widgetTaskHandler'

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const SERVICE_IDLE_CHECK_MS = 5000

function parseStoredTimestamp(value) {
  if (!value) return null
  const parsed = parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : null
}

async function showActiveWorkoutNotification(notificationId) {
  const startedAt = parseStoredTimestamp(storage.getString(MMKV_STARTED_AT))
  if (!startedAt) return

  const elapsed = Math.floor((Date.now() - startedAt) / 1000)
  const restEndsAt = parseStoredTimestamp(storage.getString(MMKV_REST_ENDS_AT))
  const restRemaining = restEndsAt && restEndsAt > Date.now()
    ? Math.ceil((restEndsAt - Date.now()) / 1000)
    : 0
  const nextNotification = buildWorkoutNotification(
    elapsed,
    restRemaining,
    startedAt,
    { restEndsAt },
  )
  await notifee.displayNotification({
    ...nextNotification,
    id: notificationId ?? nextNotification.id,
  })
}

// Runs inside the Android foreground service. It keeps the notification
// alive while the app is backgrounded. Android's native chronometer handles
// the live timer; this task only wakes for state transitions.
notifee.registerForegroundService((notification) => {
  return new Promise((resolve) => {
    async function run() {
      while (true) {
        const startedAtStr = storage.getString(MMKV_STARTED_AT)
        if (!startedAtStr) {
          resolve()
          return
        }

        const restEndsAt = parseStoredTimestamp(storage.getString(MMKV_REST_ENDS_AT))

        if (restEndsAt && restEndsAt <= Date.now()) {
          removeKey(MMKV_REST_ENDS_AT)
          await sleep(SERVICE_IDLE_CHECK_MS)
          continue
        }

        const nextDelay = restEndsAt
          ? Math.max(250, restEndsAt - Date.now())
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
    detail.notification?.id === WORKOUT_NOTIFICATION_ID &&
    detail.notification?.data?.event === 'rest_done'
  ) {
    removeKey(MMKV_REST_ENDS_AT)
  }

  if (
    type === EventType.DISMISSED &&
    detail.notification?.id === WORKOUT_NOTIFICATION_ID
  ) {
    await sleep(750)
    await showActiveWorkoutNotification(detail.notification?.id)
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
    await showActiveWorkoutNotification(detail.notification?.id)
    setString(MMKV_PENDING_WORKOUT_ACTION, 'skip_rest')
  }
})

AppRegistry.registerComponent(appName, () => App)
registerWidgetTaskHandler(widgetTaskHandler)
