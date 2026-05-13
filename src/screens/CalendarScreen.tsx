import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { createStyleSheet, useStyles } from 'react-native-unistyles';
import ScreenHeader, { useHeaderFade } from '@/components/ui/ScreenHeader';
import {
  WorkoutDetailModal,
  WorkoutSummaryCard,
} from '@/components/WorkoutHistory';
import {
  getCompletedWorkoutsPage,
  getCompletedWorkoutsInRange,
  getWorkoutDetail,
  type WorkoutDetail,
  type WorkoutSummary,
} from '@/db/workoutHelpers';

type CalendarView = 'daily' | 'weekly' | 'monthly';
type DailyMode = 'all' | 'day';

const DAY_MS = 24 * 60 * 60 * 1000;
const WORKOUT_PAGE_SIZE = 10;

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function endOfDay(date: Date) {
  return new Date(startOfDay(date).getTime() + DAY_MS);
}

function startOfWeek(date: Date) {
  const day = startOfDay(date);
  const diff = day.getDay();
  return new Date(day.getTime() - diff * DAY_MS);
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 1);
}

function formatTime(timestamp: number) {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatWorkoutDateSubtitle(timestamp: number) {
  const date = new Date(timestamp);
  const today = startOfDay(new Date());
  const workoutDay = startOfDay(date);
  const diffDays = Math.round(
    (today.getTime() - workoutDay.getTime()) / DAY_MS,
  );
  const dateLabel = date.toLocaleDateString([], {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: date.getFullYear() === today.getFullYear() ? undefined : 'numeric',
  });

  if (diffDays === 0) return `Today - ${dateLabel}`;
  if (diffDays === 1) return `Yesterday - ${dateLabel}`;
  return dateLabel;
}

function formatSummaryDate(timestamp: number | undefined) {
  if (!timestamp) return '-';
  const date = new Date(timestamp);
  const today = startOfDay(new Date());
  const day = startOfDay(date);
  const diffDays = Math.round((today.getTime() - day.getTime()) / DAY_MS);

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  return date.toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
  });
}

function formatDateTitle(date: Date, view: CalendarView) {
  if (view === 'daily') {
    return 'Workout History';
  }
  if (view === 'weekly') {
    const start = startOfWeek(date);
    const end = new Date(start.getTime() + 6 * DAY_MS);
    return `${start.toLocaleDateString([], {
      month: 'short',
      day: 'numeric',
    })} - ${end.toLocaleDateString([], { month: 'short', day: 'numeric' })}`;
  }
  return date.toLocaleDateString([], { month: 'long', year: 'numeric' });
}

function getRange(date: Date, view: CalendarView) {
  if (view === 'daily') {
    const start = startOfDay(date);
    return { start, end: endOfDay(date) };
  }
  if (view === 'weekly') {
    const start = startOfWeek(date);
    return { start, end: new Date(start.getTime() + 7 * DAY_MS) };
  }
  return { start: startOfMonth(date), end: endOfMonth(date) };
}

export default function CalendarScreen() {
  const { styles, theme } = useStyles(stylesheet);
  const { showHeaderFade, handleHeaderScroll } = useHeaderFade();
  const [view, setView] = useState<CalendarView>('daily');
  const [dailyMode, setDailyMode] = useState<DailyMode>('all');
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [workouts, setWorkouts] = useState<WorkoutSummary[]>([]);
  const [selectedWorkoutId, setSelectedWorkoutId] = useState<string | null>(
    null,
  );
  const [selectedWorkout, setSelectedWorkout] = useState<WorkoutDetail | null>(
    null,
  );
  const [workoutDetailLoading, setWorkoutDetailLoading] = useState(false);
  const [expandedWorkoutIds, setExpandedWorkoutIds] = useState<
    Record<string, boolean>
  >({});
  const [workoutPreviews, setWorkoutPreviews] = useState<
    Record<string, WorkoutDetail | null>
  >({});
  const [previewLoading, setPreviewLoading] = useState<Record<string, boolean>>(
    {},
  );
  const [loading, setLoading] = useState(true);
  const [visibleWorkoutCount, setVisibleWorkoutCount] =
    useState(WORKOUT_PAGE_SIZE);
  const [hasMoreDailyWorkouts, setHasMoreDailyWorkouts] = useState(false);
  const workoutDetailRequestRef = useRef(0);

  const range = useMemo(
    () => getRange(selectedDate, view),
    [selectedDate, view],
  );

  const loadWorkouts = useCallback(async () => {
    setLoading(true);
    try {
      if (view === 'daily' && dailyMode === 'all') {
        const rows = await getCompletedWorkoutsPage(visibleWorkoutCount + 1);
        setHasMoreDailyWorkouts(rows.length > visibleWorkoutCount);
        setWorkouts(rows.slice(0, visibleWorkoutCount));
      } else {
        const rows = await getCompletedWorkoutsInRange(
          range.start.getTime(),
          range.end.getTime(),
        );
        setHasMoreDailyWorkouts(false);
        setWorkouts(rows);
      }
    } catch (e) {
      console.error('Failed to load workouts', e);
      setWorkouts([]);
      setHasMoreDailyWorkouts(false);
    } finally {
      setLoading(false);
    }
  }, [dailyMode, range.end, range.start, view, visibleWorkoutCount]);

  useEffect(() => {
    setVisibleWorkoutCount(WORKOUT_PAGE_SIZE);
  }, [dailyMode, view]);

  useFocusEffect(
    useCallback(() => {
      let isActive = true;
      loadWorkouts().finally(() => {
        if (!isActive) return;
      });
      return () => {
        isActive = false;
      };
    }, [loadWorkouts]),
  );

  function openWorkout(workoutId: string) {
    const requestId = workoutDetailRequestRef.current + 1;
    workoutDetailRequestRef.current = requestId;
    setSelectedWorkoutId(workoutId);
    setSelectedWorkout(null);
    setWorkoutDetailLoading(true);

    getWorkoutDetail(workoutId)
      .then(detail => {
        if (workoutDetailRequestRef.current !== requestId) return;
        setSelectedWorkout(detail);
      })
      .catch(e => {
        if (workoutDetailRequestRef.current !== requestId) return;
        console.error('Failed to load workout detail', e);
      })
      .finally(() => {
        if (workoutDetailRequestRef.current !== requestId) return;
        setWorkoutDetailLoading(false);
      });
  }

  function closeWorkoutDetail() {
    workoutDetailRequestRef.current += 1;
    setSelectedWorkoutId(null);
    setSelectedWorkout(null);
    setWorkoutDetailLoading(false);
  }

  function toggleWorkoutPreview(workoutId: string) {
    setExpandedWorkoutIds(prev => ({ ...prev, [workoutId]: !prev[workoutId] }));
    if (workoutPreviews[workoutId] !== undefined || previewLoading[workoutId])
      return;

    setPreviewLoading(prev => ({ ...prev, [workoutId]: true }));
    getWorkoutDetail(workoutId)
      .then(detail => {
        setWorkoutPreviews(prev => ({ ...prev, [workoutId]: detail }));
      })
      .catch(e => {
        console.error('Failed to load workout preview', e);
        setWorkoutPreviews(prev => ({ ...prev, [workoutId]: null }));
      })
      .finally(() => {
        setPreviewLoading(prev => ({ ...prev, [workoutId]: false }));
      });
  }

  function handleWorkoutRenamed(workoutId: string, name: string) {
    setWorkouts(prev =>
      prev.map(workout =>
        workout.id === workoutId
          ? { ...workout, name: name.trim() || null }
          : workout,
      ),
    );
    setSelectedWorkout(prev =>
      prev?.id === workoutId ? { ...prev, name: name.trim() || null } : prev,
    );
  }

  function handleWorkoutUpdated(workoutId: string, workout: WorkoutDetail) {
    setSelectedWorkout(workout);
    setWorkoutPreviews(prev => ({ ...prev, [workoutId]: workout }));
    loadWorkouts().catch(console.error);
  }

  function handleWorkoutDeleted(workoutId: string) {
    setSelectedWorkoutId(null);
    setSelectedWorkout(null);
    setWorkoutDetailLoading(false);
    setExpandedWorkoutIds(prev => {
      const next = { ...prev };
      delete next[workoutId];
      return next;
    });
    setWorkoutPreviews(prev => {
      const next = { ...prev };
      delete next[workoutId];
      return next;
    });
    setPreviewLoading(prev => {
      const next = { ...prev };
      delete next[workoutId];
      return next;
    });
    loadWorkouts().catch(console.error);
  }

  function moveDate(direction: -1 | 1) {
    setSelectedDate(current => {
      if (view === 'daily') {
        return new Date(current.getTime() + direction * DAY_MS);
      }
      if (view === 'weekly') {
        return new Date(current.getTime() + direction * 7 * DAY_MS);
      }
      return new Date(current.getFullYear(), current.getMonth() + direction, 1);
    });
  }

  function jumpDate(direction: -1 | 1) {
    setSelectedDate(current => {
      if (view === 'daily') {
        return new Date(current.getTime() + direction * 7 * DAY_MS);
      }
      if (view === 'weekly') {
        return new Date(current.getTime() + direction * 28 * DAY_MS);
      }
      return new Date(current.getFullYear() + direction, current.getMonth(), 1);
    });
  }

  const totalSets = workouts.reduce(
    (sum, workout) => sum + workout.setCount,
    0,
  );
  const totalVolume = workouts.reduce(
    (sum, workout) => sum + workout.volume,
    0,
  );
  const allDailySummaryItems = useMemo(() => {
    const newestWorkout = workouts[0];
    const oldestShownWorkout = workouts[workouts.length - 1];
    return [
      {
        value: String(workouts.length),
        label: hasMoreDailyWorkouts ? 'Shown so far' : 'Shown',
      },
      {
        value: formatSummaryDate(newestWorkout?.startedAt),
        label: 'Newest',
      },
      {
        value: formatSummaryDate(oldestShownWorkout?.startedAt),
        label: hasMoreDailyWorkouts ? 'Loaded through' : 'Oldest',
      },
    ];
  }, [hasMoreDailyWorkouts, workouts]);
  const selectedDaySummaryItems = useMemo(
    () => [
      { value: String(workouts.length), label: 'Workouts' },
      { value: String(totalSets), label: 'Sets' },
      { value: String(Math.round(totalVolume)), label: 'kg volume' },
    ],
    [totalSets, totalVolume, workouts.length],
  );
  const periodSummaryItems = useMemo(
    () => [
      { value: String(workouts.length), label: 'Workouts' },
      { value: String(totalSets), label: 'Sets' },
      { value: String(Math.round(totalVolume)), label: 'kg volume' },
    ],
    [totalSets, totalVolume, workouts.length],
  );
  const summaryItems =
    view === 'daily'
      ? dailyMode === 'all'
        ? allDailySummaryItems
        : selectedDaySummaryItems
      : periodSummaryItems;
  const listWorkouts = useMemo(() => {
    if (view === 'daily') return workouts;
    const start = startOfDay(selectedDate).getTime();
    const end = start + DAY_MS;
    return workouts.filter(
      workout => workout.startedAt >= start && workout.startedAt < end,
    );
  }, [selectedDate, view, workouts]);
  const viewLabel = view.charAt(0).toUpperCase() + view.slice(1);
  const periodLabel =
    view === 'daily'
      ? selectedDate.toLocaleDateString([], { month: 'short', day: 'numeric' })
      : formatDateTitle(selectedDate, view);

  return (
    <View style={styles.container}>
      <ScreenHeader
        title={formatDateTitle(selectedDate, view)}
        eyebrow="Calendar"
        showFade={showHeaderFade}
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        onScroll={handleHeaderScroll}
        scrollEventThrottle={16}
      >
        <View style={styles.viewToggleRow}>
          {(['daily', 'weekly', 'monthly'] as CalendarView[]).map(item => (
            <TouchableOpacity
              key={item}
              style={[
                styles.viewToggleButton,
                view === item && styles.activeViewToggleButton,
              ]}
              onPress={() => setView(item)}
              activeOpacity={0.82}
            >
              <Text
                style={[
                  styles.viewToggleText,
                  view === item && styles.activeViewToggleText,
                ]}
              >
                {item.charAt(0).toUpperCase() + item.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {view !== 'daily' || dailyMode === 'day' ? (
          <View style={styles.dateNavRow}>
            <TouchableOpacity
              style={styles.navButton}
              onPress={() => jumpDate(-1)}
              activeOpacity={0.82}
            >
              <MaterialCommunityIcons
                name="chevron-double-left"
                size={19}
                color={theme.colors.text}
              />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.navButton}
              onPress={() => moveDate(-1)}
              activeOpacity={0.82}
            >
              <MaterialCommunityIcons
                name="chevron-left"
                size={20}
                color={theme.colors.text}
              />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.todayButton}
              onPress={() => setSelectedDate(new Date())}
              activeOpacity={0.82}
            >
              <Text style={styles.todayButtonText}>Today</Text>
              <Text style={styles.periodLabel} numberOfLines={1}>
                {periodLabel}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.navButton}
              onPress={() => moveDate(1)}
              activeOpacity={0.82}
            >
              <MaterialCommunityIcons
                name="chevron-right"
                size={20}
                color={theme.colors.text}
              />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.navButton}
              onPress={() => jumpDate(1)}
              activeOpacity={0.82}
            >
              <MaterialCommunityIcons
                name="chevron-double-right"
                size={19}
                color={theme.colors.text}
              />
            </TouchableOpacity>
          </View>
        ) : null}

        {view === 'daily' ? (
          <View style={styles.dailyModeBlock}>
            <View style={styles.dailyModeToggleRow}>
              {([
                ['all', 'All'],
                ['day', 'Day by day'],
              ] as Array<[DailyMode, string]>).map(([mode, label]) => (
                <TouchableOpacity
                  key={mode}
                  style={[
                    styles.dailyModeButton,
                    dailyMode === mode && styles.activeDailyModeButton,
                  ]}
                  onPress={() => setDailyMode(mode)}
                  activeOpacity={0.82}
                >
                  <Text
                    style={[
                      styles.dailyModeText,
                      dailyMode === mode && styles.activeDailyModeText,
                    ]}
                  >
                    {label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.dailyHintRow}>
              <MaterialCommunityIcons
                name={
                  dailyMode === 'all'
                    ? 'sort-clock-descending-outline'
                    : 'calendar-today-outline'
                }
                size={17}
                color={theme.colors.textMuted}
              />
              <Text style={styles.dailyHintText}>
                {dailyMode === 'all'
                  ? 'Newest saved workouts first'
                  : 'Showing workouts for the selected day'}
              </Text>
            </View>
          </View>
        ) : null}

        <View style={styles.currentViewRow}>
          <Text style={styles.currentViewText}>{viewLabel}</Text>
        </View>

        <View style={styles.summaryRow}>
          {summaryItems.map(item => (
            <View key={item.label} style={styles.summaryItem}>
              <Text style={styles.summaryValue} numberOfLines={1}>
                {item.value}
              </Text>
              <Text style={styles.summaryLabel} numberOfLines={1}>
                {item.label}
              </Text>
            </View>
          ))}
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
            {view === 'daily'
              ? dailyMode === 'all'
                ? 'All Workouts'
                : selectedDate.toLocaleDateString([], {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                  })
              : selectedDate.toLocaleDateString([], {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric',
                })}
          </Text>
        </View>

        {loading ? (
          <Text style={styles.emptyText}>Loading workouts...</Text>
        ) : listWorkouts.length === 0 ? (
          <Text style={styles.emptyText}>
            {view === 'daily'
              ? dailyMode === 'all'
                ? 'No saved workouts yet.'
                : 'No saved workouts for this day.'
              : 'No saved workouts for this day.'}
          </Text>
        ) : (
          listWorkouts.map((workout, index) => {
            const previousWorkout = listWorkouts[index - 1];
            const showDateSubtitle =
              view === 'daily' &&
              dailyMode === 'all' &&
              (!previousWorkout ||
                startOfDay(new Date(previousWorkout.startedAt)).getTime() !==
                  startOfDay(new Date(workout.startedAt)).getTime());

            return (
              <View key={workout.id} style={styles.workoutListItem}>
                {showDateSubtitle ? (
                  <Text style={styles.workoutDateSubtitle}>
                    {formatWorkoutDateSubtitle(workout.startedAt)}
                  </Text>
                ) : null}
                <WorkoutSummaryCard
                  workout={workout}
                  title={
                    workout.name || `${formatTime(workout.startedAt)} workout`
                  }
                  expanded={Boolean(expandedWorkoutIds[workout.id])}
                  preview={workoutPreviews[workout.id]}
                  previewLoading={Boolean(previewLoading[workout.id])}
                  onOpen={() => openWorkout(workout.id)}
                  onToggle={() => toggleWorkoutPreview(workout.id)}
                />
              </View>
            );
          })
        )}

        {!loading &&
        view === 'daily' &&
        dailyMode === 'all' &&
        hasMoreDailyWorkouts ? (
          <TouchableOpacity
            style={styles.showMoreButton}
            onPress={() =>
              setVisibleWorkoutCount(count => count + WORKOUT_PAGE_SIZE)
            }
            activeOpacity={0.82}
          >
            <Text style={styles.showMoreButtonText}>Show 10 More</Text>
            <MaterialCommunityIcons
              name="chevron-down"
              size={18}
              color={theme.colors.accent}
            />
          </TouchableOpacity>
        ) : null}
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
    </View>
  );
}

function CalendarStrip({
  view,
  selectedDate,
  workouts,
  onSelectDate,
}: {
  view: CalendarView;
  selectedDate: Date;
  workouts: WorkoutSummary[];
  onSelectDate: (date: Date) => void;
}) {
  const { styles } = useStyles(stylesheet);
  const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const days = useMemo(() => {
    if (view === 'weekly') {
      const start = startOfWeek(selectedDate);
      return Array.from(
        { length: 7 },
        (_, index) => new Date(start.getTime() + index * DAY_MS),
      );
    }
    const monthStart = startOfMonth(selectedDate);
    const gridStart = startOfWeek(monthStart);
    return Array.from(
      { length: 42 },
      (_, index) => new Date(gridStart.getTime() + index * DAY_MS),
    );
  }, [selectedDate, view]);

  function countForDay(day: Date) {
    const start = startOfDay(day).getTime();
    const end = start + DAY_MS;
    return workouts.filter(
      workout => workout.startedAt >= start && workout.startedAt < end,
    ).length;
  }

  return (
    <View style={styles.calendarShell}>
      <View style={styles.weekdayRow}>
        {weekDays.map(day => (
          <Text key={day} style={styles.weekdayText}>
            {day}
          </Text>
        ))}
      </View>
      <View style={styles.calendarGrid}>
        {days.map(day => {
          const count = countForDay(day);
          const isToday =
            startOfDay(day).getTime() === startOfDay(new Date()).getTime();
          const isSelected =
            startOfDay(day).getTime() === startOfDay(selectedDate).getTime();
          const isCurrentMonth = day.getMonth() === selectedDate.getMonth();
          return (
            <TouchableOpacity
              key={day.toISOString()}
              style={styles.dayCell}
              onPress={() => onSelectDate(day)}
              activeOpacity={0.82}
            >
              <View
                style={[
                  styles.dayCellInner,
                  isToday && styles.todayCell,
                  isSelected && styles.selectedDayCell,
                  view === 'monthly' &&
                    !isCurrentMonth &&
                    styles.outsideMonthCell,
                ]}
              >
                <Text style={[styles.dayText, isToday && styles.todayText]}>
                  {day.getDate()}
                </Text>
                <View style={styles.workoutMarkerSlot}>
                  {count > 0 ? <View style={styles.workoutDot} /> : null}
                </View>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const stylesheet = createStyleSheet(theme => ({
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
    gap: theme.spacing.xs,
  },
  viewToggleRow: {
    flexDirection: 'row',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.full,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 3,
  },
  viewToggleButton: {
    flex: 1,
    minHeight: 34,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.sm,
  },
  activeViewToggleButton: {
    backgroundColor: theme.colors.accent,
  },
  viewToggleText: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.bold,
  },
  activeViewToggleText: {
    color: '#FFFFFF',
  },
  navButton: {
    width: 36,
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
    flex: 1,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.sm,
  },
  todayButtonText: {
    color: theme.colors.text,
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.bold,
  },
  periodLabel: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xxs,
    fontFamily: theme.fontFamily.semiBold,
    marginTop: 1,
  },
  dailyModeBlock: {
    gap: theme.spacing.xs,
  },
  dailyModeToggleRow: {
    flexDirection: 'row',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.full,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 3,
  },
  dailyModeButton: {
    flex: 1,
    minHeight: 30,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.sm,
  },
  activeDailyModeButton: {
    backgroundColor: theme.colors.surface2,
  },
  dailyModeText: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
    fontFamily: theme.fontFamily.bold,
  },
  activeDailyModeText: {
    color: theme.colors.text,
    fontFamily: theme.fontFamily.extraBold,
  },
  dailyHintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.xs,
  },
  dailyHintText: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
    fontFamily: theme.fontFamily.semiBold,
  },
  currentViewRow: {
    alignItems: 'center',
  },
  currentViewText: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
    fontFamily: theme.fontFamily.bold,
    textTransform: 'uppercase',
    letterSpacing: 1,
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
  calendarShell: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.sm,
  },
  weekdayRow: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  weekdayText: {
    width: '14.285%',
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xxs,
    fontFamily: theme.fontFamily.extraBold,
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dayCell: {
    width: '14.285%',
    height: 46,
    padding: 2,
  },
  dayCellInner: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: 'transparent',
    opacity: 1,
  },
  todayCell: {
    backgroundColor: theme.colors.accentMuted,
  },
  selectedDayCell: {
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
  workoutMarkerSlot: {
    height: 7,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
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
  workoutListItem: {
    gap: theme.spacing.xs,
  },
  workoutDateSubtitle: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.extraBold,
  },
  emptyText: {
    color: theme.colors.textMuted,
    textAlign: 'center',
    paddingVertical: theme.spacing.xl,
    fontSize: theme.fontSize.sm,
  },
  showMoreButton: {
    minHeight: 42,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.xs,
  },
  showMoreButtonText: {
    color: theme.colors.accent,
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.extraBold,
  },
}));
