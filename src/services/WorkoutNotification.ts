import notifee, {
  AlarmType,
  AndroidFlags,
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
export const WORKOUT_REST_DONE_NOTIFICATION_ID = 'workout_rest_done_alert_v2'
const LEGACY_WORKOUT_REST_DONE_NOTIFICATION_ID = 'workout_rest_done_alert'
const LEGACY_REST_DONE_NOTIFICATION_ID = 'rest_done'
const REST_DONE_TRIGGER_MIN_LEAD_MS = 1000
let legacyNotificationArtifactsCleared = false
let lastWorkoutNotificationKey: string | null = null
let lastRestDoneTriggerKey: string | null = null
let lastWorkoutNotificationEvent: string | null = null

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
  const event = isRestDone ? 'rest_done' : hasRestTimer ? 'resting' : 'active'
  const timestamp = hasRestTimer && typeof restEndsAt === 'number'
    ? restEndsAt
    : startedAt ?? Date.now() - elapsedSeconds * 1000
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
      event,
      ...(typeof restEndsAt === 'number' ? { restEndsAt } : {}),
      ...(typeof startedAt === 'number' ? { startedAt } : {}),
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
      showTimestamp: false,
      chronometerDirection: hasRestTimer ? 'down' : 'up',
    },
  }
}

function buildRestDoneAlertNotification(
  startedAt: number,
  restEndsAt: number,
): Notification {
  return {
    id: WORKOUT_REST_DONE_NOTIFICATION_ID,
    title: 'Workout in Progress',
    body: 'Rest timer done. Time for your next set.',
    data: {
      type: 'active_workout',
      event: 'rest_done',
      restEndsAt,
      startedAt,
    },
    android: {
      channelId: WORKOUT_REST_DONE_CHANNEL_ID,
      autoCancel: true,
      ongoing: false,
      onlyAlertOnce: false,
      smallIcon: 'ic_stat_notification',
      actions: [
        {
          title: 'End Workout',
          pressAction: { id: 'end_workout', launchActivity: 'default' },
        },
      ],
      pressAction: { id: 'default', launchActivity: 'default' },
    },
  }
}

export async function showRestDoneAlertNotification(
  startedAt: number,
  restEndsAt: number,
) {
  await setupWorkoutChannel()
  await notifee.displayNotification(
    buildRestDoneAlertNotification(startedAt, restEndsAt),
  ).catch(() => {})
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
  await clearLegacyNotificationArtifacts()

  const restEndsAt = options.restEndsAt ??
    (restSecondsRemaining > 0 ? Date.now() + restSecondsRemaining * 1000 : null)

  const notification = buildWorkoutNotification(
    elapsedSeconds,
    restSecondsRemaining,
    startedAt,
    {
      ...options,
      restEndsAt,
      asForegroundService: true,
    },
  )
  const notificationKey = [
    notification.data?.event,
    notification.data?.restEndsAt,
    notification.android?.channelId,
    notification.android?.timestamp,
  ].join('|')

  if (notification.data?.event === 'resting' && typeof restEndsAt === 'number') {
    await notifee.cancelNotification(WORKOUT_REST_DONE_NOTIFICATION_ID).catch(() => {})
    await scheduleRestDoneTrigger(startedAt, restEndsAt)
  } else {
    await cancelRestDoneTrigger()
    if (notification.data?.event === 'active') {
      await notifee.cancelNotification(WORKOUT_REST_DONE_NOTIFICATION_ID).catch(() => {})
    }
  }

  if (notificationKey === lastWorkoutNotificationKey) return

  const notificationEvent = String(notification.data?.event ?? 'active')
  if (
    lastWorkoutNotificationEvent &&
    lastWorkoutNotificationEvent !== notificationEvent
  ) {
    await notifee.cancelNotification(WORKOUT_NOTIFICATION_ID).catch(() => {})
    lastWorkoutNotificationKey = null
  }

  await notifee.displayNotification(notification)
    .then(() => {
      lastWorkoutNotificationKey = notificationKey
      lastWorkoutNotificationEvent = notificationEvent
    })
    .catch(() => {})
}

async function clearLegacyNotificationArtifacts() {
  if (legacyNotificationArtifactsCleared) return
  legacyNotificationArtifactsCleared = true
  await Promise.all([
    notifee.cancelNotification(LEGACY_REST_DONE_NOTIFICATION_ID).catch(() => {}),
    notifee.cancelNotification(LEGACY_WORKOUT_REST_DONE_NOTIFICATION_ID).catch(() => {}),
    cancelRestDoneTrigger(),
  ])
}

async function scheduleRestDoneTrigger(
  startedAt?: number | null,
  restEndsAt?: number | null,
) {
  if (
    typeof startedAt !== 'number' ||
    !Number.isFinite(startedAt) ||
    typeof restEndsAt !== 'number' ||
    !Number.isFinite(restEndsAt) ||
    restEndsAt <= Date.now() + REST_DONE_TRIGGER_MIN_LEAD_MS
  ) {
    await cancelRestDoneTrigger()
    return
  }

  const triggerKey = `${startedAt}|${restEndsAt}`
  if (triggerKey === lastRestDoneTriggerKey) return

  await cancelRestDoneTrigger()

  const settings = await notifee.getNotificationSettings().catch(() => null)
  const alarmSetting = settings?.android?.alarm
  const trigger: TimestampTrigger = {
    type: TriggerType.TIMESTAMP,
    timestamp: restEndsAt,
  }

  if (
    alarmSetting === undefined ||
    alarmSetting === AndroidNotificationSetting.ENABLED ||
    alarmSetting === AndroidNotificationSetting.NOT_SUPPORTED
  ) {
    trigger.alarmManager = {
      type: AlarmType.SET_EXACT_AND_ALLOW_WHILE_IDLE,
    }
  } else {
    trigger.alarmManager = {
      type: AlarmType.SET_ALARM_CLOCK,
    }
  }

  const notification = buildRestDoneAlertNotification(startedAt, restEndsAt)

  await notifee.createTriggerNotification(notification, trigger)
    .then(() => {
      lastRestDoneTriggerKey = triggerKey
    })
    .catch(() => {
      lastRestDoneTriggerKey = null
    })
}

export async function cancelRestDoneTrigger() {
  lastRestDoneTriggerKey = null
  await Promise.all([
    notifee.cancelTriggerNotification(WORKOUT_REST_DONE_NOTIFICATION_ID).catch(() => {}),
    notifee.cancelTriggerNotification(WORKOUT_NOTIFICATION_ID).catch(() => {}),
    notifee.cancelTriggerNotification(LEGACY_WORKOUT_REST_DONE_NOTIFICATION_ID).catch(() => {}),
  ])
}

export async function cancelWorkoutNotification() {
  legacyNotificationArtifactsCleared = false
  lastWorkoutNotificationKey = null
  lastWorkoutNotificationEvent = null
  await cancelRestDoneTrigger()
  await Promise.all([
    notifee.stopForegroundService().catch(() => {}),
    notifee.cancelNotification(WORKOUT_NOTIFICATION_ID).catch(() => {}),
    notifee.cancelNotification(WORKOUT_REST_DONE_NOTIFICATION_ID).catch(() => {}),
    notifee.cancelNotification(LEGACY_WORKOUT_REST_DONE_NOTIFICATION_ID).catch(() => {}),
    notifee.cancelNotification(LEGACY_REST_DONE_NOTIFICATION_ID).catch(() => {}),
  ])
}
