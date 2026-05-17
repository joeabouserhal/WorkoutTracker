import notifee, {
  AndroidFlags,
  AndroidForegroundServiceType,
  AndroidImportance,
  type Notification,
} from '@notifee/react-native'

export const WORKOUT_CHANNEL_ID = 'workout'
export const WORKOUT_NOTIFICATION_ID = 'workout_active'
export const WORKOUT_REST_DONE_CHANNEL_ID = 'workout_rest_done'
const LEGACY_WORKOUT_REST_DONE_NOTIFICATION_ID = 'workout_rest_done_alert'
const LEGACY_REST_DONE_NOTIFICATION_ID = 'rest_done'
const REST_COUNTDOWN_DISPLAY_GRACE_MS = 900

type WorkoutNotificationOptions = {
  restEndsAt?: number | null
  restDone?: boolean
  asForegroundService?: boolean
}

export function buildWorkoutNotification(
  elapsedSeconds: number,
  restSecondsRemaining = 0,
  startedAt?: number | null,
  options: WorkoutNotificationOptions = {},
): Notification {
  const fallbackRestEndsAt = restSecondsRemaining > 0
    ? Date.now() + restSecondsRemaining * 1000
    : null
  const restEndsAt = options.restEndsAt ?? fallbackRestEndsAt
  const hasRestTimer = !options.restDone && Boolean(restEndsAt && restEndsAt > Date.now())
  const isRestDone = Boolean(options.restDone)
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
  const timestamp = hasRestTimer
    ? (restEndsAt ?? Date.now()) + REST_COUNTDOWN_DISPLAY_GRACE_MS
    : startedAt ?? Date.now() - elapsedSeconds * 1000
  const asForegroundService = options.asForegroundService ?? true

  return {
    id: WORKOUT_NOTIFICATION_ID,
    title: 'Workout in Progress',
    body: isRestDone
      ? 'Rest timer done.'
      : hasRestTimer
        ? 'Rest in progress.'
        : 'Workout in progress.',
    data: {
      type: 'active_workout',
      event: isRestDone ? 'rest_done' : hasRestTimer ? 'resting' : 'active',
    },
    android: {
      channelId: isRestDone ? WORKOUT_REST_DONE_CHANNEL_ID : WORKOUT_CHANNEL_ID,
      asForegroundService,
      foregroundServiceTypes: [
        AndroidForegroundServiceType.FOREGROUND_SERVICE_TYPE_SPECIAL_USE,
      ],
      autoCancel: false,
      flags: [AndroidFlags.FLAG_NO_CLEAR],
      ongoing: true,
      onlyAlertOnce: !isRestDone,
      smallIcon: 'ic_stat_notification',
      actions,
      pressAction: { id: 'default', launchActivity: 'default' },
      timestamp,
      showChronometer: true,
      chronometerDirection: hasRestTimer ? 'down' : 'up',
    },
  }
}

export async function setupWorkoutChannel() {
  await notifee.createChannel({
    id: WORKOUT_CHANNEL_ID,
    name: 'Active Workout',
    importance: AndroidImportance.LOW,
    lights: false,
    vibration: false,
  })
  await notifee.createChannel({
    id: WORKOUT_REST_DONE_CHANNEL_ID,
    name: 'Workout Rest Alerts',
    importance: AndroidImportance.HIGH,
    sound: 'default',
    vibration: true,
  })
}

export async function showWorkoutNotification(
  elapsedSeconds: number,
  restSecondsRemaining = 0,
  startedAt?: number | null,
  options: WorkoutNotificationOptions = {},
) {
  await setupWorkoutChannel()
  await notifee.requestPermission().catch(() => {})
  await notifee.cancelNotification(LEGACY_REST_DONE_NOTIFICATION_ID).catch(() => {})
  await notifee.cancelNotification(LEGACY_WORKOUT_REST_DONE_NOTIFICATION_ID).catch(() => {})
  await cancelRestDoneTrigger()

  const restEndsAt = options.restEndsAt ??
    (restSecondsRemaining > 0 ? Date.now() + restSecondsRemaining * 1000 : null)

  await notifee.displayNotification(
    buildWorkoutNotification(elapsedSeconds, restSecondsRemaining, startedAt, {
      ...options,
      restEndsAt,
      asForegroundService: true,
    }),
  )
}

export async function cancelRestDoneTrigger() {
  await Promise.all([
    notifee.cancelTriggerNotification(WORKOUT_NOTIFICATION_ID).catch(() => {}),
    notifee.cancelTriggerNotification(LEGACY_WORKOUT_REST_DONE_NOTIFICATION_ID).catch(() => {}),
  ])
}

export async function cancelWorkoutNotification() {
  await cancelRestDoneTrigger()
  await Promise.all([
    notifee.stopForegroundService().catch(() => {}),
    notifee.cancelNotification(WORKOUT_NOTIFICATION_ID).catch(() => {}),
    notifee.cancelNotification(LEGACY_WORKOUT_REST_DONE_NOTIFICATION_ID).catch(() => {}),
    notifee.cancelNotification(LEGACY_REST_DONE_NOTIFICATION_ID).catch(() => {}),
  ])
}
