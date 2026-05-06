import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AppState,
  Animated,
  Easing,
  Keyboard,
  Modal,
  PanResponder,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type PanResponderGestureState,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler'
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable'
import { runOnJS, useSharedValue } from 'react-native-reanimated'
import notifee, { EventType } from '@notifee/react-native'
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons'
import { createStyleSheet, useStyles } from 'react-native-unistyles'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { getString, removeKey, setString } from '@/storage/mmkv'
import {
  MMKV_LOCAL_SETS,
  MMKV_PENDING_WORKOUT_ACTION,
  useSessionStore,
} from '@/store/sessionStore'
import {
  addCompletedSetToWorkout,
  deleteCompletedSet,
  deleteWorkout,
  deleteWorkoutExercise,
  finishWorkout,
  getWorkoutWeightPrAchievements,
  getWorkoutName,
  isExerciseTypeMethodLocked,
  type WorkoutWeightPrAchievement,
  updateWorkoutExerciseOrder,
  updateWorkoutName,
} from '@/db/workoutHelpers'
import {
  cancelWorkoutNotification,
  setupWorkoutChannel,
  showWorkoutNotification,
} from '@/services/WorkoutNotification'
import {
  formatRestTimer,
  getDefaultRestSeconds,
} from '@/services/restTimerSettings'
import ExercisePickerModal from './ExercisePickerModal'
import { type ThemedDialogAction } from './ui/ThemedDialog'

type LocalSet = {
  id: string
  weightKg: string
  weightInput: string
  weightInputUnit: string
  reps: string
  completed: boolean
  persistedSetId?: string
}

const LB_PER_KG = 2.20462
const PR_GOLD = '#D9A441'
const SHEET_TOP_SWIPE_TOLERANCE = 10
const SHEET_SWIPE_CAPTURE_DISTANCE = 6
const SHEET_SWIPE_CLOSE_DISTANCE = 48
const SHEET_SWIPE_CLOSE_VELOCITY = 0.48
const PR_CONFETTI_COLORS = [PR_GOLD, '#F7D774', '#FFFFFF', '#75C7E6', '#8FE3B0']
const PR_CONFETTI = Array.from({ length: 22 }, (_, index) => {
  const column = index % 11
  const row = Math.floor(index / 11)
  return {
    left: `${6 + column * 8.8}%`,
    top: 72 + row * 18,
    size: 6 + (index % 3) * 2,
    color: PR_CONFETTI_COLORS[index % PR_CONFETTI_COLORS.length],
    translateX: (column - 5) * (7 + row * 3),
    translateY: 92 + (index % 5) * 14,
    rotate: column % 2 === 0 ? 160 : -160,
    delay: index * 16,
  }
})

function formatConvertedWeight(value: number): string {
  return Number.parseFloat(value.toFixed(2)).toString()
}

function formatStoredKg(value: number): string {
  return Number.parseFloat(value.toFixed(6)).toString()
}

function parseWeightInput(value: string): number | null {
  if (!value.trim()) return null
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : null
}

function parseRepsInput(value: string): number {
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : 0
}

function sanitizeRepsInput(value: string): string {
  return value.split(/[.,]/)[0].replace(/[^\d]/g, '')
}

function toKgInput(value: string, unit: string): string {
  const parsed = parseWeightInput(value)
  if (parsed === null) return ''
  return unit === 'lb'
    ? formatStoredKg(parsed / LB_PER_KG)
    : value
}

function fromKgInput(valueKg: string, unit: string): string {
  const parsed = parseWeightInput(valueKg)
  if (parsed === null) return ''
  return unit === 'lb'
    ? formatConvertedWeight(parsed * LB_PER_KG)
    : valueKg
}

function newLocalSet(weightUnit = 'kg'): LocalSet {
  return {
    id: `ls_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    weightKg: '',
    weightInput: '',
    weightInputUnit: weightUnit,
    reps: '',
    completed: false,
  }
}

function localSetFromCompletedSet(
  set: {
    id: string
    weight: number
    weightUnit: string
    reps: number
  },
  fallbackWeightUnit: string,
): LocalSet {
  const weightKg = formatStoredKg(set.weight)
  const weightInputUnit = set.weightUnit === 'lb'
    ? 'lb'
    : set.weightUnit === 'kg'
      ? 'kg'
      : fallbackWeightUnit
  return {
    id: set.id,
    weightKg,
    weightInput: fromKgInput(weightKg, weightInputUnit),
    weightInputUnit,
    reps: String(Math.trunc(set.reps)),
    completed: true,
    persistedSetId: set.id,
  }
}

function normalizeLocalSet(value: unknown): LocalSet | null {
  if (!value || typeof value !== 'object') return null
  const item = value as Partial<LocalSet>
  if (typeof item.id !== 'string') return null
  return {
    id: item.id,
    weightKg: typeof item.weightKg === 'string' ? item.weightKg : '',
    weightInput: typeof item.weightInput === 'string' ? item.weightInput : '',
    weightInputUnit: item.weightInputUnit === 'lb' ? 'lb' : 'kg',
    reps: typeof item.reps === 'string' ? sanitizeRepsInput(item.reps) : '',
    completed: Boolean(item.completed),
    persistedSetId: typeof item.persistedSetId === 'string' ? item.persistedSetId : undefined,
  }
}

function readActiveWorkoutDraft(workoutId: string): {
  localSets: Record<string, LocalSet[]>
  exerciseUnits: Record<string, string>
} | null {
  const raw = getString(MMKV_LOCAL_SETS)
  if (!raw) return null

  try {
    const parsed = JSON.parse(raw) as {
      workoutId?: unknown
      localSets?: unknown
      exerciseUnits?: unknown
    }
    if (parsed.workoutId !== workoutId || !parsed.localSets || typeof parsed.localSets !== 'object') {
      return null
    }

    const localSets = Object.entries(parsed.localSets as Record<string, unknown>).reduce<Record<string, LocalSet[]>>(
      (acc, [workoutExerciseId, sets]) => {
        if (!Array.isArray(sets)) return acc
        const normalizedSets = sets
          .map(normalizeLocalSet)
          .filter((set): set is LocalSet => Boolean(set))
        if (normalizedSets.length > 0) {
          acc[workoutExerciseId] = normalizedSets
        }
        return acc
      },
      {},
    )
    const exerciseUnits =
      parsed.exerciseUnits && typeof parsed.exerciseUnits === 'object'
        ? Object.entries(parsed.exerciseUnits as Record<string, unknown>)
          .reduce<Record<string, string>>((acc, [workoutExerciseId, unit]) => {
            if (unit === 'kg' || unit === 'lb') acc[workoutExerciseId] = unit
            return acc
          }, {})
        : {}

    return { localSets, exerciseUnits }
  } catch (e) {
    console.error('Could not restore active workout draft', e)
    removeKey(MMKV_LOCAL_SETS)
    return null
  }
}

function formatElapsed(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function formatVolumeKg(value: number): string {
  if (value >= 1000) {
    return `${Number.parseFloat((value / 1000).toFixed(1))}k kg`
  }
  return `${Math.round(value)} kg`
}

function formatPrWeight(weightKg: number, unit: string): string {
  if (unit === 'lb') {
    return `${formatConvertedWeight(weightKg * LB_PER_KG)} lb`
  }
  return `${formatConvertedWeight(weightKg)} kg`
}

export default function ActiveWorkoutSheet() {
  const { styles, theme } = useStyles(stylesheet)
  const insets = useSafeAreaInsets()
  const scrollRef = useRef<ScrollView>(null)
  const [pickerVisible, setPickerVisible] = useState(false)
  const [localSets, setLocalSets] = useState<Record<string, LocalSet[]>>({})
  const [restSetKey, setRestSetKey] = useState<string | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const [workoutName, setWorkoutName] = useState('')
  const [dialog, setDialog] = useState<{
    title: string
    message?: string
    actions: ThemedDialogAction[]
    compactActions?: boolean
  } | null>(null)
  const [validationNotice, setValidationNotice] = useState<string | null>(null)
  const [validationErrors, setValidationErrors] = useState<Record<string, boolean>>({})
  const [methodLockedByExerciseType, setMethodLockedByExerciseType] = useState<Record<string, boolean>>({})
  const [keyboardHeight, setKeyboardHeight] = useState(0)
  const [footerHeight, setFooterHeight] = useState(0)
  const [prCelebration, setPrCelebration] = useState<WorkoutWeightPrAchievement[]>([])
  const [draggingExerciseId, setDraggingExerciseId] = useState<string | null>(null)
  const elapsedRef = useRef(0)
  const startedAtRef = useRef<number | null>(null)
  const prConfettiAnimations = useRef(
    PR_CONFETTI.map(() => new Animated.Value(0)),
  ).current
  const prSpotlightAnimation = useRef(new Animated.Value(0)).current
  const restDoneNotifiedRef = useRef(false)
  const keyboardHeightRef = useRef(0)
  const footerHeightRef = useRef(0)
  const handledEndRequestRef = useRef(0)
  const scrollOffsetRef = useRef(0)
  const scrollHeightRef = useRef(0)
  const setLayoutRef = useRef<Record<string, { y: number; height: number }>>({})
  const exerciseLayoutRef = useRef<Record<string, { y: number; height: number }>>({})
  const exerciseDragRef = useRef<{
    id: string
    startIndex: number
    startY: number
    height: number
    targetIndex: number
    initialOrder: string[]
  } | null>(null)
  const exercisePanResponderRef = useRef<Record<string, ReturnType<typeof PanResponder.create>>>({})
  const exerciseShiftValuesRef = useRef<Record<string, Animated.Value>>({})
  const exerciseDragTranslateY = useRef(new Animated.Value(0)).current
  const localSetsDraftHydratedForWorkoutRef = useRef<string | null>(null)
  const focusedSetKeyRef = useRef<string | null>(null)
  const notificationRestEndsAtRef = useRef<number | null>(null)
  const sheetScrollAtTopRef = useRef(true)
  const sheetScrollAtTop = useSharedValue(true)

  const {
    activeWorkoutId,
    startedAt,
    exercises,
    isResting,
    restSecondsRemaining,
    restEndsAt,
    isWorkoutSheetOpen,
    endWorkoutRequestId,
    closeWorkoutSheet,
    endWorkout,
    openWorkoutSheet,
    removeExercise,
    reorderExercises,
    updateExerciseWeightUnit,
    addSet,
    removeSet,
    startRest,
    tickRest,
    clearRest,
  } = useSessionStore()
  const exercisesRef = useRef(exercises)

  const dismissSetKeyboard = useCallback(() => {
    Keyboard.dismiss()
    focusedSetKeyRef.current = null
  }, [])

  const footerStats = useMemo(() => {
    const sets = Object.values(localSets).flat()
    const completedSets = sets.filter((set) => set.completed).length
    const volumeKg = sets.reduce((total, set) => {
      if (!set.completed) return total
      const weightKg = parseWeightInput(set.weightKg) ?? 0
      const reps = parseRepsInput(set.reps)
      return total + weightKg * reps
    }, 0)
    return {
      exercises: exercises.length,
      completedSets,
      volumeLabel: formatVolumeKg(volumeKg),
    }
  }, [exercises.length, localSets])

  useEffect(() => {
    exercisesRef.current = exercises
  }, [exercises])

  const doEndWorkout = useCallback(async () => {
    let achievements: WorkoutWeightPrAchievement[] = []
    if (activeWorkoutId) {
      await updateWorkoutName(activeWorkoutId, workoutName)
      await finishWorkout(activeWorkoutId)
      achievements = (await getWorkoutWeightPrAchievements(activeWorkoutId))
        .filter((achievement) =>
          achievement.previousWeightKg !== null &&
          achievement.hasPriorExerciseHistory,
        )
    }
    if (achievements.length > 0) {
      await cancelWorkoutNotification()
      setPrCelebration(achievements)
      return
    }
    endWorkout()
  }, [activeWorkoutId, endWorkout, workoutName])

  const dismissPrCelebration = useCallback(() => {
    setPrCelebration([])
    endWorkout()
  }, [endWorkout])

  useEffect(() => {
    prConfettiAnimations.forEach((animation) => animation.setValue(0))
    prSpotlightAnimation.stopAnimation()
    prSpotlightAnimation.setValue(0)
    if (prCelebration.length === 0) return

    Animated.parallel(
      prConfettiAnimations.map((animation, index) =>
        Animated.timing(animation, {
          toValue: 1,
          duration: 980 + (index % 4) * 80,
          delay: PR_CONFETTI[index].delay,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ),
    ).start()
    const breatheAnimation = Animated.loop(
      Animated.sequence([
        Animated.timing(prSpotlightAnimation, {
          toValue: 1,
          duration: 1650,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(prSpotlightAnimation, {
          toValue: 0,
          duration: 1650,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    )
    breatheAnimation.start()
    return () => breatheAnimation.stop()
  }, [prCelebration.length, prConfettiAnimations, prSpotlightAnimation])

  const discardWorkout = useCallback(async () => {
    if (activeWorkoutId) await deleteWorkout(activeWorkoutId)
    endWorkout()
  }, [activeWorkoutId, endWorkout])

  const getRestSetKey = useCallback((weId: string, setId: string) => `${weId}:${setId}`, [])
  const getSetLayoutKey = useCallback((weId: string, setId: string) => `${weId}:${setId}`, [])

  const getFieldErrorKey = useCallback(
    (weId: string, setId: string, field: 'weight' | 'reps') => `${weId}:${setId}:${field}`,
    [],
  )

  const hasFieldError = useCallback(
    (weId: string, setId: string, field: 'weight' | 'reps') =>
      !!validationErrors[getFieldErrorKey(weId, setId, field)],
    [getFieldErrorKey, validationErrors],
  )

  const closeDialog = useCallback(() => setDialog(null), [])

  const showErrorDialog = useCallback((message: string) => {
    setDialog({
      title: 'Something went wrong',
      message,
      actions: [{ label: 'OK', variant: 'primary', onPress: closeDialog }],
    })
  }, [closeDialog])

  const markInvalidSetFields = useCallback((
    invalidFields: Array<{ weId: string; setId: string; field: 'weight' | 'reps' }>,
  ) => {
    setValidationErrors((prev) => {
      const next = { ...prev }
      for (const item of invalidFields) {
        next[getFieldErrorKey(item.weId, item.setId, item.field)] = true
      }
      return next
    })
  }, [getFieldErrorKey])

  const validateSetValues = useCallback((
    weId: string,
    set: LocalSet,
  ): Array<{ weId: string; setId: string; field: 'weight' | 'reps' }> => {
    const invalidFields: Array<{ weId: string; setId: string; field: 'weight' | 'reps' }> = []
    if ((parseWeightInput(set.weightKg) ?? 0) <= 0) {
      invalidFields.push({ weId, setId: set.id, field: 'weight' })
    }
    if (parseRepsInput(set.reps) <= 0) {
      invalidFields.push({ weId, setId: set.id, field: 'reps' })
    }
    return invalidFields
  }, [])

  const findInvalidWorkoutFields = useCallback(() => {
    const invalidFields: Array<{ weId: string; setId: string; field: 'weight' | 'reps' }> = []
    for (const [weId, sets] of Object.entries(localSets)) {
      for (const set of sets) {
        const hasAnyValue =
          parseWeightInput(set.weightKg) !== null ||
          set.weightInput.trim().length > 0 ||
          set.reps.trim().length > 0
        if (!set.completed && !hasAnyValue) continue
        invalidFields.push(...validateSetValues(weId, set))
      }
    }
    return invalidFields
  }, [localSets, validateSetValues])

  const findExercisesWithoutCompletedSets = useCallback(() => (
    exercises.filter((exercise) => {
      const sets = localSets[exercise.workoutExerciseId] ?? []
      return !sets.some((set) =>
        set.completed &&
        (parseWeightInput(set.weightKg) ?? 0) > 0 &&
        parseRepsInput(set.reps) > 0,
      )
    })
  ), [exercises, localSets])

  const hasMeaningfulCompletedSet = useCallback(() => (
    Object.values(localSets).some((sets) =>
      sets.some((set) =>
        set.completed &&
        (parseWeightInput(set.weightKg) ?? 0) > 0 &&
        parseRepsInput(set.reps) > 0,
      ),
    )
  ), [localSets])

  const requestEndWorkout = useCallback(() => {
    const invalidFields = findInvalidWorkoutFields()
    if (invalidFields.length > 0) {
      markInvalidSetFields(invalidFields)
      const message = 'Weight and reps must both be greater than 0 before this workout can be saved.'
      setValidationNotice(message)
      return
    }

    const exercisesWithoutCompletedSets = findExercisesWithoutCompletedSets()
    if (exercisesWithoutCompletedSets.length > 0) {
      const fieldsToMark = exercisesWithoutCompletedSets.flatMap((exercise) => {
        const firstSet = localSets[exercise.workoutExerciseId]?.[0]
        return firstSet
          ? validateSetValues(exercise.workoutExerciseId, firstSet)
          : []
      })
      if (fieldsToMark.length > 0) {
        markInvalidSetFields(fieldsToMark)
      }
      const exerciseName = exercisesWithoutCompletedSets[0]?.exerciseTypeName ?? 'An exercise'
      const message = exercisesWithoutCompletedSets.length === 1
        ? `${exerciseName} needs at least one completed set before saving. Complete a set or remove the exercise.`
        : 'Every exercise needs at least one completed set before saving. Complete a set or remove empty exercises.'
      setValidationNotice(message)
      return
    }

    const shouldSave = hasMeaningfulCompletedSet()
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
            closeDialog()
            const action = shouldSave ? doEndWorkout : discardWorkout
            action().catch((e) => {
              console.error('Could not end workout', e)
              showErrorDialog('Could not finish this workout.')
            })
          },
        },
      ],
    })
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
  ])

  const requestCancelWorkout = useCallback(() => {
    setDialog({
      title: 'Cancel Workout',
      message: 'Discard this workout? Exercises and completed sets from this workout will be deleted.',
      actions: [
        { label: 'Keep Workout', onPress: closeDialog },
        {
          label: 'Discard Workout',
          variant: 'danger',
          onPress: () => {
            closeDialog()
            discardWorkout().catch((e) => {
              console.error('Could not discard workout', e)
              showErrorDialog('Could not discard this workout.')
            })
          },
        },
      ],
    })
  }, [closeDialog, discardWorkout, showErrorDialog])

  const handleNotificationAction = useCallback((action?: string | null) => {
    if (!action) return
    removeKey(MMKV_PENDING_WORKOUT_ACTION)
    openWorkoutSheet()

    if (action === 'skip_rest') {
      clearRest()
      setRestSetKey(null)
      showWorkoutNotification(elapsedRef.current, 0, startedAtRef.current).catch(console.error)
      return
    }

    if (action === 'end_workout') {
      requestEndWorkout()
    }
  }, [clearRest, openWorkoutSheet, requestEndWorkout])

  const skipRestTimer = useCallback(() => {
    clearRest()
    setRestSetKey(null)
    showWorkoutNotification(elapsedRef.current, 0, startedAtRef.current).catch(console.error)
  }, [clearRest])

  useEffect(() => {
    elapsedRef.current = elapsed
  }, [elapsed])

  useEffect(() => {
    startedAtRef.current = startedAt
  }, [startedAt])

  useEffect(() => {
    setValidationNotice(null)
    setValidationErrors({})
    setDialog(null)
    setRestSetKey(null)
    setPickerVisible(false)
    setLocalSets({})
    localSetsDraftHydratedForWorkoutRef.current = null
    focusedSetKeyRef.current = null
    setLayoutRef.current = {}
    scrollOffsetRef.current = 0
    sheetScrollAtTopRef.current = true
    exerciseLayoutRef.current = {}
    exerciseDragRef.current = null
    exerciseShiftValuesRef.current = {}
    sheetScrollAtTop.value = true
    setDraggingExerciseId(null)
    exerciseDragTranslateY.setValue(0)
  }, [activeWorkoutId, exerciseDragTranslateY, sheetScrollAtTop])

  useEffect(() => {
    let cancelled = false
    const ids = Array.from(new Set(exercises.map((ex) => ex.exerciseTypeId)))
    if (ids.length === 0) {
      setMethodLockedByExerciseType({})
      return
    }

    Promise.all(
      ids.map(async (id) => [id, await isExerciseTypeMethodLocked(id)] as const),
    )
      .then((entries) => {
        if (!cancelled) {
          setMethodLockedByExerciseType(Object.fromEntries(entries))
        }
      })
      .catch((e) => console.error('Could not load exercise method flags', e))

    return () => {
      cancelled = true
    }
  }, [exercises])

  useEffect(() => {
    if (!activeWorkoutId) {
      setWorkoutName('')
      return
    }
    let isActive = true
    getWorkoutName(activeWorkoutId)
      .then((name) => {
        if (isActive) setWorkoutName(name || 'Workout')
      })
      .catch((e) => {
        console.error('Could not load workout name', e)
        if (isActive) setWorkoutName('Workout')
      })
    return () => {
      isActive = false
    }
  }, [activeWorkoutId])

  useEffect(() => {
    if (!activeWorkoutId) return
    if (localSetsDraftHydratedForWorkoutRef.current === activeWorkoutId) return
    localSetsDraftHydratedForWorkoutRef.current = activeWorkoutId

    const draft = readActiveWorkoutDraft(activeWorkoutId)
    if (draft) {
      setLocalSets(draft.localSets)
      for (const [workoutExerciseId, weightUnit] of Object.entries(draft.exerciseUnits)) {
        updateExerciseWeightUnit(workoutExerciseId, weightUnit)
      }
    }
  }, [activeWorkoutId, updateExerciseWeightUnit])

  useEffect(() => {
    if (!activeWorkoutId) {
      removeKey(MMKV_LOCAL_SETS)
      return
    }

    setString(MMKV_LOCAL_SETS, JSON.stringify({
      workoutId: activeWorkoutId,
      localSets,
      exerciseUnits: Object.fromEntries(
        exercises.map((exercise) => [exercise.workoutExerciseId, exercise.weightUnit]),
      ),
    }))
  }, [activeWorkoutId, exercises, localSets])

  // Sync new exercises into local set state (one empty set each)
  useEffect(() => {
    setLocalSets((prev) => {
      const next = { ...prev }
      for (const ex of exercises) {
        const existingSets = next[ex.workoutExerciseId] ?? []
        const restoredCompletedSets = ex.sets.map((set) =>
          localSetFromCompletedSet(set, ex.weightUnit),
        )

        if (restoredCompletedSets.length > 0) {
          const draftSetsByPersistedId = new Map(
            existingSets
              .filter((set) => set.persistedSetId)
              .map((set) => [set.persistedSetId, set]),
          )
          const completedSets = restoredCompletedSets.map((set) =>
            draftSetsByPersistedId.get(set.persistedSetId) ?? set,
          )
          const draftSets = existingSets.filter((set) => !set.completed)
          next[ex.workoutExerciseId] = [...completedSets, ...draftSets]
        } else if (!next[ex.workoutExerciseId]) {
          next[ex.workoutExerciseId] = [newLocalSet(ex.weightUnit)]
        }

        if (next[ex.workoutExerciseId]?.length === 0) {
          next[ex.workoutExerciseId] = [newLocalSet(ex.weightUnit)]
        }

      }
      for (const key of Object.keys(next)) {
        if (!exercises.find((ex) => ex.workoutExerciseId === key)) {
          delete next[key]
        }
      }
      return next
    })
  }, [exercises])

  useEffect(() => {
    if (!activeWorkoutId || !isResting || restSetKey) return

    for (const exercise of [...exercises].reverse()) {
      const latestCompletedSet = [...(localSets[exercise.workoutExerciseId] ?? [])]
        .reverse()
        .find((set) => set.completed)
      if (latestCompletedSet) {
        setRestSetKey(getRestSetKey(exercise.workoutExerciseId, latestCompletedSet.id))
        return
      }
    }
  }, [activeWorkoutId, exercises, getRestSetKey, isResting, localSets, restSetKey])

  useEffect(() => {
    const previousRestEndsAt = notificationRestEndsAtRef.current
    notificationRestEndsAtRef.current = restEndsAt ?? null

    if (!activeWorkoutId || !startedAt) {
      notificationRestEndsAtRef.current = null
      cancelWorkoutNotification().catch(() => {})
      return
    }

    if (!restEndsAt && previousRestEndsAt) return

    async function startNotification() {
      await setupWorkoutChannel()
      await notifee.requestPermission()
      const initial = Math.floor((Date.now() - startedAt!) / 1000)
      const restRemaining = restEndsAt && restEndsAt > Date.now()
        ? Math.ceil((restEndsAt - Date.now()) / 1000)
        : 0
      await showWorkoutNotification(initial, restRemaining, startedAt, {
        restEndsAt,
      })
    }
    startNotification().catch(console.error)
  }, [activeWorkoutId, restEndsAt, startedAt])

  useEffect(() => {
    const unsub = notifee.onForegroundEvent(({ type, detail }) => {
      if (type === EventType.PRESS) openWorkoutSheet()
      if (type === EventType.ACTION_PRESS && detail.pressAction?.id === 'skip_rest') {
        openWorkoutSheet()
        skipRestTimer()
      }
      if (type === EventType.ACTION_PRESS && detail.pressAction?.id === 'end_workout') {
        openWorkoutSheet()
        requestEndWorkout()
      }
    })
    return unsub
  }, [openWorkoutSheet, requestEndWorkout, skipRestTimer])

  useEffect(() => {
    if (!activeWorkoutId) return

    handleNotificationAction(getString(MMKV_PENDING_WORKOUT_ACTION))
    const appStateSub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') {
        dismissSetKeyboard()
        return
      }
      if (state === 'active') {
        dismissSetKeyboard()
        handleNotificationAction(getString(MMKV_PENDING_WORKOUT_ACTION))
      }
    })
    return () => appStateSub.remove()
  }, [activeWorkoutId, dismissSetKeyboard, handleNotificationAction])

  useEffect(() => {
    if (!activeWorkoutId || endWorkoutRequestId === 0) return
    if (handledEndRequestRef.current === endWorkoutRequestId) return
    handledEndRequestRef.current = endWorkoutRequestId
    requestEndWorkout()
  }, [activeWorkoutId, endWorkoutRequestId, requestEndWorkout])

  useEffect(() => {
    if (!startedAt) {
      setElapsed(0)
      return
    }
    setElapsed(Math.floor((Date.now() - startedAt) / 1000))
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAt) / 1000))
    }, 1000)
    const appStateSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') setElapsed(Math.floor((Date.now() - startedAt) / 1000))
    })
    return () => {
      clearInterval(interval)
      appStateSub.remove()
    }
  }, [startedAt])

  useEffect(() => {
    if (!isResting) return

    const interval = setInterval(() => {
      const state = useSessionStore.getState()
      const wasResting = state.isResting
      tickRest()
      const stillResting = useSessionStore.getState().isResting

      if (wasResting && !stillResting && !restDoneNotifiedRef.current) {
        restDoneNotifiedRef.current = true
        setRestSetKey(null)
        showWorkoutNotification(elapsedRef.current, 0, startedAtRef.current, {
          restDone: true,
        }).catch(console.error)
      }
    }, 1000)

    return () => clearInterval(interval)
  }, [isResting, tickRest])

  function handleEndWorkout() {
    dismissSetKeyboard()
    requestEndWorkout()
  }

  const handleCloseSheet = useCallback(() => {
    Keyboard.dismiss()
    closeDialog()
    closeWorkoutSheet()
  }, [closeDialog, closeWorkoutSheet])

  function handlePickerOpen() {
    dismissSetKeyboard()
    setPickerVisible(true)
  }

  function handlePickerClose() {
    setPickerVisible(false)
    if (activeWorkoutId) openWorkoutSheet()
  }

  const sheetSwipePanHandlers = useMemo(() =>
    PanResponder.create({
      onMoveShouldSetPanResponderCapture: (_event, gestureState) => {
        if (draggingExerciseId) return false
        if (!sheetScrollAtTopRef.current) return false
        if (gestureState.dy <= SHEET_SWIPE_CAPTURE_DISTANCE) return false
        return Math.abs(gestureState.dx) < 72 ||
          gestureState.dy > Math.abs(gestureState.dx) * 0.55
      },
      onPanResponderTerminationRequest: () => false,
      onPanResponderRelease: (_event, gestureState) => {
        if (!sheetScrollAtTopRef.current) return
        if (
          gestureState.dy > SHEET_SWIPE_CLOSE_DISTANCE ||
          gestureState.vy > SHEET_SWIPE_CLOSE_VELOCITY
        ) {
          handleCloseSheet()
        }
      },
      onPanResponderTerminate: (_event, gestureState) => {
        if (!sheetScrollAtTopRef.current) return
        if (
          gestureState.dy > SHEET_SWIPE_CLOSE_DISTANCE + 18 ||
          gestureState.vy > SHEET_SWIPE_CLOSE_VELOCITY + 0.2
        ) {
          handleCloseSheet()
        }
      },
    }).panHandlers,
  [draggingExerciseId, handleCloseSheet])

  function handleScroll(event: NativeSyntheticEvent<NativeScrollEvent>) {
    const offsetY = event.nativeEvent.contentOffset.y
    scrollOffsetRef.current = offsetY
    const isAtTop = offsetY <= SHEET_TOP_SWIPE_TOLERANCE
    sheetScrollAtTopRef.current = isAtTop
    sheetScrollAtTop.value = isAtTop
  }

  function handleScrollLayout(event: LayoutChangeEvent) {
    scrollHeightRef.current = event.nativeEvent.layout.height
  }

  function handleFooterLayout(event: LayoutChangeEvent) {
    const nextHeight = event.nativeEvent.layout.height
    footerHeightRef.current = nextHeight
    setFooterHeight(nextHeight)
  }

  function handleSetRowLayout(weId: string, key: string, event: LayoutChangeEvent) {
    const exerciseY = exerciseLayoutRef.current[weId]?.y ?? 0
    setLayoutRef.current[key] = {
      y: exerciseY + event.nativeEvent.layout.y,
      height: event.nativeEvent.layout.height,
    }
  }

  function handleExerciseLayout(weId: string, event: LayoutChangeEvent) {
    exerciseLayoutRef.current[weId] = {
      y: event.nativeEvent.layout.y,
      height: event.nativeEvent.layout.height,
    }
  }

  function getExerciseShiftValue(weId: string) {
    if (!exerciseShiftValuesRef.current[weId]) {
      exerciseShiftValuesRef.current[weId] = new Animated.Value(0)
    }
    return exerciseShiftValuesRef.current[weId]
  }

  function animateExerciseShift(weId: string, toValue: number) {
    Animated.timing(getExerciseShiftValue(weId), {
      toValue,
      duration: 115,
      useNativeDriver: true,
    }).start()
  }

  function resetExerciseShifts(order: string[]) {
    for (const id of order) {
      getExerciseShiftValue(id).setValue(0)
    }
  }

  const scrollSetIntoView = useCallback((key: string, delay = 40) => {
    setTimeout(() => {
      const layout = setLayoutRef.current[key]
      const viewportHeight = scrollHeightRef.current
      if (!layout || viewportHeight <= 0) return

      const currentOffset = scrollOffsetRef.current
      const safeBottom = Math.max(
        footerHeightRef.current,
        keyboardHeightRef.current,
      )
      const visibleTop = currentOffset + theme.spacing.sm
      const visibleBottom = currentOffset + viewportHeight - safeBottom
      const rowTop = layout.y
      const rowBottom = layout.y + layout.height

      if (rowBottom > visibleBottom) {
        scrollRef.current?.scrollTo({
          y: Math.max(0, rowBottom - viewportHeight + safeBottom),
          animated: true,
        })
        return
      }

      if (rowTop < visibleTop) {
        scrollRef.current?.scrollTo({
          y: Math.max(0, rowTop - theme.spacing.sm),
          animated: true,
        })
      }
    }, delay)
  }, [theme.spacing.sm])

  function handleSetInputFocus(key: string) {
    focusedSetKeyRef.current = key
    scrollSetIntoView(key, keyboardHeightRef.current > 0 ? 30 : 120)
  }

  useEffect(() => {
    const showSub = Keyboard.addListener('keyboardDidShow', (event) => {
      keyboardHeightRef.current = event.endCoordinates.height
      setKeyboardHeight(event.endCoordinates.height)
      const focusedKey = focusedSetKeyRef.current
      if (focusedKey) {
        scrollSetIntoView(focusedKey, 60)
      }
    })
    const hideSub = Keyboard.addListener('keyboardDidHide', () => {
      keyboardHeightRef.current = 0
      setKeyboardHeight(0)
    })
    return () => {
      showSub.remove()
      hideSub.remove()
    }
  }, [scrollSetIntoView])

  function saveWorkoutName() {
    if (!activeWorkoutId) return
    updateWorkoutName(activeWorkoutId, workoutName).catch((e) => {
      console.error('Could not rename workout', e)
    })
  }

  function addLocalSet(weId: string) {
    dismissSetKeyboard()
    const weightUnit = exercises.find((ex) => ex.workoutExerciseId === weId)?.weightUnit ?? 'kg'
    const previousCompletedSet = [...(localSets[weId] ?? [])]
      .reverse()
      .find((set) => set.completed && parseWeightInput(set.weightKg) !== null)
    const nextSet = newLocalSet(weightUnit)
    if (previousCompletedSet) {
      nextSet.weightKg = previousCompletedSet.weightKg
      nextSet.weightInput = previousCompletedSet.weightInputUnit === weightUnit
        ? previousCompletedSet.weightInput
        : fromKgInput(previousCompletedSet.weightKg, weightUnit)
      nextSet.weightInputUnit = weightUnit
      nextSet.reps = previousCompletedSet.reps
    }

    setLocalSets((prev) => ({
      ...prev,
      [weId]: [...(prev[weId] ?? []), nextSet],
    }))
  }

  async function removeLocalSet(weId: string, setId: string) {
    dismissSetKeyboard()
    const currentSet = localSets[weId]?.find((s) => s.id === setId)
    if (currentSet?.persistedSetId) {
      try {
        await deleteCompletedSet(currentSet.persistedSetId)
        removeSet(weId, currentSet.persistedSetId)
      } catch (e) {
        console.error('Could not delete completed set', e)
      }
    }

    if (restSetKey === getRestSetKey(weId, setId)) {
      clearRest()
      setRestSetKey(null)
      showWorkoutNotification(elapsed, 0, startedAt).catch(console.error)
    }
    setLocalSets((prev) => ({
      ...prev,
      [weId]: (prev[weId] ?? []).filter((s) => s.id !== setId),
    }))
    setValidationErrors((prev) => {
      const next = { ...prev }
      delete next[getFieldErrorKey(weId, setId, 'weight')]
      delete next[getFieldErrorKey(weId, setId, 'reps')]
      return next
    })
  }

  function updateSetField(weId: string, setId: string, field: 'weight' | 'reps', value: string) {
    const weightUnit = exercises.find((ex) => ex.workoutExerciseId === weId)?.weightUnit ?? 'kg'
    const nextValue = field === 'reps' ? sanitizeRepsInput(value) : value
    const errorKey = getFieldErrorKey(weId, setId, field)
    setLocalSets((prev) => ({
      ...prev,
      [weId]: (prev[weId] ?? []).map((s) =>
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
    }))
    setValidationErrors((prev) => {
      if (!prev[errorKey]) return prev
      const isValid = field === 'weight'
        ? (parseWeightInput(toKgInput(nextValue, weightUnit)) ?? 0) > 0
        : parseRepsInput(nextValue) > 0
      if (!isValid) return prev
      const next = { ...prev }
      delete next[errorKey]
      return next
    })
    setValidationNotice(null)
  }

  function showWeightUnitPicker(weId: string, currentUnit: string) {
    dismissSetKeyboard()
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
            closeDialog()
            if (currentUnit !== 'kg') changeExerciseWeightUnit(weId, 'kg')
          },
        },
        {
          label: 'lb',
          variant: currentUnit === 'lb' ? 'primary' : 'default',
          onPress: () => {
            closeDialog()
            if (currentUnit !== 'lb') changeExerciseWeightUnit(weId, 'lb')
          },
        },
      ],
    })
  }

  function changeExerciseWeightUnit(weId: string, weightUnit: string) {
    updateExerciseWeightUnit(weId, weightUnit)
    setLocalSets((prev) => ({
      ...prev,
      [weId]: (prev[weId] ?? []).map((s) => ({
        ...s,
        weightInput: fromKgInput(s.weightKg, weightUnit),
        weightInputUnit: weightUnit,
      })),
    }))
  }

  function getDisplayWeight(s: LocalSet, weightUnit: string): string {
    if (s.weightInputUnit === weightUnit) return s.weightInput
    return fromKgInput(s.weightKg, weightUnit)
  }

  async function toggleSetCompleted(weId: string, setId: string) {
    dismissSetKeyboard()
    const currentSet = localSets[weId]?.find((s) => s.id === setId)
    if (!currentSet) return

    if (currentSet.completed) {
      if (currentSet.persistedSetId) {
        try {
          await deleteCompletedSet(currentSet.persistedSetId)
          removeSet(weId, currentSet.persistedSetId)
        } catch (e) {
          console.error('Could not delete completed set', e)
        }
      }

      setLocalSets((prev) => ({
        ...prev,
        [weId]: (prev[weId] ?? []).map((s) =>
          s.id === setId ? { ...s, completed: false, persistedSetId: undefined } : s,
        ),
      }))

      if (restSetKey === getRestSetKey(weId, setId)) {
        clearRest()
        setRestSetKey(null)
        showWorkoutNotification(elapsed, 0, startedAt).catch(console.error)
      }
      return
    }

    const invalidFields = validateSetValues(weId, currentSet)
    if (invalidFields.length > 0) {
      markInvalidSetFields(invalidFields)
      const message = 'Enter weight and reps greater than 0 before completing this set.'
      setValidationNotice(message)
      return
    }

    try {
      const persistedSetId = await addCompletedSetToWorkout({
        workoutExerciseId: weId,
        weightKg: parseWeightInput(currentSet.weightKg) ?? 0,
        weightUnit: currentSet.weightInputUnit,
        reps: parseRepsInput(currentSet.reps),
      })
      addSet(weId, {
        id: persistedSetId,
        setType: 'working',
        weight: parseWeightInput(currentSet.weightKg) ?? 0,
        weightUnit: currentSet.weightInputUnit,
        reps: parseRepsInput(currentSet.reps),
        completedAt: Date.now(),
      })

      setLocalSets((prev) => ({
        ...prev,
        [weId]: (prev[weId] ?? []).map((s) =>
          s.id === setId ? { ...s, completed: true, persistedSetId } : s,
        ),
      }))

      const restSeconds = getDefaultRestSeconds()
      restDoneNotifiedRef.current = false
      setRestSetKey(getRestSetKey(weId, setId))
      startRest(restSeconds)
      showWorkoutNotification(elapsed, restSeconds, startedAt, {
        restEndsAt: useSessionStore.getState().restEndsAt,
      }).catch(console.error)
    } catch (e) {
      console.error('Could not complete set', e)
      showErrorDialog('Could not save this set.')
    }
  }

  async function handleDeleteExercise(weId: string) {
    const remainingOrder = exercises
      .filter((exercise) => exercise.workoutExerciseId !== weId)
      .map((exercise) => exercise.workoutExerciseId)

    try {
      await deleteWorkoutExercise(weId)
    } catch (e) {
      console.error('Could not delete workout exercise', e)
      showErrorDialog('Could not remove this exercise.')
      return
    }

    if (restSetKey?.startsWith(`${weId}:`)) {
      clearRest()
      setRestSetKey(null)
      showWorkoutNotification(elapsed, 0, startedAt).catch(console.error)
    }
    setLocalSets((prev) => {
      const next = { ...prev }
      delete next[weId]
      return next
    })
    setValidationErrors((prev) => {
      const next = { ...prev }
      for (const key of Object.keys(next)) {
        if (key.startsWith(`${weId}:`)) delete next[key]
      }
      return next
    })
    removeExercise(weId)
    updateWorkoutExerciseOrder(remainingOrder).catch((e) => {
      console.error('Could not persist exercise order after delete', e)
    })
  }

  function beginExerciseDrag(weId: string) {
    const layout = exerciseLayoutRef.current[weId]
    const currentExercises = exercisesRef.current
    const startIndex = currentExercises.findIndex((exercise) => exercise.workoutExerciseId === weId)
    if (!layout || startIndex < 0 || currentExercises.length < 2) return
    Keyboard.dismiss()
    closeDialog()
    exerciseDragRef.current = {
      id: weId,
      startIndex,
      startY: layout.y,
      height: layout.height,
      targetIndex: startIndex,
      initialOrder: currentExercises.map((exercise) => exercise.workoutExerciseId),
    }
    resetExerciseShifts(currentExercises.map((exercise) => exercise.workoutExerciseId))
    setDraggingExerciseId(weId)
    exerciseDragTranslateY.setValue(0)
  }

  function updateExerciseDrag(gestureState: PanResponderGestureState) {
    const dragState = exerciseDragRef.current
    if (!dragState) return

    const draggedCenter = dragState.startY + gestureState.dy + (dragState.height / 2)
    const nextIndex = dragState.initialOrder.reduce((index, id) => {
      if (id === dragState.id) return index
      const layout = exerciseLayoutRef.current[id]
      if (!layout) return index
      return draggedCenter > layout.y + (layout.height / 2) ? index + 1 : index
    }, 0)

    if (nextIndex !== dragState.targetIndex) {
      dragState.targetIndex = nextIndex
      for (const [index, id] of dragState.initialOrder.entries()) {
        if (id === dragState.id) continue
        let shift = 0
        if (
          nextIndex > dragState.startIndex &&
          index > dragState.startIndex &&
          index <= nextIndex
        ) {
          shift = -dragState.height
        } else if (
          nextIndex < dragState.startIndex &&
          index >= nextIndex &&
          index < dragState.startIndex
        ) {
          shift = dragState.height
        }
        animateExerciseShift(id, shift)
      }
    }

    exerciseDragTranslateY.setValue(gestureState.dy)
  }

  function finishExerciseDrag() {
    const dragState = exerciseDragRef.current
    exerciseDragRef.current = null
    setDraggingExerciseId(null)
    exerciseDragTranslateY.setValue(0)
    if (!dragState) return

    resetExerciseShifts(dragState.initialOrder)
    const finalOrder = [...dragState.initialOrder]
    const [movedId] = finalOrder.splice(dragState.startIndex, 1)
    finalOrder.splice(dragState.targetIndex, 0, movedId)
    const didChangeOrder = finalOrder.some((id, index) => id !== dragState.initialOrder[index])
    if (!didChangeOrder) return

    const byId = new Map(exercisesRef.current.map((exercise) => [exercise.workoutExerciseId, exercise]))
    exercisesRef.current = finalOrder.flatMap((id) => {
      const exercise = byId.get(id)
      return exercise ? [exercise] : []
    })
    reorderExercises(finalOrder)
    updateWorkoutExerciseOrder(finalOrder).catch((e) => {
      console.error('Could not persist exercise order', e)
      const byInitialId = new Map(exercisesRef.current.map((exercise) => [exercise.workoutExerciseId, exercise]))
      exercisesRef.current = dragState.initialOrder.flatMap((id) => {
        const exercise = byInitialId.get(id)
        return exercise ? [exercise] : []
      })
      reorderExercises(dragState.initialOrder)
      showErrorDialog('Could not rearrange exercises.')
    })
  }

  function getExerciseDragPanHandlers(weId: string) {
    if (!exercisePanResponderRef.current[weId]) {
      exercisePanResponderRef.current[weId] = PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: () => beginExerciseDrag(weId),
        onPanResponderMove: (_event, gestureState) => updateExerciseDrag(gestureState),
        onPanResponderRelease: () => finishExerciseDrag(),
        onPanResponderTerminate: () => finishExerciseDrag(),
      })
    }
    return exercisePanResponderRef.current[weId].panHandlers
  }

  function getExerciseDragStyle(weId: string) {
    if (!draggingExerciseId) return null
    if (draggingExerciseId !== weId) {
      return {
        transform: [{ translateY: getExerciseShiftValue(weId) }],
      }
    }
    return {
      transform: [{ translateY: exerciseDragTranslateY }],
    }
  }

  function renderDeleteAction(onPress: () => void) {
    return (
      <TouchableOpacity style={styles.deleteAction} onPress={onPress}>
        <MaterialCommunityIcons name="trash-can-outline" size={22} color="#fff" />
      </TouchableOpacity>
    )
  }

  const swipeDownToCloseGesture = Gesture.Pan()
    .activeOffsetY(SHEET_SWIPE_CAPTURE_DISTANCE)
    .failOffsetX([-90, 90])
    .onEnd((event) => {
      if (!sheetScrollAtTop.value) return
      if (
        event.translationY > SHEET_SWIPE_CLOSE_DISTANCE ||
        event.velocityY > SHEET_SWIPE_CLOSE_VELOCITY * 1000
      ) {
        runOnJS(handleCloseSheet)()
      }
    })

  if (!activeWorkoutId && prCelebration.length === 0) return null

  return (
    <>
      {activeWorkoutId ? (
        <Modal
          visible={isWorkoutSheetOpen}
          animationType="slide"
          onRequestClose={handleCloseSheet}
          statusBarTranslucent
          navigationBarTranslucent
        >
        <GestureHandlerRootView style={styles.gestureRoot}>
        <GestureDetector gesture={swipeDownToCloseGesture}>
        <View
          style={[styles.root, { paddingTop: insets.top }]}
          {...sheetSwipePanHandlers}
        >
          {/* Fixed header */}
          <View style={styles.header}>
            <TouchableOpacity style={styles.iconBtn} onPress={handleCloseSheet}>
              <MaterialCommunityIcons name="chevron-down" size={17} color={theme.colors.text} />
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
                <Text style={styles.timerText}>{formatElapsed(elapsed)}</Text>
              </View>
            </View>
          </View>

          {/* Scrollable exercise list */}
          <ScrollView
            ref={scrollRef}
            style={styles.scroll}
            contentContainerStyle={[
              styles.scrollContent,
              {
                paddingBottom: keyboardHeight > 0
                  ? Math.max(
                    footerHeight + insets.bottom + theme.spacing.sm,
                    keyboardHeight + theme.spacing.sm,
                  )
                  : theme.spacing.lg,
              },
            ]}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            onLayout={handleScrollLayout}
            onScroll={handleScroll}
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
              <Text style={styles.emptyHint}>Add an exercise to get started</Text>
            )}

            {exercises.map((ex) => {
              const sets = localSets[ex.workoutExerciseId] ?? []
              const showMethod = !(ex.methodLocked || methodLockedByExerciseType[ex.exerciseTypeId])
              return (
                <Animated.View
                  key={ex.workoutExerciseId}
                  style={[
                    styles.exerciseCard,
                    draggingExerciseId === ex.workoutExerciseId && styles.exerciseCardDragging,
                    getExerciseDragStyle(ex.workoutExerciseId),
                  ]}
                  onLayout={(event) => handleExerciseLayout(ex.workoutExerciseId, event)}
                >
                  {/* Exercise header row — swipe left to delete whole exercise */}
                  <ReanimatedSwipeable
                    renderRightActions={() => renderDeleteAction(() => handleDeleteExercise(ex.workoutExerciseId))}
                    overshootRight={false}
                  >
                    <View style={styles.exerciseHeader}>
                      <Text style={styles.exerciseName} numberOfLines={1}>
                        {ex.exerciseTypeName}
                        {showMethod ? (
                          <Text style={styles.exerciseMethod}>{' - '}{ex.methodName}</Text>
                        ) : null}
                      </Text>
                      <View
                        style={[
                          styles.reorderButton,
                          exercises.length < 2 && styles.reorderButtonDisabled,
                        ]}
                        {...getExerciseDragPanHandlers(ex.workoutExerciseId)}
                      >
                        <MaterialCommunityIcons
                          name="drag"
                          size={19}
                          color={exercises.length < 2 ? theme.colors.textMuted : theme.colors.text}
                        />
                      </View>
                    </View>
                  </ReanimatedSwipeable>

                  {/* Column labels */}
                  <View style={styles.setLabelRow}>
                    <Text style={[styles.setLabel, styles.setNumCol]}>SET</Text>
                    <Text style={[styles.setLabel, styles.weightCol]}>WEIGHT</Text>
                    <Text style={[styles.setLabel, styles.repsCol]}>REPS</Text>
                    <View style={styles.checkCol} />
                  </View>

                  {/* Set rows — swipe left to delete set */}
                  {sets.map((s, i) => {
                    const setRestKey = getRestSetKey(ex.workoutExerciseId, s.id)
                    const setLayoutKey = getSetLayoutKey(ex.workoutExerciseId, s.id)
                    return (
                      <React.Fragment key={s.id}>
                        <View
                          onLayout={(event) =>
                            handleSetRowLayout(ex.workoutExerciseId, setLayoutKey, event)
                          }
                        >
                          <ReanimatedSwipeable
                            renderRightActions={() => renderDeleteAction(() => removeLocalSet(ex.workoutExerciseId, s.id))}
                            childrenContainerStyle={styles.swipeableSetContent}
                            dragOffsetFromRightEdge={3}
                            overshootRight={false}
                          >
                            <View
                              style={[styles.setRow, s.completed && styles.setRowCompleted]}
                            >
                              <Text style={[styles.setNum, styles.setNumCol]}>{i + 1}</Text>

                              <View
                                style={[
                                  styles.inputWrap,
                                  styles.weightCol,
                                  hasFieldError(ex.workoutExerciseId, s.id, 'weight') &&
                                    styles.inputWrapError,
                                ]}
                              >
                                <TextInput
                                  style={styles.input}
                                  value={getDisplayWeight(s, ex.weightUnit)}
                                  onChangeText={(v) => updateSetField(ex.workoutExerciseId, s.id, 'weight', v)}
                                  keyboardType="decimal-pad"
                                  placeholder="0"
                                  placeholderTextColor={theme.colors.textMuted}
                                  returnKeyType="done"
                                  onFocus={() => handleSetInputFocus(setLayoutKey)}
                                />
                                <TouchableOpacity
                                  style={styles.inputUnitButton}
                                  onPress={() => showWeightUnitPicker(ex.workoutExerciseId, ex.weightUnit)}
                                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                >
                                  <Text style={styles.inputUnit}>{ex.weightUnit}</Text>
                                </TouchableOpacity>
                              </View>

                              <View
                                style={[
                                  styles.inputWrap,
                                  styles.repsCol,
                                  hasFieldError(ex.workoutExerciseId, s.id, 'reps') &&
                                    styles.inputWrapError,
                                ]}
                              >
                                <TextInput
                                  style={styles.input}
                                  value={s.reps}
                                  onChangeText={(v) => updateSetField(ex.workoutExerciseId, s.id, 'reps', v)}
                                  keyboardType="number-pad"
                                  placeholder="0"
                                  placeholderTextColor={theme.colors.textMuted}
                                  returnKeyType="done"
                                  onFocus={() => handleSetInputFocus(setLayoutKey)}
                                />
                                <View style={styles.inputUnitButton}>
                                  <Text style={styles.inputUnit}>reps</Text>
                                </View>
                              </View>

                              <TouchableOpacity
                                style={styles.checkCol}
                                onPress={() => toggleSetCompleted(ex.workoutExerciseId, s.id)}
                                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                              >
                                <MaterialCommunityIcons
                                  name={s.completed ? 'check-circle' : 'check-circle-outline'}
                                  size={22}
                                  color={s.completed ? theme.colors.accent : theme.colors.textMuted}
                                />
                              </TouchableOpacity>
                            </View>
                          </ReanimatedSwipeable>
                        </View>
                        {isResting && restSetKey === setRestKey && (
                          <View style={styles.restTimerRow}>
                            <MaterialCommunityIcons name="timer-sand" size={14} color={theme.colors.accent} />
                            <Text style={styles.restTimerText}>
                              Rest timer started - {formatRestTimer(restSecondsRemaining)}
                            </Text>
                            <TouchableOpacity style={styles.skipRestButton} onPress={skipRestTimer}>
                              <Text style={styles.skipRestText}>Skip</Text>
                            </TouchableOpacity>
                          </View>
                        )}
                      </React.Fragment>
                    )
                  })}

                  {/* Add Set button */}
                  <TouchableOpacity
                    style={styles.addSetBtn}
                    onPress={() => addLocalSet(ex.workoutExerciseId)}
                  >
                    <MaterialCommunityIcons name="plus" size={14} color={theme.colors.textMuted} />
                    <Text style={styles.addSetText}>Add Set</Text>
                  </TouchableOpacity>
                </Animated.View>
              )
            })}

            {/* Add Exercise button — below exercises */}
            <TouchableOpacity
              style={styles.addExerciseBtn}
              onPress={handlePickerOpen}
              activeOpacity={0.78}
            >
              <View style={styles.addExerciseIcon}>
                <MaterialCommunityIcons name="plus" size={18} color={theme.colors.accent} />
              </View>
              <Text style={styles.addExerciseText}>Add Exercise</Text>
            </TouchableOpacity>
          </ScrollView>

          {/* Fixed footer */}
          <View
            style={[
              styles.footer,
              {
                paddingBottom: Math.max(theme.spacing.md, insets.bottom + theme.spacing.sm),
              },
            ]}
            onLayout={handleFooterLayout}
          >
            {validationNotice ? (
              <View style={styles.validationNotice}>
                <MaterialCommunityIcons
                  name="alert-circle-outline"
                  size={16}
                  color={theme.colors.danger}
                />
                <Text style={styles.validationNoticeText}>{validationNotice}</Text>
              </View>
            ) : null}
            <View style={styles.footerSummary}>
              <View style={styles.footerStat}>
                <MaterialCommunityIcons name="dumbbell" size={15} color={theme.colors.accent} />
                <Text style={styles.footerStatText}>{footerStats.exercises} Exercises</Text>
              </View>
              <View style={styles.footerStatDivider} />
              <View style={styles.footerStat}>
                <MaterialCommunityIcons name="check-circle-outline" size={15} color={theme.colors.accent} />
                <Text style={styles.footerStatText}>{footerStats.completedSets} Sets Done</Text>
              </View>
              <View style={styles.footerStatDivider} />
              <View style={styles.footerStat}>
                <MaterialCommunityIcons name="weight-lifter" size={15} color={theme.colors.accent} />
                <Text style={styles.footerStatText}>{footerStats.volumeLabel}</Text>
              </View>
            </View>
            <TouchableOpacity style={styles.endButton} onPress={handleEndWorkout} activeOpacity={0.82}>
              <View style={styles.endButtonIcon}>
                <MaterialCommunityIcons name="flag-checkered" size={18} color={theme.colors.danger} />
              </View>
              <View style={styles.endButtonTextBlock}>
                <Text style={styles.endButtonText}>End Workout</Text>
                <Text style={styles.endButtonSubtext}>Review and save your session</Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={20} color={theme.colors.danger} />
            </TouchableOpacity>
          </View>

          {dialog ? (
            <View style={styles.dialogOverlay}>
              <View style={styles.dialogCard}>
                <View style={styles.dialogHeader}>
                  <View style={styles.dialogIcon}>
                    <MaterialCommunityIcons
                      name={dialog.actions.some((action) => action.variant === 'danger')
                        ? 'alert-circle-outline'
                        : 'check-circle-outline'}
                      size={22}
                      color={dialog.actions.some((action) => action.variant === 'danger')
                        ? theme.colors.danger
                        : theme.colors.accent}
                    />
                  </View>
                  <View style={styles.dialogTitleBlock}>
                    <Text style={styles.dialogTitle}>{dialog.title}</Text>
                    {dialog.message ? (
                      <Text style={styles.dialogMessage}>{dialog.message}</Text>
                    ) : null}
                  </View>
                </View>
                <View style={[
                  styles.dialogActions,
                  dialog.compactActions && styles.dialogActionsCompact,
                ]}>
                  {dialog.actions.map((action) => (
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
                          action.variant === 'primary' && styles.dialogPrimaryButton,
                          action.variant === 'danger' && styles.dialogDangerButton,
                        ]}
                      onPress={action.onPress}
                    >
                      <Text
                        style={[
                          styles.dialogButtonText,
                          action.variant === 'primary' && styles.dialogFilledButtonText,
                          action.variant === 'danger' && styles.dialogDangerButtonText,
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
        </GestureDetector>
        </GestureHandlerRootView>
        </Modal>
      ) : null}

      <Modal
        visible={prCelebration.length > 0}
        animationType="fade"
        onRequestClose={dismissPrCelebration}
        statusBarTranslucent
        navigationBarTranslucent
      >
        <View
          style={[
            styles.prCelebrationRoot,
            {
              paddingTop: insets.top + theme.spacing.lg,
              paddingBottom: insets.bottom + theme.spacing.lg,
            },
          ]}
        >
          <View pointerEvents="none" style={styles.prConfettiLayer}>
            {PR_CONFETTI.map((piece, index) => {
              const animation = prConfettiAnimations[index]
              return (
                <Animated.View
                  key={`${piece.left}-${index}`}
                  style={[
                    styles.prConfettiPiece,
                    {
                      left: piece.left as `${number}%`,
                      top: piece.top,
                      width: piece.size,
                      height: piece.size * 1.45,
                      backgroundColor: piece.color,
                      opacity: animation.interpolate({
                        inputRange: [0, 0.12, 0.72, 1],
                        outputRange: [0, 1, 1, 0],
                      }),
                      transform: [
                        {
                          translateX: animation.interpolate({
                            inputRange: [0, 1],
                            outputRange: [0, piece.translateX],
                          }),
                        },
                        {
                          translateY: animation.interpolate({
                            inputRange: [0, 1],
                            outputRange: [0, piece.translateY],
                          }),
                        },
                        {
                          rotate: animation.interpolate({
                            inputRange: [0, 1],
                            outputRange: ['0deg', `${piece.rotate}deg`],
                          }),
                        },
                      ],
                    },
                  ]}
                />
              )
            })}
          </View>
          <View style={styles.prCelebrationCard}>
            <View style={styles.prHero}>
              <View style={styles.prCelebrationIconHalo}>
                <Animated.View
                  pointerEvents="none"
                  style={[
                    styles.prCelebrationGlow,
                    {
                      opacity: prSpotlightAnimation.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0.45, 0.9],
                      }),
                      transform: [
                        {
                          scale: prSpotlightAnimation.interpolate({
                            inputRange: [0, 1],
                            outputRange: [0.86, 1.18],
                          }),
                        },
                      ],
                    },
                  ]}
                />
                <View style={styles.prCelebrationIcon}>
                  <MaterialCommunityIcons name="trophy-variant-outline" size={38} color={PR_GOLD} />
                </View>
              </View>
              <Text style={styles.prCelebrationEyebrow}>New Personal Record</Text>
              <Text style={styles.prCelebrationTitle}>That one counts.</Text>
              <Text style={styles.prCelebrationMessage}>
                You pushed your top weight higher this workout.
              </Text>
              <View style={styles.prSummaryPill}>
                <MaterialCommunityIcons name="weight-lifter" size={14} color={PR_GOLD} />
                <Text style={styles.prSummaryPillText}>
                  {prCelebration.length === 1
                    ? '1 weight PR'
                    : `${prCelebration.length} weight PRs`}
                </Text>
              </View>
            </View>

            <ScrollView
              style={styles.prList}
              contentContainerStyle={styles.prListContent}
              showsVerticalScrollIndicator={false}
            >
              {prCelebration.map((achievement) => (
                <View key={achievement.setId} style={styles.prResultCard}>
                  <View style={styles.prResultHeader}>
                    <View style={styles.prResultTitleBlock}>
                      <Text style={styles.prExerciseName} numberOfLines={1}>
                        {achievement.exerciseName}
                      </Text>
                      <Text style={styles.prMethodName} numberOfLines={1}>
                        {achievement.methodName}
                      </Text>
                    </View>
                    <View style={styles.prMiniBadge}>
                      <Text style={styles.prMiniBadgeText}>
                        {achievement.isCurrentWeightPr ? 'Current PR' : 'PR'}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.prValuesRow}>
                    <View style={styles.prValueBox}>
                      <Text style={styles.prValueLabel}>Previous</Text>
                      <Text style={styles.prPreviousValue}>
                        {achievement.previousWeightKg === null
                          ? 'No previous PR'
                          : formatPrWeight(achievement.previousWeightKg, achievement.weightUnit)}
                      </Text>
                    </View>
                    <MaterialCommunityIcons
                      name="arrow-right"
                      size={18}
                      color={theme.colors.textMuted}
                    />
                    <View style={[styles.prValueBox, styles.prNewValueBox]}>
                      <Text style={styles.prValueLabel}>Now</Text>
                      <Text style={styles.prNewValue}>
                        {formatPrWeight(achievement.newWeightKg, achievement.weightUnit)}
                        <Text style={styles.prRepsText}> x {achievement.reps}</Text>
                      </Text>
                    </View>
                  </View>
                </View>
              ))}
            </ScrollView>

            <TouchableOpacity
              style={styles.prDoneButton}
              onPress={dismissPrCelebration}
              activeOpacity={0.78}
            >
              <Text style={styles.prDoneButtonText}>Nice</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {activeWorkoutId ? (
        <ExercisePickerModal visible={pickerVisible} onClose={handlePickerClose} />
      ) : null}
    </>
  )
}

const stylesheet = createStyleSheet((theme) => ({
  gestureRoot: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  root: {
    flex: 1,
    minHeight: 0,
    position: 'relative',
    backgroundColor: theme.colors.bg,
  },
  // ── Header ──────────────────────────────────────────────
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.full,
    borderWidth: 1,
    borderColor: theme.colors.accent,
    // paddingHorizontal: 10,
    // paddingVertical: 5,
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.sm,
  },
  timerDot: {
    width: 7,
    height: 7,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.accent,
  },
  timerText: {
    color: theme.colors.accent,
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.bold,
    letterSpacing: 0.5,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  cancelIconButton: {
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
    borderWidth: 1.5,
    borderColor: theme.colors.textMuted + '45',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    gap: 3,
  },
  workoutNameLabel: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xxs,
    fontFamily: theme.fontFamily.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  workoutNameInput: {
    color: theme.colors.text,
    fontSize: theme.fontSize.lg,
    fontFamily: theme.fontFamily.extraBold,
    minHeight: 36,
    padding: 0,
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
    backgroundColor: theme.colors.danger + '18',
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
    gap: theme.spacing.sm,
    borderRadius: theme.radius.md,
    minHeight: 48,
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.md,
    backgroundColor: theme.colors.accentMuted,
    borderWidth: 1,
    borderColor: theme.colors.accent,
  },
  addExerciseIcon: {
    width: 28,
    height: 28,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surface,
  },
  addExerciseText: {
    color: theme.colors.accent,
    fontSize: theme.fontSize.md,
    fontFamily: theme.fontFamily.extraBold,
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
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: theme.radius.md,
    borderWidth: 1.5,
    borderColor: theme.colors.textMuted + '55',
    backgroundColor: theme.colors.surface2,
    paddingHorizontal: theme.spacing.sm,
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
    fontFamily: theme.fontFamily.extraBold,
  },
  footerStatDivider: {
    width: 1,
    height: 18,
    backgroundColor: theme.colors.border,
  },
  validationNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    backgroundColor: theme.colors.danger + '18',
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
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    backgroundColor: '#4A2428',
    borderRadius: theme.radius.lg,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.colors.danger + '45',
    shadowColor: theme.colors.danger,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.32,
    shadowRadius: 18,
    elevation: 5,
  },
  endButtonIcon: {
    width: 34,
    height: 34,
    borderRadius: theme.radius.full,
    backgroundColor: '#5A2B30',
    alignItems: 'center',
    justifyContent: 'center',
  },
  endButtonTextBlock: {
    flex: 1,
    minWidth: 0,
  },
  endButtonText: {
    color: theme.colors.danger,
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
    backgroundColor: theme.colors.danger + '22',
    borderColor: theme.colors.danger + '70',
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
  prCelebrationRoot: {
    flex: 1,
    backgroundColor: theme.colors.bg,
    paddingHorizontal: theme.spacing.md,
    justifyContent: 'center',
  },
  prConfettiLayer: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 2,
  },
  prConfettiPiece: {
    position: 'absolute',
    borderRadius: 2,
  },
  prCelebrationCard: {
    maxHeight: '92%',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: PR_GOLD + '44',
    padding: theme.spacing.lg,
    gap: theme.spacing.md,
    position: 'relative',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.24,
    shadowRadius: 20,
    elevation: 10,
  },
  prCelebrationGlow: {
    position: 'absolute',
    width: 104,
    height: 104,
    borderRadius: theme.radius.full,
    backgroundColor: PR_GOLD + '2A',
    zIndex: 0,
  },
  prHero: {
    alignItems: 'center',
    gap: theme.spacing.xs,
    paddingTop: theme.spacing.xs,
    zIndex: 1,
  },
  prCelebrationIconHalo: {
    width: 88,
    height: 88,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
    backgroundColor: PR_GOLD + '14',
    borderWidth: 1,
    borderColor: PR_GOLD + '2E',
    marginBottom: theme.spacing.xs,
  },
  prCelebrationIcon: {
    width: 66,
    height: 66,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: PR_GOLD + '77',
    zIndex: 1,
    shadowColor: PR_GOLD,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.38,
    shadowRadius: 16,
    elevation: 5,
  },
  prCelebrationEyebrow: {
    color: PR_GOLD,
    fontSize: theme.fontSize.xs,
    fontFamily: theme.fontFamily.black,
    letterSpacing: 1,
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  prCelebrationTitle: {
    color: theme.colors.text,
    fontSize: theme.fontSize.xxl,
    fontFamily: theme.fontFamily.black,
    textAlign: 'center',
    marginTop: -2,
  },
  prCelebrationMessage: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.md,
    fontFamily: theme.fontFamily.semiBold,
    lineHeight: 22,
    textAlign: 'center',
  },
  prSummaryPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: theme.radius.full,
    borderWidth: 1,
    borderColor: PR_GOLD + '66',
    backgroundColor: PR_GOLD + '18',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 7,
    marginTop: theme.spacing.xs,
  },
  prSummaryPillText: {
    color: PR_GOLD,
    fontSize: theme.fontSize.xs,
    fontFamily: theme.fontFamily.black,
  },
  prList: {
    maxHeight: 320,
    zIndex: 1,
  },
  prListContent: {
    gap: theme.spacing.sm,
  },
  prResultCard: {
    backgroundColor: theme.colors.surface2,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  prResultHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
  },
  prResultTitleBlock: {
    flex: 1,
    minWidth: 0,
  },
  prExerciseName: {
    color: theme.colors.text,
    fontSize: theme.fontSize.md,
    fontFamily: theme.fontFamily.extraBold,
  },
  prMethodName: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
    fontFamily: theme.fontFamily.bold,
    marginTop: 2,
  },
  prMiniBadge: {
    borderRadius: theme.radius.full,
    borderWidth: 1,
    borderColor: PR_GOLD,
    backgroundColor: PR_GOLD + '22',
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 3,
  },
  prMiniBadgeText: {
    color: PR_GOLD,
    fontSize: theme.fontSize.xs,
    fontFamily: theme.fontFamily.black,
  },
  prValuesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  prValueBox: {
    flex: 1,
    minHeight: 62,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    padding: theme.spacing.sm,
    justifyContent: 'center',
  },
  prNewValueBox: {
    borderColor: PR_GOLD + '66',
    backgroundColor: PR_GOLD + '18',
  },
  prValueLabel: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
    fontFamily: theme.fontFamily.extraBold,
    textTransform: 'uppercase',
    marginBottom: 3,
  },
  prPreviousValue: {
    color: theme.colors.text,
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.extraBold,
  },
  prNewValue: {
    color: PR_GOLD,
    fontSize: theme.fontSize.md,
    fontFamily: theme.fontFamily.black,
  },
  prRepsText: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.extraBold,
  },
  prDoneButton: {
    minHeight: 48,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.accent,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.28)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  prDoneButtonText: {
    color: '#FFFFFF',
    fontSize: theme.fontSize.md,
    fontFamily: theme.fontFamily.black,
  },
}))
