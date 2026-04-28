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
  WORKOUT_CHANNEL_ID,
  formatElapsedNotif,
  showRestDoneNotification,
} from './src/services/WorkoutNotification'
import {
  MMKV_PENDING_WORKOUT_ACTION,
  MMKV_REST_ENDS_AT,
  MMKV_STARTED_AT,
} from './src/store/sessionStore'
import { formatRestTimer } from './src/services/restTimerSettings'

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
      const restEndsAtStr = storage.getString(MMKV_REST_ENDS_AT)
      const restSecondsRemaining = restEndsAtStr
        ? Math.ceil((parseInt(restEndsAtStr, 10) - Date.now()) / 1000)
        : 0

      if (restEndsAtStr && restSecondsRemaining <= 0) {
        removeKey(MMKV_REST_ENDS_AT)
        await showRestDoneNotification(restEndsAtStr)
      }

      const hasRestTimer = restSecondsRemaining > 0
      const elapsedTitle = formatElapsedNotif(elapsed)
      const actions = [
        ...(hasRestTimer
          ? [{ title: 'Skip Rest', pressAction: { id: 'skip_rest', launchActivity: 'default' } }]
          : []),
        { title: 'End Workout', pressAction: { id: 'end_workout', launchActivity: 'default' } },
      ]
      await notifee.displayNotification({
        id: notification.id,
        title: `Workout in Progress ${elapsedTitle}`,
        body: hasRestTimer
          ? `Rest ${formatRestTimer(restSecondsRemaining)}`
          : 'Keep going. Tap to return to your workout.',
        android: {
          channelId: WORKOUT_CHANNEL_ID,
          asForegroundService: true,
          ongoing: true,
          onlyAlertOnce: true,
          smallIcon: 'ic_launcher',
          actions,
          pressAction: { id: 'default', launchActivity: 'default' },
        },
      })
    }, 1000)
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
