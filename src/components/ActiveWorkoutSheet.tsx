import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  AppState,
  Keyboard,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import {
  BottomSheetModal,
  BottomSheetScrollView,
  BottomSheetTextInput,
  type BottomSheetScrollViewMethods,
} from '@gorhom/bottom-sheet'
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable'
import notifee, { EventType } from '@notifee/react-native'
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons'
import { createStyleSheet, useStyles } from 'react-native-unistyles'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { getString, removeKey } from '@/storage/mmkv'
import {
  MMKV_PENDING_WORKOUT_ACTION,
  useSessionStore,
} from '@/store/sessionStore'
import {
  addCompletedSetToWorkout,
  deleteCompletedSet,
  deleteWorkout,
  deleteWorkoutExercise,
  finishWorkout,
  getWorkoutName,
  isExerciseTypeMethodLocked,
  updateWorkoutName,
} from '@/db/workoutHelpers'
import {
  cancelWorkoutNotification,
  setupWorkoutChannel,
  showRestDoneNotification,
  showWorkoutNotification,
} from '@/services/WorkoutNotification'
import {
  formatRestTimer,
  getDefaultRestSeconds,
} from '@/services/restTimerSettings'
import ExercisePickerModal from './ExercisePickerModal'
import ThemedDialog, { type ThemedDialogAction } from './ui/ThemedDialog'

type LocalSet = {
  id: string
  weightKg: string
  weightInput: string
  weightInputUnit: string
  reps: string
  completed: boolean
  persistedSetId?: string
}

type NativeFocusTargetEvent = NativeSyntheticEvent<{ target: number }>

const LB_PER_KG = 2.20462

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

function formatElapsed(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export default function ActiveWorkoutSheet() {
  const { styles, theme } = useStyles(stylesheet)
  const insets = useSafeAreaInsets()
  const sheetRef = useRef<BottomSheetModal>(null)
  const scrollRef = useRef<BottomSheetScrollViewMethods>(null)
  const [pickerVisible, setPickerVisible] = useState(false)
  const [localSets, setLocalSets] = useState<Record<string, LocalSet[]>>({})
  const [restSetKey, setRestSetKey] = useState<string | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const [workoutName, setWorkoutName] = useState('')
  const [dialog, setDialog] = useState<{
    title: string
    message?: string
    actions: ThemedDialogAction[]
  } | null>(null)
  const [validationNotice, setValidationNotice] = useState<string | null>(null)
  const [validationErrors, setValidationErrors] = useState<Record<string, boolean>>({})
  const [methodLockedByExerciseType, setMethodLockedByExerciseType] = useState<Record<string, boolean>>({})
  const [keyboardHeight, setKeyboardHeight] = useState(0)
  const [footerHeight, setFooterHeight] = useState(0)
  const elapsedRef = useRef(0)
  const activeWorkoutIdRef = useRef<string | null>(null)
  const isWorkoutSheetOpenRef = useRef(false)
  const sheetDismissRequestedRef = useRef(false)
  const restDoneNotifiedRef = useRef(false)
  const pickerVisibleRef = useRef(false)
  const keyboardHeightRef = useRef(0)
  const footerHeightRef = useRef(0)
  const scrollOffsetRef = useRef(0)
  const scrollHeightRef = useRef(0)
  const setLayoutRef = useRef<Record<string, { y: number; height: number }>>({})
  const focusedSetKeyRef = useRef<string | null>(null)
  const focusedInputTargetRef = useRef<number | null>(null)

  const {
    activeWorkoutId,
    startedAt,
    exercises,
    isResting,
    restSecondsRemaining,
    isWorkoutSheetOpen,
    sheetOpenRequestId,
    closeWorkoutSheet,
    endWorkout,
    openWorkoutSheet,
    removeExercise,
    updateExerciseWeightUnit,
    startRest,
    tickRest,
    clearRest,
  } = useSessionStore()

  const doEndWorkout = useCallback(async () => {
    if (activeWorkoutId) {
      await updateWorkoutName(activeWorkoutId, workoutName)
      await finishWorkout(activeWorkoutId)
    }
    endWorkout()
  }, [activeWorkoutId, endWorkout, workoutName])

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
    findInvalidWorkoutFields,
    hasMeaningfulCompletedSet,
    markInvalidSetFields,
    showErrorDialog,
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
      showWorkoutNotification(elapsedRef.current).catch(console.error)
      return
    }

    if (action === 'end_workout') {
      requestEndWorkout()
    }
  }, [clearRest, openWorkoutSheet, requestEndWorkout])

  const skipRestTimer = useCallback(() => {
    clearRest()
    setRestSetKey(null)
    showWorkoutNotification(elapsedRef.current).catch(console.error)
  }, [clearRest])

  useEffect(() => {
    elapsedRef.current = elapsed
  }, [elapsed])

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
    activeWorkoutIdRef.current = activeWorkoutId
  }, [activeWorkoutId])

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
    isWorkoutSheetOpenRef.current = isWorkoutSheetOpen
  }, [isWorkoutSheetOpen])

  useEffect(() => {
    pickerVisibleRef.current = pickerVisible
  }, [pickerVisible])

  // Sync new exercises into local set state (one empty set each)
  useEffect(() => {
    setLocalSets((prev) => {
      const next = { ...prev }
      for (const ex of exercises) {
        if (!next[ex.workoutExerciseId]) {
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
    if (!activeWorkoutId || !startedAt) {
      cancelWorkoutNotification().catch(() => {})
      return
    }
    async function startNotification() {
      await setupWorkoutChannel()
      await notifee.requestPermission()
      const initial = Math.floor((Date.now() - startedAt!) / 1000)
      await showWorkoutNotification(initial)
    }
    startNotification().catch(console.error)
    return () => {
      cancelWorkoutNotification().catch(() => {})
    }
  }, [activeWorkoutId, startedAt])

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
      if (state === 'active') {
        handleNotificationAction(getString(MMKV_PENDING_WORKOUT_ACTION))
      }
    })
    return () => appStateSub.remove()
  }, [activeWorkoutId, handleNotificationAction])

  useEffect(() => {
    if (!activeWorkoutId) return
    if (isWorkoutSheetOpen) {
      sheetRef.current?.present()
    } else {
      sheetRef.current?.dismiss()
    }
  }, [isWorkoutSheetOpen, activeWorkoutId, sheetOpenRequestId])

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
    if (!activeWorkoutId || !startedAt || !isResting) return
    showWorkoutNotification(elapsed, restSecondsRemaining).catch(console.error)
  }, [activeWorkoutId, elapsed, isResting, restSecondsRemaining, startedAt])

  useEffect(() => {
    if (!isResting) return

    const interval = setInterval(() => {
      const state = useSessionStore.getState()
      const wasResting = state.isResting
      const restEndsAt = state.restEndsAt
      tickRest()
      const stillResting = useSessionStore.getState().isResting

      if (wasResting && !stillResting && !restDoneNotifiedRef.current) {
        restDoneNotifiedRef.current = true
        setRestSetKey(null)
        showRestDoneNotification(restEndsAt).catch(console.error)
      }
    }, 1000)

    return () => clearInterval(interval)
  }, [isResting, tickRest])

  function handleEndWorkout() {
    requestEndWorkout()
  }

  function handleCloseSheet() {
    sheetDismissRequestedRef.current = true
    closeDialog()
    closeWorkoutSheet()
  }

  function handleSheetDismiss() {
    closeDialog()
    if (pickerVisibleRef.current) {
      return
    }
    if (
      activeWorkoutIdRef.current &&
      isWorkoutSheetOpenRef.current &&
      !sheetDismissRequestedRef.current
    ) {
      requestAnimationFrame(() => {
        if (!pickerVisibleRef.current) {
          sheetRef.current?.present()
        }
      })
      return
    }

    sheetDismissRequestedRef.current = false
    closeWorkoutSheet()
  }

  function handlePickerClose() {
    setPickerVisible(false)
    if (activeWorkoutIdRef.current && isWorkoutSheetOpenRef.current) {
      setTimeout(() => {
        sheetRef.current?.present()
      }, 100)
    }
  }

  function handleScroll(event: NativeSyntheticEvent<NativeScrollEvent>) {
    scrollOffsetRef.current = event.nativeEvent.contentOffset.y
  }

  function handleScrollLayout(event: LayoutChangeEvent) {
    scrollHeightRef.current = event.nativeEvent.layout.height
  }

  function handleFooterLayout(event: LayoutChangeEvent) {
    const nextHeight = event.nativeEvent.layout.height
    footerHeightRef.current = nextHeight
    setFooterHeight(nextHeight)
  }

  function handleSetRowLayout(key: string, event: LayoutChangeEvent) {
    setLayoutRef.current[key] = {
      y: event.nativeEvent.layout.y,
      height: event.nativeEvent.layout.height,
    }
  }

  const scrollSetIntoView = useCallback((key: string, delay?: number) => {
    setTimeout(() => {
      const layout = setLayoutRef.current[key]
      const viewportHeight = scrollHeightRef.current
      if (!layout || viewportHeight <= 0) return

      const currentOffset = scrollOffsetRef.current
      const safeBottom = Math.max(
        footerHeightRef.current + theme.spacing.sm,
        keyboardHeightRef.current + theme.spacing.sm,
      )
      const visibleTop = currentOffset + theme.spacing.sm
      const visibleBottom = currentOffset + viewportHeight - safeBottom
      const rowTop = layout.y
      const rowBottom = layout.y + layout.height

      if (rowBottom > visibleBottom) {
        scrollRef.current?.scrollTo({
          y: Math.max(0, rowBottom - viewportHeight + safeBottom + theme.spacing.sm),
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
    }, delay ?? (keyboardHeightRef.current > 0 ? 80 : 30))
  }, [theme.spacing.sm])

  const scrollInputToKeyboard = useCallback((target: number | null, delay = 0) => {
    if (!target) return
    setTimeout(() => {
      const responder = scrollRef.current?.getScrollResponder()
      responder?.scrollResponderScrollNativeHandleToKeyboard(
        target,
        footerHeightRef.current + theme.spacing.sm,
        true,
      )
    }, delay)
  }, [theme.spacing.sm])

  function handleSetInputFocus(
    key: string,
    event: NativeFocusTargetEvent,
  ) {
    const target = event.nativeEvent.target
    focusedSetKeyRef.current = key
    focusedInputTargetRef.current = target
    scrollInputToKeyboard(target, 30)
    scrollInputToKeyboard(target, 180)
    if (keyboardHeightRef.current === 0) {
      scrollInputToKeyboard(target, 360)
      scrollSetIntoView(key, 360)
    }
  }

  useEffect(() => {
    const showSub = Keyboard.addListener('keyboardDidShow', (event) => {
      keyboardHeightRef.current = event.endCoordinates.height
      setKeyboardHeight(event.endCoordinates.height)
      const focusedTarget = focusedInputTargetRef.current
      if (focusedTarget) {
        scrollInputToKeyboard(focusedTarget, 40)
        scrollInputToKeyboard(focusedTarget, 180)
      }
      const focusedKey = focusedSetKeyRef.current
      if (focusedKey) {
        scrollSetIntoView(focusedKey, 80)
        scrollSetIntoView(focusedKey, 220)
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
  }, [scrollInputToKeyboard, scrollSetIntoView])

  function saveWorkoutName() {
    if (!activeWorkoutId) return
    updateWorkoutName(activeWorkoutId, workoutName).catch((e) => {
      console.error('Could not rename workout', e)
    })
  }

  function addLocalSet(weId: string) {
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
    const currentSet = localSets[weId]?.find((s) => s.id === setId)
    if (currentSet?.persistedSetId) {
      try {
        await deleteCompletedSet(currentSet.persistedSetId)
      } catch (e) {
        console.error('Could not delete completed set', e)
      }
    }

    if (restSetKey === getRestSetKey(weId, setId)) {
      clearRest()
      setRestSetKey(null)
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
    const errorKey = getFieldErrorKey(weId, setId, field)
    setLocalSets((prev) => ({
      ...prev,
      [weId]: (prev[weId] ?? []).map((s) =>
        s.id !== setId
          ? s
          : field === 'weight'
            ? {
                ...s,
                weightInput: value,
                weightInputUnit: weightUnit,
                weightKg: toKgInput(value, weightUnit),
              }
            : { ...s, reps: value },
      ),
    }))
    setValidationErrors((prev) => {
      if (!prev[errorKey]) return prev
      const isValid = field === 'weight'
        ? (parseWeightInput(toKgInput(value, weightUnit)) ?? 0) > 0
        : parseRepsInput(value) > 0
      if (!isValid) return prev
      const next = { ...prev }
      delete next[errorKey]
      return next
    })
    setValidationNotice(null)
  }

  function showWeightUnitPicker(weId: string, currentUnit: string) {
    setDialog({
      title: 'Weight Unit',
      message: 'Change the unit for this exercise only.',
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
    const currentSet = localSets[weId]?.find((s) => s.id === setId)
    if (!currentSet) return

    if (currentSet.completed) {
      if (currentSet.persistedSetId) {
        try {
          await deleteCompletedSet(currentSet.persistedSetId)
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
        showWorkoutNotification(elapsed).catch(console.error)
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
      showWorkoutNotification(elapsed, restSeconds).catch(console.error)
    } catch (e) {
      console.error('Could not complete set', e)
      showErrorDialog('Could not save this set.')
    }
  }

  async function handleDeleteExercise(weId: string) {
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
  }

  function renderDeleteAction(onPress: () => void) {
    return (
      <TouchableOpacity style={styles.deleteAction} onPress={onPress}>
        <MaterialCommunityIcons name="trash-can-outline" size={22} color="#fff" />
      </TouchableOpacity>
    )
  }

  if (!activeWorkoutId) return null

  return (
    <>
      <BottomSheetModal
        ref={sheetRef}
        snapPoints={['100%']}
        enablePanDownToClose={false}
        enableDynamicSizing={false}
        keyboardBehavior="interactive"
        keyboardBlurBehavior="restore"
        android_keyboardInputMode="adjustResize"
        onDismiss={handleSheetDismiss}
        backgroundStyle={styles.background}
        handleIndicatorStyle={styles.handleIndicator}
        topInset={insets.top}
      >
        <View style={styles.root}>
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
          <BottomSheetScrollView
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
                <View key={ex.workoutExerciseId} style={styles.exerciseCard}>
                  {/* Exercise header row — swipe left to delete whole exercise */}
                  <ReanimatedSwipeable
                    renderRightActions={() => renderDeleteAction(() => handleDeleteExercise(ex.workoutExerciseId))}
                    overshootRight={false}
                  >
                    <View style={styles.exerciseHeader}>
                      <Text style={styles.exerciseName}>
                        {ex.exerciseTypeName}
                        {showMethod ? (
                          <Text style={styles.exerciseMethod}>{' - '}{ex.methodName}</Text>
                        ) : null}
                      </Text>
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
                        <ReanimatedSwipeable
                          renderRightActions={() => renderDeleteAction(() => removeLocalSet(ex.workoutExerciseId, s.id))}
                          childrenContainerStyle={styles.swipeableSetContent}
                          dragOffsetFromRightEdge={3}
                          overshootRight={false}
                        >
                          <View
                            style={[styles.setRow, s.completed && styles.setRowCompleted]}
                            onLayout={(event) => handleSetRowLayout(setLayoutKey, event)}
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
                              <BottomSheetTextInput
                                style={styles.input}
                                value={getDisplayWeight(s, ex.weightUnit)}
                                onChangeText={(v) => updateSetField(ex.workoutExerciseId, s.id, 'weight', v)}
                                keyboardType="decimal-pad"
                                placeholder="0"
                                placeholderTextColor={theme.colors.textMuted}
                                returnKeyType="done"
                                onFocus={(event) => handleSetInputFocus(setLayoutKey, event)}
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
                              <BottomSheetTextInput
                                style={styles.input}
                                value={s.reps}
                                onChangeText={(v) => updateSetField(ex.workoutExerciseId, s.id, 'reps', v)}
                                keyboardType="number-pad"
                                placeholder="0"
                                placeholderTextColor={theme.colors.textMuted}
                                returnKeyType="done"
                                onFocus={(event) => handleSetInputFocus(setLayoutKey, event)}
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
                </View>
              )
            })}

            {/* Add Exercise button — below exercises */}
            <TouchableOpacity
              style={styles.addExerciseBtn}
              onPress={() => setPickerVisible(true)}
            >
              <MaterialCommunityIcons name="plus" size={20} color={theme.colors.accent} />
              <Text style={styles.addExerciseText}>Add Exercise</Text>
            </TouchableOpacity>
          </BottomSheetScrollView>

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
            <TouchableOpacity style={styles.endButton} onPress={handleEndWorkout}>
              <Text style={styles.endButtonText}>End Workout</Text>
            </TouchableOpacity>
          </View>
        </View>
      </BottomSheetModal>

      <ExercisePickerModal visible={pickerVisible} onClose={handlePickerClose} />
      <ThemedDialog
        visible={!!dialog}
        title={dialog?.title ?? ''}
        message={dialog?.message}
        actions={dialog?.actions ?? []}
      />
    </>
  )
}

const stylesheet = createStyleSheet((theme) => ({
  background: {
    backgroundColor: theme.colors.bg,
  },
  handleIndicator: {
    backgroundColor: theme.colors.border,
    width: 36,
  },
  root: {
    flex: 1,
    minHeight: 0,
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
    fontWeight: '700',
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
    borderRadius: 4,
    backgroundColor: theme.colors.accent,
  },
  timerText: {
    color: theme.colors.accent,
    fontSize: theme.fontSize.sm,
    fontWeight: '700',
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
    fontWeight: '600',
  },
  // ── Scroll area ──────────────────────────────────────────
  scroll: {
    flex: 1,
    minHeight: 0,
  },
  scrollContent: {
    paddingHorizontal: theme.spacing.sm,
    paddingTop: theme.spacing.sm,
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
    gap: 2,
  },
  workoutNameLabel: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xxs,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  workoutNameInput: {
    color: theme.colors.text,
    fontSize: theme.fontSize.lg,
    fontWeight: '800',
    minHeight: 34,
    padding: 0,
  },
  // ── Exercise card ────────────────────────────────────────
  exerciseCard: {
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
    overflow: 'hidden',
  },
  exerciseHeader: {
    backgroundColor: theme.colors.surface,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
  },
  exerciseName: {
    color: theme.colors.text,
    fontSize: theme.fontSize.sm,
    fontWeight: '700',
  },
  exerciseMethod: {
    color: theme.colors.textMuted,
    fontWeight: '400',
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
    fontWeight: '600',
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
    fontWeight: '600',
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
    fontWeight: '800',
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
    fontWeight: '600',
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
    fontWeight: '600',
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
    fontWeight: '700',
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
    fontWeight: '600',
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
    paddingVertical: theme.spacing.sm,
    borderWidth: 1.5,
    borderColor: theme.colors.accent,
  },
  addExerciseText: {
    color: theme.colors.accent,
    fontSize: theme.fontSize.md,
    fontWeight: '600',
  },
  // ── Footer ───────────────────────────────────────────────
  footer: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    gap: theme.spacing.sm,
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
    fontWeight: '600',
  },
  endButton: {
    backgroundColor: theme.colors.danger,
    borderRadius: theme.radius.md,
    paddingVertical: theme.spacing.md,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  endButtonText: {
    color: '#FFFFFF',
    fontSize: theme.fontSize.md,
    fontWeight: '700',
  },
}))
