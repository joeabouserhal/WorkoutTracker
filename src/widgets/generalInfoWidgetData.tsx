import React from 'react';
import { Platform } from 'react-native';
import { requestWidgetUpdate } from 'react-native-android-widget';
import {
  getMuscleGroupFatigue,
  getRecentCompletedWorkouts,
  type MuscleGroupFatigue,
} from '@/db/workoutHelpers';
import { getDefaultMuscleRecoveryHours } from '@/services/muscleRecoverySettings';
import { getString } from '@/storage/mmkv';
import {
  APP_THEMES,
  THEME_STORAGE_KEY,
  normalizeThemeKey,
} from '@/theme/themes';
import GeneralInfoWidget from './GeneralInfoWidget';
import { GENERAL_INFO_WIDGET_NAME } from './widgetConstants';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const MOTIVATION_THRESHOLD_MS = 48 * HOUR_MS;

export type WidgetHexColor = `#${string}`;

export type WidgetThemeColors = {
  bg: WidgetHexColor;
  surface: WidgetHexColor;
  surface2: WidgetHexColor;
  text: WidgetHexColor;
  textMuted: WidgetHexColor;
  accent: WidgetHexColor;
  accentMuted: WidgetHexColor;
  border: WidgetHexColor;
};

export type WidgetFatigueMuscle = Pick<
  MuscleGroupFatigue,
  'name' | 'fatigue' | 'status' | 'restHoursRemaining'
> & {
  recoveryLabel: string;
};

export type WidgetStatusSnapshot = {
  title: string;
  headline: string;
  detail: string;
  tone: 'empty' | 'motivation' | 'fatigue' | 'ready';
  topFatiguedMuscles: WidgetFatigueMuscle[];
  lastWorkoutAt: number | null;
  lastWorkoutAgeHours: number | null;
  daysSinceLastWorkout: number | null;
  lastWorkoutLabel: string;
  longestRecoveryLabel: string | null;
  updatedAt: number;
  theme: WidgetThemeColors;
};

function asWidgetColor(value: string): WidgetHexColor {
  return value as WidgetHexColor;
}

export function getWidgetThemeColors(): WidgetThemeColors {
  const themeKey = normalizeThemeKey(getString(THEME_STORAGE_KEY));
  const colors = APP_THEMES[themeKey].colors;

  return {
    bg: asWidgetColor(colors.bg),
    surface: asWidgetColor(colors.surface),
    surface2: asWidgetColor(colors.surface2),
    text: asWidgetColor(colors.text),
    textMuted: asWidgetColor(colors.textMuted),
    accent: asWidgetColor(colors.accent),
    accentMuted: asWidgetColor(colors.accentMuted),
    border: asWidgetColor(colors.border),
  };
}

export function formatWidgetRecoveryHours(hours: number) {
  if (hours <= 0) return 'Ready';
  if (hours < 1) return '<1h';

  const roundedHours = Math.ceil(hours);
  if (roundedHours < 24) return `${roundedHours}h`;

  const days = Math.floor(roundedHours / 24);
  const remainderHours = roundedHours % 24;
  return remainderHours > 0 ? `${days}d ${remainderHours}h` : `${days}d`;
}

function formatWorkoutAge(ageMs: number) {
  const safeAgeMs = Math.max(0, ageMs);
  const hours = safeAgeMs / HOUR_MS;

  if (hours < 1) return 'Just now';
  if (hours < 24) return `${Math.ceil(hours)}h ago`;

  const days = Math.floor(safeAgeMs / DAY_MS);
  return `${Math.max(1, days)}d ago`;
}

function formatDayCount(days: number) {
  return `${days} ${days === 1 ? 'day' : 'days'}`;
}

function joinMuscleNames(groups: WidgetFatigueMuscle[]) {
  return groups.map(group => group.name).join(', ');
}

function createSnapshot(
  snapshot: Omit<
    WidgetStatusSnapshot,
    'title' | 'updatedAt' | 'theme'
  >,
): WidgetStatusSnapshot {
  return {
    title: 'Workout Status',
    updatedAt: Date.now(),
    theme: getWidgetThemeColors(),
    ...snapshot,
  };
}

export function buildGeneralInfoFallbackSnapshot(): WidgetStatusSnapshot {
  return createSnapshot({
    headline: 'Open Workout Tracker',
    detail: 'Your status will refresh here.',
    tone: 'empty',
    topFatiguedMuscles: [],
    lastWorkoutAt: null,
    lastWorkoutAgeHours: null,
    daysSinceLastWorkout: null,
    lastWorkoutLabel: 'Sync pending',
    longestRecoveryLabel: null,
  });
}

export async function buildGeneralInfoWidgetSnapshot(): Promise<WidgetStatusSnapshot> {
  const [fatigue, recentWorkouts] = await Promise.all([
    getMuscleGroupFatigue(getDefaultMuscleRecoveryHours()),
    getRecentCompletedWorkouts(1),
  ]);
  const recentWorkout = recentWorkouts[0];
  const lastWorkoutAt = recentWorkout?.endedAt ?? null;
  const now = Date.now();
  const lastWorkoutAgeMs = lastWorkoutAt == null ? null : now - lastWorkoutAt;
  const lastWorkoutAgeHours =
    lastWorkoutAgeMs == null ? null : Math.max(0, lastWorkoutAgeMs / HOUR_MS);
  const daysSinceLastWorkout =
    lastWorkoutAgeMs == null
      ? null
      : Math.max(0, Math.floor(Math.max(0, lastWorkoutAgeMs) / DAY_MS));
  const topFatiguedMuscles = fatigue
    .filter(group => group.fatigue >= 0.1)
    .sort((a, b) => b.restHoursRemaining - a.restHoursRemaining)
    .slice(0, 3)
    .map(group => ({
      name: group.name,
      fatigue: group.fatigue,
      status: group.status,
      restHoursRemaining: group.restHoursRemaining,
      recoveryLabel: formatWidgetRecoveryHours(group.restHoursRemaining),
    }));
  const longestRecoveryHours = topFatiguedMuscles.reduce(
    (longest, group) => Math.max(longest, group.restHoursRemaining),
    0,
  );
  const longestRecoveryLabel =
    topFatiguedMuscles.length > 0
      ? formatWidgetRecoveryHours(longestRecoveryHours)
      : null;

  if (!recentWorkout || lastWorkoutAt == null) {
    return createSnapshot({
      headline: 'Ready when you are',
      detail: 'Log your first workout.',
      tone: 'empty',
      topFatiguedMuscles: [],
      lastWorkoutAt: null,
      lastWorkoutAgeHours: null,
      daysSinceLastWorkout: null,
      lastWorkoutLabel: 'No workouts yet',
      longestRecoveryLabel: null,
    });
  }

  if (lastWorkoutAgeMs != null && lastWorkoutAgeMs > MOTIVATION_THRESHOLD_MS) {
    const motivationDays = daysSinceLastWorkout ?? 2;

    return createSnapshot({
      headline: `Gym misses you`,
      detail: `${formatDayCount(motivationDays)} off. Go make some noise.`,
      tone: 'motivation',
      topFatiguedMuscles,
      lastWorkoutAt,
      lastWorkoutAgeHours,
      daysSinceLastWorkout,
      lastWorkoutLabel: formatWorkoutAge(lastWorkoutAgeMs),
      longestRecoveryLabel,
    });
  }

  if (topFatiguedMuscles.length > 0) {
    return createSnapshot({
      headline: joinMuscleNames(topFatiguedMuscles),
      detail: `Longest recovery ${longestRecoveryLabel}.`,
      tone: 'fatigue',
      topFatiguedMuscles,
      lastWorkoutAt,
      lastWorkoutAgeHours,
      daysSinceLastWorkout,
      lastWorkoutLabel: formatWorkoutAge(lastWorkoutAgeMs ?? 0),
      longestRecoveryLabel,
    });
  }

  return createSnapshot({
    headline: 'Recovered',
    detail: 'Good day to train.',
    tone: 'ready',
    topFatiguedMuscles: [],
    lastWorkoutAt,
    lastWorkoutAgeHours,
    daysSinceLastWorkout,
    lastWorkoutLabel: formatWorkoutAge(lastWorkoutAgeMs ?? 0),
    longestRecoveryLabel: null,
  });
}

export async function refreshGeneralInfoWidget() {
  if (Platform.OS !== 'android') return;

  try {
    await requestWidgetUpdate({
      widgetName: GENERAL_INFO_WIDGET_NAME,
      renderWidget: async () => (
        <GeneralInfoWidget snapshot={await buildGeneralInfoWidgetSnapshot()} />
      ),
    });
  } catch (e) {
    console.warn('Could not refresh general info widget', e);
  }
}
