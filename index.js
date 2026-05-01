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
  buildWorkoutNotification,
  showRestDoneNotification,
} from './src/services/WorkoutNotification'
import {
  MMKV_PENDING_WORKOUT_ACTION,
  MMKV_REST_ENDS_AT,
  MMKV_STARTED_AT,
} from './src/store/sessionStore'

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// Runs inside the Android foreground service. It keeps the notification
// alive while the app is backgrounded. Android's native chronometer handles
// the live timer so we do not hammer the system notification manager.
notifee.registerForegroundService((notification) => {
  return new Promise((resolve) => {
    async function run() {
      while (true) {
        const startedAtStr = storage.getString(MMKV_STARTED_AT)
        if (!startedAtStr) {
          resolve()
          return
        }

        const startedAt = parseInt(startedAtStr, 10)
        const elapsed = Math.floor((Date.now() - startedAt) / 1000)
        const restEndsAtStr = storage.getString(MMKV_REST_ENDS_AT)
        const restSecondsRemaining = restEndsAtStr
          ? Math.ceil((parseInt(restEndsAtStr, 10) - Date.now()) / 1000)
          : 0

        if (restEndsAtStr && restSecondsRemaining <= 0) {
          removeKey(MMKV_REST_ENDS_AT)
          await showRestDoneNotification(restEndsAtStr)
          await notifee.displayNotification(buildWorkoutNotification(elapsed, 0, startedAt))
          await sleep(5000)
          continue
        }

        const nextNotification = buildWorkoutNotification(
          elapsed,
          Math.max(0, restSecondsRemaining),
          startedAt,
        )
        await notifee.displayNotification({
          ...nextNotification,
          id: notification.id ?? nextNotification.id,
        })

        const nextDelay = restSecondsRemaining > 0
          ? Math.max(1000, Math.min(5000, restSecondsRemaining * 1000))
          : 5000
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
  if (type === EventType.PRESS) {
    setString(MMKV_PENDING_WORKOUT_ACTION, 'open')
  }

  if (type === EventType.ACTION_PRESS && detail.pressAction?.id === 'end_workout') {
    setString(MMKV_PENDING_WORKOUT_ACTION, 'end_workout')
  }

  if (type === EventType.ACTION_PRESS && detail.pressAction?.id === 'skip_rest') {
    removeKey(MMKV_REST_ENDS_AT)
    setString(MMKV_PENDING_WORKOUT_ACTION, 'skip_rest')
  }
})

AppRegistry.registerComponent(appName, () => App)
