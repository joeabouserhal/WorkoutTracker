import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  AppState,
  BackHandler,
  InteractionManager,
  Keyboard,
  StatusBar,
  type LayoutChangeEvent,
  type StyleProp,
  StyleSheet,
  Text,
  TextInput,
  type TextStyle,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
  ScrollView as GestureScrollView,
} from 'react-native-gesture-handler';
import {
  KeyboardAwareScrollView,
  type KeyboardAwareScrollViewProps,
} from 'react-native-keyboard-controller';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import Reanimated, {
  Easing as ReanimatedEasing,
  runOnJS,
  type SharedValue,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import notifee, { EventType } from '@notifee/react-native';
import { useNavigation } from '@react-navigation/native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { createStyleSheet, useStyles } from 'react-native-unistyles';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getString, removeKey, setString } from '@/storage/mmkv';
import {
  MMKV_LOCAL_SETS,
  MMKV_PENDING_WORKOUT_ACTION,
  type ExerciseEntry,
  useSessionStore,
} from '@/store/sessionStore';
import {
  addCompletedSetToWorkout,
  addExerciseToWorkout,
  createSetId,
  createWorkoutExerciseId,
  deleteCompletedSet,
  deleteWorkout,
  deleteWorkoutExercise,
  finishWorkout,
  getWorkoutName,
  isExerciseTypeMethodLocked,
  updateCompletedSetInWorkout,
  updateWorkoutExerciseOrder,
  updateWorkoutName,
} from '@/db/workoutHelpers';
import {
  cancelWorkoutNotification,
  showWorkoutNotification,
} from '@/services/WorkoutNotification';
import {
  formatRestTimer,
  getDefaultRestSeconds,
} from '@/services/restTimerSettings';
import { useRestCountdownSeconds } from '@/hooks/useRestCountdownSeconds';
import {
  backupToGoogleDrive,
  getAutoBackupAfterWorkoutEnabled,
} from '@/services/backupService';
import ExercisePickerModal from './ExercisePickerModal';
import { type ThemedDialogAction } from './ui/ThemedDialog';

type LocalSet = {
  id: string;
  weightKg: string;
  weightInput: string;
  weightInputUnit: string;
  reps: string;
  completed: boolean;
  persistedSetId?: string;
};

type WorkoutExercisePositions = Record<string, number>;
type WorkoutExerciseHeights = Record<string, number>;

const LB_PER_KG = 2.20462;
const WORKOUT_EXERCISE_DEFAULT_HEIGHT = 178;
const WORKOUT_EXERCISE_GAP = 8;
const WORKOUT_EXERCISE_SETTLE_MS = 105;
const WORKOUT_EXERCISE_DRAG_ACTIVATE_MS = 65;
const ACTIVE_WORKOUT_DRAFT_SAVE_DELAY_MS = 250;
const DELETE_SWIPE_DRAG_OFFSET = 18;
const PULL_TO_CLOSE_TOP_EPSILON = 1;
const PULL_TO_CLOSE_ACTIVATE_DISTANCE = 10;
const PULL_TO_CLOSE_TRIGGER_DISTANCE = 68;
const PULL_TO_CLOSE_MAX_DISTANCE = 104;
const PULL_TO_CLOSE_TRIGGER_VELOCITY = 850;
const KeyboardAwareGestureScrollView = Reanimated.createAnimatedComponent(
  GestureScrollView,
) as NonNullable<KeyboardAwareScrollViewProps['ScrollViewComponent']>;

function buildWorkoutExercisePositions(
  exercises: ExerciseEntry[],
): WorkoutExercisePositions {
  return exercises.reduce<WorkoutExercisePositions>(
    (positions, exercise, index) => {
      positions[exercise.workoutExerciseId] = index;
      return positions;
    },
    {},
  );
}

function clampWorkoutExerciseIndex(value: number, min: number, max: number) {
  'worklet';
  return Math.max(min, Math.min(max, value));
}

function getWorkoutExerciseHeight(
  heights: WorkoutExerciseHeights,
  exerciseId: string,
) {
  'worklet';
  const height = heights[exerciseId];
  return typeof height === 'number' && height > 0
    ? height
    : WORKOUT_EXERCISE_DEFAULT_HEIGHT;
}

function getWorkoutExerciseTopForIndex(
  targetIndex: number,
  positions: WorkoutExercisePositions,
  heights: WorkoutExerciseHeights,
  exerciseIds: string[],
) {
  'worklet';
  let top = 0;
  for (let i = 0; i < exerciseIds.length; i += 1) {
    const exerciseId = exerciseIds[i];
    const position = positions[exerciseId] ?? i;
    if (position < targetIndex) {
      top +=
        getWorkoutExerciseHeight(heights, exerciseId) + WORKOUT_EXERCISE_GAP;
    }
  }
  return top;
}

function getWorkoutExerciseTargetIndex(
  draggedExerciseId: string,
  draggedCenter: number,
  positions: WorkoutExercisePositions,
  heights: WorkoutExerciseHeights,
  exerciseIds: string[],
) {
  'worklet';
  let targetIndex = 0;
  for (let i = 0; i < exerciseIds.length; i += 1) {
    const exerciseId = exerciseIds[i];
    if (exerciseId === draggedExerciseId) continue;
    const position = positions[exerciseId] ?? i;
    const height = getWorkoutExerciseHeight(heights, exerciseId);
    const top = getWorkoutExerciseTopForIndex(
      position,
      positions,
      heights,
      exerciseIds,
    );
    if (draggedCenter > top + height / 2) {
      targetIndex += 1;
    }
  }
  return clampWorkoutExerciseIndex(targetIndex, 0, exerciseIds.length - 1);
}

function formatConvertedWeight(value: number): string {
  return Number.parseFloat(value.toFixed(2)).toString();
}

function formatStoredKg(value: number): string {
  return Number.parseFloat(value.toFixed(6)).toString();
}

function parseWeightInput(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseRepsInput(value: string): number {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function sanitizeRepsInput(value: string): string {
  return value.split(/[.,]/)[0].replace(/[^\d]/g, '');
}

function toKgInput(value: string, unit: string): string {
  const parsed = parseWeightInput(value);
  if (parsed === null) return '';
  return unit === 'lb' ? formatStoredKg(parsed / LB_PER_KG) : value;
}

function fromKgInput(valueKg: string, unit: string): string {
  const parsed = parseWeightInput(valueKg);
  if (parsed === null) return '';
  return unit === 'lb' ? formatConvertedWeight(parsed * LB_PER_KG) : valueKg;
}

function newLocalSet(weightUnit = 'kg'): LocalSet {
  return {
    id: `ls_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    weightKg: '',
    weightInput: '',
    weightInputUnit: weightUnit,
    reps: '',
    completed: false,
  };
}

function localSetFromCompletedSet(
  set: {
    id: string;
    weight: number;
    weightUnit: string;
    reps: number;
  },
  fallbackWeightUnit: string,
): LocalSet {
  const weightKg = formatStoredKg(set.weight);
  const weightInputUnit =
    set.weightUnit === 'lb'
      ? 'lb'
      : set.weightUnit === 'kg'
      ? 'kg'
      : fallbackWeightUnit;
  return {
    id: set.id,
    weightKg,
    weightInput: fromKgInput(weightKg, weightInputUnit),
    weightInputUnit,
    reps: String(Math.trunc(set.reps)),
    completed: true,
    persistedSetId: set.id,
  };
}

function normalizeLocalSet(value: unknown): LocalSet | null {
  if (!value || typeof value !== 'object') return null;
  const item = value as Partial<LocalSet>;
  if (typeof item.id !== 'string') return null;
  return {
    id: item.id,
    weightKg: typeof item.weightKg === 'string' ? item.weightKg : '',
    weightInput: typeof item.weightInput === 'string' ? item.weightInput : '',
    weightInputUnit: item.weightInputUnit === 'lb' ? 'lb' : 'kg',
    reps: typeof item.reps === 'string' ? sanitizeRepsInput(item.reps) : '',
    completed: Boolean(item.completed),
    persistedSetId:
      typeof item.persistedSetId === 'string' ? item.persistedSetId : undefined,
  };
}

function readActiveWorkoutDraft(workoutId: string): {
  localSets: Record<string, LocalSet[]>;
  exerciseUnits: Record<string, string>;
} | null {
  const raw = getString(MMKV_LOCAL_SETS);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as {
      workoutId?: unknown;
      localSets?: unknown;
      exerciseUnits?: unknown;
    };
    if (
      parsed.workoutId !== workoutId ||
      !parsed.localSets ||
      typeof parsed.localSets !== 'object'
    ) {
      return null;
    }

    const localSets = Object.entries(
      parsed.localSets as Record<string, unknown>,
    ).reduce<Record<string, LocalSet[]>>((acc, [workoutExerciseId, sets]) => {
      if (!Array.isArray(sets)) return acc;
      const normalizedSets = sets
        .map(normalizeLocalSet)
        .filter((set): set is LocalSet => Boolean(set));
      if (normalizedSets.length > 0) {
        acc[workoutExerciseId] = normalizedSets;
      }
      return acc;
    }, {});
    const exerciseUnits =
      parsed.exerciseUnits && typeof parsed.exerciseUnits === 'object'
        ? Object.entries(
            parsed.exerciseUnits as Record<string, unknown>,
          ).reduce<Record<string, string>>((acc, [workoutExerciseId, unit]) => {
            if (unit === 'kg' || unit === 'lb') acc[workoutExerciseId] = unit;
            return acc;
          }, {})
        : {};

    return { localSets, exerciseUnits };
  } catch (e) {
    console.error('Could not restore active workout draft', e);
    removeKey(MMKV_LOCAL_SETS);
    return null;
  }
}

function writeActiveWorkoutDraft(
  workoutId: string,
  localSets: Record<string, LocalSet[]>,
  exercises: ExerciseEntry[],
) {
  setString(
    MMKV_LOCAL_SETS,
    JSON.stringify({
      workoutId,
      localSets,
      exerciseUnits: Object.fromEntries(
        exercises.map(exercise => [
          exercise.workoutExerciseId,
          exercise.weightUnit,
        ]),
      ),
    }),
  );
}

function areLocalSetsEqual(a: LocalSet, b: LocalSet) {
  return (
    a.id === b.id &&
    a.weightKg === b.weightKg &&
    a.weightInput === b.weightInput &&
    a.weightInputUnit === b.weightInputUnit &&
    a.reps === b.reps &&
    a.completed === b.completed &&
    a.persistedSetId === b.persistedSetId
  );
}

function areLocalSetArraysEqual(a: LocalSet[], b: LocalSet[]) {
  if (a.length !== b.length) return false;
  return a.every((set, index) => areLocalSetsEqual(set, b[index]));
}

function formatElapsed(seconds: number): string {
  const safeSeconds = Math.max(0, seconds);
  const h = Math.floor(safeSeconds / 3600);
  const m = Math.floor((safeSeconds % 3600) / 60);
  const s = safeSeconds % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function getElapsedSeconds(startedAt?: number | null): number {
  return startedAt
    ? Math.max(0, Math.floor((Date.now() - startedAt) / 1000))
    : 0;
}

function WorkoutElapsedText({
  startedAt,
  style,
}: {
  startedAt: number | null;
  style: StyleProp<TextStyle>;
}) {
  const [elapsed, setElapsed] = useState(() => getElapsedSeconds(startedAt));

  useEffect(() => {
    setElapsed(getElapsedSeconds(startedAt));
    if (!startedAt) return;

    const interval = setInterval(() => {
      setElapsed(getElapsedSeconds(startedAt));
    }, 1000);

    const appStateSub = AppState.addEventListener('change', state => {
      if (state === 'active') setElapsed(getElapsedSeconds(startedAt));
    });

    return () => {
      clearInterval(interval);
      appStateSub.remove();
    };
  }, [startedAt]);

  return <Text style={style}>{formatElapsed(elapsed)}</Text>;
}

function RestTimerCountdownText({ style }: { style: StyleProp<TextStyle> }) {
  const restEndsAt = useSessionStore(state => state.restEndsAt);
  const restSecondsRemaining = useRestCountdownSeconds(restEndsAt);

  return <Text style={style}>{formatRestTimer(restSecondsRemaining)}</Text>;
}

function formatVolumeKg(value: number): string {
  if (value >= 1000) {
    return `${Number.parseFloat((value / 1000).toFixed(1))}k kg`;
  }
  return `${Math.round(value)} kg`;
}

export default function ActiveWorkoutSheet() {
  const { styles, theme } = useStyles(stylesheet);
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const topSafeInset = Math.max(insets.top, StatusBar.currentHeight ?? 0);
  const bottomSafeInset = Math.max(insets.bottom, 0);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [localSets, setLocalSets] = useState<Record<string, LocalSet[]>>({});
  const [restSetKey, setRestSetKey] = useState<string | null>(null);
  const restSetKeyRef = useRef<string | null>(null);
  const [workoutName, setWorkoutName] = useState('');
  const [dialog, setDialog] = useState<{
    title: string;
    message?: string;
    actions: ThemedDialogAction[];
    compactActions?: boolean;
  } | null>(null);
  const [validationNotice, setValidationNotice] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<
    Record<string, boolean>
  >({});
  const [methodLockedByExerciseType, setMethodLockedByExerciseType] = useState<
    Record<string, boolean>
  >({});
  const [draggingExerciseId, setDraggingExerciseId] = useState<string | null>(
    null,
  );
  const appStateRef = useRef(AppState.currentState);
  const activeSinceRef = useRef<number | null>(
    AppState.currentState === 'active' ? Date.now() : null,
  );
  const startedAtRef = useRef<number | null>(null);
  const scrollOffsetY = useSharedValue(0);
  const pullToCloseDistance = useSharedValue(0);
  const pullToCloseStartX = useSharedValue(0);
  const pullToCloseStartY = useSharedValue(0);
  const restDoneNotifiedRef = useRef(false);
  const handledEndRequestRef = useRef(0);
  const localSetsDraftHydratedForWorkoutRef = useRef<string | null>(null);
  const localSetsRef = useRef(localSets);
  const notificationRestEndsAtRef = useRef<number | null>(null);
  const reorderPersistRequestIdRef = useRef(0);

  const activeWorkoutId = useSessionStore(state => state.activeWorkoutId);
  const startedAt = useSessionStore(state => state.startedAt);
  const exercises = useSessionStore(state => state.exercises);
  const isResting = useSessionStore(state => state.isResting);
  const restEndsAt = useSessionStore(state => state.restEndsAt);
  const isWorkoutSheetOpen = useSessionStore(state => state.isWorkoutSheetOpen);
  const endWorkoutRequestId = useSessionStore(
    state => state.endWorkoutRequestId,
  );
  const closeWorkoutSheet = useSessionStore(state => state.closeWorkoutSheet);
  const endWorkout = useSessionStore(state => state.endWorkout);
  const openWorkoutSheet = useSessionStore(state => state.openWorkoutSheet);
  const addExercise = useSessionStore(state => state.addExercise);
  const removeExercise = useSessionStore(state => state.removeExercise);
  const reorderExercises = useSessionStore(state => state.reorderExercises);
  const updateExerciseWeightUnit = useSessionStore(
    state => state.updateExerciseWeightUnit,
  );
  const addSet = useSessionStore(state => state.addSet);
  const updateSet = useSessionStore(state => state.updateSet);
  const removeSet = useSessionStore(state => state.removeSet);
  const startRest = useSessionStore(state => state.startRest);
  const tickRest = useSessionStore(state => state.tickRest);
  const clearRest = useSessionStore(state => state.clearRest);
  const exercisesRef = useRef(exercises);

  const dismissSetKeyboard = useCallback(() => {
    Keyboard.dismiss();
  }, []);

  const exerciseWeightUnitById = useMemo(
    () =>
      exercises.reduce<Record<string, string>>((acc, exercise) => {
        acc[exercise.workoutExerciseId] = exercise.weightUnit;
        return acc;
      }, {}),
    [exercises],
  );

  const footerStats = useMemo(() => {
    let completedSets = 0;
    let volumeKg = 0;
    for (const sets of Object.values(localSets)) {
      for (const set of sets) {
        if (!set.completed) continue;
        completedSets += 1;
        const weightKg = parseWeightInput(set.weightKg) ?? 0;
        const reps = parseRepsInput(set.reps);
        volumeKg += weightKg * reps;
      }
    }
    return {
      exercises: exercises.length,
      completedSets,
      volumeLabel: formatVolumeKg(volumeKg),
    };
  }, [exercises.length, localSets]);

  useEffect(() => {
    exercisesRef.current = exercises;
  }, [exercises]);

  useEffect(() => {
    localSetsRef.current = localSets;
  }, [localSets]);

  useEffect(() => {
    restSetKeyRef.current = restSetKey;
  }, [restSetKey]);

  const maybeRunAutoBackup = useCallback(async () => {
    if (!getAutoBackupAfterWorkoutEnabled()) return;

    try {
      await backupToGoogleDrive();
    } catch (e) {
      console.error('Auto backup after workout failed', e);
    }
  }, []);

  const doEndWorkout = useCallback(async () => {
    if (!activeWorkoutId) return;

    const completedWorkoutId = activeWorkoutId;
    await updateWorkoutName(completedWorkoutId, workoutName);
    await finishWorkout(completedWorkoutId);
    endWorkout();
    navigation.navigate('HomeTab', {
      screen: 'PostWorkout',
      params: { workoutId: completedWorkoutId },
    });
    cancelWorkoutNotification().catch(console.error);
    maybeRunAutoBackup().catch(console.error);
  }, [
    activeWorkoutId,
    endWorkout,
    maybeRunAutoBackup,
    navigation,
    workoutName,
  ]);

  const discardWorkout = useCallback(async () => {
    if (activeWorkoutId) await deleteWorkout(activeWorkoutId);
    endWorkout();
    await cancelWorkoutNotification();
  }, [activeWorkoutId, endWorkout]);

  const getRestSetKey = useCallback(
    (weId: string, setId: string) => `${weId}:${setId}`,
    [],
  );
  const getFieldErrorKey = useCallback(
    (weId: string, setId: string, field: 'weight' | 'reps') =>
      `${weId}:${setId}:${field}`,
    [],
  );

  const hasFieldError = useCallback(
    (weId: string, setId: string, field: 'weight' | 'reps') =>
      !!validationErrors[getFieldErrorKey(weId, setId, field)],
    [getFieldErrorKey, validationErrors],
  );

  const closeDialog = useCallback(() => setDialog(null), []);

  const showErrorDialog = useCallback(
    (message: string) => {
      setDialog({
        title: 'Something went wrong',
        message,
        actions: [{ label: 'OK', variant: 'primary', onPress: closeDialog }],
      });
    },
    [closeDialog],
  );

  const markInvalidSetFields = useCallback(
    (
      invalidFields: Array<{
        weId: string;
        setId: string;
        field: 'weight' | 'reps';
      }>,
    ) => {
      setValidationErrors(prev => {
        const next = { ...prev };
        for (const item of invalidFields) {
          next[getFieldErrorKey(item.weId, item.setId, item.field)] = true;
        }
        return next;
      });
    },
    [getFieldErrorKey],
  );

  const validateSetValues = useCallback(
    (
      weId: string,
      set: LocalSet,
    ): Array<{ weId: string; setId: string; field: 'weight' | 'reps' }> => {
      const invalidFields: Array<{
        weId: string;
        setId: string;
        field: 'weight' | 'reps';
      }> = [];
      if ((parseWeightInput(set.weightKg) ?? 0) <= 0) {
        invalidFields.push({ weId, setId: set.id, field: 'weight' });
      }
      if (parseRepsInput(set.reps) <= 0) {
        invalidFields.push({ weId, setId: set.id, field: 'reps' });
      }
      return invalidFields;
    },
    [],
  );

  const findInvalidWorkoutFields = useCallback(() => {
    const invalidFields: Array<{
      weId: string;
      setId: string;
      field: 'weight' | 'reps';
    }> = [];
    for (const [weId, sets] of Object.entries(localSets)) {
      for (const set of sets) {
        const hasAnyValue =
          parseWeightInput(set.weightKg) !== null ||
          set.weightInput.trim().length > 0 ||
          set.reps.trim().length > 0;
        if (!set.completed && !hasAnyValue) continue;
        invalidFields.push(...validateSetValues(weId, set));
      }
    }
    return invalidFields;
  }, [localSets, validateSetValues]);

  const findExercisesWithoutCompletedSets = useCallback(
    () =>
      exercises.filter(exercise => {
        const sets = localSets[exercise.workoutExerciseId] ?? [];
        return !sets.some(
          set =>
            set.completed &&
            (parseWeightInput(set.weightKg) ?? 0) > 0 &&
            parseRepsInput(set.reps) > 0,
        );
      }),
    [exercises, localSets],
  );

  const hasMeaningfulCompletedSet = useCallback(
    () =>
      Object.values(localSets).some(sets =>
        sets.some(
          set =>
            set.completed &&
            (parseWeightInput(set.weightKg) ?? 0) > 0 &&
            parseRepsInput(set.reps) > 0,
        ),
      ),
    [localSets],
  );

  const requestEndWorkout = useCallback(() => {
    const invalidFields = findInvalidWorkoutFields();
    if (invalidFields.length > 0) {
      markInvalidSetFields(invalidFields);
      const message =
        'Weight and reps must both be greater than 0 before this workout can be saved.';
      setValidationNotice(message);
      return;
    }

    const exercisesWithoutCompletedSets = findExercisesWithoutCompletedSets();
    if (exercisesWithoutCompletedSets.length > 0) {
      const fieldsToMark = exercisesWithoutCompletedSets.flatMap(exercise => {
        const firstSet = localSets[exercise.workoutExerciseId]?.[0];
        return firstSet
          ? validateSetValues(exercise.workoutExerciseId, firstSet)
          : [];
      });
      if (fieldsToMark.length > 0) {
        markInvalidSetFields(fieldsToMark);
      }
      const exerciseName =
        exercisesWithoutCompletedSets[0]?.exerciseTypeName ?? 'An exercise';
      const message =
        exercisesWithoutCompletedSets.length === 1
          ? `${exerciseName} needs at least one completed set before saving. Complete a set or remove the exercise.`
          : 'Every exercise needs at least one completed set before saving. Complete a set or remove empty exercises.';
      setValidationNotice(message);
      return;
    }

    const shouldSave = hasMeaningfulCompletedSet();
    setDialog({
      title: shouldSave ? 'End Workout' : 'Discard Workout',
      message: shouldSave
        ? 'Are you sure you want to end and save this workout?'
        : 'This workout has no completed sets with values, so ending it will discard it.',
      actions: [
        { label: 'Cancel', onPress: closeDialog },
        {
          label: shouldSave ? 'Save Workout' : 'Discard Workout',
          variant: shouldSave ? 'primary' : 'danger',
          onPress: () => {
            closeDialog();
            const action = shouldSave ? doEndWorkout : discardWorkout;
            action().catch(e => {
              console.error('Could not end workout', e);
              showErrorDialog('Could not finish this workout.');
            });
          },
        },
      ],
    });
  }, [
    closeDialog,
    discardWorkout,
    doEndWorkout,
    findExercisesWithoutCompletedSets,
    findInvalidWorkoutFields,
    hasMeaningfulCompletedSet,
    localSets,
    markInvalidSetFields,
    showErrorDialog,
    validateSetValues,
  ]);

  const requestCancelWorkout = useCallback(() => {
    dismissSetKeyboard();
    setDialog({
      title: 'Cancel Workout',
      message:
        'Discard this workout? Exercises and completed sets from this workout will be deleted.',
      actions: [
        { label: 'Keep Workout', onPress: closeDialog },
        {
          label: 'Discard Workout',
          variant: 'danger',
          onPress: () => {
            closeDialog();
            discardWorkout().catch(e => {
              console.error('Could not discard workout', e);
              showErrorDialog('Could not discard this workout.');
            });
          },
        },
      ],
    });
  }, [closeDialog, discardWorkout, dismissSetKeyboard, showErrorDialog]);

  const handleNotificationAction = useCallback(
    (action?: string | null) => {
      if (!action) return;
      removeKey(MMKV_PENDING_WORKOUT_ACTION);
      openWorkoutSheet();

      if (action === 'skip_rest') {
        clearRest();
        setRestSetKey(null);
        showWorkoutNotification(
          getElapsedSeconds(startedAtRef.current),
          0,
          startedAtRef.current,
        ).catch(console.error);
        return;
      }

      if (action === 'end_workout') {
        requestEndWorkout();
      }
    },
    [clearRest, openWorkoutSheet, requestEndWorkout],
  );

  const skipRestTimer = useCallback(() => {
    clearRest();
    setRestSetKey(null);
    showWorkoutNotification(
      getElapsedSeconds(startedAtRef.current),
      0,
      startedAtRef.current,
    ).catch(console.error);
  }, [clearRest]);

  useEffect(() => {
    startedAtRef.current = startedAt;
  }, [startedAt]);

  useEffect(() => {
    setValidationNotice(null);
    setValidationErrors({});
    setDialog(null);
    setRestSetKey(null);
    setPickerVisible(false);
    setLocalSets({});
    localSetsDraftHydratedForWorkoutRef.current = null;
    pullToCloseDistance.value = 0;
    scrollOffsetY.value = 0;
    setDraggingExerciseId(null);
  }, [activeWorkoutId, pullToCloseDistance, scrollOffsetY]);

  useEffect(() => {
    let cancelled = false;
    const ids = Array.from(new Set(exercises.map(ex => ex.exerciseTypeId)));
    if (ids.length === 0) {
      setMethodLockedByExerciseType({});
      return;
    }

    Promise.all(
      ids.map(async id => [id, await isExerciseTypeMethodLocked(id)] as const),
    )
      .then(entries => {
        if (!cancelled) {
          setMethodLockedByExerciseType(Object.fromEntries(entries));
        }
      })
      .catch(e => console.error('Could not load exercise method flags', e));

    return () => {
      cancelled = true;
    };
  }, [exercises]);

  useEffect(() => {
    if (!activeWorkoutId) {
      setWorkoutName('');
      return;
    }
    let isActive = true;
    getWorkoutName(activeWorkoutId)
      .then(name => {
        if (isActive) setWorkoutName(name || 'Workout');
      })
      .catch(e => {
        console.error('Could not load workout name', e);
        if (isActive) setWorkoutName('Workout');
      });
    return () => {
      isActive = false;
    };
  }, [activeWorkoutId]);

  useEffect(() => {
    if (!activeWorkoutId) return;
    if (localSetsDraftHydratedForWorkoutRef.current === activeWorkoutId) return;
    localSetsDraftHydratedForWorkoutRef.current = activeWorkoutId;

    const draft = readActiveWorkoutDraft(activeWorkoutId);
    if (draft) {
      setLocalSets(draft.localSets);
      for (const [workoutExerciseId, weightUnit] of Object.entries(
        draft.exerciseUnits,
      )) {
        updateExerciseWeightUnit(workoutExerciseId, weightUnit);
      }
    }
  }, [activeWorkoutId, updateExerciseWeightUnit]);

  useEffect(() => {
    if (!activeWorkoutId) {
      removeKey(MMKV_LOCAL_SETS);
      return;
    }

    const timeout = setTimeout(() => {
      writeActiveWorkoutDraft(activeWorkoutId, localSets, exercises);
    }, ACTIVE_WORKOUT_DRAFT_SAVE_DELAY_MS);
    return () => clearTimeout(timeout);
  }, [activeWorkoutId, exercises, localSets]);

  // Sync new exercises into local set state (one empty set each)
  useEffect(() => {
    setLocalSets(prev => {
      const next = { ...prev };
      let didChange = false;
      const exerciseIds = new Set(
        exercises.map(exercise => exercise.workoutExerciseId),
      );
      for (const ex of exercises) {
        const existingSets = next[ex.workoutExerciseId] ?? [];
        const restoredCompletedSets = ex.sets.map(set =>
          localSetFromCompletedSet(set, ex.weightUnit),
        );

        if (restoredCompletedSets.length > 0) {
          const draftSetsByPersistedId = new Map(
            existingSets
              .filter(set => set.persistedSetId)
              .map(set => [set.persistedSetId, set]),
          );
          const completedSets = restoredCompletedSets.map(
            set => draftSetsByPersistedId.get(set.persistedSetId) ?? set,
          );
          const draftSets = existingSets.filter(set => !set.completed);
          const mergedSets = [...completedSets, ...draftSets];
          if (!areLocalSetArraysEqual(existingSets, mergedSets)) {
            next[ex.workoutExerciseId] = mergedSets;
            didChange = true;
          }
        } else if (!next[ex.workoutExerciseId]) {
          const plannedSetCount = Math.max(
            1,
            Math.trunc(ex.plannedSetCount ?? 1),
          );
          next[ex.workoutExerciseId] = Array.from(
            { length: plannedSetCount },
            () => newLocalSet(ex.weightUnit),
          );
          didChange = true;
        }

        if (next[ex.workoutExerciseId]?.length === 0) {
          next[ex.workoutExerciseId] = [newLocalSet(ex.weightUnit)];
          didChange = true;
        }
      }
      for (const key of Object.keys(next)) {
        if (!exerciseIds.has(key)) {
          delete next[key];
          didChange = true;
        }
      }
      return didChange ? next : prev;
    });
  }, [exercises]);

  useEffect(() => {
    if (!activeWorkoutId || !isResting || restSetKey) return;

    for (const exercise of [...exercises].reverse()) {
      const latestCompletedSet = [
        ...(localSets[exercise.workoutExerciseId] ?? []),
      ]
        .reverse()
        .find(set => set.completed);
      if (latestCompletedSet) {
        setRestSetKey(
          getRestSetKey(exercise.workoutExerciseId, latestCompletedSet.id),
        );
        return;
      }
    }
  }, [
    activeWorkoutId,
    exercises,
    getRestSetKey,
    isResting,
    localSets,
    restSetKey,
  ]);

  useEffect(() => {
    const previousRestEndsAt = notificationRestEndsAtRef.current;
    notificationRestEndsAtRef.current = restEndsAt ?? null;

    if (!activeWorkoutId || !startedAt) {
      notificationRestEndsAtRef.current = null;
      cancelWorkoutNotification().catch(() => {});
      return;
    }

    if (!restEndsAt && previousRestEndsAt) return;

    async function startNotification() {
      const initial = Math.floor((Date.now() - startedAt!) / 1000);
      const restRemaining =
        restEndsAt && restEndsAt > Date.now()
          ? Math.ceil((restEndsAt - Date.now()) / 1000)
          : 0;
      await showWorkoutNotification(initial, restRemaining, startedAt, {
        restEndsAt,
      });
    }
    startNotification().catch(console.error);
  }, [activeWorkoutId, restEndsAt, startedAt]);

  useEffect(() => {
    const unsub = notifee.onForegroundEvent(({ type, detail }) => {
      if (type === EventType.PRESS) openWorkoutSheet();
      if (
        type === EventType.ACTION_PRESS &&
        detail.pressAction?.id === 'skip_rest'
      ) {
        openWorkoutSheet();
        skipRestTimer();
      }
      if (
        type === EventType.ACTION_PRESS &&
        detail.pressAction?.id === 'end_workout'
      ) {
        openWorkoutSheet();
        requestEndWorkout();
      }
    });
    return unsub;
  }, [openWorkoutSheet, requestEndWorkout, skipRestTimer]);

  useEffect(() => {
    if (!activeWorkoutId) return;

    handleNotificationAction(getString(MMKV_PENDING_WORKOUT_ACTION));
    const appStateSub = AppState.addEventListener('change', state => {
      appStateRef.current = state;
      if (state !== 'active') {
        activeSinceRef.current = null;
        dismissSetKeyboard();
        writeActiveWorkoutDraft(
          activeWorkoutId,
          localSetsRef.current,
          exercisesRef.current,
        );
        return;
      }
      if (state === 'active') {
        activeSinceRef.current = Date.now();
        dismissSetKeyboard();
        handleNotificationAction(getString(MMKV_PENDING_WORKOUT_ACTION));
        const session = useSessionStore.getState();
        if (
          session.startedAt &&
          session.restEndsAt &&
          session.restEndsAt <= Date.now()
        ) {
          useSessionStore.getState().clearRest();
          restDoneNotifiedRef.current = true;
          setRestSetKey(null);
          showWorkoutNotification(
            Math.floor((Date.now() - session.startedAt) / 1000),
            0,
            session.startedAt,
          ).catch(console.error);
          return;
        }
        if (
          session.startedAt &&
          session.restEndsAt &&
          session.restEndsAt > Date.now()
        ) {
          showWorkoutNotification(
            Math.floor((Date.now() - session.startedAt) / 1000),
            Math.ceil((session.restEndsAt - Date.now()) / 1000),
            session.startedAt,
            { restEndsAt: session.restEndsAt },
          ).catch(console.error);
        }
        if (
          session.startedAt &&
          !session.restEndsAt &&
          restDoneNotifiedRef.current
        ) {
          showWorkoutNotification(
            Math.floor((Date.now() - session.startedAt) / 1000),
            0,
            session.startedAt,
          ).catch(console.error);
        }
      }
    });
    return () => appStateSub.remove();
  }, [activeWorkoutId, dismissSetKeyboard, handleNotificationAction]);

  useEffect(() => {
    if (!activeWorkoutId || endWorkoutRequestId === 0) return;
    if (handledEndRequestRef.current === endWorkoutRequestId) return;
    handledEndRequestRef.current = endWorkoutRequestId;
    requestEndWorkout();
  }, [activeWorkoutId, endWorkoutRequestId, requestEndWorkout]);

  useEffect(() => {
    if (!isResting) return;

    const interval = setInterval(() => {
      const state = useSessionStore.getState();
      const wasResting = state.isResting;
      const restEndsAtBeforeTick = state.restEndsAt;
      tickRest();
      const stillResting = useSessionStore.getState().isResting;

      if (wasResting && !stillResting && !restDoneNotifiedRef.current) {
        restDoneNotifiedRef.current = true;
        setRestSetKey(null);
        const completedBeforeCurrentForeground =
          typeof restEndsAtBeforeTick === 'number' &&
          typeof activeSinceRef.current === 'number' &&
          restEndsAtBeforeTick <= activeSinceRef.current;

        if (appStateRef.current !== 'active') return;

        if (completedBeforeCurrentForeground) {
          showWorkoutNotification(
            getElapsedSeconds(startedAtRef.current),
            0,
            startedAtRef.current,
          ).catch(console.error);
          return;
        }

        showWorkoutNotification(
          getElapsedSeconds(startedAtRef.current),
          0,
          startedAtRef.current,
          { restDone: true },
        ).catch(console.error);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [isResting, tickRest]);

  function handleEndWorkout() {
    dismissSetKeyboard();
    requestEndWorkout();
  }

  const handleCloseSheet = useCallback(() => {
    Keyboard.dismiss();
    closeDialog();
    pullToCloseDistance.value = 0;
    setDraggingExerciseId(null);
    closeWorkoutSheet();
  }, [
    closeDialog,
    closeWorkoutSheet,
    pullToCloseDistance,
    setDraggingExerciseId,
  ]);

  useEffect(() => {
    if (!isWorkoutSheetOpen) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      handleCloseSheet();
      return true;
    });
    return () => sub.remove();
  }, [handleCloseSheet, isWorkoutSheetOpen]);

  function handlePickerOpen() {
    dismissSetKeyboard();
    setPickerVisible(true);
  }

  function handlePickerClose() {
    setPickerVisible(false);
    if (activeWorkoutId) openWorkoutSheet();
  }

  function handleExercisePicked(params: {
    exerciseTypeId: string;
    exerciseTypeName: string;
    methodLocked?: number;
    methodId: string;
    methodName: string;
  }) {
    const workoutId = activeWorkoutId;
    if (!workoutId) {
      showErrorDialog('Start a workout before adding exercises.');
      return;
    }

    const orderIndex = exercisesRef.current.length;
    const workoutExerciseId = createWorkoutExerciseId(orderIndex);
    addExercise({
      workoutExerciseId,
      exerciseTypeId: params.exerciseTypeId,
      exerciseTypeName: params.exerciseTypeName,
      methodLocked: params.methodLocked,
      methodId: params.methodId,
      methodName: params.methodName,
      weightUnit: 'kg',
    });

    addExerciseToWorkout({
      workoutId,
      exerciseTypeId: params.exerciseTypeId,
      methodId: params.methodId,
      weightUnit: 'kg',
      orderIndex,
      workoutExerciseId,
    }).catch(e => {
      console.error('Could not add exercise', e);
      removeExercise(workoutExerciseId);
      showErrorDialog('Could not add this exercise.');
    });
  }

  const scrollHandler = useAnimatedScrollHandler(event => {
    scrollOffsetY.value = Math.max(0, event.contentOffset.y);
  });

  const pullToCloseGesture = useMemo(
    () =>
      Gesture.Pan()
        .enabled(!draggingExerciseId)
        .manualActivation(true)
        .failOffsetX([-24, 24])
        .onTouchesDown(event => {
          const touch = event.allTouches[0];
          if (!touch) return;
          pullToCloseStartX.value = touch.absoluteX;
          pullToCloseStartY.value = touch.absoluteY;
        })
        .onTouchesMove((event, state) => {
          const touch = event.allTouches[0];
          if (!touch) return;

          const deltaX = touch.absoluteX - pullToCloseStartX.value;
          const deltaY = touch.absoluteY - pullToCloseStartY.value;
          const absDeltaX = Math.abs(deltaX);
          const isHorizontalSwipe = absDeltaX > 16 && absDeltaX > deltaY;

          if (
            scrollOffsetY.value > PULL_TO_CLOSE_TOP_EPSILON ||
            deltaY < -2 ||
            isHorizontalSwipe
          ) {
            state.fail();
            return;
          }

          if (
            deltaY > PULL_TO_CLOSE_ACTIVATE_DISTANCE &&
            deltaY > absDeltaX
          ) {
            state.activate();
          }
        })
        .onUpdate(event => {
          const nextDistance = Math.max(
            0,
            Math.min(
              PULL_TO_CLOSE_MAX_DISTANCE,
              event.translationY * 0.72,
            ),
          );
          pullToCloseDistance.value = nextDistance;
        })
        .onEnd(event => {
          const shouldClose =
            pullToCloseDistance.value >= PULL_TO_CLOSE_TRIGGER_DISTANCE ||
            event.velocityY >= PULL_TO_CLOSE_TRIGGER_VELOCITY;

          pullToCloseDistance.value = withSpring(0, {
            damping: 18,
            stiffness: 240,
          });

          if (shouldClose) {
            runOnJS(handleCloseSheet)();
          }
        })
        .onFinalize(() => {
          pullToCloseDistance.value = withSpring(0, {
            damping: 18,
            stiffness: 240,
          });
        }),
    [
      draggingExerciseId,
      handleCloseSheet,
      pullToCloseDistance,
      pullToCloseStartX,
      pullToCloseStartY,
      scrollOffsetY,
    ],
  );

  const pullToCloseHintStyle = useAnimatedStyle(() => {
    const progress = Math.min(
      1,
      pullToCloseDistance.value / PULL_TO_CLOSE_TRIGGER_DISTANCE,
    );

    return {
      opacity: progress,
      transform: [
        {
          translateY: -18 + Math.min(34, pullToCloseDistance.value * 0.45),
        },
        { scale: 0.94 + progress * 0.06 },
      ],
    };
  });

  function saveWorkoutName() {
    if (!activeWorkoutId) return;
    updateWorkoutName(activeWorkoutId, workoutName).catch(e => {
      console.error('Could not rename workout', e);
    });
  }

  function addLocalSet(weId: string) {
    dismissSetKeyboard();
    const weightUnit = exerciseWeightUnitById[weId] ?? 'kg';
    const previousCompletedSet = [...(localSets[weId] ?? [])]
      .reverse()
      .find(set => set.completed && parseWeightInput(set.weightKg) !== null);
    const nextSet = newLocalSet(weightUnit);
    if (previousCompletedSet) {
      nextSet.weightKg = previousCompletedSet.weightKg;
      nextSet.weightInput =
        previousCompletedSet.weightInputUnit === weightUnit
          ? previousCompletedSet.weightInput
          : fromKgInput(previousCompletedSet.weightKg, weightUnit);
      nextSet.weightInputUnit = weightUnit;
      nextSet.reps = previousCompletedSet.reps;
    }

    setLocalSets(prev => ({
      ...prev,
      [weId]: [...(prev[weId] ?? []), nextSet],
    }));
  }

  async function removeLocalSet(weId: string, setId: string) {
    dismissSetKeyboard();
    const currentSet = localSets[weId]?.find(s => s.id === setId);
    if (currentSet?.persistedSetId) {
      try {
        await deleteCompletedSet(currentSet.persistedSetId);
        removeSet(weId, currentSet.persistedSetId);
      } catch (e) {
        console.error('Could not delete completed set', e);
      }
    }

    if (restSetKey === getRestSetKey(weId, setId)) {
      clearRest();
      setRestSetKey(null);
      showWorkoutNotification(getElapsedSeconds(startedAt), 0, startedAt).catch(
        console.error,
      );
    }
    setLocalSets(prev => ({
      ...prev,
      [weId]: (prev[weId] ?? []).filter(s => s.id !== setId),
    }));
    setValidationErrors(prev => {
      const next = { ...prev };
      delete next[getFieldErrorKey(weId, setId, 'weight')];
      delete next[getFieldErrorKey(weId, setId, 'reps')];
      return next;
    });
  }

  function updateSetField(
    weId: string,
    setId: string,
    field: 'weight' | 'reps',
    value: string,
  ) {
    const weightUnit = exerciseWeightUnitById[weId] ?? 'kg';
    const nextValue = field === 'reps' ? sanitizeRepsInput(value) : value;
    const errorKey = getFieldErrorKey(weId, setId, field);
    const currentSet = localSets[weId]?.find(s => s.id === setId);
    const nextSet = currentSet
      ? field === 'weight'
        ? {
            ...currentSet,
            weightInput: nextValue,
            weightInputUnit: weightUnit,
            weightKg: toKgInput(nextValue, weightUnit),
          }
        : { ...currentSet, reps: nextValue }
      : null;
    setLocalSets(prev => ({
      ...prev,
      [weId]: (prev[weId] ?? []).map(s =>
        s.id !== setId
          ? s
          : field === 'weight'
          ? {
              ...s,
              weightInput: nextValue,
              weightInputUnit: weightUnit,
              weightKg: toKgInput(nextValue, weightUnit),
            }
          : { ...s, reps: nextValue },
      ),
    }));
    if (nextSet?.completed && nextSet.persistedSetId) {
      const weightKg = parseWeightInput(nextSet.weightKg);
      const reps = parseRepsInput(nextSet.reps);
      if (weightKg !== null && weightKg > 0 && reps > 0) {
        updateSet(weId, nextSet.persistedSetId, {
          weight: weightKg,
          weightUnit: nextSet.weightInputUnit,
          reps,
        });
        updateCompletedSetInWorkout({
          setId: nextSet.persistedSetId,
          weightKg,
          weightUnit: nextSet.weightInputUnit,
          reps,
        }).catch(e => {
          console.error('Could not update completed set', e);
        });
      }
    }
    setValidationErrors(prev => {
      if (!prev[errorKey]) return prev;
      const isValid =
        field === 'weight'
          ? (parseWeightInput(toKgInput(nextValue, weightUnit)) ?? 0) > 0
          : parseRepsInput(nextValue) > 0;
      if (!isValid) return prev;
      const next = { ...prev };
      delete next[errorKey];
      return next;
    });
    setValidationNotice(null);
  }

  function showWeightUnitPicker(weId: string, currentUnit: string) {
    dismissSetKeyboard();
    setDialog({
      title: 'Weight Unit',
      message: 'Change the unit for this exercise only.',
      compactActions: true,
      actions: [
        { label: 'Cancel', onPress: closeDialog },
        {
          label: 'kg',
          variant: currentUnit === 'kg' ? 'primary' : 'default',
          onPress: () => {
            closeDialog();
            if (currentUnit !== 'kg') changeExerciseWeightUnit(weId, 'kg');
          },
        },
        {
          label: 'lb',
          variant: currentUnit === 'lb' ? 'primary' : 'default',
          onPress: () => {
            closeDialog();
            if (currentUnit !== 'lb') changeExerciseWeightUnit(weId, 'lb');
          },
        },
      ],
    });
  }

  function changeExerciseWeightUnit(weId: string, weightUnit: string) {
    updateExerciseWeightUnit(weId, weightUnit);
    setLocalSets(prev => ({
      ...prev,
      [weId]: (prev[weId] ?? []).map(s => ({
        ...s,
        weightInput: fromKgInput(s.weightKg, weightUnit),
        weightInputUnit: weightUnit,
      })),
    }));
  }

  function getDisplayWeight(s: LocalSet, weightUnit: string): string {
    if (s.weightInputUnit === weightUnit) return s.weightInput;
    return fromKgInput(s.weightKg, weightUnit);
  }

  function toggleSetCompleted(weId: string, setId: string) {
    dismissSetKeyboard();
    const currentSet = localSets[weId]?.find(s => s.id === setId);
    if (!currentSet) return;

    if (currentSet.completed) {
      const persistedSetId = currentSet.persistedSetId;

      setLocalSets(prev => ({
        ...prev,
        [weId]: (prev[weId] ?? []).map(s =>
          s.id === setId
            ? { ...s, completed: false, persistedSetId: undefined }
            : s,
        ),
      }));
      if (persistedSetId) {
        removeSet(weId, persistedSetId);
      }

      if (restSetKey === getRestSetKey(weId, setId)) {
        clearRest();
        setRestSetKey(null);
        showWorkoutNotification(
          getElapsedSeconds(startedAt),
          0,
          startedAt,
        ).catch(console.error);
      }
      if (persistedSetId) {
        deleteCompletedSet(persistedSetId).catch(e => {
          console.error('Could not delete completed set', e);
          setLocalSets(prev => ({
            ...prev,
            [weId]: (prev[weId] ?? []).map(s =>
              s.id === setId
                ? { ...s, completed: true, persistedSetId }
                : s,
            ),
          }));
          addSet(weId, {
            id: persistedSetId,
            setType: 'working',
            weight: parseWeightInput(currentSet.weightKg) ?? 0,
            weightUnit: currentSet.weightInputUnit,
            reps: parseRepsInput(currentSet.reps),
            completedAt: Date.now(),
          });
          showErrorDialog('Could not update this set.');
        });
      }
      return;
    }

    const invalidFields = validateSetValues(weId, currentSet);
    if (invalidFields.length > 0) {
      markInvalidSetFields(invalidFields);
      const message =
        'Enter weight and reps greater than 0 before completing this set.';
      setValidationNotice(message);
      return;
    }

    const persistedSetId = createSetId();
    const completedAt = Date.now();
    const weightKg = parseWeightInput(currentSet.weightKg) ?? 0;
    const reps = parseRepsInput(currentSet.reps);
    const setRestKey = getRestSetKey(weId, setId);

    addSet(weId, {
      id: persistedSetId,
      setType: 'working',
      weight: weightKg,
      weightUnit: currentSet.weightInputUnit,
      reps,
      completedAt,
    });
    setLocalSets(prev => ({
      ...prev,
      [weId]: (prev[weId] ?? []).map(s =>
        s.id === setId ? { ...s, completed: true, persistedSetId } : s,
      ),
    }));

    const restSeconds = getDefaultRestSeconds();
    restDoneNotifiedRef.current = false;
    setRestSetKey(setRestKey);
    startRest(restSeconds);

    addCompletedSetToWorkout({
      workoutExerciseId: weId,
      weightKg,
      weightUnit: currentSet.weightInputUnit,
      reps,
      setId: persistedSetId,
      completedAt,
    }).catch(e => {
      console.error('Could not complete set', e);
      removeSet(weId, persistedSetId);
      setLocalSets(prev => ({
        ...prev,
        [weId]: (prev[weId] ?? []).map(s =>
          s.id === setId
            ? { ...s, completed: false, persistedSetId: undefined }
            : s,
        ),
      }));
      if (restSetKeyRef.current === setRestKey) {
        clearRest();
        setRestSetKey(null);
        showWorkoutNotification(
          getElapsedSeconds(startedAtRef.current),
          0,
          startedAtRef.current,
        ).catch(console.error);
      }
      showErrorDialog('Could not save this set.');
    });
  }

  async function handleDeleteExercise(weId: string) {
    const remainingOrder = exercises
      .filter(exercise => exercise.workoutExerciseId !== weId)
      .map(exercise => exercise.workoutExerciseId);

    try {
      await deleteWorkoutExercise(weId);
    } catch (e) {
      console.error('Could not delete workout exercise', e);
      showErrorDialog('Could not remove this exercise.');
      return;
    }

    if (restSetKey?.startsWith(`${weId}:`)) {
      clearRest();
      setRestSetKey(null);
      showWorkoutNotification(getElapsedSeconds(startedAt), 0, startedAt).catch(
        console.error,
      );
    }
    setLocalSets(prev => {
      const next = { ...prev };
      delete next[weId];
      return next;
    });
    setValidationErrors(prev => {
      const next = { ...prev };
      for (const key of Object.keys(next)) {
        if (key.startsWith(`${weId}:`)) delete next[key];
      }
      return next;
    });
    removeExercise(weId);
    updateWorkoutExerciseOrder(remainingOrder).catch(e => {
      console.error('Could not persist exercise order after delete', e);
    });
  }

  const handleExerciseDragStateChange = useCallback(
    (weId: string | null) => {
      if (weId) {
        Keyboard.dismiss();
        closeDialog();
      }
      setDraggingExerciseId(weId);
    },
    [closeDialog],
  );

  const persistExerciseOrder = useCallback(
    (finalOrder: string[]) => {
      const currentOrder = exercisesRef.current.map(
        exercise => exercise.workoutExerciseId,
      );
      const didChangeOrder = finalOrder.some(
        (id, index) => id !== currentOrder[index],
      );
      if (!didChangeOrder || finalOrder.length !== currentOrder.length) return;

      const byId = new Map(
        exercisesRef.current.map(exercise => [
          exercise.workoutExerciseId,
          exercise,
        ]),
      );
      exercisesRef.current = finalOrder.flatMap(id => {
        const exercise = byId.get(id);
        return exercise ? [exercise] : [];
      });
      reorderExercises(finalOrder);

      const persistRequestId = reorderPersistRequestIdRef.current + 1;
      reorderPersistRequestIdRef.current = persistRequestId;

      InteractionManager.runAfterInteractions(() => {
        if (reorderPersistRequestIdRef.current !== persistRequestId) return;

        updateWorkoutExerciseOrder(finalOrder).catch(e => {
          if (reorderPersistRequestIdRef.current !== persistRequestId) return;

          console.error('Could not persist exercise order', e);
          const byInitialId = new Map(
            exercisesRef.current.map(exercise => [
              exercise.workoutExerciseId,
              exercise,
            ]),
          );
          exercisesRef.current = currentOrder.flatMap(id => {
            const exercise = byInitialId.get(id);
            return exercise ? [exercise] : [];
          });
          reorderExercises(currentOrder);
          showErrorDialog('Could not rearrange exercises.');
        });
      });
    },
    [reorderExercises, showErrorDialog],
  );

  function renderDeleteAction(onPress: () => void) {
    return (
      <TouchableOpacity style={styles.deleteAction} onPress={onPress}>
        <MaterialCommunityIcons
          name="trash-can-outline"
          size={22}
          color="#fff"
        />
      </TouchableOpacity>
    );
  }

  if (!activeWorkoutId) return null;

  return (
    <>
      {activeWorkoutId && isWorkoutSheetOpen ? (
        <View style={styles.sheetOverlay}>
          <GestureHandlerRootView style={styles.gestureRoot}>
            <View style={[styles.root, { paddingTop: topSafeInset }]}>
              {/* Fixed header */}
              <View style={styles.header}>
                <TouchableOpacity
                  style={styles.iconBtn}
                  onPress={handleCloseSheet}
                >
                  <MaterialCommunityIcons
                    name="chevron-down"
                    size={17}
                    color={theme.colors.text}
                  />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Active Workout</Text>
                <View style={styles.headerActions}>
                  <TouchableOpacity
                    style={styles.cancelIconButton}
                    onPress={requestCancelWorkout}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <MaterialCommunityIcons
                      name="close"
                      size={17}
                      color={theme.colors.text}
                    />
                    <Text style={styles.cancelIconText}>Cancel</Text>
                  </TouchableOpacity>
                  <View style={styles.timerPill}>
                    <View style={styles.timerDot} />
                    <WorkoutElapsedText
                      startedAt={startedAt}
                      style={styles.timerText}
                    />
                  </View>
                </View>
              </View>
              {/* Scrollable exercise list */}
              <GestureDetector gesture={pullToCloseGesture}>
                <View style={styles.scrollRegion}>
                  <Reanimated.View
                    pointerEvents="none"
                    style={[styles.pullToCloseHint, pullToCloseHintStyle]}
                  >
                    <View style={styles.pullToCloseHintIcon}>
                      <MaterialCommunityIcons
                        name="chevron-down"
                        size={25}
                        color={theme.colors.accent}
                      />
                    </View>
                  </Reanimated.View>
                  <KeyboardAwareScrollView
                    ScrollViewComponent={KeyboardAwareGestureScrollView}
                    bottomOffset={theme.spacing.md}
                    style={styles.scroll}
                    contentContainerStyle={[
                      styles.scrollContent,
                      {
                        paddingBottom: theme.spacing.lg,
                      },
                    ]}
                    keyboardShouldPersistTaps="handled"
                    keyboardDismissMode="interactive"
                    alwaysBounceVertical
                    overScrollMode="always"
                    onScroll={scrollHandler}
                    scrollEventThrottle={16}
                    scrollEnabled={!draggingExerciseId}
                  >
                  <View style={styles.workoutNameCard}>
                    <Text style={styles.workoutNameLabel}>Workout Name</Text>
                    <TextInput
                      style={styles.workoutNameInput}
                      value={workoutName}
                      onChangeText={setWorkoutName}
                      onBlur={saveWorkoutName}
                      placeholder="Workout"
                      placeholderTextColor={theme.colors.textMuted}
                      returnKeyType="done"
                    />
                  </View>

                  {exercises.length === 0 && (
                    <Text style={styles.emptyHint}>
                      Add an exercise to get started
                    </Text>
                  )}

                  {exercises.length > 0 ? (
                    <SortableActiveWorkoutExerciseList
                      exercises={exercises}
                      draggingExerciseId={draggingExerciseId}
                      methodLockedByExerciseType={methodLockedByExerciseType}
                      onDeleteExercise={handleDeleteExercise}
                      onDragStateChange={handleExerciseDragStateChange}
                      onReorder={persistExerciseOrder}
                      renderExerciseBody={ex => {
                        const sets = localSets[ex.workoutExerciseId] ?? [];
                        return (
                          <>
                            {/* Column labels */}
                            <View style={styles.setLabelRow}>
                              <Text style={[styles.setLabel, styles.setNumCol]}>
                                SET
                              </Text>
                              <Text style={[styles.setLabel, styles.weightCol]}>
                                WEIGHT
                              </Text>
                              <Text style={[styles.setLabel, styles.repsCol]}>
                                REPS
                              </Text>
                              <View style={styles.checkCol} />
                            </View>

                            {/* Set rows — swipe left to delete set */}
                            {sets.map((s, i) => {
                              const setRestKey = getRestSetKey(
                                ex.workoutExerciseId,
                                s.id,
                              );
                              return (
                                <React.Fragment key={s.id}>
                                  <View>
                                    <ReanimatedSwipeable
                                      renderRightActions={() =>
                                        renderDeleteAction(() =>
                                          removeLocalSet(
                                            ex.workoutExerciseId,
                                            s.id,
                                          ),
                                        )
                                      }
                                      childrenContainerStyle={
                                        styles.swipeableSetContent
                                      }
                                      dragOffsetFromRightEdge={
                                        DELETE_SWIPE_DRAG_OFFSET
                                      }
                                      overshootRight={false}
                                    >
                                      <View
                                        style={[
                                          styles.setRow,
                                          s.completed && styles.setRowCompleted,
                                        ]}
                                      >
                                        <Text
                                          style={[
                                            styles.setNum,
                                            styles.setNumCol,
                                          ]}
                                        >
                                          {i + 1}
                                        </Text>

                                        <View
                                          style={[
                                            styles.inputWrap,
                                            styles.weightCol,
                                            hasFieldError(
                                              ex.workoutExerciseId,
                                              s.id,
                                              'weight',
                                            ) && styles.inputWrapError,
                                          ]}
                                        >
                                          <TextInput
                                            style={styles.input}
                                            value={getDisplayWeight(
                                              s,
                                              ex.weightUnit,
                                            )}
                                            onChangeText={v =>
                                              updateSetField(
                                                ex.workoutExerciseId,
                                                s.id,
                                                'weight',
                                                v,
                                              )
                                            }
                                            keyboardType="decimal-pad"
                                            placeholder="0"
                                            placeholderTextColor={
                                              theme.colors.textMuted
                                            }
                                            returnKeyType="done"
                                          />
                                          <TouchableOpacity
                                            style={styles.inputUnitButton}
                                            onPress={() =>
                                              showWeightUnitPicker(
                                                ex.workoutExerciseId,
                                                ex.weightUnit,
                                              )
                                            }
                                            hitSlop={{
                                              top: 8,
                                              bottom: 8,
                                              left: 8,
                                              right: 8,
                                            }}
                                          >
                                            <Text style={styles.inputUnit}>
                                              {ex.weightUnit}
                                            </Text>
                                          </TouchableOpacity>
                                        </View>

                                        <View
                                          style={[
                                            styles.inputWrap,
                                            styles.repsCol,
                                            hasFieldError(
                                              ex.workoutExerciseId,
                                              s.id,
                                              'reps',
                                            ) && styles.inputWrapError,
                                          ]}
                                        >
                                          <TextInput
                                            style={styles.input}
                                            value={s.reps}
                                            onChangeText={v =>
                                              updateSetField(
                                                ex.workoutExerciseId,
                                                s.id,
                                                'reps',
                                                v,
                                              )
                                            }
                                            keyboardType="number-pad"
                                            placeholder="0"
                                            placeholderTextColor={
                                              theme.colors.textMuted
                                            }
                                            returnKeyType="done"
                                          />
                                          <View style={styles.inputUnitButton}>
                                            <Text style={styles.inputUnit}>
                                              reps
                                            </Text>
                                          </View>
                                        </View>

                                        <TouchableOpacity
                                          style={styles.checkCol}
                                          onPress={() =>
                                            toggleSetCompleted(
                                              ex.workoutExerciseId,
                                              s.id,
                                            )
                                          }
                                          hitSlop={{
                                            top: 8,
                                            bottom: 8,
                                            left: 8,
                                            right: 8,
                                          }}
                                        >
                                          <MaterialCommunityIcons
                                            name={
                                              s.completed
                                                ? 'check-circle'
                                                : 'check-circle-outline'
                                            }
                                            size={22}
                                            color={
                                              s.completed
                                                ? theme.colors.accent
                                                : theme.colors.textMuted
                                            }
                                          />
                                        </TouchableOpacity>
                                      </View>
                                    </ReanimatedSwipeable>
                                  </View>
                                  {isResting && restSetKey === setRestKey && (
                                    <View style={styles.restTimerRow}>
                                      <MaterialCommunityIcons
                                        name="timer-sand"
                                        size={14}
                                        color={theme.colors.accent}
                                      />
                                      <Text style={styles.restTimerText}>
                                        Rest timer started
                                      </Text>
                                      <RestTimerCountdownText
                                        style={styles.restTimerCountdownText}
                                      />
                                      <TouchableOpacity
                                        style={styles.skipRestButton}
                                        onPress={skipRestTimer}
                                      >
                                        <Text style={styles.skipRestText}>
                                          Skip
                                        </Text>
                                      </TouchableOpacity>
                                    </View>
                                  )}
                                </React.Fragment>
                              );
                            })}

                            {/* Add Set button */}
                            <TouchableOpacity
                              style={styles.addSetBtn}
                              onPress={() => addLocalSet(ex.workoutExerciseId)}
                            >
                              <MaterialCommunityIcons
                                name="plus"
                                size={14}
                                color={theme.colors.textMuted}
                              />
                              <Text style={styles.addSetText}>Add Set</Text>
                            </TouchableOpacity>
                          </>
                        );
                      }}
                    />
                  ) : null}

                  {/* Add Exercise button — below exercises */}
                  <TouchableOpacity
                    style={styles.addExerciseBtn}
                    onPress={handlePickerOpen}
                    activeOpacity={0.78}
                  >
                    <View style={styles.addExerciseIcon}>
                      <MaterialCommunityIcons
                        name="plus"
                        size={18}
                        color={theme.colors.accent}
                      />
                    </View>
                    <Text style={styles.addExerciseText}>Add Exercise</Text>
                  </TouchableOpacity>
                  </KeyboardAwareScrollView>
                </View>
              </GestureDetector>

              <View
                style={[
                  styles.footer,
                  {
                    paddingBottom: Math.max(
                      theme.spacing.lg,
                      bottomSafeInset + theme.spacing.md,
                    ),
                  },
                ]}
              >
                {validationNotice ? (
                  <View style={styles.validationNotice}>
                    <MaterialCommunityIcons
                      name="alert-circle-outline"
                      size={16}
                      color={theme.colors.danger}
                    />
                    <Text style={styles.validationNoticeText}>
                      {validationNotice}
                    </Text>
                  </View>
                ) : null}
                <View style={styles.footerSummary}>
                  <View style={styles.footerStat}>
                    <MaterialCommunityIcons
                      name="dumbbell"
                      size={15}
                      color={theme.colors.accent}
                    />
                    <Text style={styles.footerStatText}>
                      {footerStats.exercises} Exercises
                    </Text>
                  </View>
                  <View style={styles.footerStatDivider} />
                  <View style={styles.footerStat}>
                    <MaterialCommunityIcons
                      name="check-circle-outline"
                      size={15}
                      color={theme.colors.accent}
                    />
                    <Text style={styles.footerStatText}>
                      {footerStats.completedSets} Sets Done
                    </Text>
                  </View>
                  <View style={styles.footerStatDivider} />
                  <View style={styles.footerStat}>
                    <MaterialCommunityIcons
                      name="weight-lifter"
                      size={15}
                      color={theme.colors.accent}
                    />
                    <Text style={styles.footerStatText}>
                      {footerStats.volumeLabel}
                    </Text>
                  </View>
                </View>
                <TouchableOpacity
                  style={styles.endButton}
                  onPress={handleEndWorkout}
                  activeOpacity={0.82}
                >
                  <View style={styles.endButtonIcon}>
                    <MaterialCommunityIcons
                      name="flag-checkered"
                      size={18}
                      color={theme.colors.accent}
                    />
                  </View>
                  <View style={styles.endButtonTextBlock}>
                    <Text style={styles.endButtonText}>End Workout</Text>
                    <Text style={styles.endButtonSubtext}>
                      Review and save your session
                    </Text>
                  </View>
                  <MaterialCommunityIcons
                    name="chevron-right"
                    size={20}
                    color={theme.colors.textMuted}
                  />
                </TouchableOpacity>
              </View>

              {dialog ? (
                <View style={styles.dialogOverlay}>
                  <View style={styles.dialogCard}>
                    <View style={styles.dialogHeader}>
                      <View style={styles.dialogIcon}>
                        <MaterialCommunityIcons
                          name={
                            dialog.actions.some(
                              action => action.variant === 'danger',
                            )
                              ? 'alert-circle-outline'
                              : 'check-circle-outline'
                          }
                          size={22}
                          color={
                            dialog.actions.some(
                              action => action.variant === 'danger',
                            )
                              ? theme.colors.danger
                              : theme.colors.accent
                          }
                        />
                      </View>
                      <View style={styles.dialogTitleBlock}>
                        <Text style={styles.dialogTitle}>{dialog.title}</Text>
                        {dialog.message ? (
                          <Text style={styles.dialogMessage}>
                            {dialog.message}
                          </Text>
                        ) : null}
                      </View>
                    </View>
                    <View
                      style={[
                        styles.dialogActions,
                        dialog.compactActions && styles.dialogActionsCompact,
                      ]}
                    >
                      {dialog.actions.map(action => (
                        <TouchableOpacity
                          key={action.label}
                          style={[
                            styles.dialogButton,
                            dialog.compactActions &&
                              action.label !== 'Cancel' &&
                              styles.dialogCompactButton,
                            dialog.compactActions &&
                              action.label === 'Cancel' &&
                              styles.dialogCompactCancelButton,
                            action.variant === 'primary' &&
                              styles.dialogPrimaryButton,
                            action.variant === 'danger' &&
                              styles.dialogDangerButton,
                          ]}
                          onPress={action.onPress}
                        >
                          <Text
                            style={[
                              styles.dialogButtonText,
                              action.variant === 'primary' &&
                                styles.dialogFilledButtonText,
                              action.variant === 'danger' &&
                                styles.dialogDangerButtonText,
                            ]}
                          >
                            {action.label}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                </View>
              ) : null}
            </View>
          </GestureHandlerRootView>
        </View>
      ) : null}

      {activeWorkoutId ? (
        <ExercisePickerModal
          visible={pickerVisible}
          onClose={handlePickerClose}
          onPick={handleExercisePicked}
        />
      ) : null}
    </>
  );
}

function SortableActiveWorkoutExerciseList({
  exercises,
  draggingExerciseId,
  methodLockedByExerciseType,
  onDeleteExercise,
  onDragStateChange,
  onReorder,
  renderExerciseBody,
}: {
  exercises: ExerciseEntry[];
  draggingExerciseId: string | null;
  methodLockedByExerciseType: Record<string, boolean>;
  onDeleteExercise: (workoutExerciseId: string) => void;
  onDragStateChange: (workoutExerciseId: string | null) => void;
  onReorder: (workoutExerciseIds: string[]) => void;
  renderExerciseBody: (exercise: ExerciseEntry) => React.ReactNode;
}) {
  const { styles } = useStyles(stylesheet);
  const exerciseIds = useMemo(
    () => exercises.map(exercise => exercise.workoutExerciseId),
    [exercises],
  );
  const exerciseKey = exerciseIds.join('|');
  const positions = useSharedValue<WorkoutExercisePositions>(
    buildWorkoutExercisePositions(exercises),
  );
  const heights = useSharedValue<WorkoutExerciseHeights>({});
  const activeExerciseId = useSharedValue<string | null>(null);
  const [measuredHeights, setMeasuredHeights] =
    useState<WorkoutExerciseHeights>({});
  const pendingMeasuredHeightsRef = useRef<WorkoutExerciseHeights>({});
  const measureFrameRef = useRef<number | null>(null);

  useEffect(() => {
    positions.value = buildWorkoutExercisePositions(exercises);
    activeExerciseId.value = null;
  }, [activeExerciseId, exerciseKey, exercises, positions]);

  useEffect(() => {
    heights.value = measuredHeights;
  }, [heights, measuredHeights]);

  const listHeight = useMemo(
    () =>
      exercises.reduce((total, exercise, index) => {
        const height =
          measuredHeights[exercise.workoutExerciseId] ??
          WORKOUT_EXERCISE_DEFAULT_HEIGHT;
        return (
          total +
          height +
          (index < exercises.length - 1 ? WORKOUT_EXERCISE_GAP : 0)
        );
      }, 0),
    [exercises, measuredHeights],
  );

  const listStyle = useMemo(
    () => [styles.sortableWorkoutExerciseList, { height: listHeight }],
    [listHeight, styles.sortableWorkoutExerciseList],
  );

  useEffect(
    () => () => {
      if (measureFrameRef.current !== null) {
        cancelAnimationFrame(measureFrameRef.current);
      }
    },
    [],
  );

  const handleExerciseMeasure = useCallback(
    (workoutExerciseId: string, height: number) => {
      if (!Number.isFinite(height) || height <= 0) return;
      const currentHeight = heights.value[workoutExerciseId];
      if (
        typeof currentHeight === 'number' &&
        Math.abs(currentHeight - height) < 1
      ) {
        return;
      }

      heights.value = {
        ...heights.value,
        [workoutExerciseId]: height,
      };
      pendingMeasuredHeightsRef.current = {
        ...pendingMeasuredHeightsRef.current,
        [workoutExerciseId]: height,
      };

      if (measureFrameRef.current !== null) return;
      measureFrameRef.current = requestAnimationFrame(() => {
        measureFrameRef.current = null;
        const nextHeights = pendingMeasuredHeightsRef.current;
        pendingMeasuredHeightsRef.current = {};

        setMeasuredHeights(prev => {
          let didChange = false;
          const next = { ...prev };
          for (const [exerciseId, measuredHeight] of Object.entries(
            nextHeights,
          )) {
            const current = prev[exerciseId];
            if (
              typeof current === 'number' &&
              Math.abs(current - measuredHeight) < 1
            ) {
              continue;
            }
            next[exerciseId] = measuredHeight;
            didChange = true;
          }
          return didChange ? next : prev;
        });
      });
    },
    [heights],
  );

  return (
    <View style={listStyle}>
      {exercises.map((exercise, index) => {
        const showMethod = !(
          exercise.methodLocked ||
          methodLockedByExerciseType[exercise.exerciseTypeId]
        );
        return (
          <SortableActiveWorkoutExerciseRow
            key={exercise.workoutExerciseId}
            exercise={exercise}
            index={index}
            exerciseCount={exercises.length}
            exerciseIds={exerciseIds}
            activeExerciseId={activeExerciseId}
            draggingExerciseId={draggingExerciseId}
            heights={heights}
            positions={positions}
            showMethod={showMethod}
            onDeleteExercise={onDeleteExercise}
            onDragStateChange={onDragStateChange}
            onMeasure={handleExerciseMeasure}
            onReorder={onReorder}
          >
            {renderExerciseBody(exercise)}
          </SortableActiveWorkoutExerciseRow>
        );
      })}
    </View>
  );
}

function SortableActiveWorkoutExerciseRow({
  children,
  exercise,
  index,
  exerciseCount,
  exerciseIds,
  activeExerciseId,
  draggingExerciseId,
  heights,
  positions,
  showMethod,
  onDeleteExercise,
  onDragStateChange,
  onMeasure,
  onReorder,
}: {
  children: React.ReactNode;
  exercise: ExerciseEntry;
  index: number;
  exerciseCount: number;
  exerciseIds: string[];
  activeExerciseId: SharedValue<string | null>;
  draggingExerciseId: string | null;
  heights: SharedValue<WorkoutExerciseHeights>;
  positions: SharedValue<WorkoutExercisePositions>;
  showMethod: boolean;
  onDeleteExercise: (workoutExerciseId: string) => void;
  onDragStateChange: (workoutExerciseId: string | null) => void;
  onMeasure: (workoutExerciseId: string, height: number) => void;
  onReorder: (workoutExerciseIds: string[]) => void;
}) {
  const { styles, theme } = useStyles(stylesheet);
  const workoutExerciseId = exercise.workoutExerciseId;
  const top = useSharedValue(
    index * (WORKOUT_EXERCISE_DEFAULT_HEIGHT + WORKOUT_EXERCISE_GAP),
  );
  const startTop = useSharedValue(
    index * (WORKOUT_EXERCISE_DEFAULT_HEIGHT + WORKOUT_EXERCISE_GAP),
  );
  const didEndDrag = useSharedValue(false);

  const finishReorder = useCallback(
    (orderedExerciseIds: string[]) => {
      onDragStateChange(null);
      requestAnimationFrame(() => {
        onReorder(orderedExerciseIds);
      });
    },
    [onDragStateChange, onReorder],
  );

  const dragGesture = useMemo(
    () =>
      Gesture.Pan()
        .enabled(exerciseCount > 1)
        .activateAfterLongPress(WORKOUT_EXERCISE_DRAG_ACTIVATE_MS)
        .minDistance(1)
        .failOffsetX([-18, 18])
        .onStart(() => {
          didEndDrag.value = false;
          activeExerciseId.value = workoutExerciseId;
          const currentIndex = positions.value[workoutExerciseId] ?? index;
          startTop.value = getWorkoutExerciseTopForIndex(
            currentIndex,
            positions.value,
            heights.value,
            exerciseIds,
          );
          top.value = startTop.value;
          runOnJS(onDragStateChange)(workoutExerciseId);
        })
        .onUpdate(event => {
          const nextTop = startTop.value + event.translationY;
          const currentIndex = positions.value[workoutExerciseId] ?? index;
          const draggedHeight = getWorkoutExerciseHeight(
            heights.value,
            workoutExerciseId,
          );
          const targetIndex = getWorkoutExerciseTargetIndex(
            workoutExerciseId,
            nextTop + draggedHeight / 2,
            positions.value,
            heights.value,
            exerciseIds,
          );

          top.value = nextTop;

          if (targetIndex === currentIndex) return;

          const nextPositions = { ...positions.value };
          for (let i = 0; i < exerciseIds.length; i += 1) {
            const exerciseId = exerciseIds[i];
            if (exerciseId === workoutExerciseId) continue;
            const position = positions.value[exerciseId] ?? i;
            if (
              targetIndex > currentIndex &&
              position > currentIndex &&
              position <= targetIndex
            ) {
              nextPositions[exerciseId] = position - 1;
            } else if (
              targetIndex < currentIndex &&
              position >= targetIndex &&
              position < currentIndex
            ) {
              nextPositions[exerciseId] = position + 1;
            }
          }
          nextPositions[workoutExerciseId] = targetIndex;
          positions.value = nextPositions;
        })
        .onEnd(() => {
          didEndDrag.value = true;
          const landedPositions = positions.value;
          const orderedExerciseIds = [...exerciseIds].sort(
            (firstId, secondId) =>
              landedPositions[firstId] - landedPositions[secondId],
          );
          const finalTop = getWorkoutExerciseTopForIndex(
            landedPositions[workoutExerciseId] ?? index,
            landedPositions,
            heights.value,
            exerciseIds,
          );
          top.value = withTiming(
            finalTop,
            {
              duration: WORKOUT_EXERCISE_SETTLE_MS,
              easing: ReanimatedEasing.out(ReanimatedEasing.cubic),
            },
            finished => {
              if (!finished) return;
              activeExerciseId.value = null;
              runOnJS(finishReorder)(orderedExerciseIds);
            },
          );
        })
        .onFinalize(() => {
          if (!didEndDrag.value) {
            const currentTop = getWorkoutExerciseTopForIndex(
              positions.value[workoutExerciseId] ?? index,
              positions.value,
              heights.value,
              exerciseIds,
            );
            top.value = withTiming(currentTop, {
              duration: WORKOUT_EXERCISE_SETTLE_MS,
              easing: ReanimatedEasing.out(ReanimatedEasing.cubic),
            });
            activeExerciseId.value = null;
            runOnJS(onDragStateChange)(null);
          }
        }),
    [
      activeExerciseId,
      didEndDrag,
      exerciseCount,
      exerciseIds,
      finishReorder,
      heights,
      index,
      onDragStateChange,
      positions,
      startTop,
      top,
      workoutExerciseId,
    ],
  );

  const animatedRowStyle = useAnimatedStyle(() => {
    const isActive = activeExerciseId.value === workoutExerciseId;
    const position = positions.value[workoutExerciseId] ?? index;
    const nextTop = getWorkoutExerciseTopForIndex(
      position,
      positions.value,
      heights.value,
      exerciseIds,
    );

    return {
      top: isActive
        ? top.value
        : withTiming(nextTop, {
          duration: WORKOUT_EXERCISE_SETTLE_MS,
          easing: ReanimatedEasing.out(ReanimatedEasing.cubic),
        }),
      zIndex: isActive ? 10 : 1,
      elevation: isActive ? 8 : 0,
    };
  }, [exerciseIds, index, workoutExerciseId]);

  const handleLayout = useCallback(
    (event: LayoutChangeEvent) => {
      onMeasure(workoutExerciseId, event.nativeEvent.layout.height);
    },
    [onMeasure, workoutExerciseId],
  );

  return (
    <Reanimated.View
      style={[styles.sortableWorkoutExerciseRow, animatedRowStyle]}
    >
      <View
        style={[
          styles.exerciseCard,
          draggingExerciseId === workoutExerciseId &&
            styles.exerciseCardDragging,
        ]}
        onLayout={handleLayout}
      >
        <ReanimatedSwipeable
          renderRightActions={() => (
            <TouchableOpacity
              style={styles.deleteAction}
              onPress={() => onDeleteExercise(workoutExerciseId)}
            >
              <MaterialCommunityIcons
                name="trash-can-outline"
                size={22}
                color="#fff"
              />
            </TouchableOpacity>
          )}
          dragOffsetFromRightEdge={DELETE_SWIPE_DRAG_OFFSET}
          overshootRight={false}
        >
          <View style={styles.exerciseHeader}>
            <Text style={styles.exerciseName} numberOfLines={1}>
              {exercise.exerciseTypeName}
              {showMethod ? (
                <Text style={styles.exerciseMethod}>
                  {' - '}
                  {exercise.methodName}
                </Text>
              ) : null}
            </Text>
            <GestureDetector gesture={dragGesture}>
              <View
                style={[
                  styles.reorderButton,
                  exerciseCount < 2 && styles.reorderButtonDisabled,
                ]}
              >
                <MaterialCommunityIcons
                  name="drag"
                  size={19}
                  color={
                    exerciseCount < 2
                      ? theme.colors.textMuted
                      : theme.colors.text
                  }
                />
              </View>
            </GestureDetector>
          </View>
        </ReanimatedSwipeable>
        {children}
      </View>
    </Reanimated.View>
  );
}

const stylesheet = createStyleSheet(theme => ({
  sheetOverlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 1000,
    elevation: 1000,
    backgroundColor: theme.colors.bg,
  },
  gestureRoot: {
    flex: 1,
    backgroundColor: theme.colors.bg,
  },
  root: {
    flex: 1,
    minHeight: 0,
    position: 'relative',
    backgroundColor: theme.colors.bg,
  },
  // ── Header ──────────────────────────────────────────────
  header: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  pullToCloseHint: {
    position: 'absolute',
    top: theme.spacing.md,
    left: 0,
    right: 0,
    zIndex: 20,
    elevation: 20,
    alignItems: 'center',
  },
  pullToCloseHintIcon: {
    width: 58,
    height: 32,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtn: {
    width: 32,
    height: 32,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    color: theme.colors.text,
    fontSize: theme.fontSize.md,
    fontFamily: theme.fontFamily.bold,
  },
  timerPill: {
    width: 76,
    minHeight: 32,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.full,
    borderWidth: 1,
    borderColor: theme.colors.accent,
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.xs,
  },
  timerDot: {
    width: 7,
    height: 7,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.accent,
  },
  timerText: {
    minWidth: 44,
    color: theme.colors.accent,
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.bold,
    letterSpacing: 0.5,
    textAlign: 'center',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  cancelIconButton: {
    minHeight: 32,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    borderRadius: theme.radius.full,
    justifyContent: 'center',
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.md,
  },
  cancelIconText: {
    color: theme.colors.text,
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.semiBold,
  },
  // ── Scroll area ──────────────────────────────────────────
  scroll: {
    flex: 1,
    minHeight: 0,
  },
  scrollRegion: {
    flex: 1,
    minHeight: 0,
    position: 'relative',
  },
  scrollContent: {
    paddingHorizontal: theme.spacing.sm,
    paddingTop: theme.spacing.md,
    paddingBottom: theme.spacing.xs,
    gap: theme.spacing.sm,
  },
  emptyHint: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.sm,
    textAlign: 'center',
    paddingVertical: theme.spacing.lg,
  },
  workoutNameCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    gap: 1,
  },
  workoutNameLabel: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xxs,
    fontFamily: theme.fontFamily.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  workoutNameInput: {
    color: theme.colors.text,
    fontSize: theme.fontSize.md,
    fontFamily: theme.fontFamily.extraBold,
    minHeight: 30,
    padding: 0,
  },
  sortableWorkoutExerciseList: {
    position: 'relative',
    width: '100%',
  },
  sortableWorkoutExerciseRow: {
    position: 'absolute',
    left: 0,
    right: 0,
  },
  // ── Exercise card ────────────────────────────────────────
  exerciseCard: {
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
    overflow: 'hidden',
  },
  exerciseCardDragging: {
    zIndex: 10,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.22,
    shadowRadius: 14,
    opacity: 0.96,
  },
  exerciseHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
    backgroundColor: theme.colors.surface,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
  },
  exerciseName: {
    flex: 1,
    minWidth: 0,
    color: theme.colors.text,
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.bold,
  },
  exerciseMethod: {
    color: theme.colors.textMuted,
    fontFamily: theme.fontFamily.regular,
  },
  reorderButton: {
    width: 30,
    height: 30,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.surface2,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reorderButtonDisabled: {
    opacity: 0.35,
  },
  // ── Set rows ─────────────────────────────────────────────
  setLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.bg,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 4,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  setLabel: {
    color: theme.colors.textMuted,
    fontSize: 10,
    fontFamily: theme.fontFamily.semiBold,
    letterSpacing: 0.8,
  },
  setRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.bg,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 6,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  setRowCompleted: {
    backgroundColor: theme.colors.surface,
  },
  swipeableSetContent: {
    width: '100%',
  },
  restTimerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    backgroundColor: theme.colors.bg,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
  },
  restTimerText: {
    flex: 1,
    color: theme.colors.accent,
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.semiBold,
  },
  restTimerCountdownText: {
    minWidth: 42,
    color: theme.colors.accent,
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.bold,
    textAlign: 'right',
  },
  skipRestButton: {
    minHeight: 26,
    borderRadius: theme.radius.full,
    borderWidth: 1,
    borderColor: theme.colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.sm,
    backgroundColor: theme.colors.accentMuted,
  },
  skipRestText: {
    color: theme.colors.accent,
    fontSize: theme.fontSize.xs,
    fontFamily: theme.fontFamily.extraBold,
  },
  setNumCol: {
    width: 24,
  },
  weightCol: {
    flex: 1,
    marginRight: theme.spacing.xs,
  },
  repsCol: {
    flex: 1,
    marginRight: theme.spacing.xs,
  },
  checkCol: {
    width: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  setNum: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.semiBold,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    borderColor: 'transparent',
    minHeight: 38,
    paddingLeft: 8,
    paddingRight: 2,
    gap: 4,
  },
  inputWrapError: {
    borderColor: theme.colors.danger,
    backgroundColor: theme.colors.dangerMuted,
  },
  input: {
    flex: 1,
    color: theme.colors.text,
    fontSize: theme.fontSize.md,
    fontFamily: theme.fontFamily.semiBold,
    minWidth: 0,
    height: 38,
    padding: 0,
  },
  inputUnitButton: {
    minHeight: 32,
    minWidth: 36,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  inputUnit: {
    color: theme.colors.accent,
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.bold,
  },
  // ── Add Set ──────────────────────────────────────────────
  addSetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: theme.colors.bg,
    paddingVertical: 7,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  addSetText: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.semiBold,
  },
  // ── Delete swipe action ──────────────────────────────────
  deleteAction: {
    backgroundColor: theme.colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
    width: 72,
  },
  // ── Add Exercise ─────────────────────────────────────────
  addExerciseBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.xs,
    borderRadius: theme.radius.md,
    minHeight: 42,
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.sm,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  addExerciseIcon: {
    width: 24,
    height: 24,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.accentMuted,
  },
  addExerciseText: {
    color: theme.colors.text,
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.bold,
  },
  // ── Footer ───────────────────────────────────────────────
  footer: {
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.sm,
    paddingBottom: theme.spacing.md,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    gap: theme.spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.12,
    shadowRadius: 14,
    elevation: 8,
  },
  footerSummary: {
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.xs,
  },
  footerStat: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  footerStatText: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
    fontFamily: theme.fontFamily.semiBold,
  },
  footerStatDivider: {
    width: 1,
    height: 14,
    backgroundColor: theme.colors.border,
  },
  validationNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    backgroundColor: theme.colors.dangerMuted,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.danger,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  validationNoticeText: {
    flex: 1,
    color: theme.colors.text,
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.semiBold,
  },
  endButton: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    backgroundColor: theme.colors.surface2,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.colors.borderStrong,
  },
  endButtonIcon: {
    width: 34,
    height: 34,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  endButtonTextBlock: {
    flex: 1,
    minWidth: 0,
  },
  endButtonText: {
    color: theme.colors.text,
    fontSize: theme.fontSize.md,
    fontFamily: theme.fontFamily.extraBold,
  },
  endButtonSubtext: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
    fontFamily: theme.fontFamily.bold,
    marginTop: 1,
  },
  dialogOverlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.58)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.lg,
  },
  dialogCard: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    padding: theme.spacing.lg,
    gap: theme.spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.32,
    shadowRadius: 22,
    elevation: 12,
  },
  dialogHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing.md,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface2,
    padding: theme.spacing.md,
  },
  dialogIcon: {
    width: 42,
    height: 42,
    borderRadius: theme.radius.full,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dialogTitleBlock: {
    flex: 1,
    minWidth: 0,
  },
  dialogTitle: {
    color: theme.colors.text,
    fontSize: theme.fontSize.lg,
    fontFamily: theme.fontFamily.extraBold,
  },
  dialogMessage: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.semiBold,
    lineHeight: 20,
    marginTop: 4,
  },
  dialogActions: {
    gap: theme.spacing.sm,
  },
  dialogActionsCompact: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  dialogButton: {
    minHeight: 48,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.md,
  },
  dialogCompactButton: {
    flex: 1,
    minWidth: 0,
  },
  dialogCompactCancelButton: {
    flexBasis: '100%',
    order: 2,
  },
  dialogPrimaryButton: {
    backgroundColor: theme.colors.accent,
    borderColor: 'rgba(255, 255, 255, 0.28)',
    shadowColor: theme.colors.accent,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.22,
    shadowRadius: 10,
    elevation: 3,
  },
  dialogDangerButton: {
    backgroundColor: theme.colors.dangerMuted,
    borderColor: theme.colors.dangerMuted,
  },
  dialogButtonText: {
    color: theme.colors.text,
    fontSize: theme.fontSize.md,
    fontFamily: theme.fontFamily.extraBold,
  },
  dialogFilledButtonText: {
    color: '#FFFFFF',
  },
  dialogDangerButtonText: {
    color: theme.colors.danger,
  },
}));
