import 'react-native-gesture-handler'

/**
 * @format
 */

import { AppRegistry } from 'react-native'
import App from './App'
import { name as appName } from './app.json'
import notifee, { EventType } from '@notifee/react-native'
import { storage, removeKey } from './src/storage/mmkv'
import { finishWorkout } from './src/db/workoutHelpers'
import {
  WORKOUT_CHANNEL_ID,
  WORKOUT_NOTIFICATION_ID,
  formatElapsedNotif,
} from './src/services/WorkoutNotification'
import { MMKV_STARTED_AT, MMKV_WORKOUT_ID } from './src/store/sessionStore'

// Runs inside the Android foreground service — keeps the notification
// timer ticking every second while the app is backgrounded.
notifee.registerForegroundService((notification) => {
  return new Promise(() => {
    const interval = setInterval(async () => {
      const startedAtStr = storage.getString(MMKV_STARTED_AT)
      if (!startedAtStr) {
        clearInterval(interval)
        return
      }
      const elapsed = Math.floor((Date.now() - parseInt(startedAtStr, 10)) / 1000)
      notifee.displayNotification({
        id: notification.id,
        title: 'Workout in Progress',
        body: formatElapsedNotif(elapsed),
        android: {
          channelId: WORKOUT_CHANNEL_ID,
          asForegroundService: true,
          ongoing: true,
          onlyAlertOnce: true,
          smallIcon: 'ic_launcher',
          actions: [
            { title: 'Skip Rest', pressAction: { id: 'skip_rest' } },
            { title: 'End Workout', pressAction: { id: 'end_workout' } },
          ],
          pressAction: { id: 'default', launchActivity: 'default' },
        },
      })
    }, 1000)
  })
})

// Handles notification button presses while the app is backgrounded or killed.
notifee.onBackgroundEvent(async ({ type, detail }) => {
  if (type === EventType.ACTION_PRESS && detail.pressAction?.id === 'end_workout') {
    const workoutId = storage.getString(MMKV_WORKOUT_ID)
    if (workoutId) {
      try {
        await finishWorkout(workoutId)
      } catch (e) {
        console.error('Failed to finish workout from background', e)
      }
    }
    removeKey(MMKV_WORKOUT_ID)
    removeKey(MMKV_STARTED_AT)
    await notifee.stopForegroundService()
    await notifee.cancelNotification(WORKOUT_NOTIFICATION_ID)
  }
})

AppRegistry.registerComponent(appName, () => App)
