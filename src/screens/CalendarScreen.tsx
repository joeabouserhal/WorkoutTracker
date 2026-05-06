import React, { useCallback, useMemo, useRef, useState } from 'react'
import {
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons'
import { createStyleSheet, useStyles } from 'react-native-unistyles'
import ScreenHeader, { ScreenHeaderButton, useHeaderFade } from '@/components/ui/ScreenHeader'
import { WorkoutDetailModal, WorkoutSummaryCard } from '@/components/WorkoutHistory'
import {
  getCompletedWorkoutsInRange,
  getWorkoutDetail,
  type WorkoutDetail,
  type WorkoutSummary,
} from '@/db/workoutHelpers'
import ThemedDialog, { type ThemedDialogAction } from '@/components/ui/ThemedDialog'

type CalendarView = 'daily' | 'weekly' | 'monthly'

const DAY_MS = 24 * 60 * 60 * 1000

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function endOfDay(date: Date) {
  return new Date(startOfDay(date).getTime() + DAY_MS)
}

function startOfWeek(date: Date) {
  const day = startOfDay(date)
  const diff = day.getDay()
  return new Date(day.getTime() - diff * DAY_MS)
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

function endOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 1)
}

function formatTime(timestamp: number) {
  return new Date(timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

function formatDateTitle(date: Date, view: CalendarView) {
  if (view === 'daily') {
    return date.toLocaleDateString([], {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    })
  }
  if (view === 'weekly') {
    const start = startOfWeek(date)
    const end = new Date(start.getTime() + 6 * DAY_MS)
    return `${start.toLocaleDateString([], { month: 'short', day: 'numeric' })} - ${end.toLocaleDateString([], { month: 'short', day: 'numeric' })}`
  }
  return date.toLocaleDateString([], { month: 'long', year: 'numeric' })
}

function getRange(date: Date, view: CalendarView) {
  if (view === 'daily') {
    const start = startOfDay(date)
    return { start, end: endOfDay(date) }
  }
  if (view === 'weekly') {
    const start = startOfWeek(date)
    return { start, end: new Date(start.getTime() + 7 * DAY_MS) }
  }
  return { start: startOfMonth(date), end: endOfMonth(date) }
}

export default function CalendarScreen() {
  const { styles, theme } = useStyles(stylesheet)
  const { showHeaderFade, handleHeaderScroll } = useHeaderFade()
  const [view, setView] = useState<CalendarView>('daily')
  const [selectedDate, setSelectedDate] = useState(() => new Date())
  const [workouts, setWorkouts] = useState<WorkoutSummary[]>([])
  const [selectedWorkoutId, setSelectedWorkoutId] = useState<string | null>(null)
  const [selectedWorkout, setSelectedWorkout] = useState<WorkoutDetail | null>(null)
  const [workoutDetailLoading, setWorkoutDetailLoading] = useState(false)
  const [expandedWorkoutIds, setExpandedWorkoutIds] = useState<Record<string, boolean>>({})
  const [workoutPreviews, setWorkoutPreviews] = useState<Record<string, WorkoutDetail | null>>({})
  const [previewLoading, setPreviewLoading] = useState<Record<string, boolean>>({})
  const [loading, setLoading] = useState(true)
  const workoutDetailRequestRef = useRef(0)
  const [dialog, setDialog] = useState<{
    title: string
    message?: string
    actions: ThemedDialogAction[]
  } | null>(null)

  const range = useMemo(() => getRange(selectedDate, view), [selectedDate, view])

  const loadWorkouts = useCallback(async () => {
    setLoading(true)
    try {
      const rows = await getCompletedWorkoutsInRange(range.start.getTime(), range.end.getTime())
      setWorkouts(rows)
    } catch (e) {
      console.error('Failed to load workouts', e)
      setWorkouts([])
    } finally {
      setLoading(false)
    }
  }, [range.end, range.start])

  useFocusEffect(
    useCallback(() => {
      let isActive = true
      loadWorkouts().finally(() => {
        if (!isActive) return
      })
      return () => {
        isActive = false
      }
    }, [loadWorkouts]),
  )

  function openWorkout(workoutId: string) {
    const requestId = workoutDetailRequestRef.current + 1
    workoutDetailRequestRef.current = requestId
    setSelectedWorkoutId(workoutId)
    setSelectedWorkout(null)
    setWorkoutDetailLoading(true)

    getWorkoutDetail(workoutId)
      .then((detail) => {
        if (workoutDetailRequestRef.current !== requestId) return
        setSelectedWorkout(detail)
      })
      .catch((e) => {
        if (workoutDetailRequestRef.current !== requestId) return
        console.error('Failed to load workout detail', e)
      })
      .finally(() => {
        if (workoutDetailRequestRef.current !== requestId) return
        setWorkoutDetailLoading(false)
      })
  }

  function closeWorkoutDetail() {
    workoutDetailRequestRef.current += 1
    setSelectedWorkoutId(null)
    setSelectedWorkout(null)
    setWorkoutDetailLoading(false)
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

  function handleWorkoutRenamed(workoutId: string, name: string) {
    setWorkouts((prev) =>
      prev.map((workout) =>
        workout.id === workoutId ? { ...workout, name: name.trim() || null } : workout,
      ),
    )
    setSelectedWorkout((prev) =>
      prev?.id === workoutId ? { ...prev, name: name.trim() || null } : prev,
    )
  }

  function handleWorkoutUpdated(workoutId: string, workout: WorkoutDetail) {
    setSelectedWorkout(workout)
    setWorkoutPreviews((prev) => ({ ...prev, [workoutId]: workout }))
    loadWorkouts().catch(console.error)
  }

  function handleWorkoutDeleted(workoutId: string) {
    setSelectedWorkoutId(null)
    setSelectedWorkout(null)
    setWorkoutDetailLoading(false)
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
    loadWorkouts().catch(console.error)
  }

  function closeDialog() {
    setDialog(null)
  }

  function moveDate(direction: -1 | 1) {
    setSelectedDate((current) => {
      if (view === 'daily') {
        return new Date(current.getTime() + direction * DAY_MS)
      }
      if (view === 'weekly') {
        return new Date(current.getTime() + direction * 7 * DAY_MS)
      }
      return new Date(current.getFullYear(), current.getMonth() + direction, 1)
    })
  }

  function showViewPicker() {
    setDialog({
      title: 'Calendar View',
      message: 'Choose how to browse saved workouts.',
      actions: [
        {
          label: 'Daily',
          variant: view === 'daily' ? 'primary' : 'default',
          onPress: () => {
            closeDialog()
            setView('daily')
          },
        },
        {
          label: 'Weekly',
          variant: view === 'weekly' ? 'primary' : 'default',
          onPress: () => {
            closeDialog()
            setView('weekly')
          },
        },
        {
          label: 'Monthly',
          variant: view === 'monthly' ? 'primary' : 'default',
          onPress: () => {
            closeDialog()
            setView('monthly')
          },
        },
      ],
    })
  }

  const totalSets = workouts.reduce((sum, workout) => sum + workout.setCount, 0)
  const totalVolume = workouts.reduce((sum, workout) => sum + workout.volume, 0)
  const listWorkouts = useMemo(() => {
    if (view !== 'monthly') return workouts
    const start = startOfDay(selectedDate).getTime()
    const end = start + DAY_MS
    return workouts.filter((workout) => workout.startedAt >= start && workout.startedAt < end)
  }, [selectedDate, view, workouts])
  const viewLabel = view.charAt(0).toUpperCase() + view.slice(1)

  return (
    <View style={styles.container}>
      <ScreenHeader
        title={formatDateTitle(selectedDate, view)}
        eyebrow="Calendar"
        showFade={showHeaderFade}
        rightContent={(
          <ScreenHeaderButton label={viewLabel} onPress={showViewPicker} />
        )}
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        onScroll={handleHeaderScroll}
        scrollEventThrottle={16}
      >
        <View style={styles.dateNavRow}>
          <TouchableOpacity style={styles.navButton} onPress={() => moveDate(-1)}>
            <MaterialCommunityIcons name="chevron-left" size={20} color={theme.colors.text} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.todayButton} onPress={() => setSelectedDate(new Date())}>
            <Text style={styles.todayButtonText}>Today</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.navButton} onPress={() => moveDate(1)}>
            <MaterialCommunityIcons name="chevron-right" size={20} color={theme.colors.text} />
          </TouchableOpacity>
        </View>

        <View style={styles.summaryRow}>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryValue}>{workouts.length}</Text>
            <Text style={styles.summaryLabel}>Workouts</Text>
          </View>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryValue}>{totalSets}</Text>
            <Text style={styles.summaryLabel}>Sets</Text>
          </View>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryValue}>{Math.round(totalVolume)}</Text>
            <Text style={styles.summaryLabel}>kg volume</Text>
          </View>
        </View>

        {view !== 'daily' ? (
          <CalendarStrip
            view={view}
            selectedDate={selectedDate}
            workouts={workouts}
            onSelectDate={setSelectedDate}
          />
        ) : null}

        <View style={styles.listHeader}>
          <Text style={styles.listTitle}>
            {view === 'monthly'
              ? selectedDate.toLocaleDateString([], { month: 'short', day: 'numeric' })
              : 'Saved Workouts'}
          </Text>
        </View>

        {loading ? (
          <Text style={styles.emptyText}>Loading workouts...</Text>
        ) : listWorkouts.length === 0 ? (
          <Text style={styles.emptyText}>
            No saved workouts for this {view === 'monthly' ? 'day' : view} view.
          </Text>
        ) : (
          listWorkouts.map((workout) => (
            <WorkoutSummaryCard
              key={workout.id}
              workout={workout}
              title={workout.name || `${formatTime(workout.startedAt)} workout`}
              expanded={Boolean(expandedWorkoutIds[workout.id])}
              preview={workoutPreviews[workout.id]}
              previewLoading={Boolean(previewLoading[workout.id])}
              onOpen={() => openWorkout(workout.id)}
              onToggle={() => toggleWorkoutPreview(workout.id)}
            />
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
        onUpdated={handleWorkoutUpdated}
      />

      <ThemedDialog
        visible={!!dialog}
        title={dialog?.title ?? ''}
        message={dialog?.message}
        actions={dialog?.actions ?? []}
      />
    </View>
  )
}

function CalendarStrip({
  view,
  selectedDate,
  workouts,
  onSelectDate,
}: {
  view: CalendarView
  selectedDate: Date
  workouts: WorkoutSummary[]
  onSelectDate: (date: Date) => void
}) {
  const { styles } = useStyles(stylesheet)
  const days = useMemo(() => {
    if (view === 'weekly') {
      const start = startOfWeek(selectedDate)
      return Array.from({ length: 7 }, (_, index) => new Date(start.getTime() + index * DAY_MS))
    }
    const monthStart = startOfMonth(selectedDate)
    const gridStart = startOfWeek(monthStart)
    return Array.from({ length: 35 }, (_, index) => new Date(gridStart.getTime() + index * DAY_MS))
  }, [selectedDate, view])

  function countForDay(day: Date) {
    const start = startOfDay(day).getTime()
    const end = start + DAY_MS
    return workouts.filter((workout) => workout.startedAt >= start && workout.startedAt < end).length
  }

  return (
    <View style={styles.calendarGrid}>
      {days.map((day) => {
        const count = countForDay(day)
        const isToday = startOfDay(day).getTime() === startOfDay(new Date()).getTime()
        const isSelected = startOfDay(day).getTime() === startOfDay(selectedDate).getTime()
        const isCurrentMonth = day.getMonth() === selectedDate.getMonth()
        return (
          <TouchableOpacity
            key={day.toISOString()}
            style={[
              styles.dayCell,
              isToday && styles.todayCell,
              isSelected && styles.selectedDayCell,
              view === 'monthly' && !isCurrentMonth && styles.outsideMonthCell,
            ]}
            onPress={() => onSelectDate(day)}
            activeOpacity={0.75}
          >
            <Text style={[styles.dayText, isToday && styles.todayText]}>
              {day.getDate()}
            </Text>
            {count > 0 ? <View style={styles.workoutDot} /> : null}
          </TouchableOpacity>
        )
      })}
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
  dateNavRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.sm,
  },
  navButton: {
    width: 38,
    height: 38,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  todayButton: {
    minHeight: 38,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.md,
  },
  todayButtonText: {
    color: theme.colors.text,
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.bold,
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
    padding: theme.spacing.md,
  },
  summaryValue: {
    color: theme.colors.text,
    fontSize: theme.fontSize.lg,
    fontFamily: theme.fontFamily.extraBold,
  },
  summaryLabel: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
    fontFamily: theme.fontFamily.semiBold,
    marginTop: 2,
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.sm,
  },
  dayCell: {
    width: '14.285%',
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    opacity: 1,
  },
  todayCell: {
    backgroundColor: theme.colors.accentMuted,
    borderRadius: theme.radius.md,
  },
  selectedDayCell: {
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.accent,
  },
  outsideMonthCell: {
    opacity: 0.32,
  },
  dayText: {
    color: theme.colors.text,
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.bold,
  },
  todayText: {
    color: theme.colors.accent,
  },
  workoutDot: {
    width: 5,
    height: 5,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.accent,
  },
  listHeader: {
    marginTop: theme.spacing.sm,
  },
  listTitle: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
    fontFamily: theme.fontFamily.bold,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  emptyText: {
    color: theme.colors.textMuted,
    textAlign: 'center',
    paddingVertical: theme.spacing.xl,
    fontSize: theme.fontSize.sm,
  },
}))
