import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  Dimensions,
  findNodeHandle,
  Keyboard,
  Modal,
  ScrollView,
  StatusBar,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons'
import { createStyleSheet, useStyles } from 'react-native-unistyles'
import ThemedDialog from '@/components/ui/ThemedDialog'
import {
  deleteWorkout,
  getWorkoutDetail,
  updateCompletedWorkout,
  updateWorkoutName,
  type CompletedWorkoutSetUpdate,
  type WorkoutDetail,
  type WorkoutSummary,
} from '@/db/workoutHelpers'

const LB_PER_KG = 2.20462
const PR_GOLD = '#D9A441'

function formatDuration(startedAt: number, endedAt: number) {
  const minutes = Math.max(1, Math.round((endedAt - startedAt) / 60000))
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  if (hours > 0) return `${hours}h ${mins}m`
  return `${minutes}m`
}

function formatCompactNumber(value: number) {
  return Number.parseFloat(value.toFixed(2)).toString()
}

function roundWeightKg(value: number) {
  return Number.parseFloat(value.toFixed(6))
}

function formatSetWeight(weightKg: number, unit: string) {
  if (unit === 'lb') {
    return `${formatCompactNumber(weightKg * LB_PER_KG)} lb`
  }
  return `${formatCompactNumber(weightKg)} kg`
}

function formatDateInput(timestamp: number) {
  const date = new Date(timestamp)
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

function parseDateInput(value: string, originalTimestamp: number): number | null {
  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return null

  const original = new Date(originalTimestamp)
  const year = Number(match[1])
  const month = Number(match[2]) - 1
  const day = Number(match[3])
  const next = new Date(
    year,
    month,
    day,
    original.getHours(),
    original.getMinutes(),
    original.getSeconds(),
    original.getMilliseconds(),
  )

  if (
    next.getFullYear() !== year ||
    next.getMonth() !== month ||
    next.getDate() !== day
  ) {
    return null
  }

  return next.getTime()
}

function displayWeightValue(weightKg: number, unit: string) {
  return unit === 'lb'
    ? formatCompactNumber(weightKg * LB_PER_KG)
    : formatCompactNumber(weightKg)
}

function weightInputToKg(value: string, unit: string) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return null
  return roundWeightKg(unit === 'lb' ? parsed / LB_PER_KG : parsed)
}

type EditableSet = {
  id: string
  weightText: string
  weightUnit: string
  weightKg: number | null
  repsText: string
}

function buildEditableSets(workout: WorkoutDetail | null): Record<string, EditableSet> {
  const sets: Record<string, EditableSet> = {}
  workout?.exercises.forEach((exercise) => {
    exercise.sets.forEach((set) => {
      sets[set.id] = {
        id: set.id,
        weightText: displayWeightValue(set.weightKg, set.weightUnit),
        weightUnit: set.weightUnit === 'lb' ? 'lb' : 'kg',
        weightKg: set.weightKg,
        repsText: `${set.reps}`,
      }
    })
  })
  return sets
}

function getExerciseEditUnit(
  exercise: WorkoutDetail['exercises'][number],
  editableSets: Record<string, EditableSet>,
) {
  const firstSet = exercise.sets[0]
  if (!firstSet) return 'kg'
  return editableSets[firstSet.id]?.weightUnit ?? firstSet.weightUnit
}

function getExerciseSetSummaries(exercise: WorkoutDetail['exercises'][number]) {
  if (exercise.sets.length === 0) {
    return [{
      key: 'empty',
      label: 'No sets',
      hasWeightPr: false,
      hasCurrentWeightPr: false,
    }]
  }

  const groupedSets = exercise.sets.reduce<
    Array<{
      key: string
      weight: string
      reps: number
      count: number
      hasWeightPr: boolean
      hasCurrentWeightPr: boolean
    }>
  >((groups, set) => {
    const weight = formatSetWeight(set.weightKg, set.weightUnit)
    const key = `${weight}-${set.reps}`
    const existingGroup = groups.find((group) => group.key === key)

    if (existingGroup) {
      existingGroup.count += 1
      existingGroup.hasWeightPr = existingGroup.hasWeightPr || Boolean(set.isWeightPr)
      existingGroup.hasCurrentWeightPr =
        existingGroup.hasCurrentWeightPr || Boolean(set.isCurrentWeightPr)
    } else {
      groups.push({
        key,
        weight,
        reps: set.reps,
        count: 1,
        hasWeightPr: Boolean(set.isWeightPr),
        hasCurrentWeightPr: Boolean(set.isCurrentWeightPr),
      })
    }

    return groups
  }, [])

  return groupedSets.map((group) => {
    const setLabel = group.count === 1 ? '1 set' : `${group.count} sets`
    return {
      key: group.key,
      label: `${setLabel} of ${group.weight} x ${group.reps}`,
      hasWeightPr: group.hasWeightPr,
      hasCurrentWeightPr: group.hasCurrentWeightPr,
    }
  })
}

export function WorkoutSummaryCard({
  workout,
  title,
  expanded,
  preview,
  previewLoading,
  onOpen,
  onToggle,
}: {
  workout: WorkoutSummary
  title?: string
  expanded: boolean
  preview: WorkoutDetail | null | undefined
  previewLoading: boolean
  onOpen: () => void
  onToggle: () => void
}) {
  const { styles, theme } = useStyles(stylesheet)
  const hasCurrentPr = (workout.currentWeightPrCount ?? 0) > 0
  const prColor = hasCurrentPr ? PR_GOLD : theme.colors.accent

  return (
    <View style={styles.workoutCard}>
      <View style={styles.workoutCardHeader}>
        <TouchableOpacity
          style={styles.workoutCardBody}
          onPress={onOpen}
          activeOpacity={0.75}
        >
          <Text style={styles.workoutTitle}>
            {title ?? workout.name ?? 'Workout'}
          </Text>
          <Text style={styles.workoutMeta}>
            {formatDuration(workout.startedAt, workout.endedAt)} - {workout.exerciseCount} exercises - {workout.setCount} sets
          </Text>
          {workout.weightPrCount > 0 ? (
            <View style={[styles.prBadge, hasCurrentPr && styles.currentPrBadge]}>
              <MaterialCommunityIcons name="trophy-outline" size={13} color={prColor} />
              <Text style={[styles.prBadgeText, hasCurrentPr && styles.currentPrBadgeText]}>
                {workout.weightPrCount} PR
              </Text>
            </View>
          ) : null}
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.expandButton}
          onPress={onToggle}
          activeOpacity={0.75}
        >
          <MaterialCommunityIcons
            name={expanded ? 'chevron-up' : 'chevron-down'}
            size={22}
            color={theme.colors.textMuted}
          />
        </TouchableOpacity>
      </View>
      {expanded ? (
        <WorkoutQuickPreview
          workout={preview}
          loading={previewLoading}
        />
      ) : null}
    </View>
  )
}

function WorkoutQuickPreview({
  workout,
  loading,
}: {
  workout: WorkoutDetail | null | undefined
  loading: boolean
}) {
  const { styles } = useStyles(stylesheet)

  if (loading) {
    return (
      <View style={styles.quickPreview}>
        <Text style={styles.quickPreviewText}>Loading exercises...</Text>
      </View>
    )
  }

  if (!workout) {
    return (
      <View style={styles.quickPreview}>
        <Text style={styles.quickPreviewText}>Exercises unavailable.</Text>
      </View>
    )
  }

  return (
    <View style={styles.quickPreview}>
      {workout.exercises.length === 0 ? (
        <Text style={styles.quickPreviewText}>No exercises saved.</Text>
      ) : (
        workout.exercises.map((exercise) => (
          <View key={exercise.id} style={styles.quickExerciseRow}>
            <Text style={styles.quickExerciseName} numberOfLines={1}>
              {exercise.exerciseName}
              {exercise.methodName ? (
                <Text style={styles.quickExerciseMethod}> - {exercise.methodName}</Text>
              ) : null}
            </Text>
            <View style={styles.quickExerciseRightBlock}>
              <View style={styles.quickSetList}>
                {getExerciseSetSummaries(exercise).map((summary) => (
                  <View key={summary.key} style={styles.quickSetRow}>
                    <Text style={styles.quickExerciseSets} numberOfLines={1}>
                      {summary.label}
                    </Text>
                    <View style={styles.quickPrDotSlot}>
                    {summary.hasWeightPr ? (
                      <View
                        style={[
                          styles.quickPrDot,
                          summary.hasCurrentWeightPr && styles.quickCurrentPrDot,
                        ]}
                      />
                    ) : null}
                    </View>
                  </View>
                ))}
              </View>
            </View>
          </View>
        ))
      )}
    </View>
  )
}

export function WorkoutDetailModal({
  workoutId,
  workout,
  loading,
  onClose,
  onDeleted,
  onRename,
  onUpdated,
}: {
  workoutId: string | null
  workout: WorkoutDetail | null
  loading: boolean
  onClose: () => void
  onDeleted?: (workoutId: string) => void
  onRename?: (workoutId: string, name: string) => void
  onUpdated?: (workoutId: string, workout: WorkoutDetail) => void
}) {
  const { styles, theme } = useStyles(stylesheet)
  const [name, setName] = useState('')
  const [dateText, setDateText] = useState('')
  const [editableSets, setEditableSets] = useState<Record<string, EditableSet>>({})
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [keyboardHeight, setKeyboardHeight] = useState(0)
  const [showDefaultUnits, setShowDefaultUnits] = useState<Record<string, boolean>>({})
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)
  const scrollRef = useRef<ScrollView | null>(null)
  const scrollOffsetRef = useRef(0)
  const keyboardHeightRef = useRef(0)
  const keyboardTopRef = useRef(Dimensions.get('window').height)
  const focusedEditFieldRef = useRef<string | null>(null)
  const editFieldInputRef = useRef<Record<string, TextInput | null>>({})

  useEffect(() => {
    setName(workout?.name || '')
    setDateText(workout ? formatDateInput(workout.startedAt) : '')
    setEditableSets(buildEditableSets(workout))
    setEditing(false)
    setSaving(false)
    setEditError(null)
    setShowDefaultUnits({})
  }, [workout])

  const scrollEditFieldIntoView = useCallback((key: string, delay = 40) => {
    setTimeout(() => {
      const input = editFieldInputRef.current[key]
      const scrollView = scrollRef.current
      if (!input || !scrollView) return
      const metrics = Keyboard.metrics()
      if (metrics?.height && metrics.height !== keyboardHeightRef.current) {
        keyboardHeightRef.current = metrics.height
        keyboardTopRef.current = metrics.screenY
        setKeyboardHeight(metrics.height)
      }

      const nodeHandle = findNodeHandle(input)
      const keyboardResponder = scrollView.getScrollResponder() as unknown as {
        scrollResponderScrollNativeHandleToKeyboard?: (
          nodeHandle: number,
          additionalOffset?: number,
          preventNegativeScrollOffset?: boolean,
        ) => void
      }
      if (nodeHandle) {
        keyboardResponder.scrollResponderScrollNativeHandleToKeyboard?.(
          nodeHandle,
          theme.spacing.lg,
          true,
        )
      }

      const measurableScrollView = scrollView as unknown as {
        measureInWindow: (
          callback: (
            x: number,
            y: number,
            width: number,
            height: number,
          ) => void,
        ) => void
      }

      measurableScrollView.measureInWindow((_scrollX, scrollY, _scrollWidth, scrollHeight) => {
        input.measureInWindow((_inputX, inputY, _inputWidth, inputHeight) => {
          const windowHeight = Dimensions.get('window').height
          const liveMetrics = Keyboard.metrics()
          const knownKeyboardHeight = liveMetrics?.height ?? keyboardHeightRef.current
          const measuredKeyboardTop = liveMetrics?.screenY ?? keyboardTopRef.current
          const keyboardTop = knownKeyboardHeight > 0
            ? measuredKeyboardTop || windowHeight - knownKeyboardHeight
            : windowHeight
          const visibleTop = scrollY + theme.spacing.sm
          const visibleBottom = Math.min(
            scrollY + scrollHeight,
            keyboardTop,
          ) - theme.spacing.lg
          const inputTop = inputY
          const inputBottom = inputY + inputHeight

          if (inputBottom > visibleBottom) {
            scrollView.scrollTo({
              y: Math.max(0, scrollOffsetRef.current + inputBottom - visibleBottom),
              animated: true,
            })
            return
          }

          if (inputTop < visibleTop) {
            scrollView.scrollTo({
              y: Math.max(0, scrollOffsetRef.current - (visibleTop - inputTop)),
              animated: true,
            })
          }
        })
      })
    }, delay)
  }, [theme.spacing.lg, theme.spacing.sm])

  function handleEditFieldFocus(key: string) {
    focusedEditFieldRef.current = key
    scrollEditFieldIntoView(key, 80)
    scrollEditFieldIntoView(key, 240)
    scrollEditFieldIntoView(key, 420)
  }

  function handleDetailScroll(event: NativeSyntheticEvent<NativeScrollEvent>) {
    scrollOffsetRef.current = event.nativeEvent.contentOffset.y
  }

  useEffect(() => {
    const showSub = Keyboard.addListener('keyboardDidShow', (event) => {
      keyboardHeightRef.current = event.endCoordinates.height
      keyboardTopRef.current = event.endCoordinates.screenY
      setKeyboardHeight(event.endCoordinates.height)
      const focusedKey = focusedEditFieldRef.current
      if (focusedKey) {
        scrollEditFieldIntoView(focusedKey, 60)
      }
    })
    const hideSub = Keyboard.addListener('keyboardDidHide', () => {
      keyboardHeightRef.current = 0
      keyboardTopRef.current = Dimensions.get('window').height
      setKeyboardHeight(0)
    })
    return () => {
      showSub.remove()
      hideSub.remove()
    }
  }, [scrollEditFieldIntoView])

  if (!workoutId) return null
  const detailWorkoutId = workoutId

  function saveName() {
    if (!workout || !onRename || editing) return
    updateWorkoutName(detailWorkoutId, name)
      .then(() => onRename(detailWorkoutId, name))
      .catch((e) => console.error('Failed to rename workout', e))
  }

  function resetEdits() {
    setName(workout?.name || '')
    setDateText(workout ? formatDateInput(workout.startedAt) : '')
    setEditableSets(buildEditableSets(workout))
    setEditError(null)
    setEditing(false)
  }

  function updateEditableSet(setId: string, patch: Partial<EditableSet>) {
    setEditableSets((prev) => ({
      ...prev,
      [setId]: {
        ...prev[setId],
        ...patch,
      },
    }))
  }

  function toggleEditableExerciseUnit(exercise: WorkoutDetail['exercises'][number]) {
    setEditableSets((prev) => {
      const currentUnit = getExerciseEditUnit(exercise, prev)
      const nextUnit = currentUnit === 'lb' ? 'kg' : 'lb'
      const next = { ...prev }

      for (const set of exercise.sets) {
        const current = next[set.id]
        if (!current) continue
        const currentWeightKg = current.weightKg ??
          weightInputToKg(current.weightText, current.weightUnit)
        next[set.id] = {
          ...current,
          weightUnit: nextUnit,
          weightText: currentWeightKg === null
            ? current.weightText
            : displayWeightValue(currentWeightKg, nextUnit),
          weightKg: currentWeightKg,
        }
      }

      return next
    })
  }

  async function saveWorkoutEdits() {
    if (!workout || saving) return

    const startedAt = parseDateInput(dateText, workout.startedAt)
    if (startedAt === null) {
      setEditError('Use a valid date in YYYY-MM-DD format.')
      return
    }

    const setUpdates: CompletedWorkoutSetUpdate[] = []
    for (const exercise of workout.exercises) {
      for (const set of exercise.sets) {
        const editSet = editableSets[set.id]
        if (!editSet) continue
        const weightKg = editSet.weightKg ??
          weightInputToKg(editSet.weightText, editSet.weightUnit)
        const reps = Number(editSet.repsText)
        if (weightKg === null || weightKg <= 0) {
          setEditError('Every set needs a weight greater than 0.')
          return
        }
        if (!Number.isInteger(reps) || reps <= 0) {
          setEditError('Every set needs whole-number reps greater than 0.')
          return
        }
        setUpdates.push({
          id: set.id,
          weightKg,
          weightUnit: editSet.weightUnit === 'lb' ? 'lb' : 'kg',
          reps,
        })
      }
    }

    setSaving(true)
    setEditError(null)
    try {
      await updateCompletedWorkout({
        workoutId: detailWorkoutId,
        name,
        startedAt,
        sets: setUpdates,
      })
      const updated = await getWorkoutDetail(detailWorkoutId)
      if (updated) {
        onUpdated?.(detailWorkoutId, updated)
      }
      setEditing(false)
    } catch (e) {
      console.error('Failed to update workout', e)
      setEditError('Could not save workout changes.')
    } finally {
      setSaving(false)
    }
  }

  function confirmDelete() {
    if (deleting) return
    setDeleting(true)
    deleteWorkout(detailWorkoutId)
      .then(() => {
        setShowDeleteDialog(false)
        onDeleted?.(detailWorkoutId)
      })
      .catch((e) => console.error('Failed to delete workout', e))
      .finally(() => setDeleting(false))
  }

  return (
    <Modal
      visible
      animationType="slide"
      onRequestClose={onClose}
      backdropColor={theme.colors.bg}
      statusBarTranslucent
      navigationBarTranslucent
    >
      <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />
      <SafeAreaView style={styles.detailRoot} edges={['top', 'bottom']}>
        <View style={styles.detailHeader}>
          <TouchableOpacity style={styles.viewButton} onPress={onClose}>
            <MaterialCommunityIcons name="chevron-left" size={17} color={theme.colors.text} />
            <Text style={styles.viewButtonText}>Back</Text>
          </TouchableOpacity>
          <View style={styles.headerActionRow}>
            {editing ? (
              <>
                <TouchableOpacity
                  style={styles.viewButton}
                  onPress={resetEdits}
                  disabled={saving}
                >
                  <Text style={styles.viewButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.saveEditButton}
                  onPress={saveWorkoutEdits}
                  disabled={saving}
                >
                  <MaterialCommunityIcons name="check" size={17} color="#FFFFFF" />
                  <Text style={styles.saveEditButtonText}>
                    {saving ? 'Saving' : 'Save'}
                  </Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <TouchableOpacity
                  style={styles.viewButton}
                  onPress={() => setEditing(true)}
                  disabled={loading || !workout}
                >
                  <MaterialCommunityIcons name="pencil-outline" size={17} color={theme.colors.text} />
                  <Text style={styles.viewButtonText}>Edit</Text>
                </TouchableOpacity>
                {onDeleted ? (
                  <TouchableOpacity
                    style={styles.deleteButton}
                    onPress={() => setShowDeleteDialog(true)}
                    disabled={loading || deleting}
                  >
                    <MaterialCommunityIcons name="trash-can-outline" size={17} color={theme.colors.danger} />
                    <Text style={styles.deleteButtonText}>Delete</Text>
                  </TouchableOpacity>
                ) : null}
              </>
            )}
          </View>
        </View>

        {loading || !workout ? (
          <View style={styles.detailLoading}>
            <Text style={styles.emptyText}>Loading workout...</Text>
          </View>
        ) : (
          <ScrollView
            ref={scrollRef}
            style={styles.detailScroll}
            contentContainerStyle={[
              styles.detailContent,
              keyboardHeight > 0 && {
                paddingBottom: keyboardHeight + theme.spacing.lg,
              },
            ]}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            onScroll={handleDetailScroll}
            scrollEventThrottle={16}
          >
            {onRename ? (
              <View style={styles.renameCard}>
                <Text style={styles.renameLabel}>Workout Name</Text>
                <TextInput
                  ref={(ref) => {
                    editFieldInputRef.current.name = ref
                  }}
                  style={styles.renameInput}
                  value={name}
                  onChangeText={setName}
                  onBlur={saveName}
                  onFocus={() => handleEditFieldFocus('name')}
                  onSubmitEditing={saveName}
                  placeholder="Workout"
                  placeholderTextColor={theme.colors.textMuted}
                  returnKeyType="done"
                  editable={editing}
                />
              </View>
            ) : (
              <View style={styles.renameCard}>
                <Text style={styles.renameLabel}>Workout Name</Text>
                <Text style={styles.detailName}>{workout.name || 'Workout'}</Text>
              </View>
            )}

            {editing ? (
              <View style={styles.renameCard}>
                <Text style={styles.renameLabel}>Workout Date</Text>
                <TextInput
                  ref={(ref) => {
                    editFieldInputRef.current.date = ref
                  }}
                  style={styles.renameInput}
                  value={dateText}
                  onChangeText={setDateText}
                  onFocus={() => handleEditFieldFocus('date')}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={theme.colors.textMuted}
                  returnKeyType="done"
                />
              </View>
            ) : null}

            {editError ? (
              <View style={styles.editErrorCard}>
                <MaterialCommunityIcons name="alert-circle-outline" size={17} color={theme.colors.danger} />
                <Text style={styles.editErrorText}>{editError}</Text>
              </View>
            ) : null}

            <Text style={styles.dateTitle}>
              {new Date(workout.startedAt).toLocaleDateString([], {
                weekday: 'long',
                month: 'long',
                day: 'numeric',
              })}
            </Text>
            <Text style={styles.detailMeta}>
              {new Date(workout.startedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} - {formatDuration(workout.startedAt, workout.endedAt)}
            </Text>

            <View style={styles.summaryRow}>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryValue}>{workout.exerciseCount}</Text>
                <Text style={styles.summaryLabel}>Exercises</Text>
              </View>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryValue}>{workout.setCount}</Text>
                <Text style={styles.summaryLabel}>Sets</Text>
              </View>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryValue}>{Math.round(workout.volume)}</Text>
                <Text style={styles.summaryLabel}>kg volume</Text>
              </View>
            </View>

            {workout.exercises.map((exercise) => {
              const hasUnitMismatch = exercise.sets.some(
                (set) => set.weightUnit !== exercise.defaultWeightUnit,
              )
              const editUnit = getExerciseEditUnit(exercise, editableSets)
              const displayUnit = showDefaultUnits[exercise.id]
                ? exercise.defaultWeightUnit
                : null

              return (
                <View key={exercise.id} style={styles.exerciseCard}>
                  <View style={styles.exerciseTitleRow}>
                    <View style={styles.exerciseTitleBlock}>
                      <Text style={styles.exerciseTitle}>
                        {exercise.exerciseName}
                        <Text style={styles.exerciseMethod}> - {exercise.methodName}</Text>
                      </Text>
                      {exercise.hasWeightPr ? (
                        <View style={styles.badgeRow}>
                          <View
                            style={[
                              styles.prBadge,
                              exercise.hasCurrentWeightPr && styles.currentPrBadge,
                            ]}
                          >
                            <MaterialCommunityIcons
                              name="trophy-outline"
                              size={13}
                              color={exercise.hasCurrentWeightPr ? PR_GOLD : theme.colors.accent}
                            />
                            <Text
                              style={[
                                styles.prBadgeText,
                                exercise.hasCurrentWeightPr && styles.currentPrBadgeText,
                              ]}
                            >
                              {exercise.hasCurrentWeightPr ? 'Current PR' : 'PR'}
                            </Text>
                          </View>
                        </View>
                      ) : null}
                    </View>
                    {hasUnitMismatch ? (
                      <TouchableOpacity
                        style={styles.unitToggleButton}
                        onPress={() =>
                          setShowDefaultUnits((prev) => ({
                            ...prev,
                            [exercise.id]: !prev[exercise.id],
                          }))
                        }
                      >
                        <Text style={styles.unitToggleText}>
                          {showDefaultUnits[exercise.id]
                            ? 'Show Original'
                            : `Show ${exercise.defaultWeightUnit}`}
                        </Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                  {exercise.sets.length === 0 ? (
                    <Text style={styles.emptySetText}>No completed sets</Text>
                  ) : (
                    <View style={styles.setTable}>
                      <View style={styles.setTableHeader}>
                        <Text style={[styles.setHeaderText, styles.setIndexCol]}>Set</Text>
                        <Text style={[styles.setHeaderText, styles.setWeightCol]}>Weight</Text>
                        <Text style={[styles.setHeaderText, styles.setRepsCol]}>Reps</Text>
                        <Text style={[styles.setHeaderText, styles.setVolumeCol]}>Volume</Text>
                      </View>
                      {exercise.sets.map((set, index) => {
                        const editSet = editableSets[set.id]
                        return (
                          <View
                            key={set.id}
                            style={styles.setRow}
                          >
                            <Text style={[styles.setIndex, styles.setIndexCol]}>{index + 1}</Text>
                            {editing && editSet ? (
                              <>
                                <View style={[styles.editWeightGroup, styles.setWeightCol]}>
                                  <TextInput
                                    ref={(ref) => {
                                      editFieldInputRef.current[`${set.id}:weight`] = ref
                                    }}
                                    style={styles.editSetInput}
                                    value={editSet.weightText}
                                    onChangeText={(value) =>
                                      updateEditableSet(set.id, {
                                        weightText: value,
                                        weightKg: weightInputToKg(value, editSet.weightUnit),
                                      })
                                    }
                                    onFocus={() => handleEditFieldFocus(`${set.id}:weight`)}
                                    keyboardType="decimal-pad"
                                    selectTextOnFocus
                                  />
                                  <TouchableOpacity
                                    style={styles.editUnitButton}
                                    onPress={() => toggleEditableExerciseUnit(exercise)}
                                  >
                                    <Text style={styles.editUnitText}>{editUnit}</Text>
                                  </TouchableOpacity>
                                </View>
                                <TextInput
                                  ref={(ref) => {
                                    editFieldInputRef.current[`${set.id}:reps`] = ref
                                  }}
                                  style={[styles.editSetInput, styles.editRepsInput, styles.setRepsCol]}
                                  value={editSet.repsText}
                                  onChangeText={(value) =>
                                    updateEditableSet(set.id, {
                                      repsText: value.replace(/[^0-9]/g, ''),
                                    })
                                  }
                                  onFocus={() => handleEditFieldFocus(`${set.id}:reps`)}
                                  keyboardType="number-pad"
                                  selectTextOnFocus
                                />
                              </>
                            ) : (
                              <>
                                <View style={[styles.valueWithPrCol, styles.setWeightCol]}>
                                  <Text style={styles.setValue}>
                                    {formatSetWeight(set.weightKg, displayUnit ?? set.weightUnit)}
                                  </Text>
                                  {set.isWeightPr ? (
                                    <InlineWeightPrPill current={set.isCurrentWeightPr} />
                                  ) : null}
                                </View>
                                <Text style={[styles.setValue, styles.setRepsCol]}>{set.reps}</Text>
                              </>
                            )}
                            <Text style={[styles.setVolume, styles.setVolumeCol]}>
                              {Math.round(
                                editing && editSet
                                  ? (editSet.weightKg ?? weightInputToKg(editSet.weightText, editSet.weightUnit) ?? set.weightKg) *
                                    (Number(editSet.repsText) || set.reps)
                                  : set.volume,
                              )} kg
                            </Text>
                          </View>
                        )
                      })}
                    </View>
                  )}
                </View>
              )
            })}
          </ScrollView>
        )}
      </SafeAreaView>
      <ThemedDialog
        visible={showDeleteDialog}
        title="Delete Workout"
        message="Delete this saved workout? This cannot be undone."
        actions={[
          { label: 'Cancel', onPress: () => setShowDeleteDialog(false) },
          {
            label: deleting ? 'Deleting...' : 'Delete Workout',
            variant: 'danger',
            onPress: confirmDelete,
          },
        ]}
      />
    </Modal>
  )
}

function InlineWeightPrPill({ current }: { current: boolean }) {
  const { styles } = useStyles(stylesheet)
  return (
    <View
      style={[
        styles.inlinePrPill,
        current && styles.currentInlinePrPill,
      ]}
    >
      <Text
        style={[
          styles.inlinePrText,
          current && styles.currentInlinePrText,
        ]}
      >
        {current ? 'Current PR' : 'PR'}
      </Text>
    </View>
  )
}

const stylesheet = createStyleSheet((theme) => ({
  workoutCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    overflow: 'hidden',
  },
  workoutCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 12,
  },
  workoutCardBody: {
    flex: 1,
    minWidth: 0,
  },
  expandButton: {
    width: 32,
    height: 32,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.surface2,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  workoutTitle: {
    color: theme.colors.text,
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.bold,
  },
  workoutMeta: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
    marginTop: 2,
  },
  prBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: theme.colors.accentMuted,
    borderRadius: theme.radius.full,
    borderWidth: 1,
    borderColor: theme.colors.accent,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginTop: 4,
  },
  prBadgeText: {
    color: theme.colors.accent,
    fontSize: theme.fontSize.xs,
    fontFamily: theme.fontFamily.extraBold,
  },
  currentPrBadge: {
    backgroundColor: PR_GOLD + '26',
    borderColor: PR_GOLD,
  },
  currentPrBadgeText: {
    color: PR_GOLD,
  },
  quickPreview: {
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    paddingHorizontal: theme.spacing.sm,
    paddingTop: 0,
    paddingBottom: 1,
  },
  quickPreviewText: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
    fontFamily: theme.fontFamily.semiBold,
  },
  quickExerciseRow: {
    paddingVertical: 4,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: theme.spacing.xs,
  },
  quickExerciseName: {
    flex: 1,
    minWidth: 0,
    color: theme.colors.text,
    fontSize: theme.fontSize.xs,
    fontFamily: theme.fontFamily.bold,
  },
  quickExerciseMethod: {
    color: theme.colors.textMuted,
    fontFamily: theme.fontFamily.semiBold,
  },
  quickExerciseSets: {
    flexShrink: 1,
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xxs,
    fontFamily: theme.fontFamily.semiBold,
    textAlign: 'right',
  },
  quickSetList: {
    flexShrink: 1,
    gap: 1,
  },
  quickSetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 6,
  },
  quickPrDotSlot: {
    width: 8,
    alignItems: 'flex-end',
  },
  quickExerciseRightBlock: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'flex-end',
    flexShrink: 1,
    maxWidth: '58%',
    gap: theme.spacing.xs,
  },
  quickPrDot: {
    width: 6,
    height: 6,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.accent,
  },
  quickCurrentPrDot: {
    backgroundColor: PR_GOLD,
  },
  viewButton: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.full,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.md,
  },
  viewButtonText: {
    color: theme.colors.text,
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.bold,
  },
  detailRoot: {
    flex: 1,
    backgroundColor: theme.colors.bg,
  },
  detailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.md,
    paddingBottom: 4,
  },
  detailScroll: {
    flex: 1,
  },
  headerActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  saveEditButton: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: theme.colors.accent,
    borderRadius: theme.radius.full,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.28)',
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.md,
  },
  saveEditButtonText: {
    color: '#FFFFFF',
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.bold,
  },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    backgroundColor: theme.colors.danger + '18',
    borderRadius: theme.radius.full,
    borderWidth: 1,
    borderColor: theme.colors.danger + '40',
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.md,
  },
  deleteButtonText: {
    color: theme.colors.danger,
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.bold,
  },
  detailContent: {
    padding: theme.spacing.md,
    paddingBottom: theme.spacing.xl,
    gap: theme.spacing.sm,
  },
  detailLoading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing.xl,
  },
  renameCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
    gap: theme.spacing.xs,
  },
  renameLabel: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
    fontFamily: theme.fontFamily.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  renameInput: {
    color: theme.colors.text,
    fontSize: theme.fontSize.lg,
    fontFamily: theme.fontFamily.extraBold,
    minHeight: 34,
    padding: 0,
  },
  editErrorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    backgroundColor: theme.colors.danger + '18',
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.danger + '60',
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
  },
  editErrorText: {
    flex: 1,
    color: theme.colors.danger,
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.semiBold,
  },
  detailName: {
    color: theme.colors.text,
    fontSize: theme.fontSize.lg,
    fontFamily: theme.fontFamily.extraBold,
  },
  dateTitle: {
    color: theme.colors.text,
    fontSize: theme.fontSize.xl,
    fontFamily: theme.fontFamily.extraBold,
  },
  detailMeta: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.semiBold,
  },
  summaryRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  summaryItem: {
    flex: 1,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.sm,
  },
  summaryValue: {
    color: theme.colors.text,
    fontSize: theme.fontSize.md,
    fontFamily: theme.fontFamily.extraBold,
  },
  summaryLabel: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
    fontFamily: theme.fontFamily.semiBold,
    marginTop: 2,
  },
  exerciseCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    overflow: 'hidden',
  },
  exerciseTitle: {
    color: theme.colors.text,
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.extraBold,
  },
  exerciseTitleBlock: {
    flex: 1,
    minWidth: 0,
  },
  exerciseTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  unitToggleButton: {
    minHeight: 28,
    borderRadius: theme.radius.full,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.sm,
  },
  unitToggleText: {
    color: theme.colors.accent,
    fontSize: theme.fontSize.xs,
    fontFamily: theme.fontFamily.extraBold,
  },
  exerciseMethod: {
    color: theme.colors.textMuted,
    fontFamily: theme.fontFamily.medium,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
    alignItems: 'center',
    marginTop: 7,
  },
  emptyText: {
    color: theme.colors.textMuted,
    textAlign: 'center',
    paddingVertical: theme.spacing.xl,
    fontSize: theme.fontSize.sm,
  },
  emptySetText: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.sm,
    padding: theme.spacing.sm,
  },
  setTable: {
    width: '100%',
  },
  setTableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.bg,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  setHeaderText: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
    fontFamily: theme.fontFamily.extraBold,
    textTransform: 'uppercase',
  },
  setRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  setIndexCol: {
    width: 30,
  },
  setWeightCol: {
    flex: 1.45,
    minWidth: 96,
    paddingRight: theme.spacing.xs,
  },
  setRepsCol: {
    width: 74,
    paddingRight: theme.spacing.xs,
  },
  setVolumeCol: {
    width: 60,
    textAlign: 'right',
  },
  setIndex: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.bold,
  },
  setValue: {
    color: theme.colors.text,
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.bold,
  },
  setVolume: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.bold,
  },
  valueWithPrCol: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexWrap: 'nowrap',
  },
  editWeightGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  editSetInput: {
    minHeight: 34,
    flex: 1,
    color: theme.colors.text,
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.bold,
    backgroundColor: theme.colors.bg,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 0,
  },
  editRepsInput: {
    flex: 0,
    textAlign: 'center',
  },
  editUnitButton: {
    minHeight: 34,
    minWidth: 42,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.xs,
  },
  editUnitText: {
    color: theme.colors.accent,
    fontSize: theme.fontSize.xs,
    fontFamily: theme.fontFamily.extraBold,
    textTransform: 'uppercase',
  },
  inlinePrPill: {
    flexShrink: 0,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.accentMuted,
    borderWidth: 1,
    borderColor: theme.colors.accent,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  inlinePrText: {
    color: theme.colors.accent,
    fontSize: theme.fontSize.xxs,
    fontFamily: theme.fontFamily.extraBold,
  },
  currentInlinePrPill: {
    backgroundColor: PR_GOLD + '26',
    borderColor: PR_GOLD,
  },
  currentInlinePrText: {
    color: PR_GOLD,
  },
}))
