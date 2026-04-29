import notifee, { AndroidImportance } from '@notifee/react-native'
import { getString, setString } from '@/storage/mmkv'
import { formatRestTimer } from './restTimerSettings'

export const WORKOUT_CHANNEL_ID = 'workout'
export const WORKOUT_NOTIFICATION_ID = 'workout_active'
export const REST_DONE_CHANNEL_ID = 'rest_done'
export const REST_DONE_NOTIFICATION_ID = 'rest_done'
const REST_DONE_NOTIFIED_AT_KEY = 'rest_done_notified_at'

export function formatElapsedNotif(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export async function setupWorkoutChannel() {
  await notifee.createChannel({
    id: WORKOUT_CHANNEL_ID,
    name: 'Active Workout',
    importance: AndroidImportance.LOW,
    lights: false,
    vibration: false,
  })
}

export async function setupRestDoneChannel() {
  await notifee.createChannel({
    id: REST_DONE_CHANNEL_ID,
    name: 'Rest Timer',
    importance: AndroidImportance.HIGH,
    sound: 'default',
    vibration: true,
  })
}

export async function showWorkoutNotification(
  elapsedSeconds: number,
  restSecondsRemaining = 0,
) {
  const hasRestTimer = restSecondsRemaining > 0
  const elapsed = formatElapsedNotif(elapsedSeconds)
  const actions = [
    ...(hasRestTimer
      ? [{
          title: 'Skip Rest',
          pressAction: { id: 'skip_rest', launchActivity: 'default' },
        }]
      : []),
    {
      title: 'End Workout',
      pressAction: { id: 'end_workout', launchActivity: 'default' },
    },
  ]
  await notifee.displayNotification({
    id: WORKOUT_NOTIFICATION_ID,
    title: `Workout in Progress ${elapsed}`,
    body: hasRestTimer
      ? `Rest ${formatRestTimer(restSecondsRemaining)}`
      : 'Keep going. Tap to return to your workout.',
    android: {
      channelId: WORKOUT_CHANNEL_ID,
      asForegroundService: true,
      ongoing: true,
      onlyAlertOnce: true,
      smallIcon: 'ic_stat_notification',
      actions,
      pressAction: { id: 'default', launchActivity: 'default' },
    },
  })
}

export async function showRestDoneNotification(restEndsAt?: number | string | null) {
  if (restEndsAt) {
    const marker = String(restEndsAt)
    if (getString(REST_DONE_NOTIFIED_AT_KEY) === marker) return
    setString(REST_DONE_NOTIFIED_AT_KEY, marker)
  }

  await setupRestDoneChannel()
  await notifee.displayNotification({
    id: REST_DONE_NOTIFICATION_ID,
    title: 'Rest Time Done',
    body: 'Time to start your next set.',
    android: {
      channelId: REST_DONE_CHANNEL_ID,
      smallIcon: 'ic_stat_notification',
      pressAction: { id: 'default', launchActivity: 'default' },
    },
    ios: {
      sound: 'default',
      foregroundPresentationOptions: {
        alert: true,
        sound: true,
      },
    },
  })
}

export async function cancelWorkoutNotification() {
  await notifee.stopForegroundService()
  await notifee.cancelNotification(WORKOUT_NOTIFICATION_ID)
}
