import notifee, { AndroidImportance } from '@notifee/react-native'

export const WORKOUT_CHANNEL_ID = 'workout'
export const WORKOUT_NOTIFICATION_ID = 'workout_active'

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

export async function showWorkoutNotification(elapsedSeconds: number) {
  await notifee.displayNotification({
    id: WORKOUT_NOTIFICATION_ID,
    title: 'Workout in Progress',
    body: formatElapsedNotif(elapsedSeconds),
    android: {
      channelId: WORKOUT_CHANNEL_ID,
      asForegroundService: true,
      ongoing: true,
      onlyAlertOnce: true,
      smallIcon: 'ic_launcher',
      actions: [
        {
          title: 'Skip Rest',
          pressAction: { id: 'skip_rest' },
        },
        {
          title: 'End Workout',
          pressAction: { id: 'end_workout' },
        },
      ],
      pressAction: { id: 'default', launchActivity: 'default' },
    },
  })
}

export async function cancelWorkoutNotification() {
  await notifee.stopForegroundService()
  await notifee.cancelNotification(WORKOUT_NOTIFICATION_ID)
}
