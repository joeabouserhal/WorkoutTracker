import { Platform } from 'react-native'
import notifee, {
  AndroidFlags,
  AlarmType,
  AndroidForegroundServiceType,
  AndroidImportance,
  AndroidNotificationSetting,
  TriggerType,
  type Notification,
  type TimestampTrigger,
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

type RestDoneTrigger = {
  trigger: TimestampTrigger
  usesExactAlarm: boolean
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

export async function shouldPromptForRestAlarmPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return false

  const settings = await notifee.getNotificationSettings()
  return settings.android.alarm === AndroidNotificationSetting.DISABLED
}

export async function openRestAlarmPermissionSettings(): Promise<void> {
  if (Platform.OS === 'android') {
    await notifee.openAlarmPermissionSettings()
  }
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

  const restEndsAt = options.restEndsAt ??
    (restSecondsRemaining > 0 ? Date.now() + restSecondsRemaining * 1000 : null)

  if (restEndsAt && restEndsAt > Date.now() && startedAt) {
    await scheduleRestDoneNotification(restEndsAt, startedAt).catch(error => {
      console.error('Could not schedule rest done notification', error)
    })
  } else {
    await cancelRestDoneTrigger()
  }

  await notifee.displayNotification(
    buildWorkoutNotification(elapsedSeconds, restSecondsRemaining, startedAt, {
      ...options,
      restEndsAt,
      asForegroundService: true,
    }),
  )
}

async function getRestDoneTrigger(restEndsAt: number): Promise<RestDoneTrigger> {
  const trigger: TimestampTrigger = {
    type: TriggerType.TIMESTAMP,
    timestamp: restEndsAt,
  }

  if (Platform.OS !== 'android') {
    return { trigger, usesExactAlarm: false }
  }

  const settings = await notifee.getNotificationSettings().catch(() => null)
  const canUseExactAlarm =
    settings?.android.alarm === AndroidNotificationSetting.ENABLED ||
    settings?.android.alarm === AndroidNotificationSetting.NOT_SUPPORTED

  return {
    trigger: {
      ...trigger,
      alarmManager: {
        type: canUseExactAlarm
          ? AlarmType.SET_EXACT_AND_ALLOW_WHILE_IDLE
          : AlarmType.SET_AND_ALLOW_WHILE_IDLE,
      },
    },
    usesExactAlarm: canUseExactAlarm,
  }
}

async function createRestDoneTriggerNotification(
  notification: Notification,
  restEndsAt: number,
) {
  const { trigger, usesExactAlarm } = await getRestDoneTrigger(restEndsAt)

  try {
    await notifee.createTriggerNotification(notification, trigger)
  } catch (error) {
    if (!usesExactAlarm || Platform.OS !== 'android') throw error

    await notifee.createTriggerNotification(notification, {
      ...trigger,
      alarmManager: {
        type: AlarmType.SET_AND_ALLOW_WHILE_IDLE,
      },
    })
  }
}

export async function scheduleRestDoneNotification(restEndsAt: number, startedAt: number) {
  await cancelRestDoneTrigger()
  if (restEndsAt <= Date.now()) return

  await setupWorkoutChannel()
  const elapsedAtRestEnd = Math.max(0, Math.floor((restEndsAt - startedAt) / 1000))

  await createRestDoneTriggerNotification(
    buildWorkoutNotification(elapsedAtRestEnd, 0, startedAt, {
      restDone: true,
      asForegroundService: true,
    }),
    restEndsAt,
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
  await notifee.stopForegroundService()
  await notifee.cancelNotification(WORKOUT_NOTIFICATION_ID)
  await notifee.cancelNotification(LEGACY_WORKOUT_REST_DONE_NOTIFICATION_ID)
  await notifee.cancelNotification(LEGACY_REST_DONE_NOTIFICATION_ID)
}
