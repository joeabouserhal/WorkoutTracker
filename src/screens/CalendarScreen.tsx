import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Modal,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons'
import { createStyleSheet, useStyles } from 'react-native-unistyles'
import {
  deleteWorkout,
  getCompletedWorkoutsInRange,
  getWorkoutDetail,
  updateWorkoutName,
  type WorkoutDetail,
  type WorkoutSummary,
} from '@/db/workoutHelpers'
import ThemedDialog, { type ThemedDialogAction } from '@/components/ui/ThemedDialog'

type CalendarView = 'daily' | 'weekly' | 'monthly'

const DAY_MS = 24 * 60 * 60 * 1000
const LB_PER_KG = 2.20462

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
  const [view, setView] = useState<CalendarView>('daily')
  const [selectedDate, setSelectedDate] = useState(() => new Date())
  const [workouts, setWorkouts] = useState<WorkoutSummary[]>([])
  const [selectedWorkout, setSelectedWorkout] = useState<WorkoutDetail | null>(null)
  const [loading, setLoading] = useState(true)
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

  async function openWorkout(workoutId: string) {
    try {
      const detail = await getWorkoutDetail(workoutId)
      setSelectedWorkout(detail)
    } catch (e) {
      console.error('Failed to load workout detail', e)
    }
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

  function requestDeleteWorkout(workoutId: string) {
    setDialog({
      title: 'Delete Workout',
      message: 'Delete this saved workout? This cannot be undone.',
      actions: [
        { label: 'Cancel', onPress: closeDialog },
        {
          label: 'Delete Workout',
          variant: 'danger',
          onPress: () => {
            closeDialog()
            deleteWorkout(workoutId)
              .then(() => {
                setSelectedWorkout(null)
                loadWorkouts().catch(console.error)
              })
              .catch((e) => console.error('Failed to delete workout', e))
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

  return (
    <>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
      >
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.sectionLabel}>Calendar</Text>
            <Text style={styles.title}>{formatDateTitle(selectedDate, view)}</Text>
          </View>
          <TouchableOpacity style={styles.viewButton} onPress={showViewPicker}>
            <Text style={styles.viewButtonText}>{view}</Text>
          </TouchableOpacity>
        </View>

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
            <TouchableOpacity
              key={workout.id}
              style={styles.workoutCard}
              onPress={() => openWorkout(workout.id)}
            >
              <View>
                <Text style={styles.workoutTitle}>
                  {workout.name || `${formatTime(workout.startedAt)} workout`}
                </Text>
                <Text style={styles.workoutMeta}>
                  {formatDuration(workout.startedAt, workout.endedAt)} - {workout.exerciseCount} exercises - {workout.setCount} sets
                </Text>
              </View>
              <MaterialCommunityIcons
                name="chevron-right"
                size={22}
                color={theme.colors.textMuted}
              />
            </TouchableOpacity>
          ))
        )}
      </ScrollView>

      <WorkoutDetailModal
        workout={selectedWorkout}
        onClose={() => setSelectedWorkout(null)}
        onDelete={requestDeleteWorkout}
        onRename={handleWorkoutRenamed}
      />

      <ThemedDialog
        visible={!!dialog}
        title={dialog?.title ?? ''}
        message={dialog?.message}
        actions={dialog?.actions ?? []}
      />
    </>
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

function WorkoutDetailModal({
  workout,
  onClose,
  onDelete,
  onRename,
}: {
  workout: WorkoutDetail | null
  onClose: () => void
  onDelete: (workoutId: string) => void
  onRename: (workoutId: string, name: string) => void
}) {
  const { styles, theme } = useStyles(stylesheet)
  const [name, setName] = useState('')
  const [showDefaultUnits, setShowDefaultUnits] = useState<Record<string, boolean>>({})

  useEffect(() => {
    setName(workout?.name || '')
    setShowDefaultUnits({})
  }, [workout])

  if (!workout) return null
  const workoutId = workout.id

  function saveName() {
    updateWorkoutName(workoutId, name)
      .then(() => onRename(workoutId, name))
      .catch((e) => console.error('Failed to rename workout', e))
  }

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={styles.detailRoot}>
        <View style={styles.detailHeader}>
          <TouchableOpacity style={styles.viewButton} onPress={onClose}>
            <Text style={styles.viewButtonText}>Back</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.deleteButton} onPress={() => onDelete(workout.id)}>
            <MaterialCommunityIcons name="trash-can-outline" size={18} color="#FFFFFF" />
            <Text style={styles.deleteButtonText}>Delete</Text>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.detailContent}>
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
          <Text style={styles.detailTitle}>
            {new Date(workout.startedAt).toLocaleDateString([], {
              weekday: 'long',
              month: 'long',
              day: 'numeric',
            })}
          </Text>
          <Text style={styles.detailMeta}>
            {formatTime(workout.startedAt)} - {formatDuration(workout.startedAt, workout.endedAt)}
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
                  <Text style={styles.exerciseTitle}>
                    {exercise.exerciseName}
                    <Text style={styles.exerciseMethod}> - {exercise.methodName}</Text>
                  </Text>
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
                  exercise.sets.map((set, index) => (
                    <View key={set.id} style={styles.setRow}>
                      <Text style={styles.setIndex}>{index + 1}</Text>
                      <Text style={styles.setValue}>
                        {formatSetWeight(set.weightKg, displayUnit ?? set.weightUnit)}
                      </Text>
                      <Text style={styles.setValue}>{set.reps} reps</Text>
                      <Text style={[styles.setValue, { color: theme.colors.textMuted }]}>
                        {Math.round(set.volume)} kg
                      </Text>
                    </View>
                  ))
                )}
              </View>
            )
          })}
        </ScrollView>
      </View>
    </Modal>
  )
}

const stylesheet = createStyleSheet((theme) => ({
  scroll: {
    flex: 1,
    backgroundColor: theme.colors.bg,
  },
  content: {
    padding: theme.spacing.md,
    paddingBottom: theme.spacing.xl,
    gap: theme.spacing.md,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: theme.spacing.lg,
    gap: theme.spacing.md,
  },
  sectionLabel: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: theme.spacing.xs,
  },
  title: {
    color: theme.colors.text,
    fontSize: theme.fontSize.xl,
    fontWeight: '800',
  },
  viewButton: {
    alignSelf: 'flex-start',
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
    textTransform: 'capitalize',
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
    fontWeight: '700',
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
    fontWeight: '800',
  },
  summaryLabel: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
    fontWeight: '600',
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
    fontWeight: '700',
  },
  todayText: {
    color: theme.colors.accent,
  },
  workoutDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: theme.colors.accent,
  },
  listHeader: {
    marginTop: theme.spacing.sm,
  },
  listTitle: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  emptyText: {
    color: theme.colors.textMuted,
    textAlign: 'center',
    paddingVertical: theme.spacing.xl,
    fontSize: theme.fontSize.sm,
  },
  workoutCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.md,
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
  detailRoot: {
    flex: 1,
    backgroundColor: theme.colors.bg,
  },
  detailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.xl,
    paddingBottom: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    backgroundColor: theme.colors.danger,
    borderRadius: theme.radius.full,
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.md,
  },
  deleteButtonText: {
    color: '#FFFFFF',
    fontSize: theme.fontSize.sm,
    fontWeight: '700',
  },
  detailContent: {
    padding: theme.spacing.md,
    paddingBottom: theme.spacing.xl,
    gap: theme.spacing.md,
  },
  renameCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: theme.spacing.md,
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
    fontSize: theme.fontSize.xl,
    fontWeight: '800',
    minHeight: 42,
    padding: 0,
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
  exerciseCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    overflow: 'hidden',
  },
  exerciseTitle: {
    flex: 1,
    minWidth: 0,
    color: theme.colors.text,
    fontSize: theme.fontSize.md,
    fontWeight: '800',
  },
  exerciseTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  unitToggleButton: {
    minHeight: 30,
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
  emptySetText: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.sm,
    padding: theme.spacing.md,
  },
  setRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  setIndex: {
    width: 28,
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.sm,
    fontWeight: '700',
  },
  setValue: {
    flex: 1,
    color: theme.colors.text,
    fontSize: theme.fontSize.sm,
    fontWeight: '700',
  },
}))
