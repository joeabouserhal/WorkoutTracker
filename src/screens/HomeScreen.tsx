import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Alert,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { useFocusEffect, useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons'
import { createStyleSheet, useStyles } from 'react-native-unistyles'
import { WorkoutDetailModal, WorkoutSummaryCard } from '@/components/WorkoutHistory'
import { getProfile } from '@/db/profileHelpers'
import {
  createWorkout,
  getRecentCompletedWorkouts,
  getWorkoutDetail,
  type WorkoutDetail,
  type WorkoutSummary,
} from '@/db/workoutHelpers'
import { useSessionStore } from '@/store/sessionStore'
import type { HomeStackParamList } from '../navigation/TabNavigator'

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

export default function HomeScreen() {
  const { styles, theme } = useStyles(stylesheet)
  const navigation = useNavigation<NativeStackNavigationProp<HomeStackParamList>>()
  const [name, setName] = useState<string>('')
  const [recentWorkouts, setRecentWorkouts] = useState<WorkoutSummary[]>([])
  const [selectedWorkoutId, setSelectedWorkoutId] = useState<string | null>(null)
  const [selectedWorkout, setSelectedWorkout] = useState<WorkoutDetail | null>(null)
  const [workoutDetailLoading, setWorkoutDetailLoading] = useState(false)
  const [expandedWorkoutIds, setExpandedWorkoutIds] = useState<Record<string, boolean>>({})
  const [workoutPreviews, setWorkoutPreviews] = useState<Record<string, WorkoutDetail | null>>({})
  const [previewLoading, setPreviewLoading] = useState<Record<string, boolean>>({})
  const [loading, setLoading] = useState(true)
  const [showHeaderFade, setShowHeaderFade] = useState(false)
  const startWorkout = useSessionStore((s) => s.startWorkout)
  const activeWorkoutId = useSessionStore((s) => s.activeWorkoutId)
  const previousActiveWorkoutIdRef = useRef<string | null>(activeWorkoutId)

  const loadHome = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true)
    try {
      const [profile, workouts] = await Promise.all([
        getProfile(),
        getRecentCompletedWorkouts(3),
      ])
      setName(profile?.name ?? '')
      setRecentWorkouts(workouts)
      setExpandedWorkoutIds({})
      setWorkoutPreviews({})
      setPreviewLoading({})
    } catch (e) {
      console.error('Failed to load home screen', e)
      setRecentWorkouts([])
    } finally {
      if (showLoading) setLoading(false)
    }
  }, [])

  useFocusEffect(
    useCallback(() => {
      let isActive = true

      loadHome().finally(() => {
        if (!isActive) return
      })

      return () => {
        isActive = false
      }
    }, [loadHome]),
  )

  useEffect(() => {
    const previousActiveWorkoutId = previousActiveWorkoutIdRef.current
    previousActiveWorkoutIdRef.current = activeWorkoutId

    if (previousActiveWorkoutId && !activeWorkoutId) {
      loadHome(false).catch(console.error)
    }
  }, [activeWorkoutId, loadHome])

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
    navigation.navigate('Templates')
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

  function handleWorkoutRenamed(workoutId: string, workoutName: string) {
    setRecentWorkouts((prev) =>
      prev.map((workout) =>
        workout.id === workoutId ? { ...workout, name: workoutName.trim() || null } : workout,
      ),
    )
    setSelectedWorkout((prev) =>
      prev?.id === workoutId ? { ...prev, name: workoutName.trim() || null } : prev,
    )
  }

  function handleWorkoutDeleted(workoutId: string) {
    setSelectedWorkoutId(null)
    setSelectedWorkout(null)
    setWorkoutDetailLoading(false)
    setRecentWorkouts((prev) => prev.filter((workout) => workout.id !== workoutId))
    setExpandedWorkoutIds((prev) => {
      const next = { ...prev }
      delete next[workoutId]
      return next
    })
    setWorkoutPreviews((prev) => {
      const next = { ...prev }
      delete next[workoutId]
      return next
    })
    setPreviewLoading((prev) => {
      const next = { ...prev }
      delete next[workoutId]
      return next
    })
    loadHome(false).catch(console.error)
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
    <View style={styles.container}>
      <View style={styles.stickyHero}>
        <View style={styles.heroSection}>
          <View style={styles.heroTextBlock}>
            <Text style={styles.welcomeText}>Welcome back</Text>
            <Text style={styles.nameText}>{loading ? 'Loading...' : name || 'Athlete'}</Text>
          </View>
          <View style={styles.heroIcon}>
            <MaterialCommunityIcons name="dumbbell" size={24} color={theme.colors.accent} />
          </View>
        </View>
        {showHeaderFade ? (
          <View pointerEvents="none" style={styles.heroFade}>
            <View style={[styles.heroFadeBand, styles.heroFadeBand14]} />
            <View style={[styles.heroFadeBand, styles.heroFadeBand13]} />
            <View style={[styles.heroFadeBand, styles.heroFadeBand12]} />
            <View style={[styles.heroFadeBand, styles.heroFadeBand11]} />
            <View style={[styles.heroFadeBand, styles.heroFadeBand10]} />
            <View style={[styles.heroFadeBand, styles.heroFadeBand9]} />
            <View style={[styles.heroFadeBand, styles.heroFadeBand8]} />
            <View style={[styles.heroFadeBand, styles.heroFadeBand7]} />
            <View style={[styles.heroFadeBand, styles.heroFadeBand6]} />
            <View style={[styles.heroFadeBand, styles.heroFadeBand5]} />
            <View style={[styles.heroFadeBand, styles.heroFadeBand4]} />
            <View style={[styles.heroFadeBand, styles.heroFadeBand3]} />
            <View style={[styles.heroFadeBand, styles.heroFadeBand2]} />
            <View style={[styles.heroFadeBand, styles.heroFadeBand1]} />
          </View>
        ) : null}
      </View>

      <ScrollView
        style={styles.scrollArea}
        contentContainerStyle={styles.content}
        onScroll={(event) => {
          const shouldShowFade = event.nativeEvent.contentOffset.y > 4
          setShowHeaderFade((prev) => (prev === shouldShowFade ? prev : shouldShowFade))
        }}
        scrollEventThrottle={16}
      >
        <View
          style={[
            styles.startWorkoutGlow,
            isWorkoutActive && styles.startWorkoutGlowDisabled,
          ]}
        >
          <TouchableOpacity
            style={[
              styles.startWorkoutButton,
              isWorkoutActive && styles.startWorkoutButtonDisabled,
            ]}
            onPress={handleStartWorkout}
            disabled={isWorkoutActive}
            activeOpacity={0.82}
          >
            <View
              style={[
                styles.primaryIcon,
                isWorkoutActive && styles.primaryIconDisabled,
              ]}
            >
              <MaterialCommunityIcons
                name={isWorkoutActive ? 'timer-sand' : 'plus'}
                size={21}
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
                {isWorkoutActive ? 'Finish or cancel it before starting another.' : 'Track sets and rest live.'}
              </Text>
            </View>
          </TouchableOpacity>
        </View>

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
              <View style={styles.workoutList}>
                {group.workouts.map((workout) => (
                  <WorkoutSummaryCard
                    key={workout.id}
                    workout={workout}
                    expanded={Boolean(expandedWorkoutIds[workout.id])}
                    preview={workoutPreviews[workout.id]}
                    previewLoading={Boolean(previewLoading[workout.id])}
                    onOpen={() => openWorkout(workout.id)}
                    onToggle={() => toggleWorkoutPreview(workout.id)}
                  />
                ))}
              </View>
            </View>
          ))
        )}
      </ScrollView>

      <WorkoutDetailModal
        workoutId={selectedWorkoutId}
        workout={selectedWorkout}
        loading={workoutDetailLoading}
        onClose={closeWorkoutDetail}
        onDeleted={handleWorkoutDeleted}
        onRename={handleWorkoutRenamed}
      />
    </View>
  )
}

const stylesheet = createStyleSheet((theme) => ({
  container: {
    flex: 1,
    backgroundColor: theme.colors.bg,
  },
  stickyHero: {
    backgroundColor: theme.colors.bg,
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.xl + theme.spacing.md,
    paddingBottom: theme.spacing.sm,
    zIndex: 2,
    elevation: 2,
    overflow: 'visible',
  },
  heroFade: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: -34,
    height: 34,
  },
  heroFadeBand: {
    flex: 1,
    backgroundColor: theme.colors.bg,
  },
  heroFadeBand14: {
    opacity: 0.9,
  },
  heroFadeBand13: {
    opacity: 0.84,
  },
  heroFadeBand12: {
    opacity: 0.78,
  },
  heroFadeBand11: {
    opacity: 0.72,
  },
  heroFadeBand10: {
    opacity: 0.64,
  },
  heroFadeBand9: {
    opacity: 0.56,
  },
  heroFadeBand8: {
    opacity: 0.48,
  },
  heroFadeBand7: {
    opacity: 0.4,
  },
  heroFadeBand6: {
    opacity: 0.32,
  },
  heroFadeBand5: {
    opacity: 0.25,
  },
  heroFadeBand4: {
    opacity: 0.17,
  },
  heroFadeBand3: {
    opacity: 0.11,
  },
  heroFadeBand2: {
    opacity: 0.06,
  },
  heroFadeBand1: {
    opacity: 0.02,
  },
  scrollArea: {
    flex: 1,
  },
  content: {
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.md,
    paddingBottom: theme.spacing.xl,
    gap: theme.spacing.md,
  },
  heroSection: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.md,
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
  startWorkoutGlow: {
    borderRadius: theme.radius.md,
    shadowColor: theme.colors.accent,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.62,
    shadowRadius: 24,
    elevation: 10,
  },
  startWorkoutGlowDisabled: {
    shadowOpacity: 0,
    elevation: 0,
  },
  startWorkoutButton: {
    minHeight: 58,
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
    width: 38,
    height: 38,
    borderRadius: theme.radius.full,
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
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
    fontSize: theme.fontSize.md,
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
    gap: theme.spacing.xs,
  },
  workoutList: {
    gap: theme.spacing.md,
  },
  workoutDateLabel: {
    alignSelf: 'flex-start',
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
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
}))
