import React, { useCallback, useMemo, useState } from 'react'
import {
  Alert,
  Modal,
  ScrollView,
  StatusBar,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { SafeAreaView } from 'react-native-safe-area-context'
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons'
import { createStyleSheet, useStyles } from 'react-native-unistyles'
import { getProfile } from '@/db/profileHelpers'
import {
  createWorkout,
  getRecentCompletedWorkouts,
  getWorkoutDetail,
  type WorkoutDetail,
  type WorkoutSummary,
} from '@/db/workoutHelpers'
import { useSessionStore } from '@/store/sessionStore'

const LB_PER_KG = 2.20462
const PR_GOLD = '#D9A441'

function formatDate(timestamp: number) {
  return new Date(timestamp).toLocaleDateString([], {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  })
}

function getDayKey(timestamp: number) {
  const date = new Date(timestamp)
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
}

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

function formatExerciseSets(exercise: WorkoutDetail['exercises'][number]) {
  if (exercise.sets.length === 0) return 'No sets'
  return exercise.sets
    .map((set) => `${formatSetWeight(set.weightKg, set.weightUnit)} x ${set.reps}`)
    .join(', ')
}

export default function HomeScreen() {
  const { styles, theme } = useStyles(stylesheet)
  const [name, setName] = useState<string>('')
  const [recentWorkouts, setRecentWorkouts] = useState<WorkoutSummary[]>([])
  const [selectedWorkoutId, setSelectedWorkoutId] = useState<string | null>(null)
  const [selectedWorkout, setSelectedWorkout] = useState<WorkoutDetail | null>(null)
  const [workoutDetailLoading, setWorkoutDetailLoading] = useState(false)
  const [expandedWorkoutIds, setExpandedWorkoutIds] = useState<Record<string, boolean>>({})
  const [workoutPreviews, setWorkoutPreviews] = useState<Record<string, WorkoutDetail | null>>({})
  const [previewLoading, setPreviewLoading] = useState<Record<string, boolean>>({})
  const [loading, setLoading] = useState(true)
  const startWorkout = useSessionStore((s) => s.startWorkout)
  const activeWorkoutId = useSessionStore((s) => s.activeWorkoutId)

  useFocusEffect(
    useCallback(() => {
      let isActive = true

      async function loadHome() {
        setLoading(true)
        try {
          const [profile, workouts] = await Promise.all([
            getProfile(),
            getRecentCompletedWorkouts(3),
          ])
          if (isActive) {
            setName(profile?.name ?? '')
            setRecentWorkouts(workouts)
          }
        } catch (e) {
          console.error('Failed to load home screen', e)
          if (isActive) setRecentWorkouts([])
        } finally {
          if (isActive) setLoading(false)
        }
      }

      loadHome()

      return () => {
        isActive = false
      }
    }, []),
  )

  async function handleStartWorkout() {
    if (activeWorkoutId) return

    try {
      const workoutId = await createWorkout()
      startWorkout(workoutId)
    } catch (e) {
      Alert.alert('Error', 'Could not start workout.')
      console.error(e)
    }
  }

  function handleTemplatesPress() {
    Alert.alert('Templates', 'Workout templates will be available here soon.')
  }

  function toggleWorkoutPreview(workoutId: string) {
    setExpandedWorkoutIds((prev) => ({ ...prev, [workoutId]: !prev[workoutId] }))
    if (workoutPreviews[workoutId] !== undefined || previewLoading[workoutId]) return

    setPreviewLoading((prev) => ({ ...prev, [workoutId]: true }))
    getWorkoutDetail(workoutId)
      .then((detail) => {
        setWorkoutPreviews((prev) => ({ ...prev, [workoutId]: detail }))
      })
      .catch((e) => {
        console.error('Failed to load workout preview', e)
        setWorkoutPreviews((prev) => ({ ...prev, [workoutId]: null }))
      })
      .finally(() => {
        setPreviewLoading((prev) => ({ ...prev, [workoutId]: false }))
      })
  }

  function openWorkout(workoutId: string) {
    setSelectedWorkoutId(workoutId)
    setSelectedWorkout(null)
    setWorkoutDetailLoading(true)

    getWorkoutDetail(workoutId)
      .then((detail) => setSelectedWorkout(detail))
      .catch((e) => console.error('Failed to load workout detail', e))
      .finally(() => setWorkoutDetailLoading(false))
  }

  function closeWorkoutDetail() {
    setSelectedWorkoutId(null)
    setSelectedWorkout(null)
    setWorkoutDetailLoading(false)
  }

  const isWorkoutActive = Boolean(activeWorkoutId)
  const recentWorkoutGroups = useMemo(
    () =>
      recentWorkouts.reduce<
        Array<{ dayKey: string; dateLabel: string; workouts: WorkoutSummary[] }>
      >((groups, workout) => {
        const dayKey = getDayKey(workout.startedAt)
        const existingGroup = groups.find((group) => group.dayKey === dayKey)

        if (existingGroup) {
          existingGroup.workouts.push(workout)
        } else {
          groups.push({
            dayKey,
            dateLabel: formatDate(workout.startedAt),
            workouts: [workout],
          })
        }

        return groups
      }, []),
    [recentWorkouts],
  )

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
    >
      <View style={styles.heroSection}>
        <View style={styles.heroTextBlock}>
          <Text style={styles.welcomeText}>Welcome back</Text>
          <Text style={styles.nameText}>{loading ? 'Loading...' : name || 'Athlete'}</Text>
        </View>
        <View style={styles.heroIcon}>
          <MaterialCommunityIcons name="dumbbell" size={24} color={theme.colors.accent} />
        </View>
      </View>

      <TouchableOpacity
        style={[
          styles.startWorkoutButton,
          isWorkoutActive && styles.startWorkoutButtonDisabled,
        ]}
        onPress={handleStartWorkout}
        disabled={isWorkoutActive}
      >
        <View
          style={[
            styles.primaryIcon,
            isWorkoutActive && styles.primaryIconDisabled,
          ]}
        >
          <MaterialCommunityIcons
            name={isWorkoutActive ? 'timer-sand' : 'plus'}
            size={22}
            color={isWorkoutActive ? theme.colors.textMuted : '#FFFFFF'}
          />
        </View>
        <View style={styles.primaryTextBlock}>
          <Text
            style={[
              styles.startWorkoutText,
              isWorkoutActive && styles.startWorkoutTextDisabled,
            ]}
          >
            {isWorkoutActive ? 'Workout Currently Ongoing' : 'Start Workout'}
          </Text>
          <Text
            style={[
              styles.actionSubtitle,
              !isWorkoutActive && styles.primaryActionSubtitle,
            ]}
          >
            {isWorkoutActive ? 'Finish or cancel it before starting another.' : 'Track sets, rest, and PRs live.'}
          </Text>
        </View>
      </TouchableOpacity>

      <TouchableOpacity style={styles.templatesButton} onPress={handleTemplatesPress}>
        <View style={styles.secondaryIcon}>
          <MaterialCommunityIcons name="clipboard-text-outline" size={21} color={theme.colors.accent} />
        </View>
        <View style={styles.templatesTextBlock}>
          <Text style={styles.templatesTitle}>Templates</Text>
          <Text style={styles.actionSubtitle}>Build repeatable workout plans.</Text>
        </View>
        <MaterialCommunityIcons name="chevron-right" size={20} color={theme.colors.textMuted} />
      </TouchableOpacity>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Recent Workouts</Text>
        <Text style={styles.sectionHint}>Last 3</Text>
      </View>

      {loading ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyText}>Loading recent workouts...</Text>
        </View>
      ) : recentWorkouts.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyText}>No completed workouts yet.</Text>
        </View>
      ) : (
        recentWorkoutGroups.map((group) => (
          <View key={group.dayKey} style={styles.workoutGroup}>
            <Text style={styles.workoutDateLabel}>{group.dateLabel}</Text>
            {group.workouts.map((workout) => (
              <View key={workout.id} style={styles.workoutCard}>
                <View style={styles.workoutCardHeader}>
                  <TouchableOpacity
                    style={styles.workoutCardBody}
                    onPress={() => openWorkout(workout.id)}
                    activeOpacity={0.75}
                  >
                    <Text style={styles.workoutTitle}>
                      {workout.name || 'Workout'}
                    </Text>
                    <Text style={styles.workoutMeta}>
                      {formatDuration(workout.startedAt, workout.endedAt)} - {workout.exerciseCount} exercises - {workout.setCount} sets
                    </Text>
                    {workout.prCount > 0 ? (
                      <View style={styles.prPill}>
                        <MaterialCommunityIcons name="trophy-outline" size={13} color={theme.colors.accent} />
                        <Text style={styles.prPillText}>{workout.prCount} PR</Text>
                      </View>
                    ) : null}
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.expandButton}
                    onPress={() => toggleWorkoutPreview(workout.id)}
                    activeOpacity={0.75}
                  >
                    <MaterialCommunityIcons
                      name={expandedWorkoutIds[workout.id] ? 'chevron-up' : 'chevron-down'}
                      size={22}
                      color={theme.colors.textMuted}
                    />
                  </TouchableOpacity>
                </View>
                {expandedWorkoutIds[workout.id] ? (
                  <WorkoutQuickPreview
                    workout={workoutPreviews[workout.id]}
                    loading={Boolean(previewLoading[workout.id])}
                  />
                ) : null}
              </View>
            ))}
          </View>
        ))
      )}
      <WorkoutDetailModal
        workoutId={selectedWorkoutId}
        workout={selectedWorkout}
        loading={workoutDetailLoading}
        onClose={closeWorkoutDetail}
      />
    </ScrollView>
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
        workout.exercises.map((exercise) => {
          const hasCurrentPr = exercise.hasCurrentWeightPr || exercise.hasCurrentRepsPr
          const hasPastPr = exercise.hasWeightPr || exercise.hasRepsPr

          return (
            <View key={exercise.id} style={styles.quickExerciseRow}>
              <View style={styles.quickExerciseTextBlock}>
                <Text style={styles.quickExerciseName} numberOfLines={1}>
                  {exercise.exerciseName}
                  {exercise.methodName ? (
                    <Text style={styles.quickExerciseMethod}> - {exercise.methodName}</Text>
                  ) : null}
                </Text>
                <Text style={styles.quickExerciseSets} numberOfLines={1}>
                  {formatExerciseSets(exercise)}
                </Text>
              </View>
              {hasPastPr ? (
                <View
                  style={[
                    styles.quickPrDot,
                    hasCurrentPr && styles.quickCurrentPrDot,
                  ]}
                />
              ) : null}
            </View>
          )
        })
      )}
    </View>
  )
}

function WorkoutDetailModal({
  workoutId,
  workout,
  loading,
  onClose,
}: {
  workoutId: string | null
  workout: WorkoutDetail | null
  loading: boolean
  onClose: () => void
}) {
  const { styles, theme } = useStyles(stylesheet)

  if (!workoutId) return null

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
        </View>

        {loading || !workout ? (
          <View style={styles.detailLoading}>
            <Text style={styles.emptyText}>Loading workout...</Text>
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.detailContent}>
            <Text style={styles.detailTitle}>{workout.name || 'Workout'}</Text>
            <Text style={styles.detailMeta}>
              {new Date(workout.startedAt).toLocaleDateString([], {
                weekday: 'long',
                month: 'long',
                day: 'numeric',
              })} - {formatDuration(workout.startedAt, workout.endedAt)}
            </Text>

            <View style={styles.detailSummaryRow}>
              <View style={styles.detailSummaryItem}>
                <Text style={styles.detailSummaryValue}>{workout.exerciseCount}</Text>
                <Text style={styles.detailSummaryLabel}>Exercises</Text>
              </View>
              <View style={styles.detailSummaryItem}>
                <Text style={styles.detailSummaryValue}>{workout.setCount}</Text>
                <Text style={styles.detailSummaryLabel}>Sets</Text>
              </View>
              <View style={styles.detailSummaryItem}>
                <Text style={styles.detailSummaryValue}>{Math.round(workout.volume)}</Text>
                <Text style={styles.detailSummaryLabel}>kg volume</Text>
              </View>
            </View>

            {workout.exercises.map((exercise) => (
              <View key={exercise.id} style={styles.detailExerciseCard}>
                <Text style={styles.detailExerciseTitle}>
                  {exercise.exerciseName}
                  <Text style={styles.quickExerciseMethod}> - {exercise.methodName}</Text>
                </Text>
                {exercise.sets.map((set, index) => (
                  <View key={set.id} style={styles.detailSetRow}>
                    <Text style={styles.detailSetIndex}>{index + 1}</Text>
                    <Text style={styles.detailSetText}>
                      {formatSetWeight(set.weightKg, set.weightUnit)} x {set.reps}
                    </Text>
                    {set.isWeightPr || set.isRepsPr ? (
                      <View
                        style={[
                          styles.inlinePrPill,
                          (set.isCurrentWeightPr || set.isCurrentRepsPr) && styles.currentInlinePrPill,
                        ]}
                      >
                        <Text
                          style={[
                            styles.inlinePrText,
                            (set.isCurrentWeightPr || set.isCurrentRepsPr) && styles.currentInlinePrText,
                          ]}
                        >
                          {(set.isCurrentWeightPr || set.isCurrentRepsPr) ? 'Current PR' : 'PR'}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                ))}
              </View>
            ))}
          </ScrollView>
        )}
      </SafeAreaView>
    </Modal>
  )
}

const stylesheet = createStyleSheet((theme) => ({
  container: {
    flex: 1,
    backgroundColor: theme.colors.bg,
  },
  content: {
    padding: theme.spacing.md,
    paddingTop: theme.spacing.xl,
    paddingBottom: theme.spacing.xl,
    gap: theme.spacing.md,
  },
  heroSection: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.md,
    marginTop: theme.spacing.md,
  },
  heroTextBlock: {
    flex: 1,
    minWidth: 0,
  },
  welcomeText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.textMuted,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: theme.spacing.xs,
  },
  nameText: {
    fontSize: theme.fontSize.xxl,
    color: theme.colors.text,
    fontWeight: '800',
  },
  heroIcon: {
    width: 48,
    height: 48,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.accentMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  startWorkoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    backgroundColor: theme.colors.accent,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.28)',
  },
  startWorkoutButtonDisabled: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
  },
  primaryIcon: {
    width: 44,
    height: 44,
    borderRadius: theme.radius.md,
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryIconDisabled: {
    backgroundColor: theme.colors.surface2,
  },
  primaryTextBlock: {
    flex: 1,
    minWidth: 0,
  },
  startWorkoutText: {
    fontSize: theme.fontSize.lg,
    color: '#FFFFFF',
    fontWeight: '800',
  },
  startWorkoutTextDisabled: {
    color: theme.colors.textMuted,
  },
  actionSubtitle: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
    fontWeight: '600',
    marginTop: 2,
  },
  primaryActionSubtitle: {
    color: 'rgba(255, 255, 255, 0.78)',
  },
  templatesButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.md,
  },
  secondaryIcon: {
    width: 38,
    height: 38,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.accentMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  templatesTextBlock: {
    flex: 1,
    minWidth: 0,
  },
  templatesTitle: {
    color: theme.colors.text,
    fontSize: theme.fontSize.md,
    fontWeight: '800',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: theme.spacing.sm,
  },
  sectionTitle: {
    color: theme.colors.text,
    fontSize: theme.fontSize.lg,
    fontWeight: '800',
  },
  sectionHint: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  workoutGroup: {
    gap: theme.spacing.sm,
  },
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
    padding: theme.spacing.md,
  },
  workoutCardBody: {
    flex: 1,
    minWidth: 0,
  },
  expandButton: {
    width: 36,
    height: 36,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.surface2,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  workoutDateLabel: {
    alignSelf: 'flex-start',
    color: theme.colors.accent,
    fontSize: theme.fontSize.xs,
    fontWeight: '800',
    textTransform: 'uppercase',
    backgroundColor: theme.colors.accentMuted,
    borderRadius: theme.radius.full,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 3,
  },
  workoutTitle: {
    color: theme.colors.text,
    fontSize: theme.fontSize.md,
    fontWeight: '700',
  },
  workoutMeta: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.sm,
    marginTop: 4,
  },
  prPill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: theme.colors.accentMuted,
    borderRadius: theme.radius.full,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 3,
    marginTop: theme.spacing.xs,
  },
  prPillText: {
    color: theme.colors.accent,
    fontSize: theme.fontSize.xs,
    fontWeight: '800',
  },
  quickPreview: {
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.xs,
    paddingBottom: theme.spacing.sm,
    gap: 2,
  },
  quickPreviewText: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
    fontWeight: '600',
  },
  quickExerciseRow: {
    minHeight: 32,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
  },
  quickExerciseTextBlock: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  quickExerciseName: {
    flex: 1,
    minWidth: 0,
    color: theme.colors.text,
    fontSize: theme.fontSize.xs,
    fontWeight: '800',
  },
  quickExerciseMethod: {
    color: theme.colors.textMuted,
    fontWeight: '600',
  },
  quickExerciseSets: {
    flexShrink: 1,
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
    fontWeight: '600',
  },
  quickPrDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: theme.colors.accent,
  },
  quickCurrentPrDot: {
    backgroundColor: '#D9A441',
  },
  emptyCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.lg,
    alignItems: 'center',
  },
  emptyText: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.sm,
    fontWeight: '600',
    textAlign: 'center',
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
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.lg,
    paddingBottom: theme.spacing.xs,
  },
  detailContent: {
    padding: theme.spacing.md,
    paddingBottom: theme.spacing.xl,
    gap: theme.spacing.md,
  },
  detailLoading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing.xl,
  },
  detailTitle: {
    color: theme.colors.text,
    fontSize: theme.fontSize.xxl,
    fontWeight: '800',
  },
  detailMeta: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.md,
    fontWeight: '600',
  },
  detailSummaryRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  detailSummaryItem: {
    flex: 1,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.md,
  },
  detailSummaryValue: {
    color: theme.colors.text,
    fontSize: theme.fontSize.lg,
    fontWeight: '800',
  },
  detailSummaryLabel: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
    fontWeight: '600',
    marginTop: 2,
  },
  detailExerciseCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.md,
    gap: theme.spacing.xs,
  },
  detailExerciseTitle: {
    color: theme.colors.text,
    fontSize: theme.fontSize.md,
    fontWeight: '800',
    marginBottom: theme.spacing.xs,
  },
  detailSetRow: {
    minHeight: 28,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  detailSetIndex: {
    width: 24,
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.sm,
    fontWeight: '700',
  },
  detailSetText: {
    flex: 1,
    color: theme.colors.text,
    fontSize: theme.fontSize.sm,
    fontWeight: '700',
  },
  inlinePrPill: {
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.accentMuted,
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
  },
  currentInlinePrText: {
    color: PR_GOLD,
  },
}))
