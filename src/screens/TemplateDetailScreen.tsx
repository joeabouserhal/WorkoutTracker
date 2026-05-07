import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, {
  runOnJS,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons'
import { createStyleSheet, useStyles } from 'react-native-unistyles'
import ScreenHeader, { ScreenHeaderButton, useHeaderFade } from '@/components/ui/ScreenHeader'
import ThemedDialog from '@/components/ui/ThemedDialog'
import ExercisePickerModal from '@/components/ExercisePickerModal'
import {
  addExerciseToWorkoutTemplate,
  createWorkoutFromTemplate,
  deleteWorkoutTemplate,
  getWorkoutTemplateDetail,
  replaceWorkoutTemplateExercises,
  removeExerciseFromWorkoutTemplate,
  setWorkoutTemplateFavorite,
  updateWorkoutTemplateExerciseSetCount,
  updateWorkoutTemplateName,
  type WorkoutTemplateDetail,
} from '@/db/workoutHelpers'
import { useSessionStore } from '@/store/sessionStore'
import type { HomeStackParamList } from '../navigation/TabNavigator'

type Props = NativeStackScreenProps<HomeStackParamList, 'TemplateDetail'>
type TemplateExercise = WorkoutTemplateDetail['exercises'][number]
type TemplateExercisePositions = Record<string, number>
const TEMPLATE_EXERCISE_ROW_HEIGHT = 56
const TEMPLATE_EXERCISE_ROW_GAP = 6
const TEMPLATE_EXERCISE_SLOT_HEIGHT = TEMPLATE_EXERCISE_ROW_HEIGHT + TEMPLATE_EXERCISE_ROW_GAP

function buildExercisePositions(exercises: TemplateExercise[]): TemplateExercisePositions {
  return exercises.reduce<TemplateExercisePositions>((positions, exercise, index) => {
    positions[exercise.id] = index
    return positions
  }, {})
}

function clampIndex(value: number, min: number, max: number) {
  'worklet'
  return Math.max(min, Math.min(max, value))
}

export default function TemplateDetailScreen({ navigation, route }: Props) {
  const { styles, theme } = useStyles(stylesheet)
  const { showHeaderFade, handleHeaderScroll } = useHeaderFade()
  const [template, setTemplate] = useState<WorkoutTemplateDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [editMode, setEditMode] = useState(Boolean(route.params.initialEdit))
  const [draftName, setDraftName] = useState('')
  const [message, setMessage] = useState('')
  const [pickerVisible, setPickerVisible] = useState(false)
  const [deleteVisible, setDeleteVisible] = useState(false)
  const [cancelVisible, setCancelVisible] = useState(false)
  const [editSnapshot, setEditSnapshot] = useState<WorkoutTemplateDetail | null>(null)
  const [draggingExerciseId, setDraggingExerciseId] = useState<string | null>(null)
  const templateRef = useRef<WorkoutTemplateDetail | null>(null)
  const activeWorkoutId = useSessionStore((s) => s.activeWorkoutId)
  const restoreWorkoutSession = useSessionStore((s) => s.restoreWorkoutSession)
  const templateId = route.params.templateId

  const loadTemplate = useCallback(async () => {
    setLoading(true)
    try {
      const detail = await getWorkoutTemplateDetail(templateId)
      setTemplate(detail)
      setDraftName(detail?.name ?? '')
    } catch (e) {
      console.error('Could not load template detail', e)
      setTemplate(null)
    } finally {
      setLoading(false)
    }
  }, [templateId])

  useFocusEffect(
    useCallback(() => {
      loadTemplate().catch(console.error)
    }, [loadTemplate]),
  )

  useEffect(() => {
    setEditMode(Boolean(route.params.initialEdit))
  }, [route.params.initialEdit, templateId])

  useEffect(() => {
    if (editMode && template && !editSnapshot) {
      setEditSnapshot({
        ...template,
        exercises: template.exercises.map((exercise) => ({ ...exercise })),
      })
    }
  }, [editMode, editSnapshot, template])

  useEffect(() => {
    templateRef.current = template
  }, [template])

  async function saveTemplate() {
    const trimmed = draftName.trim()
    if (!trimmed) {
      setMessage('Template name is required.')
      return
    }
    try {
      await updateWorkoutTemplateName(templateId, trimmed)
      setMessage('')
      await loadTemplate()
      setEditMode(false)
      setEditSnapshot(null)
      navigation.setParams({ initialEdit: false })
    } catch (e) {
      console.error('Could not save template', e)
      setMessage('Could not save this template.')
    }
  }

  async function cancelEdit() {
    try {
      setCancelVisible(false)
      if (editSnapshot) {
        await replaceWorkoutTemplateExercises(templateId, editSnapshot.exercises)
        setTemplate(editSnapshot)
        setDraftName(editSnapshot.name)
      } else {
        await loadTemplate()
      }
      setMessage('')
      setEditMode(false)
      setEditSnapshot(null)
      navigation.setParams({ initialEdit: false })
    } catch (e) {
      console.error('Could not cancel template edits', e)
      setMessage('Could not cancel these changes.')
    }
  }

  function exitEditMode() {
    setDraftName(template?.name ?? '')
    setMessage('')
    setEditMode(false)
    setEditSnapshot(null)
    navigation.setParams({ initialEdit: false })
  }

  async function toggleFavorite() {
    if (!template) return
    try {
      await setWorkoutTemplateFavorite(template.id, !template.isFavorite)
      setMessage('')
      await loadTemplate()
    } catch (e) {
      console.error('Could not update favorite template', e)
      setMessage('You can favorite up to 6 templates.')
    }
  }

  async function updateSetCount(templateExerciseId: string, setCount: number) {
    if (!template) return
    const currentExercise = template.exercises.find((exercise) => exercise.id === templateExerciseId)
    if (!currentExercise) return
    const safeSetCount = Math.max(1, Math.min(12, Math.trunc(setCount)))
    if (currentExercise.setCount === safeSetCount) return

    const setDelta = safeSetCount - currentExercise.setCount
    setTemplate({
      ...template,
      totalSetCount: Math.max(0, template.totalSetCount + setDelta),
      exercises: template.exercises.map((exercise) =>
        exercise.id === templateExerciseId ? { ...exercise, setCount: safeSetCount } : exercise,
      ),
    })

    try {
      await updateWorkoutTemplateExerciseSetCount(templateExerciseId, safeSetCount)
    } catch (e) {
      console.error('Could not update template set count', e)
      await loadTemplate()
    }
  }

  async function removeExercise(templateExerciseId: string) {
    if (!template) return
    const removedExercise = template.exercises.find((exercise) => exercise.id === templateExerciseId)
    if (!removedExercise) return

    const previousTemplate = template
    const nextExercises = template.exercises.filter((exercise) => exercise.id !== templateExerciseId)
    setTemplate({
      ...template,
      exerciseCount: nextExercises.length,
      totalSetCount: Math.max(0, template.totalSetCount - removedExercise.setCount),
      exercises: nextExercises,
    })
    setMessage('')

    try {
      await removeExerciseFromWorkoutTemplate(templateExerciseId)
    } catch (e) {
      console.error('Could not remove template exercise', e)
      setTemplate(previousTemplate)
      setMessage('Could not remove this exercise.')
    }
  }

  async function persistExerciseOrder(orderedExerciseIds: string[]) {
    const currentTemplate = templateRef.current
    if (!currentTemplate || orderedExerciseIds.length !== currentTemplate.exercises.length) return

    const previousTemplate = currentTemplate
    const exerciseById = new Map(currentTemplate.exercises.map((exercise) => [exercise.id, exercise]))
    const orderedExercises = orderedExerciseIds.flatMap((exerciseId, index) => {
      const exercise = exerciseById.get(exerciseId)
      return exercise ? [{ ...exercise, orderIndex: index }] : []
    })
    if (orderedExercises.length !== currentTemplate.exercises.length) return

    setTemplate({
      ...currentTemplate,
      exercises: orderedExercises,
    })
    setMessage('')

    try {
      await replaceWorkoutTemplateExercises(templateId, orderedExercises)
    } catch (e) {
      console.error('Could not reorder template exercises', e)
      setTemplate(previousTemplate)
      setMessage('Could not reorder these exercises.')
    }
  }

  async function handleExercisePicked(params: {
    exerciseTypeId: string
    methodId: string
  }) {
    try {
      await addExerciseToWorkoutTemplate({
        ...params,
        templateId,
        setCount: 3,
      })
      setPickerVisible(false)
      await loadTemplate()
    } catch (e) {
      console.error('Could not add exercise to template', e)
      setMessage('Could not add this exercise.')
    }
  }

  async function startTemplate() {
    if (activeWorkoutId) {
      Alert.alert('Workout already active', 'Finish or cancel it before starting a template.')
      return
    }
    try {
      const session = await createWorkoutFromTemplate(templateId)
      restoreWorkoutSession({
        workoutId: session.id,
        startedAt: session.startedAt,
        exercises: session.exercises,
        openSheet: true,
      })
    } catch (e) {
      console.error('Could not start template', e)
      setMessage('Add exercises to this template before starting it.')
    }
  }

  async function confirmDelete() {
    try {
      setDeleteVisible(false)
      await deleteWorkoutTemplate(templateId)
      navigation.goBack()
    } catch (e) {
      console.error('Could not delete template', e)
      setMessage('Could not delete this template.')
    }
  }

  const canStart = Boolean(template?.exercises.length && !activeWorkoutId)
  const hasUnsavedChanges = useMemo(() => {
    if (!editSnapshot || !template) return false
    if (draftName.trim() !== editSnapshot.name.trim()) return true
    if (template.exercises.length !== editSnapshot.exercises.length) return true

    return template.exercises.some((exercise, index) => {
      const snapshotExercise = editSnapshot.exercises[index]
      return (
        !snapshotExercise ||
        exercise.id !== snapshotExercise.id ||
        exercise.exerciseTypeId !== snapshotExercise.exerciseTypeId ||
        exercise.methodId !== snapshotExercise.methodId ||
        exercise.setCount !== snapshotExercise.setCount
      )
    })
  }, [draftName, editSnapshot, template])
  const scrollContentStyle = useMemo(
    () => [
      styles.content,
      !editMode ? styles.contentWithBottomAction : null,
    ],
    [editMode, styles.content, styles.contentWithBottomAction],
  )

  function handleCancelEditPress() {
    if (hasUnsavedChanges) {
      setCancelVisible(true)
      return
    }
    exitEditMode()
  }

  return (
    <View style={styles.container}>
      <ScreenHeader
        title={editMode ? 'Edit Template' : template?.name ?? 'Template'}
        onBack={() => navigation.goBack()}
        showFade={showHeaderFade}
        afterTitle={
          !editMode && template ? (
            <Text style={styles.headerSubtitle}>
              {template.exerciseCount} exercises - {template.totalSetCount} sets
            </Text>
          ) : null
        }
        rightContent={(
          editMode ? (
            <View style={styles.headerActions}>
              <ScreenHeaderButton label="Cancel" iconName="close" onPress={handleCancelEditPress} />
              <ScreenHeaderButton label="Save" iconName="check" onPress={saveTemplate} />
            </View>
          ) : (
            <View style={styles.headerActions}>
              <TouchableOpacity style={styles.headerIconButton} onPress={() => setEditMode(true)}>
                <MaterialCommunityIcons name="pencil-outline" size={17} color={theme.colors.text} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.headerIconButton} onPress={toggleFavorite}>
                <MaterialCommunityIcons
                  name={template?.isFavorite ? 'star' : 'star-outline'}
                  size={18}
                  color={template?.isFavorite ? theme.colors.accent : theme.colors.text}
                />
              </TouchableOpacity>
              <TouchableOpacity style={styles.headerIconButton} onPress={() => setDeleteVisible(true)}>
                <MaterialCommunityIcons name="trash-can-outline" size={17} color={theme.colors.text} />
              </TouchableOpacity>
            </View>
          )
        )}
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={scrollContentStyle}
        onScroll={handleHeaderScroll}
        scrollEventThrottle={16}
        scrollEnabled={!draggingExerciseId}
      >
        {message ? (
          <View style={styles.notice}>
            <MaterialCommunityIcons name="information-outline" size={16} color={theme.colors.accent} />
            <Text style={styles.noticeText}>{message}</Text>
          </View>
        ) : null}

        {loading ? (
          <View style={styles.emptyCard}>
            <ActivityIndicator color={theme.colors.accent} />
          </View>
        ) : !template ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>Template not found.</Text>
          </View>
        ) : (
          <>
            {editMode ? (
              <View style={styles.editorCard}>
                <Text style={styles.fieldLabel}>Template name</Text>
                <TextInput
                  style={styles.nameInput}
                  value={draftName}
                  onChangeText={setDraftName}
                  placeholder="Template name"
                  placeholderTextColor={theme.colors.textMuted}
                  returnKeyType="done"
                />
              </View>
            ) : null}

            <View style={styles.exerciseCard}>
              <View style={styles.exerciseHeader}>
                <Text style={styles.sectionTitle}>Exercises</Text>
                {editMode ? (
                  <TouchableOpacity style={styles.addButton} onPress={() => setPickerVisible(true)}>
                    <MaterialCommunityIcons name="plus" size={16} color={theme.colors.accent} />
                    <Text style={styles.addButtonText}>Add</Text>
                  </TouchableOpacity>
                ) : null}
              </View>

              {template.exercises.length === 0 ? (
                <Text style={styles.emptyText}>
                  Add exercises and planned sets to build this template.
                </Text>
              ) : editMode ? (
                <SortableTemplateExerciseList
                  exercises={template.exercises}
                  onDragStateChange={setDraggingExerciseId}
                  onReorder={persistExerciseOrder}
                  onUpdateSetCount={updateSetCount}
                  onRemove={removeExercise}
                />
              ) : (
                <View style={styles.exerciseList}>
                  {template.exercises.map((exercise) => (
                    <TemplateExerciseRow
                      key={exercise.id}
                      exercise={exercise}
                    />
                  ))}
                </View>
              )}
            </View>
          </>
        )}
      </ScrollView>

      {!editMode && template ? (
        <View style={styles.bottomBar}>
          <TouchableOpacity
            style={[styles.startButton, !canStart && styles.startButtonDisabled]}
            onPress={startTemplate}
            disabled={!canStart}
            activeOpacity={0.82}
          >
            <View style={styles.startIcon}>
              <MaterialCommunityIcons name="play" size={18} color={theme.colors.accent} />
            </View>
            <View style={styles.startTextBlock}>
              <Text style={styles.startButtonText}>
                {activeWorkoutId ? 'Workout Active' : 'Start Workout'}
              </Text>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={18} color={theme.colors.textMuted} />
          </TouchableOpacity>
        </View>
      ) : null}

      <ExercisePickerModal
        visible={pickerVisible}
        onClose={() => setPickerVisible(false)}
        onPick={handleExercisePicked}
      />
      <ThemedDialog
        visible={deleteVisible}
        title="Delete Template"
        message={template ? `Delete ${template.name}? This removes the template only.` : undefined}
        actions={[
          { label: 'Cancel', onPress: () => setDeleteVisible(false) },
          { label: 'Delete', variant: 'danger', onPress: confirmDelete },
        ]}
      />
      <ThemedDialog
        visible={cancelVisible}
        title="Discard Changes"
        message="Cancel editing and restore this template to how it was before your changes?"
        actions={[
          { label: 'Keep Editing', onPress: () => setCancelVisible(false) },
          { label: 'Discard', variant: 'danger', onPress: cancelEdit },
        ]}
      />
    </View>
  )
}

function SortableTemplateExerciseList({
  exercises,
  onDragStateChange,
  onReorder,
  onUpdateSetCount,
  onRemove,
}: {
  exercises: TemplateExercise[]
  onDragStateChange: (exerciseId: string | null) => void
  onReorder: (orderedExerciseIds: string[]) => void
  onUpdateSetCount: (exerciseId: string, setCount: number) => void
  onRemove: (exerciseId: string) => void
}) {
  const { styles } = useStyles(stylesheet)
  const exerciseIds = useMemo(() => exercises.map((exercise) => exercise.id), [exercises])
  const exerciseKey = exerciseIds.join('|')
  const positions = useSharedValue<TemplateExercisePositions>(buildExercisePositions(exercises))
  const activeExerciseId = useSharedValue<string | null>(null)

  useEffect(() => {
    positions.value = buildExercisePositions(exercises)
  }, [exerciseKey, exercises, positions])

  const sortableListStyle = useMemo(
    () => [
      styles.sortableExerciseList,
      { height: Math.max(0, exercises.length * TEMPLATE_EXERCISE_SLOT_HEIGHT - TEMPLATE_EXERCISE_ROW_GAP) },
    ],
    [exercises.length, styles.sortableExerciseList],
  )

  return (
    <View style={sortableListStyle}>
      {exercises.map((exercise, index) => (
        <SortableTemplateExerciseRow
          key={exercise.id}
          exercise={exercise}
          index={index}
          exerciseIds={exerciseIds}
          positions={positions}
          activeExerciseId={activeExerciseId}
          onDragStateChange={onDragStateChange}
          onReorder={onReorder}
          onUpdateSetCount={onUpdateSetCount}
          onRemove={onRemove}
        />
      ))}
    </View>
  )
}

function SortableTemplateExerciseRow({
  exercise,
  index,
  exerciseIds,
  positions,
  activeExerciseId,
  onDragStateChange,
  onReorder,
  onUpdateSetCount,
  onRemove,
}: {
  exercise: TemplateExercise
  index: number
  exerciseIds: string[]
  positions: SharedValue<TemplateExercisePositions>
  activeExerciseId: SharedValue<string | null>
  onDragStateChange: (exerciseId: string | null) => void
  onReorder: (orderedExerciseIds: string[]) => void
  onUpdateSetCount: (exerciseId: string, setCount: number) => void
  onRemove: (exerciseId: string) => void
}) {
  const { styles, theme } = useStyles(stylesheet)
  const top = useSharedValue(index * TEMPLATE_EXERCISE_SLOT_HEIGHT)
  const startTop = useSharedValue(index * TEMPLATE_EXERCISE_SLOT_HEIGHT)
  const didEndDrag = useSharedValue(false)

  const rowGesture = useMemo(
    () =>
      Gesture.Pan()
        .enabled(exerciseIds.length > 1)
        .activateAfterLongPress(80)
        .minDistance(1)
        .onStart(() => {
          didEndDrag.value = false
          activeExerciseId.value = exercise.id
          startTop.value = (positions.value[exercise.id] ?? index) * TEMPLATE_EXERCISE_SLOT_HEIGHT
          top.value = startTop.value
          runOnJS(onDragStateChange)(exercise.id)
        })
        .onUpdate((event) => {
          const nextTop = startTop.value + event.translationY
          const currentIndex = positions.value[exercise.id] ?? index
          const targetIndex = clampIndex(
            Math.round(nextTop / TEMPLATE_EXERCISE_SLOT_HEIGHT),
            0,
            exerciseIds.length - 1,
          )

          top.value = nextTop

          if (targetIndex === currentIndex) return

          const nextPositions = { ...positions.value }
          for (let i = 0; i < exerciseIds.length; i += 1) {
            const exerciseId = exerciseIds[i]
            if (exerciseId === exercise.id) continue
            const position = positions.value[exerciseId]
            if (targetIndex > currentIndex && position > currentIndex && position <= targetIndex) {
              nextPositions[exerciseId] = position - 1
            } else if (targetIndex < currentIndex && position >= targetIndex && position < currentIndex) {
              nextPositions[exerciseId] = position + 1
            }
          }
          nextPositions[exercise.id] = targetIndex
          positions.value = nextPositions
        })
        .onEnd(() => {
          didEndDrag.value = true
          const landedPositions = positions.value
          const orderedExerciseIds = [...exerciseIds].sort(
            (firstId, secondId) => landedPositions[firstId] - landedPositions[secondId],
          )
          top.value = withTiming(
            landedPositions[exercise.id] * TEMPLATE_EXERCISE_SLOT_HEIGHT,
            { duration: 120 },
            (finished) => {
              if (!finished) return
              activeExerciseId.value = null
              runOnJS(onDragStateChange)(null)
              runOnJS(onReorder)(orderedExerciseIds)
            },
          )
        })
        .onFinalize(() => {
          if (!didEndDrag.value) {
            top.value = withTiming((positions.value[exercise.id] ?? index) * TEMPLATE_EXERCISE_SLOT_HEIGHT)
            activeExerciseId.value = null
            runOnJS(onDragStateChange)(null)
          }
        }),
    [
      activeExerciseId,
      didEndDrag,
      exercise.id,
      exerciseIds,
      index,
      onDragStateChange,
      onReorder,
      positions,
      startTop,
      top,
    ],
  )

  const animatedRowStyle = useAnimatedStyle(() => {
    const isActive = activeExerciseId.value === exercise.id
    const nextTop = (positions.value[exercise.id] ?? index) * TEMPLATE_EXERCISE_SLOT_HEIGHT

    return {
      top: isActive ? top.value : withTiming(nextTop, { duration: 120 }),
      zIndex: isActive ? 10 : 1,
      elevation: isActive ? 6 : 0,
    }
  }, [exercise.id, index])

  return (
    <Animated.View
      style={[
        styles.sortableExerciseRow,
        styles.exerciseRow,
        animatedRowStyle,
      ]}
    >
      <GestureDetector gesture={rowGesture}>
        <View
          style={[
            styles.dragButton,
            exerciseIds.length < 2 && styles.dragButtonDisabled,
          ]}
        >
          <MaterialCommunityIcons name="drag" size={17} color={theme.colors.textMuted} />
        </View>
      </GestureDetector>
      <View style={styles.exerciseTextBlock}>
        <Text style={styles.exerciseName} numberOfLines={1}>
          {exercise.exerciseTypeName}
        </Text>
        {!exercise.methodLocked ? (
          <Text style={styles.exerciseMethod} numberOfLines={1}>
            {exercise.methodName}
          </Text>
        ) : null}
      </View>

      <View style={styles.setStepper}>
        <TouchableOpacity
          style={styles.stepperButton}
          onPress={() => onUpdateSetCount(exercise.id, exercise.setCount - 1)}
          disabled={exercise.setCount <= 1}
        >
          <MaterialCommunityIcons name="minus" size={15} color={theme.colors.textMuted} />
        </TouchableOpacity>
        <Text style={styles.setCount}>{exercise.setCount}</Text>
        <TouchableOpacity
          style={styles.stepperButton}
          onPress={() => onUpdateSetCount(exercise.id, exercise.setCount + 1)}
          disabled={exercise.setCount >= 12}
        >
          <MaterialCommunityIcons name="plus" size={15} color={theme.colors.textMuted} />
        </TouchableOpacity>
      </View>
      <TouchableOpacity
        style={styles.removeButton}
        onPress={() => onRemove(exercise.id)}
      >
        <MaterialCommunityIcons name="trash-can-outline" size={17} color={theme.colors.textMuted} />
      </TouchableOpacity>
    </Animated.View>
  )
}

function TemplateExerciseRow({
  exercise,
}: {
  exercise: TemplateExercise
}) {
  const { styles } = useStyles(stylesheet)

  return (
    <View style={styles.exerciseRow}>
      <View style={styles.exerciseTextBlock}>
        <Text style={styles.exerciseName} numberOfLines={1}>
          {exercise.exerciseTypeName}
        </Text>
        {!exercise.methodLocked ? (
          <Text style={styles.exerciseMethod} numberOfLines={1}>
            {exercise.methodName}
          </Text>
        ) : null}
      </View>
      <Text style={styles.previewSetCount}>
        {exercise.setCount} {exercise.setCount === 1 ? 'set' : 'sets'}
      </Text>
    </View>
  )
}

const stylesheet = createStyleSheet((theme) => ({
  container: {
    flex: 1,
    backgroundColor: theme.colors.bg,
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.md,
    paddingBottom: theme.spacing.xl,
    gap: theme.spacing.md,
  },
  contentWithBottomAction: {
    paddingBottom: 72,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  headerIconButton: {
    width: 34,
    height: 34,
    borderRadius: theme.radius.full,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerSubtitle: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.semiBold,
    marginTop: -theme.spacing.xs,
  },
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.sm,
  },
  noticeText: {
    flex: 1,
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.semiBold,
  },
  editorCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.md,
    gap: theme.spacing.xs,
  },
  fieldLabel: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
    fontFamily: theme.fontFamily.bold,
    textTransform: 'uppercase',
  },
  nameInput: {
    minHeight: 44,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface2,
    color: theme.colors.text,
    fontSize: theme.fontSize.md,
    fontFamily: theme.fontFamily.extraBold,
    paddingHorizontal: theme.spacing.md,
  },
  exerciseCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  exerciseHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
  },
  sectionTitle: {
    color: theme.colors.text,
    fontSize: theme.fontSize.lg,
    fontFamily: theme.fontFamily.extraBold,
  },
  addButton: {
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    borderRadius: theme.radius.full,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface2,
    paddingHorizontal: theme.spacing.sm,
  },
  addButtonText: {
    color: theme.colors.accent,
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.bold,
  },
  exerciseList: {
    gap: theme.spacing.xs,
  },
  sortableExerciseList: {
    position: 'relative',
    width: '100%',
  },
  sortableExerciseRow: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: TEMPLATE_EXERCISE_ROW_HEIGHT,
  },
  exerciseRow: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    backgroundColor: theme.colors.surface2,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 5,
  },
  exerciseRowDragging: {
    zIndex: 5,
    elevation: 5,
    borderColor: theme.colors.accent,
    backgroundColor: theme.colors.surface,
  },
  exerciseRowDropTarget: {
    borderColor: theme.colors.accent,
  },
  dragButton: {
    width: 30,
    height: 30,
    borderRadius: theme.radius.full,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dragButtonDisabled: {
    opacity: 0.45,
  },
  exerciseTextBlock: {
    flex: 1,
    minWidth: 0,
  },
  exerciseName: {
    color: theme.colors.text,
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.extraBold,
  },
  exerciseMethod: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
    fontFamily: theme.fontFamily.regular,
    marginTop: 1,
  },
  exerciseMeta: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
    fontFamily: theme.fontFamily.semiBold,
    marginTop: 2,
  },
  setStepper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: theme.radius.full,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    overflow: 'hidden',
  },
  stepperButton: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  setCount: {
    minWidth: 22,
    color: theme.colors.text,
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.extraBold,
    textAlign: 'center',
  },
  removeButton: {
    width: 32,
    height: 32,
    borderRadius: theme.radius.full,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewSetCount: {
    minWidth: 58,
    color: theme.colors.accent,
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.extraBold,
    textAlign: 'right',
  },
  emptyCard: {
    minHeight: 116,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.semiBold,
    textAlign: 'center',
    paddingVertical: theme.spacing.sm,
  },
  bottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    backgroundColor: theme.colors.bg,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  startButton: {
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    paddingHorizontal: theme.spacing.sm,
  },
  startButtonDisabled: {
    opacity: 0.45,
  },
  startButtonText: {
    color: theme.colors.text,
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.extraBold,
  },
  startIcon: {
    width: 28,
    height: 28,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.accentMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  startTextBlock: {
    flex: 1,
    minWidth: 0,
  },
}))
