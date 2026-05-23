jest.mock('@notifee/react-native', () => ({
  __esModule: true,
  default: {
    cancelNotification: jest.fn(() => Promise.resolve()),
    cancelTriggerNotification: jest.fn(() => Promise.resolve()),
    createChannel: jest.fn(() => Promise.resolve()),
    createTriggerNotification: jest.fn(() => Promise.resolve()),
    displayNotification: jest.fn(() => Promise.resolve()),
    getNotificationSettings: jest.fn(() =>
      Promise.resolve({ android: { alarm: 1 } }),
    ),
    stopForegroundService: jest.fn(() => Promise.resolve()),
  },
  AlarmType: {
    SET_AND_ALLOW_WHILE_IDLE: 1,
    SET_EXACT_AND_ALLOW_WHILE_IDLE: 3,
    SET_ALARM_CLOCK: 4,
  },
  AndroidFlags: {
    FLAG_NO_CLEAR: 32,
  },
  AndroidForegroundServiceType: {
    FOREGROUND_SERVICE_TYPE_SPECIAL_USE: 1073741824,
  },
  AndroidImportance: {
    LOW: 2,
    HIGH: 4,
  },
  AndroidNotificationSetting: {
    NOT_SUPPORTED: -1,
    DISABLED: 0,
    ENABLED: 1,
  },
  TriggerType: {
    TIMESTAMP: 0,
  },
}));

import {
  buildWorkoutNotification,
  WORKOUT_CHANNEL_ID,
  WORKOUT_REST_DONE_CHANNEL_ID,
} from '../src/services/WorkoutNotification';

describe('workout notifications', () => {
  it('uses an upward workout chronometer outside rest', () => {
    const startedAt = Date.now() - 60_000;

    const notification = buildWorkoutNotification(60, 0, startedAt);

    expect(notification.title).toBe('Workout in Progress');
    expect(notification.body).toBe('Workout in progress.');
    expect(notification.data?.event).toBe('active');
    expect(notification.android?.timestamp).toBe(startedAt);
    expect(notification.android?.showChronometer).toBe(true);
    expect(notification.android?.chronometerDirection).toBe('up');
  });

  it('uses the native countdown chronometer for active rest', () => {
    const startedAt = Date.now() - 60_000;
    const restEndsAt = Date.now() + 90_000;

    const notification = buildWorkoutNotification(60, 90, startedAt, {
      restEndsAt,
    });

    expect(notification.data?.event).toBe('resting');
    expect(notification.data?.restEndsAt).toBe(restEndsAt);
    expect(notification.body).toBe('Rest in progress.');
    expect(notification.android?.channelId).toBe(WORKOUT_CHANNEL_ID);
    expect(notification.android?.timestamp).toBe(restEndsAt);
    expect(notification.android?.showChronometer).toBe(true);
    expect(notification.android?.showTimestamp).toBe(false);
    expect(notification.android?.chronometerDirection).toBe('down');
    expect(notification.android?.actions?.map(action => action.title)).toEqual([
      'Skip Rest',
      'End Workout',
    ]);
  });

  it('switches to a rest-done notification without rest countdown actions', () => {
    const startedAt = Date.now() - 180_000;
    const restEndsAt = Date.now() - 1_000;

    const notification = buildWorkoutNotification(180, 0, startedAt, {
      restDone: true,
      restEndsAt,
    });

    expect(notification.title).toBe('Workout in Progress');
    expect(notification.body).toBe('Rest timer done.');
    expect(notification.data?.event).toBe('rest_done');
    expect(notification.data?.restEndsAt).toBe(restEndsAt);
    expect(notification.android?.channelId).toBe(WORKOUT_REST_DONE_CHANNEL_ID);
    expect(notification.android?.timestamp).toBe(startedAt);
    expect(notification.android?.showChronometer).toBe(true);
    expect(notification.android?.chronometerDirection).toBe('up');
    expect(notification.android?.actions?.map(action => action.title)).toEqual([
      'End Workout',
    ]);
  });
});
