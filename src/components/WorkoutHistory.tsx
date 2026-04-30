import React, { useEffect, useState } from 'react'
import {
  Modal,
  ScrollView,
  StatusBar,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons'
import { createStyleSheet, useStyles } from 'react-native-unistyles'
import ThemedDialog from '@/components/ui/ThemedDialog'
import {
  deleteWorkout,
  updateWorkoutName,
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

function formatSetWeight(weightKg: number, unit: string) {
  if (unit === 'lb') {
    return `${formatCompactNumber(weightKg * LB_PER_KG)} lb`
  }
  return `${formatCompactNumber(weightKg)} kg`
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
}: {
  workoutId: string | null
  workout: WorkoutDetail | null
  loading: boolean
  onClose: () => void
  onDeleted?: (workoutId: string) => void
  onRename?: (workoutId: string, name: string) => void
}) {
  const { styles, theme } = useStyles(stylesheet)
  const [name, setName] = useState('')
  const [showDefaultUnits, setShowDefaultUnits] = useState<Record<string, boolean>>({})
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    setName(workout?.name || '')
    setShowDefaultUnits({})
  }, [workout])

  if (!workoutId) return null
  const detailWorkoutId = workoutId

  function saveName() {
    if (!workout || !onRename) return
    updateWorkoutName(detailWorkoutId, name)
      .then(() => onRename(detailWorkoutId, name))
      .catch((e) => console.error('Failed to rename workout', e))
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
        </View>

        {loading || !workout ? (
          <View style={styles.detailLoading}>
            <Text style={styles.emptyText}>Loading workout...</Text>
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.detailContent}>
            {onRename ? (
              <View style={styles.renameCard}>
                <Text style={styles.renameLabel}>Workout Name</Text>
                <TextInput
                  style={styles.renameInput}
                  value={name}
                  onChangeText={setName}
                  onBlur={saveName}
                  onSubmitEditing={saveName}
                  placeholder="Workout"
                  placeholderTextColor={theme.colors.textMuted}
                  returnKeyType="done"
                />
              </View>
            ) : (
              <View style={styles.renameCard}>
                <Text style={styles.renameLabel}>Workout Name</Text>
                <Text style={styles.detailName}>{workout.name || 'Workout'}</Text>
              </View>
            )}

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
                      {exercise.sets.map((set, index) => (
                        <View key={set.id} style={styles.setRow}>
                          <Text style={[styles.setIndex, styles.setIndexCol]}>{index + 1}</Text>
                          <View style={[styles.valueWithPrCol, styles.setWeightCol]}>
                            <Text style={styles.setValue}>
                              {formatSetWeight(set.weightKg, displayUnit ?? set.weightUnit)}
                            </Text>
                            {set.isWeightPr ? (
                              <InlineWeightPrPill current={set.isCurrentWeightPr} />
                            ) : null}
                          </View>
                          <Text style={[styles.setValue, styles.setRepsCol]}>{set.reps}</Text>
                          <Text style={[styles.setVolume, styles.setVolumeCol]}>
                            {Math.round(set.volume)} kg
                          </Text>
                        </View>
                      ))}
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
    fontWeight: '700',
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
    fontWeight: '800',
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
    fontWeight: '600',
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
    fontWeight: '700',
  },
  quickExerciseMethod: {
    color: theme.colors.textMuted,
    fontWeight: '600',
  },
  quickExerciseSets: {
    flexShrink: 1,
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xxs,
    fontWeight: '600',
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
    fontWeight: '700',
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
    fontWeight: '700',
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
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  renameInput: {
    color: theme.colors.text,
    fontSize: theme.fontSize.lg,
    fontWeight: '800',
    minHeight: 34,
    padding: 0,
  },
  detailName: {
    color: theme.colors.text,
    fontSize: theme.fontSize.lg,
    fontWeight: '800',
  },
  dateTitle: {
    color: theme.colors.text,
    fontSize: theme.fontSize.xl,
    fontWeight: '800',
  },
  detailMeta: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.sm,
    fontWeight: '600',
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
    fontWeight: '800',
  },
  summaryLabel: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
    fontWeight: '600',
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
    fontWeight: '800',
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
    fontWeight: '800',
  },
  exerciseMethod: {
    color: theme.colors.textMuted,
    fontWeight: '500',
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
    fontWeight: '800',
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
    fontWeight: '700',
  },
  setValue: {
    color: theme.colors.text,
    fontSize: theme.fontSize.sm,
    fontWeight: '700',
  },
  setVolume: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.sm,
    fontWeight: '700',
  },
  valueWithPrCol: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexWrap: 'nowrap',
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
    fontWeight: '800',
  },
  currentInlinePrPill: {
    backgroundColor: PR_GOLD + '26',
    borderColor: PR_GOLD,
  },
  currentInlinePrText: {
    color: PR_GOLD,
  },
}))
