import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  InteractionManager,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text as RNText,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import {
  Canvas,
  Circle,
  Group,
  Line as SkiaLine,
  LinearGradient,
  Path,
  Skia,
  vec,
} from '@shopify/react-native-skia';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { createStyleSheet, useStyles } from 'react-native-unistyles';
import ThemedDialog, {
  type ThemedDialogAction,
} from '@/components/ui/ThemedDialog';
import ScreenHeader, { useHeaderFade } from '@/components/ui/ScreenHeader';
import {
  deleteBodyWeightLog,
  getBodyWeightLogs,
  logBodyWeight,
  updateBodyWeightLog,
  type WeightLog,
} from '@/db/bodyWeightHelpers';
import { getProfile } from '@/db/profileHelpers';
import {
  getProgressOverview,
  type ProgressExerciseSummary,
  type ProgressHighlight,
  type ProgressMethodSummary,
  type ProgressOverviewSummary,
  type ProgressPoint,
} from '@/db/progressHelpers';
import {
  getPinnedProgressExerciseIds,
  MAX_PINNED_PROGRESS_EXERCISES,
  setPinnedProgressExerciseIds,
} from '@/services/progressPins';

const CHART_HEIGHT = 116;
const CHART_PAD = { top: 14, right: 12, bottom: 22, left: 12 };
const LB_PER_KG = 2.20462;
const DEFAULT_VISIBLE_LIFT_COUNT = 8;
const WEIGHT_HISTORY_PAGE_SIZE = 10;

type WeightUnit = 'kg' | 'lb';
type ProgressSegment = 'overview' | 'lifts' | 'weight';

type DialogState = {
  title: string;
  message?: string;
  actions: ThemedDialogAction[];
};

type ChartPoint = {
  timestamp: number;
  value: number;
};

const progressSegments: Array<{
  key: ProgressSegment;
  label: string;
}> = [
  { key: 'overview', label: 'Overview' },
  { key: 'lifts', label: 'Lifts' },
  { key: 'weight', label: 'Weight' },
];

const emptySheet = createStyleSheet(() => ({}));

function normalizeWeightUnit(unit?: string | null): WeightUnit {
  return unit === 'lb' ? 'lb' : 'kg';
}

function convertKg(weightKg: number, unit: WeightUnit): number {
  return unit === 'lb' ? weightKg * LB_PER_KG : weightKg;
}

function formatWeightValue(weightKg: number, unit: WeightUnit): string {
  const value = convertKg(weightKg, unit);
  return value >= 100 ? value.toFixed(0) : value.toFixed(1);
}

function formatWeight(weightKg: number, unit: WeightUnit): string {
  return `${formatWeightValue(weightKg, unit)} ${unit}`;
}

function formatSignedWeight(weightKg: number, unit: WeightUnit): string {
  const value = convertKg(weightKg, unit);
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(1)} ${unit}`;
}

function formatShortDate(ts: number): string {
  const date = new Date(ts);
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function formatDateLabel(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

function formatWeightLogDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function getLayoutWidth(
  event: { nativeEvent?: { layout?: { width?: number } | null } } | null,
) {
  return event?.nativeEvent?.layout?.width ?? 0;
}

function getHighlightUnit(highlight: ProgressHighlight | null): WeightUnit {
  return normalizeWeightUnit(highlight?.weightUnit);
}

function formatCountLabel(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function formatHighlightSet(highlight: ProgressHighlight): string {
  return `${highlight.reps} ${highlight.reps === 1 ? 'rep' : 'reps'}`;
}

function getMethodDisplayUnit(
  method: ProgressMethodSummary | null,
  fallbackUnit: WeightUnit,
): WeightUnit {
  return method
    ? normalizeWeightUnit(method.currentPrUnit ?? method.latestUnit)
    : fallbackUnit;
}

function getWeightDelta(logs: WeightLog[]): number | null {
  if (logs.length < 2) return null;
  return logs[logs.length - 1].weight - logs[logs.length - 2].weight;
}

function makeChartData(
  points: ChartPoint[],
  width: number,
  height: number,
  pad = CHART_PAD,
) {
  if (width <= 0 || points.length < 2) return null;

  const plotW = Math.max(1, width - pad.left - pad.right);
  const plotH = Math.max(1, height - pad.top - pad.bottom);
  const values = points.map(point => point.value);
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const rangePadding = Math.max((maxValue - minValue) * 0.12, 0.5);
  const low = minValue - rangePadding;
  const high = maxValue + rangePadding;
  const range = high - low || 1;
  const bottomY = pad.top + plotH;

  const toX = (index: number) =>
    pad.left + (index / (points.length - 1)) * plotW;
  const toY = (value: number) =>
    pad.top + (1 - (value - low) / range) * plotH;

  const linePath = Skia.Path.Make();
  const fillPath = Skia.Path.Make();
  const dots = points.map((point, index) => {
    const x = toX(index);
    const y = toY(point.value);
    if (index === 0) {
      linePath.moveTo(x, y);
      fillPath.moveTo(x, y);
    } else {
      linePath.lineTo(x, y);
      fillPath.lineTo(x, y);
    }
    return { x, y };
  });

  fillPath.lineTo(toX(points.length - 1), bottomY);
  fillPath.lineTo(toX(0), bottomY);
  fillPath.close();

  return {
    linePath,
    fillPath,
    dots,
    bottomY,
    plotW,
    first: points[0],
    last: points[points.length - 1],
  };
}

function TrendLineChart({
  points,
  unit,
}: {
  points: ChartPoint[];
  unit: WeightUnit;
}) {
  const { theme } = useStyles(emptySheet);
  const [containerWidth, setContainerWidth] = useState(0);
  const chartData = useMemo(
    () => makeChartData(points, containerWidth, CHART_HEIGHT),
    [containerWidth, points],
  );
  const canvasStyle = useMemo(
    () => [chartStyles.canvas, { width: containerWidth, height: CHART_HEIGHT }],
    [containerWidth],
  );
  const leftLabelStyle = useMemo(
    () => [
      chartStyles.dateLabel,
      chartStyles.dateLabelLeft,
      { color: theme.colors.textMuted },
    ],
    [theme.colors.textMuted],
  );
  const rightLabelStyle = useMemo(
    () => [
      chartStyles.dateLabel,
      chartStyles.dateLabelRight,
      { color: theme.colors.textMuted },
    ],
    [theme.colors.textMuted],
  );
  const chartValueStyle = useMemo(
    () => [chartStyles.chartValue, { color: theme.colors.text }],
    [theme.colors.text],
  );
  const latestValue = points[points.length - 1]?.value ?? 0;

  return (
    <View
      style={chartStyles.chart}
      onLayout={event => setContainerWidth(getLayoutWidth(event))}
    >
      <View style={chartStyles.chartTopLabel}>
        <RNText style={chartValueStyle}>
          {latestValue.toFixed(latestValue >= 100 ? 0 : 1)} {unit}
        </RNText>
      </View>
      {chartData && containerWidth > 0 ? (
        <Canvas style={canvasStyle}>
          <SkiaLine
            p1={vec(CHART_PAD.left, chartData.bottomY)}
            p2={vec(CHART_PAD.left + chartData.plotW, chartData.bottomY)}
            color={theme.colors.border}
            strokeWidth={0.5}
          />
          <Path path={chartData.fillPath} style="fill">
            <LinearGradient
              start={vec(0, CHART_PAD.top)}
              end={vec(0, chartData.bottomY)}
              colors={[theme.colors.accent + '44', theme.colors.accent + '00']}
            />
          </Path>
          <Path
            path={chartData.linePath}
            style="stroke"
            strokeWidth={2}
            color={theme.colors.accent}
            strokeJoin="round"
            strokeCap="round"
          />
          {chartData.dots.map((dot, index) => (
            <Group key={`${dot.x}-${index}`}>
              <Circle cx={dot.x} cy={dot.y} r={4.5} color={theme.colors.surface2} />
              <Circle cx={dot.x} cy={dot.y} r={2.6} color={theme.colors.accent} />
            </Group>
          ))}
        </Canvas>
      ) : null}
      {chartData ? (
        <>
          <RNText style={leftLabelStyle}>
            {formatShortDate(chartData.first.timestamp)}
          </RNText>
          <RNText style={rightLabelStyle}>
            {formatShortDate(chartData.last.timestamp)}
          </RNText>
        </>
      ) : null}
    </View>
  );
}

function EmptyStrengthCard() {
  const { styles, theme } = useStyles(stylesheet);
  return (
    <View style={styles.emptyStrengthCard}>
      <View style={styles.emptyStrengthIcon}>
        <MaterialCommunityIcons
          name="chart-line-variant"
          size={22}
          color={theme.colors.accent}
        />
      </View>
      <RNText style={styles.emptyStrengthTitle}>No lift trends yet</RNText>
      <RNText style={styles.emptyStrengthText}>
        Finish weighted sets to unlock lift trends.
      </RNText>
    </View>
  );
}

type HighlightRowProps = {
  label: string;
  title: string;
  meta: string;
  iconName: string;
  onPress?: () => void;
};

function HighlightRow({
  label,
  title,
  meta,
  iconName,
  onPress,
}: HighlightRowProps) {
  const { styles, theme } = useStyles(stylesheet);
  const content = (
    <>
      <View style={styles.highlightRowIcon}>
        <MaterialCommunityIcons
          name={iconName}
          size={17}
          color={onPress ? theme.colors.accent : theme.colors.textMuted}
        />
      </View>
      <View style={styles.highlightRowText}>
        <RNText style={styles.highlightRowLabel} numberOfLines={1}>
          {label}
        </RNText>
        <RNText style={styles.highlightRowTitle} numberOfLines={1}>
          {title}
        </RNText>
        <RNText style={styles.highlightRowMeta} numberOfLines={1}>
          {meta}
        </RNText>
      </View>
      {onPress ? (
        <MaterialCommunityIcons
          name="chevron-right"
          size={20}
          color={theme.colors.textMuted}
        />
      ) : null}
    </>
  );

  if (!onPress) {
    return <View style={styles.highlightRow}>{content}</View>;
  }

  return (
    <TouchableOpacity
      style={styles.highlightRow}
      onPress={onPress}
      activeOpacity={0.82}
    >
      {content}
    </TouchableOpacity>
  );
}

export default function ProgressScreen() {
  const { styles, theme } = useStyles(stylesheet);
  const { showHeaderFade, handleHeaderScroll } = useHeaderFade();
  const scrollViewRef = useRef<ScrollView>(null);
  const [logs, setLogs] = useState<WeightLog[]>([]);
  const [weightUnit, setWeightUnit] = useState<WeightUnit>('kg');
  const [progressExercises, setProgressExercises] = useState<
    ProgressExerciseSummary[]
  >([]);
  const [progressSummary, setProgressSummary] =
    useState<ProgressOverviewSummary>({
      recentWindowDays: 30,
      recentPrCount: 0,
      recentImprovedLiftCount: 0,
      latestRecentPr: null,
      bestRecentImprovement: null,
      latestPr: null,
    });
  const [selectedProgressExerciseId, setSelectedProgressExerciseId] = useState<
    string | null
  >(null);
  const [selectedProgressMethodId, setSelectedProgressMethodId] = useState<
    string | null
  >(null);
  const [pinnedExerciseIds, setPinnedExerciseIdsState] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeSegment, setActiveSegment] =
    useState<ProgressSegment>('overview');
  const [showLiftDetail, setShowLiftDetail] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showOneRmInfo, setShowOneRmInfo] = useState(false);
  const [showAllPrHistory, setShowAllPrHistory] = useState(false);
  const [visibleWeightHistoryCount, setVisibleWeightHistoryCount] = useState(
    WEIGHT_HISTORY_PAGE_SIZE,
  );
  const [inputWeight, setInputWeight] = useState('');
  const [editingWeightLog, setEditingWeightLog] = useState<WeightLog | null>(
    null,
  );
  const [deleteWeightLogTarget, setDeleteWeightLogTarget] =
    useState<WeightLog | null>(null);
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [saving, setSaving] = useState(false);
  const loadRequestRef = useRef(0);

  useFocusEffect(
    useCallback(() => {
      let isActive = true;
      const task = InteractionManager.runAfterInteractions(() => {
        if (!isActive) return;
        loadData().catch(console.error);
      });

      return () => {
        isActive = false;
        task.cancel();
        loadRequestRef.current += 1;
      };
    }, []),
  );

  async function loadData() {
    const requestId = loadRequestRef.current + 1;
    loadRequestRef.current = requestId;
    try {
      const [profile, weightLogs, progressOverview] = await Promise.all([
        getProfile(),
        getBodyWeightLogs(),
        getProgressOverview(),
      ]);
      if (loadRequestRef.current !== requestId) return;
      setWeightUnit(normalizeWeightUnit(profile?.defaultWeightUnit));
      setLogs(weightLogs);
      setProgressExercises(progressOverview.exercises);
      setProgressSummary(progressOverview.summary);
      setPinnedExerciseIdsState(getPinnedProgressExerciseIds());
      setSelectedProgressExerciseId(current =>
        progressOverview.exercises.some(
          exercise => exercise.exerciseTypeId === current,
        )
          ? current
          : progressOverview.exercises[0]?.exerciseTypeId ?? null,
      );
    } catch (e) {
      if (loadRequestRef.current !== requestId) return;
      console.error('Failed to load progress data', e);
    } finally {
      if (loadRequestRef.current === requestId) {
        setLoading(false);
      }
    }
  }

  function closeDialog() {
    setDialog(null);
  }

  function showProgressDialog(title: string, message: string) {
    setDialog({
      title,
      message,
      actions: [{ label: 'OK', variant: 'primary', onPress: closeDialog }],
    });
  }

  async function handleSaveWeight() {
    const value = parseFloat(inputWeight);
    if (isNaN(value) || value <= 0) {
      showProgressDialog(
        'Invalid Weight',
        'Please enter a valid positive number.',
      );
      return;
    }

    const previousInputWeight = inputWeight;
    const weightKg = weightUnit === 'lb' ? value / LB_PER_KG : value;
    const targetLog = editingWeightLog;
    setSaving(true);
    setInputWeight('');
    setShowModal(false);
    setEditingWeightLog(null);
    try {
      if (targetLog) {
        await updateBodyWeightLog(targetLog.id, weightKg);
      } else {
        await logBodyWeight(weightKg);
      }
      await loadData();
    } catch (e) {
      setInputWeight(previousInputWeight);
      if (targetLog) {
        setEditingWeightLog(targetLog);
      } else {
        setShowModal(true);
      }
      showProgressDialog(
        'Something Went Wrong',
        targetLog ? 'Failed to update weight.' : 'Failed to log weight.',
      );
      console.error(e);
    } finally {
      setSaving(false);
    }
  }

  function openModal() {
    setEditingWeightLog(null);
    const sourceLog = logs[logs.length - 1];
    if (sourceLog) {
      setInputWeight(formatWeightValue(sourceLog.weight, weightUnit));
    } else {
      setInputWeight('');
    }
    setShowModal(true);
  }

  function openEditWeightModal(log: WeightLog) {
    setShowModal(false);
    setEditingWeightLog(log);
    setInputWeight(formatWeightValue(log.weight, weightUnit));
  }

  function closeWeightModal() {
    setShowModal(false);
    setEditingWeightLog(null);
    setInputWeight('');
  }

  async function confirmDeleteWeightLog() {
    const target = deleteWeightLogTarget;
    if (!target) return;

    setSaving(true);
    setDeleteWeightLogTarget(null);
    try {
      await deleteBodyWeightLog(target.id);
      await loadData();
    } catch (e) {
      setDeleteWeightLogTarget(target);
      showProgressDialog('Something Went Wrong', 'Failed to delete weight.');
      console.error(e);
    } finally {
      setSaving(false);
    }
  }

  function persistPinnedExerciseIds(nextIds: string[]) {
    const savedIds = setPinnedProgressExerciseIds(nextIds);
    setPinnedExerciseIdsState(savedIds);
  }

  function togglePinnedExercise(exerciseTypeId: string) {
    if (pinnedExerciseIds.includes(exerciseTypeId)) {
      persistPinnedExerciseIds(
        pinnedExerciseIds.filter(id => id !== exerciseTypeId),
      );
      return;
    }

    if (pinnedExerciseIds.length >= MAX_PINNED_PROGRESS_EXERCISES) {
      showProgressDialog(
        'Pinned Lifts Full',
        `You can pin up to ${MAX_PINNED_PROGRESS_EXERCISES} lifts.`,
      );
      return;
    }

    persistPinnedExerciseIds([...pinnedExerciseIds, exerciseTypeId]);
  }

  function scrollToTop() {
    requestAnimationFrame(() => {
      scrollViewRef.current?.scrollTo({ y: 0, animated: true });
    });
  }

  function switchSegment(segment: ProgressSegment) {
    setActiveSegment(segment);
    setShowLiftDetail(false);
    if (segment === 'weight') {
      setVisibleWeightHistoryCount(WEIGHT_HISTORY_PAGE_SIZE);
    }
    scrollToTop();
  }

  function selectExercise(exerciseTypeId: string, methodId?: string | null) {
    setSelectedProgressExerciseId(exerciseTypeId);
    setSelectedProgressMethodId(methodId ?? null);
    setShowAllPrHistory(false);
    setShowLiftDetail(true);
    setActiveSegment('lifts');
    scrollToTop();
  }

  function selectHighlight(highlight: ProgressHighlight | null) {
    if (!highlight) return;
    selectExercise(highlight.exerciseTypeId, highlight.methodId);
  }

  function showLiftList() {
    setShowLiftDetail(false);
    scrollToTop();
  }

  const latestLog = logs[logs.length - 1];
  const currentWeight = latestLog ? formatWeight(latestLog.weight, weightUnit) : null;
  const weightDelta = getWeightDelta(logs);
  const weightMeta =
    weightDelta === null
      ? logs.length === 0
        ? 'Log to start tracking.'
        : 'Add one more log for change.'
      : `${formatSignedWeight(weightDelta, weightUnit)} since last log`;
  const weightDateMeta = latestLog
    ? `Logged ${formatDateLabel(latestLog.loggedAt)}`
    : 'No logs yet';
  const bodyWeightChartPoints = useMemo(
    () =>
      logs.map(log => ({
        timestamp: log.loggedAt,
        value: convertKg(log.weight, weightUnit),
      })),
    [logs, weightUnit],
  );
  const weightHistory = useMemo(() => logs.slice().reverse(), [logs]);
  const visibleWeightHistory = weightHistory.slice(
    0,
    visibleWeightHistoryCount,
  );
  const hasMoreWeightHistory =
    visibleWeightHistory.length < weightHistory.length;
  const remainingWeightHistoryCount =
    weightHistory.length - visibleWeightHistory.length;
  const pinnedIdSet = useMemo(
    () => new Set(pinnedExerciseIds),
    [pinnedExerciseIds],
  );
  const orderedProgressExercises = useMemo(() => {
    const pinOrder = new Map(
      pinnedExerciseIds.map((exerciseTypeId, index) => [exerciseTypeId, index]),
    );
    return [...progressExercises].sort((a, b) => {
      const aPin = pinOrder.get(a.exerciseTypeId);
      const bPin = pinOrder.get(b.exerciseTypeId);
      if (typeof aPin === 'number' || typeof bPin === 'number') {
        if (typeof aPin !== 'number') return 1;
        if (typeof bPin !== 'number') return -1;
        return aPin - bPin;
      }
      if (a.setCount !== b.setCount) return b.setCount - a.setCount;
      if (a.workoutCount !== b.workoutCount) {
        return b.workoutCount - a.workoutCount;
      }
      return b.latestSetAt - a.latestSetAt;
    });
  }, [pinnedExerciseIds, progressExercises]);
  const normalizedSearchQuery = searchQuery.trim().toLowerCase();
  const matchingProgressExercises = useMemo(() => {
    if (!normalizedSearchQuery) return orderedProgressExercises;
    return orderedProgressExercises.filter(exercise => {
      const methodMatch = exercise.methods.some(method =>
        method.methodName.toLowerCase().includes(normalizedSearchQuery),
      );
      return (
        exercise.exerciseName.toLowerCase().includes(normalizedSearchQuery) ||
        methodMatch
      );
    });
  }, [normalizedSearchQuery, orderedProgressExercises]);
  const visibleProgressExercises = normalizedSearchQuery
    ? matchingProgressExercises
    : matchingProgressExercises.slice(
        0,
        Math.max(DEFAULT_VISIBLE_LIFT_COUNT, pinnedExerciseIds.length),
      );
  const hasHiddenLifts =
    !normalizedSearchQuery &&
    matchingProgressExercises.length > visibleProgressExercises.length;
  const featuredProgressExercise = orderedProgressExercises[0] ?? null;
  const featuredProgressMethod = featuredProgressExercise?.methods[0] ?? null;
  const featuredProgressUnit = getMethodDisplayUnit(
    featuredProgressMethod ?? null,
    weightUnit,
  );
  const selectedProgressExercise = useMemo(
    () =>
      progressExercises.find(
        exercise => exercise.exerciseTypeId === selectedProgressExerciseId,
      ) ??
      progressExercises[0] ??
      null,
    [progressExercises, selectedProgressExerciseId],
  );
  const selectedProgressMethod = useMemo(
    () =>
      selectedProgressExercise?.methods.find(
        method => method.methodId === selectedProgressMethodId,
      ) ??
      selectedProgressExercise?.methods[0] ??
      null,
    [selectedProgressExercise, selectedProgressMethodId],
  );
  const selectedExercisePinned = selectedProgressExercise
    ? pinnedIdSet.has(selectedProgressExercise.exerciseTypeId)
    : false;
  const progressDisplayUnit = getMethodDisplayUnit(
    selectedProgressMethod,
    weightUnit,
  );
  const selectedTrendPoints = useMemo(
    () =>
      (selectedProgressMethod?.trend ?? []).map((point: ProgressPoint) => ({
        timestamp: point.timestamp,
        value: convertKg(point.weightKg, progressDisplayUnit),
      })),
    [progressDisplayUnit, selectedProgressMethod],
  );
  const prHistory = useMemo(
    () => [...(selectedProgressMethod?.prHistory ?? [])].reverse(),
    [selectedProgressMethod],
  );
  const visiblePrHistory = showAllPrHistory
    ? prHistory
    : prHistory.slice(0, 3);
  const recentImprovedLiftCount = progressSummary.recentImprovedLiftCount;
  const recentPrCount = progressSummary.recentPrCount;
  const latestHighlight = progressSummary.latestRecentPr ?? progressSummary.latestPr;
  const latestHighlightLabel = progressSummary.latestRecentPr
    ? 'Latest PR'
    : 'Last PR';
  const latestHighlightUnit = getHighlightUnit(latestHighlight);
  const latestHighlightMeta = latestHighlight
    ? `${formatWeight(
        latestHighlight.weightKg,
        latestHighlightUnit,
      )} - ${formatHighlightSet(latestHighlight)} - ${formatDateLabel(
        latestHighlight.timestamp,
      )}`
    : 'New PRs will show here.';
  const bestRecentImprovement = progressSummary.bestRecentImprovement;
  const bestRecentImprovementUnit = getHighlightUnit(bestRecentImprovement);
  const bestRecentImprovementMeta = bestRecentImprovement
    ? `${formatSignedWeight(
        bestRecentImprovement.deltaKg,
        bestRecentImprovementUnit,
      )} vs previous PR - ${formatDateLabel(bestRecentImprovement.timestamp)}`
    : `Hit a second PR within ${progressSummary.recentWindowDays} days.`;

  useEffect(() => {
    if (!selectedProgressExercise) {
      setSelectedProgressMethodId(null);
      return;
    }

    setSelectedProgressMethodId(current =>
      selectedProgressExercise.methods.some(method => method.methodId === current)
        ? current
        : selectedProgressExercise.methods[0]?.methodId ?? null,
    );
  }, [selectedProgressExercise]);

  useEffect(() => {
    setShowAllPrHistory(false);
  }, [selectedProgressExercise?.exerciseTypeId, selectedProgressMethod?.methodId]);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator color={theme.colors.accent} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScreenHeader
        title="Progress"
        showFade={showHeaderFade}
        afterTitle={
          <View style={styles.segmentedControl}>
            {progressSegments.map(segment => {
              const selected = activeSegment === segment.key;
              return (
                <TouchableOpacity
                  key={segment.key}
                  style={[
                    styles.segmentButton,
                    selected && styles.segmentButtonSelected,
                  ]}
                  onPress={() => switchSegment(segment.key)}
                  activeOpacity={0.82}
                >
                  <RNText
                    style={[
                      styles.segmentButtonText,
                      selected && styles.segmentButtonTextSelected,
                    ]}
                    numberOfLines={1}
                  >
                    {segment.label}
                  </RNText>
                </TouchableOpacity>
              );
            })}
          </View>
        }
      />
      <ScrollView
        ref={scrollViewRef}
        style={styles.scroll}
        contentContainerStyle={styles.content}
        onScroll={handleHeaderScroll}
        scrollEventThrottle={16}
      >
        {activeSegment === 'overview' ? (
          <View style={styles.overviewStack}>
            {progressExercises.length === 0 ? (
              <EmptyStrengthCard />
            ) : (
              <>
                <View style={styles.strengthProgressCard}>
                  <View style={styles.strengthProgressHeader}>
                    <View style={styles.strengthProgressIcon}>
                      <MaterialCommunityIcons
                        name="trending-up"
                        size={20}
                        color={theme.colors.accent}
                      />
                    </View>
                    <View style={styles.strengthProgressText}>
                      <RNText style={styles.strengthProgressLabel}>
                        Recent Strength
                      </RNText>
                      <RNText
                        style={styles.strengthProgressValue}
                        numberOfLines={1}
                        adjustsFontSizeToFit
                      >
                        {recentImprovedLiftCount > 0
                          ? `${formatCountLabel(recentImprovedLiftCount, 'lift')} improved`
                          : 'No recent PRs yet'}
                      </RNText>
                      <RNText
                        style={styles.strengthProgressMeta}
                        numberOfLines={1}
                      >
                        {recentPrCount > 0
                          ? `${formatCountLabel(
                              recentPrCount,
                              'PR',
                              'PRs',
                            )} in ${progressSummary.recentWindowDays} days`
                          : 'Repeat a tracked lift to surface PRs.'}
                      </RNText>
                    </View>
                  </View>
                </View>

                <View style={styles.highlightRows}>
                  <HighlightRow
                    label={latestHighlightLabel}
                    title={latestHighlight?.exerciseName ?? 'No PR yet'}
                    meta={latestHighlightMeta}
                    iconName="medal-outline"
                    onPress={
                      latestHighlight
                        ? () => selectHighlight(latestHighlight)
                        : undefined
                    }
                  />
                  <HighlightRow
                    label="Biggest Jump"
                    title={
                      bestRecentImprovement?.exerciseName ?? 'No recent jump yet'
                    }
                    meta={bestRecentImprovementMeta}
                    iconName="arrow-up-bold-circle-outline"
                    onPress={
                      bestRecentImprovement
                        ? () => selectHighlight(bestRecentImprovement)
                        : undefined
                    }
                  />
                </View>
              </>
            )}

            <View style={styles.overviewMetricGrid}>
              <TouchableOpacity
                style={styles.overviewMetricCard}
                onPress={() => switchSegment('lifts')}
                activeOpacity={0.82}
              >
                <View style={styles.overviewMetricIcon}>
                  <MaterialCommunityIcons
                    name="dumbbell"
                    size={18}
                    color={theme.colors.accent}
                  />
                </View>
                <RNText style={styles.overviewMetricLabel}>Tracked Lifts</RNText>
                <RNText style={styles.overviewMetricValue} numberOfLines={1}>
                  {progressExercises.length}
                </RNText>
                <RNText style={styles.overviewMetricMeta} numberOfLines={1}>
                  {progressExercises.length === 0
                    ? 'Add weighted sets'
                    : pinnedExerciseIds.length > 0
                      ? `${pinnedExerciseIds.length} pinned`
                      : 'Pin favorites'}
                </RNText>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.overviewMetricCard}
                onPress={() => switchSegment('weight')}
                activeOpacity={0.82}
              >
                <View style={styles.overviewMetricIcon}>
                  <MaterialCommunityIcons
                    name="scale-bathroom"
                    size={18}
                    color={theme.colors.accent}
                  />
                </View>
                <RNText style={styles.overviewMetricLabel}>Current Weight</RNText>
                <RNText
                  style={styles.overviewMetricValue}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                >
                  {currentWeight ?? 'No weight'}
                </RNText>
                <RNText style={styles.overviewMetricMeta} numberOfLines={1}>
                  {weightDelta === null ? weightDateMeta : weightMeta}
                </RNText>
              </TouchableOpacity>
            </View>

            {featuredProgressExercise && featuredProgressMethod ? (
              <TouchableOpacity
                style={styles.overviewLiftCard}
                onPress={() =>
                  selectExercise(
                    featuredProgressExercise.exerciseTypeId,
                    featuredProgressMethod.methodId,
                  )
                }
                activeOpacity={0.84}
              >
                <View style={styles.overviewLiftText}>
                  <RNText style={styles.overviewMetricLabel}>
                    Most Tracked Lift
                  </RNText>
                  <RNText style={styles.overviewLiftTitle} numberOfLines={1}>
                    {featuredProgressExercise.exerciseName}
                  </RNText>
                  <RNText style={styles.overviewMetricMeta} numberOfLines={1}>
                    {featuredProgressExercise.workoutCount} workouts
                  </RNText>
                </View>
                <View style={styles.overviewLiftValueBlock}>
                  <RNText style={styles.overviewLiftValue} numberOfLines={1}>
                    {formatWeight(
                      featuredProgressMethod.currentPrKg,
                      featuredProgressUnit,
                    )}
                  </RNText>
                  <RNText style={styles.overviewLiftValueLabel}>PR</RNText>
                </View>
                <MaterialCommunityIcons
                  name="chevron-right"
                  size={19}
                  color={theme.colors.textMuted}
                />
              </TouchableOpacity>
            ) : null}
          </View>
        ) : null}

        {activeSegment === 'lifts' ? (
          progressExercises.length === 0 ? (
            <EmptyStrengthCard />
          ) : showLiftDetail && selectedProgressExercise && selectedProgressMethod ? (
            <View style={styles.progressCard}>
              <View style={styles.detailTopRow}>
                <TouchableOpacity
                  style={styles.backToListButton}
                  onPress={showLiftList}
                  activeOpacity={0.78}
                >
                  <MaterialCommunityIcons
                    name="chevron-left"
                    size={19}
                    color={theme.colors.text}
                  />
                  <RNText style={styles.backToListText}>Lifts</RNText>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.headerPinButton}
                  onPress={() =>
                    togglePinnedExercise(selectedProgressExercise.exerciseTypeId)
                  }
                  activeOpacity={0.78}
                >
                  <MaterialCommunityIcons
                    name={selectedExercisePinned ? 'star' : 'star-outline'}
                    size={19}
                    color={
                      selectedExercisePinned
                        ? theme.colors.accent
                        : theme.colors.textMuted
                    }
                  />
                </TouchableOpacity>
              </View>

              <View style={styles.progressHeader}>
                <View style={styles.progressHeaderText}>
                  <RNText style={styles.progressTitle} numberOfLines={1}>
                    {selectedProgressExercise.exerciseName}
                  </RNText>
                  <RNText style={styles.progressSubtitle} numberOfLines={1}>
                    {selectedProgressMethod.workoutCount} workouts,{' '}
                    {selectedProgressMethod.setCount} sets
                  </RNText>
                </View>
              </View>

              {selectedProgressExercise.methods.length > 1 ? (
                <View style={styles.methodWrap}>
                  {selectedProgressExercise.methods.map(method => {
                    const selected =
                      selectedProgressMethod.methodId === method.methodId;
                    return (
                      <TouchableOpacity
                        key={method.methodId}
                        style={[
                          styles.methodChip,
                          selected && styles.methodChipSelected,
                        ]}
                        onPress={() => {
                          setSelectedProgressMethodId(method.methodId);
                          setShowAllPrHistory(false);
                        }}
                        activeOpacity={0.84}
                      >
                        <RNText
                          style={[
                            styles.methodChipText,
                            selected && styles.methodChipTextSelected,
                          ]}
                          numberOfLines={1}
                        >
                          {method.methodName}
                        </RNText>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ) : (
                <View style={styles.singleMethodPill}>
                  <RNText style={styles.singleMethodText}>
                    {selectedProgressMethod.methodName}
                  </RNText>
                </View>
              )}

              <View style={styles.currentPrCard}>
                <RNText style={styles.currentPrLabel}>Current PR</RNText>
                <RNText
                  style={styles.currentPrValue}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                >
                  {formatWeight(
                    selectedProgressMethod.currentPrKg,
                    progressDisplayUnit,
                  )}
                </RNText>
                <RNText style={styles.currentPrMeta}>
                  {selectedProgressMethod.currentPrReps} reps
                </RNText>
              </View>

              <View style={styles.progressStats}>
                <View style={styles.progressStat}>
                  <View style={styles.progressStatLabelRow}>
                    <RNText style={styles.progressStatLabel}>Est. 1RM</RNText>
                    <TouchableOpacity
                      style={styles.infoButton}
                      onPress={() => setShowOneRmInfo(true)}
                      activeOpacity={0.8}
                    >
                      <RNText style={styles.infoButtonText}>i</RNText>
                    </TouchableOpacity>
                  </View>
                  <RNText style={styles.progressStatValue} numberOfLines={1}>
                    {formatWeight(
                      selectedProgressMethod.estimatedOneRmKg,
                      progressDisplayUnit,
                    )}
                  </RNText>
                  <RNText style={styles.progressStatNote}>
                    from {selectedProgressMethod.estimatedOneRmReps} reps
                  </RNText>
                </View>
                <View style={styles.progressStat}>
                  <RNText style={styles.progressStatLabel}>Change</RNText>
                  <RNText style={styles.progressStatValue} numberOfLines={1}>
                    {formatSignedWeight(
                      selectedProgressMethod.weightDeltaKg,
                      progressDisplayUnit,
                    )}
                  </RNText>
                  <RNText style={styles.progressStatNote}>
                    since {formatDateLabel(selectedProgressMethod.firstSetAt)}
                  </RNText>
                </View>
              </View>

              <View style={styles.trendCard}>
                <View style={styles.trendHeader}>
                  <RNText style={styles.trendTitle}>Best Set Trend</RNText>
                  <RNText style={styles.trendUnit}>{progressDisplayUnit}</RNText>
                </View>
                {selectedTrendPoints.length >= 2 ? (
                  <TrendLineChart
                    points={selectedTrendPoints}
                    unit={progressDisplayUnit}
                  />
                ) : (
                  <View style={styles.emptyTrend}>
                    <RNText style={styles.emptyChartText}>
                      One more workout starts the trend.
                    </RNText>
                  </View>
                )}
              </View>

              <View style={styles.prHistoryHeader}>
                <View>
                  <RNText style={styles.prHistoryTitle}>PR history</RNText>
                  <RNText style={styles.prHistoryHint}>Latest milestones</RNText>
                </View>
                {prHistory.length > 3 ? (
                  <TouchableOpacity
                    style={styles.viewAllButton}
                    onPress={() => setShowAllPrHistory(current => !current)}
                    activeOpacity={0.78}
                  >
                    <RNText style={styles.viewAllButtonText}>
                      {showAllPrHistory ? 'Show less' : 'View all'}
                    </RNText>
                  </TouchableOpacity>
                ) : null}
              </View>
              <View style={styles.prHistoryList}>
                {visiblePrHistory.map(pr => (
                  <View
                    key={`${pr.timestamp}-${pr.weightKg}-${pr.reps}`}
                    style={styles.prHistoryRow}
                  >
                    <View style={styles.prDot} />
                    <View style={styles.prHistoryText}>
                      <RNText style={styles.prHistoryValue}>
                        {formatWeight(pr.weightKg, progressDisplayUnit)}
                      </RNText>
                      <RNText style={styles.prHistoryMeta}>
                        {pr.reps} reps - {pr.methodName}
                      </RNText>
                    </View>
                    <RNText style={styles.prHistoryDate}>
                      {formatDateLabel(pr.timestamp)}
                    </RNText>
                  </View>
                ))}
              </View>
            </View>
          ) : (
            <View style={styles.liftPickerCard}>
              <View style={styles.liftPickerHeader}>
                <View>
                  <RNText style={styles.cardTitle}>Lifts</RNText>
                  <RNText style={styles.cardMeta}>
                    {pinnedExerciseIds.length}/{MAX_PINNED_PROGRESS_EXERCISES}{' '}
                    pinned
                  </RNText>
                </View>
              </View>

              <View style={styles.searchBox}>
                <MaterialCommunityIcons
                  name="magnify"
                  size={18}
                  color={theme.colors.textMuted}
                />
                <TextInput
                  style={styles.searchInput}
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  placeholder="Search lifts"
                  placeholderTextColor={theme.colors.textMuted}
                  returnKeyType="search"
                />
                {searchQuery.length > 0 ? (
                  <TouchableOpacity
                    style={styles.clearSearchButton}
                    onPress={() => setSearchQuery('')}
                    activeOpacity={0.78}
                  >
                    <MaterialCommunityIcons
                      name="close"
                      size={16}
                      color={theme.colors.textMuted}
                    />
                  </TouchableOpacity>
                ) : null}
              </View>

              <View style={styles.liftList}>
                {visibleProgressExercises.length === 0 ? (
                  <View style={styles.emptySearchCard}>
                    <RNText style={styles.emptyChartText}>
                      No matching lift.
                    </RNText>
                  </View>
                ) : (
                  visibleProgressExercises.map(exercise => {
                    const pinned = pinnedIdSet.has(exercise.exerciseTypeId);
                    const primaryMethod = exercise.methods[0];
                    const displayUnit = getMethodDisplayUnit(
                      primaryMethod ?? null,
                      weightUnit,
                    );
                    return (
                      <TouchableOpacity
                        key={exercise.exerciseTypeId}
                        style={styles.liftRow}
                        onPress={() =>
                          selectExercise(
                            exercise.exerciseTypeId,
                            primaryMethod?.methodId,
                          )
                        }
                        activeOpacity={0.84}
                      >
                        <TouchableOpacity
                          style={styles.pinButton}
                          onPress={() =>
                            togglePinnedExercise(exercise.exerciseTypeId)
                          }
                          activeOpacity={0.78}
                        >
                          <MaterialCommunityIcons
                            name={pinned ? 'star' : 'star-outline'}
                            size={18}
                            color={
                              pinned ? theme.colors.accent : theme.colors.textMuted
                            }
                          />
                        </TouchableOpacity>
                        <View style={styles.liftRowText}>
                          <RNText style={styles.liftRowTitle} numberOfLines={1}>
                            {exercise.exerciseName}
                          </RNText>
                          <RNText style={styles.liftRowMeta} numberOfLines={1}>
                            {exercise.workoutCount} workouts
                          </RNText>
                        </View>
                        <View style={styles.liftRowValueBlock}>
                          <RNText style={styles.liftRowValue} numberOfLines={1}>
                            {primaryMethod
                              ? formatWeight(
                                  primaryMethod.currentPrKg,
                                  displayUnit,
                                )
                              : '-'}
                          </RNText>
                          <RNText style={styles.liftRowValueLabel}>PR</RNText>
                        </View>
                        <MaterialCommunityIcons
                          name="chevron-right"
                          size={18}
                          color={theme.colors.textMuted}
                        />
                      </TouchableOpacity>
                    );
                  })
                )}
              </View>

              {hasHiddenLifts ? (
                <RNText style={styles.liftPickerHint}>
                  Search to find more lifts.
                </RNText>
              ) : null}
            </View>
          )
        ) : null}

        {activeSegment === 'weight' ? (
          <View style={styles.weightStack}>
            <View style={styles.weightHeroCard}>
              <View style={styles.weightHeroHeader}>
                <View style={styles.weightHeroIcon}>
                  <MaterialCommunityIcons
                    name="scale-bathroom"
                    size={21}
                    color={theme.colors.accent}
                  />
                </View>
                <View style={styles.weightHeroText}>
                  <RNText style={styles.strengthProgressLabel}>
                    Current Weight
                  </RNText>
                  <RNText
                    style={styles.weightHeroValue}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                  >
                    {currentWeight ?? 'No weight yet'}
                  </RNText>
                  <RNText style={styles.bodyWeightMeta} numberOfLines={1}>
                    {weightMeta}
                  </RNText>
                </View>
              </View>

              <View style={styles.weightActions}>
                <TouchableOpacity
                  style={styles.primaryActionButton}
                  onPress={openModal}
                  activeOpacity={0.82}
                >
                  <RNText style={styles.primaryActionText}>Log Weight</RNText>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.trendCard}>
              <View style={styles.trendHeader}>
                <RNText style={styles.trendTitle}>Weight Trend</RNText>
                <RNText style={styles.trendUnit}>{weightUnit}</RNText>
              </View>
              {bodyWeightChartPoints.length >= 2 ? (
                <TrendLineChart
                  points={bodyWeightChartPoints}
                  unit={weightUnit}
                />
              ) : (
                <View style={styles.emptyTrend}>
                  <RNText style={styles.emptyChartText}>
                    Log two weights to see a trend.
                  </RNText>
                </View>
              )}
            </View>

            <View style={styles.weightHistoryCard}>
              <View style={styles.weightHistoryHeader}>
                <View style={styles.weightHistoryHeaderIcon}>
                  <MaterialCommunityIcons
                    name="history"
                    size={18}
                    color={theme.colors.accent}
                  />
                </View>
                <View style={styles.weightHistoryHeaderText}>
                  <RNText style={styles.weightHistoryTitle}>History</RNText>
                  <RNText style={styles.weightHistoryMeta}>
                    {weightHistory.length === 0
                      ? 'No entries yet'
                      : `${weightHistory.length} ${weightHistory.length === 1 ? 'entry' : 'entries'}`}
                  </RNText>
                </View>
              </View>

              {visibleWeightHistory.length > 0 ? (
                <View style={styles.weightHistoryList}>
                  {visibleWeightHistory.map(log => (
                    <View key={log.id} style={styles.weightHistoryRow}>
                      <View style={styles.weightHistoryText}>
                        <RNText style={styles.weightHistoryValue}>
                          {formatWeight(log.weight, weightUnit)}
                        </RNText>
                        <RNText style={styles.weightHistoryDate}>
                          {formatWeightLogDate(log.loggedAt)}
                        </RNText>
                      </View>
                      <View style={styles.weightHistoryActions}>
                        <TouchableOpacity
                          style={styles.weightHistoryIconButton}
                          onPress={() => openEditWeightModal(log)}
                          activeOpacity={0.78}
                          accessibilityLabel="Edit weight log"
                        >
                          <MaterialCommunityIcons
                            name="pencil"
                            size={16}
                            color={theme.colors.text}
                          />
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[
                            styles.weightHistoryIconButton,
                            styles.deleteWeightButton,
                          ]}
                          onPress={() => setDeleteWeightLogTarget(log)}
                          activeOpacity={0.78}
                          accessibilityLabel="Delete weight log"
                        >
                          <MaterialCommunityIcons
                            name="delete-outline"
                            size={16}
                            color={theme.colors.danger}
                          />
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))}
                </View>
              ) : (
                <View style={styles.emptyWeightHistory}>
                  <RNText style={styles.emptyChartText}>
                    Logged weights will show here.
                  </RNText>
                </View>
              )}

              {hasMoreWeightHistory ? (
                <TouchableOpacity
                  style={styles.showMoreWeightButton}
                  onPress={() =>
                    setVisibleWeightHistoryCount(current =>
                      Math.min(
                        current + WEIGHT_HISTORY_PAGE_SIZE,
                        weightHistory.length,
                      ),
                    )
                  }
                  activeOpacity={0.82}
                >
                  <RNText style={styles.showMoreWeightText}>
                    Show{' '}
                    {Math.min(
                      WEIGHT_HISTORY_PAGE_SIZE,
                      remainingWeightHistoryCount,
                    )}{' '}
                    more
                  </RNText>
                </TouchableOpacity>
              ) : null}
            </View>
          </View>
        ) : null}
      </ScrollView>

      <Modal
        visible={showModal || Boolean(editingWeightLog)}
        transparent
        animationType="fade"
        onRequestClose={closeWeightModal}
      >
        <Pressable style={styles.overlay} onPress={closeWeightModal}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <RNText style={styles.modalTitle}>
              {editingWeightLog ? 'Edit Weight' : 'Log Weight'}
            </RNText>
            <View style={styles.inputRow}>
              <TextInput
                style={styles.weightInput}
                value={inputWeight}
                onChangeText={setInputWeight}
                keyboardType="decimal-pad"
                placeholder="0.0"
                placeholderTextColor={theme.colors.textMuted}
                autoFocus
              />
              <RNText style={styles.inputUnitLabel}>{weightUnit}</RNText>
            </View>
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.cancelModalBtn}
                onPress={closeWeightModal}
              >
                <RNText style={styles.cancelModalText}>Cancel</RNText>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.saveModalBtn,
                  saving && styles.saveModalBtnDisabled,
                ]}
                onPress={handleSaveWeight}
                disabled={saving}
              >
                <RNText style={styles.saveModalText}>
                  {saving ? 'Saving...' : editingWeightLog ? 'Update' : 'Save'}
                </RNText>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <ThemedDialog
        visible={Boolean(deleteWeightLogTarget)}
        title="Delete Weight Log"
        message={
          deleteWeightLogTarget
            ? `Delete ${formatWeight(deleteWeightLogTarget.weight, weightUnit)} from ${formatWeightLogDate(deleteWeightLogTarget.loggedAt)}?`
            : undefined
        }
        actions={[
          { label: 'Cancel', onPress: () => setDeleteWeightLogTarget(null) },
          {
            label: saving ? 'Deleting...' : 'Delete',
            variant: 'danger',
            onPress: confirmDeleteWeightLog,
          },
        ]}
      />

      <ThemedDialog
        visible={showOneRmInfo}
        title="Estimated 1RM"
        message="Estimated 1RM uses the Epley formula: 1RM = weight x (1 + reps / 30). It is a practical estimate from your best set, not a true max test."
        actions={[
          {
            label: 'Got it',
            variant: 'primary',
            onPress: () => setShowOneRmInfo(false),
          },
        ]}
      />
      <ThemedDialog
        visible={Boolean(dialog)}
        title={dialog?.title ?? ''}
        message={dialog?.message}
        actions={dialog?.actions ?? []}
      />
    </View>
  );
}

const chartStyles = StyleSheet.create({
  chart: {
    height: CHART_HEIGHT,
    position: 'relative',
  },
  canvas: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  chartTopLabel: {
    position: 'absolute',
    top: 0,
    right: 0,
    zIndex: 1,
  },
  chartValue: {
    fontSize: 11,
    fontWeight: '700',
  },
  dateLabel: {
    position: 'absolute',
    bottom: 0,
    width: 56,
    fontSize: 10,
  },
  dateLabelLeft: {
    left: 0,
    textAlign: 'left',
  },
  dateLabelRight: {
    right: 0,
    textAlign: 'right',
  },
});

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
    paddingBottom: theme.spacing.lg,
    gap: theme.spacing.sm,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: theme.colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentedControl: {
    flexDirection: 'row',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.full,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 3,
  },
  segmentButton: {
    flex: 1,
    minWidth: 0,
    minHeight: 34,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.sm,
  },
  segmentButtonSelected: {
    backgroundColor: theme.colors.accent,
  },
  segmentButtonText: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.bold,
  },
  segmentButtonTextSelected: {
    color: '#FFFFFF',
  },
  overviewStack: {
    gap: theme.spacing.md,
  },
  strengthProgressCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 0.5,
    borderColor: theme.colors.border,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  strengthProgressHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  strengthProgressIcon: {
    width: 36,
    height: 36,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.accentMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  strengthProgressText: {
    flex: 1,
    minWidth: 0,
    gap: 5,
  },
  strengthProgressLabel: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xxs,
    fontFamily: theme.fontFamily.extraBold,
    textTransform: 'uppercase',
    includeFontPadding: false,
  },
  strengthProgressValue: {
    color: theme.colors.text,
    fontSize: theme.fontSize.xl,
    fontFamily: theme.fontFamily.extraBold,
    includeFontPadding: false,
  },
  strengthProgressMeta: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
    fontFamily: theme.fontFamily.medium,
    lineHeight: 18,
    includeFontPadding: false,
  },
  highlightRows: {
    gap: theme.spacing.sm,
  },
  highlightRow: {
    minHeight: 62,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    backgroundColor: theme.colors.surface2,
    borderRadius: theme.radius.md,
    borderWidth: 0.5,
    borderColor: theme.colors.border,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  highlightRowIcon: {
    width: 30,
    height: 30,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  highlightRowText: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  highlightRowLabel: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xxs,
    fontFamily: theme.fontFamily.extraBold,
    textTransform: 'uppercase',
    includeFontPadding: false,
  },
  highlightRowTitle: {
    color: theme.colors.text,
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.bold,
    includeFontPadding: false,
  },
  highlightRowMeta: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
    fontFamily: theme.fontFamily.medium,
    lineHeight: 16,
    includeFontPadding: false,
  },
  overviewMetricGrid: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  overviewMetricCard: {
    flex: 1,
    minWidth: 0,
    minHeight: 132,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 0.5,
    borderColor: theme.colors.border,
    padding: theme.spacing.md,
    justifyContent: 'space-between',
  },
  overviewMetricIcon: {
    width: 34,
    height: 34,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.accentMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  overviewMetricLabel: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xxs,
    fontFamily: theme.fontFamily.extraBold,
    textTransform: 'uppercase',
    includeFontPadding: false,
  },
  overviewMetricValue: {
    color: theme.colors.text,
    fontSize: theme.fontSize.xl,
    fontFamily: theme.fontFamily.black,
    includeFontPadding: false,
  },
  overviewMetricMeta: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
    fontFamily: theme.fontFamily.medium,
    lineHeight: 16,
    includeFontPadding: false,
  },
  overviewLiftCard: {
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 0.5,
    borderColor: theme.colors.border,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  overviewLiftText: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  overviewLiftTitle: {
    color: theme.colors.text,
    fontSize: theme.fontSize.md,
    fontFamily: theme.fontFamily.extraBold,
    includeFontPadding: false,
  },
  overviewLiftValueBlock: {
    alignItems: 'flex-end',
    maxWidth: 112,
  },
  overviewLiftValue: {
    color: theme.colors.text,
    fontSize: theme.fontSize.md,
    fontFamily: theme.fontFamily.extraBold,
    includeFontPadding: false,
  },
  overviewLiftValueLabel: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xxs,
    fontFamily: theme.fontFamily.extraBold,
    includeFontPadding: false,
  },
  emptyStrengthCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 0.5,
    borderColor: theme.colors.border,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    gap: theme.spacing.xs,
  },
  emptyStrengthIcon: {
    width: 34,
    height: 34,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.accentMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyStrengthTitle: {
    color: theme.colors.text,
    fontSize: theme.fontSize.md,
    fontFamily: theme.fontFamily.bold,
  },
  emptyStrengthText: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.medium,
    lineHeight: 19,
  },
  liftPickerCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 0.5,
    borderColor: theme.colors.border,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    gap: theme.spacing.sm,
  },
  liftPickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardTitle: {
    color: theme.colors.text,
    fontSize: theme.fontSize.md,
    fontFamily: theme.fontFamily.bold,
  },
  cardMeta: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
    fontFamily: theme.fontFamily.medium,
  },
  searchBox: {
    minHeight: 38,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    backgroundColor: theme.colors.surface2,
    borderRadius: theme.radius.md,
    borderWidth: 0.5,
    borderColor: theme.colors.border,
    paddingHorizontal: theme.spacing.md,
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    color: theme.colors.text,
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.medium,
    paddingVertical: theme.spacing.xs,
  },
  clearSearchButton: {
    width: 28,
    height: 28,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  liftList: {
    gap: theme.spacing.xs,
  },
  liftRow: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    backgroundColor: theme.colors.surface2,
    borderRadius: theme.radius.md,
    borderWidth: 0.5,
    borderColor: theme.colors.border,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
  },
  pinButton: {
    width: 30,
    height: 30,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  liftRowText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  liftRowTitle: {
    color: theme.colors.text,
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.bold,
  },
  liftRowMeta: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
    fontFamily: theme.fontFamily.medium,
  },
  liftRowValueBlock: {
    alignItems: 'flex-end',
    minWidth: 64,
  },
  liftRowValue: {
    color: theme.colors.text,
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.extraBold,
  },
  liftRowValueLabel: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xxs,
    fontFamily: theme.fontFamily.extraBold,
  },
  liftPickerHint: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
    fontFamily: theme.fontFamily.medium,
    textAlign: 'center',
  },
  emptySearchCard: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surface2,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing.md,
  },
  progressCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 0.5,
    borderColor: theme.colors.border,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    gap: theme.spacing.sm,
  },
  detailTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
  },
  backToListButton: {
    minHeight: 32,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.surface2,
    borderWidth: 0.5,
    borderColor: theme.colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingLeft: theme.spacing.xs,
    paddingRight: theme.spacing.sm,
  },
  backToListText: {
    color: theme.colors.text,
    fontSize: theme.fontSize.xs,
    fontFamily: theme.fontFamily.bold,
  },
  progressHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  progressHeaderText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  progressTitle: {
    color: theme.colors.text,
    fontSize: theme.fontSize.lg,
    fontFamily: theme.fontFamily.extraBold,
  },
  progressSubtitle: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
    fontFamily: theme.fontFamily.medium,
  },
  headerPinButton: {
    width: 32,
    height: 32,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.surface2,
    borderWidth: 0.5,
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  methodWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
  },
  methodChip: {
    minHeight: 30,
    maxWidth: '100%',
    borderRadius: theme.radius.full,
    borderWidth: 0.5,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface2,
    paddingHorizontal: theme.spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  methodChipSelected: {
    borderColor: theme.colors.accent,
    backgroundColor: theme.colors.accentMuted,
  },
  methodChipText: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.semiBold,
  },
  methodChipTextSelected: {
    color: theme.colors.text,
  },
  singleMethodPill: {
    alignSelf: 'flex-start',
    minHeight: 30,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.surface2,
    borderWidth: 0.5,
    borderColor: theme.colors.border,
    paddingHorizontal: theme.spacing.md,
    justifyContent: 'center',
  },
  singleMethodText: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.semiBold,
  },
  progressStats: {
    flexDirection: 'row',
    gap: theme.spacing.xs,
  },
  currentPrCard: {
    backgroundColor: theme.colors.accentMuted,
    borderRadius: theme.radius.lg,
    borderWidth: 0.5,
    borderColor: theme.colors.accentMuted,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    gap: 4,
  },
  currentPrLabel: {
    color: theme.colors.accent,
    fontSize: theme.fontSize.xxs,
    fontFamily: theme.fontFamily.extraBold,
    textTransform: 'uppercase',
  },
  currentPrValue: {
    color: theme.colors.text,
    fontSize: 30,
    fontFamily: theme.fontFamily.black,
    includeFontPadding: false,
  },
  currentPrMeta: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.bold,
  },
  progressStat: {
    flex: 1,
    minWidth: 0,
    backgroundColor: theme.colors.surface2,
    borderRadius: theme.radius.md,
    borderWidth: 0.5,
    borderColor: theme.colors.border,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    gap: 3,
  },
  progressStatLabel: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xxs,
    fontFamily: theme.fontFamily.extraBold,
    textTransform: 'uppercase',
  },
  progressStatLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.xs,
  },
  infoButton: {
    width: 18,
    height: 18,
    borderRadius: theme.radius.full,
    borderWidth: 0.5,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoButtonText: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xxs,
    fontFamily: theme.fontFamily.extraBold,
  },
  progressStatValue: {
    color: theme.colors.text,
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.extraBold,
  },
  progressStatNote: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xxs,
    fontFamily: theme.fontFamily.medium,
    lineHeight: 13,
  },
  trendCard: {
    backgroundColor: theme.colors.surface2,
    borderRadius: theme.radius.md,
    borderWidth: 0.5,
    borderColor: theme.colors.border,
    padding: theme.spacing.xs,
    overflow: 'hidden',
  },
  trendHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.xs,
  },
  trendTitle: {
    color: theme.colors.text,
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.bold,
  },
  trendUnit: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
    fontFamily: theme.fontFamily.extraBold,
    textTransform: 'uppercase',
  },
  emptyTrend: {
    height: 96,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.md,
  },
  emptyChartText: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.sm,
    textAlign: 'center',
    lineHeight: 20,
  },
  prHistoryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  prHistoryTitle: {
    color: theme.colors.text,
    fontSize: theme.fontSize.md,
    fontFamily: theme.fontFamily.bold,
  },
  prHistoryHint: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
    fontFamily: theme.fontFamily.medium,
  },
  viewAllButton: {
    minHeight: 30,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.surface2,
    borderWidth: 0.5,
    borderColor: theme.colors.border,
    paddingHorizontal: theme.spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewAllButtonText: {
    color: theme.colors.accent,
    fontSize: theme.fontSize.xs,
    fontFamily: theme.fontFamily.bold,
  },
  prHistoryList: {
    gap: theme.spacing.xs,
  },
  prHistoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface2,
    borderRadius: theme.radius.md,
    borderWidth: 0.5,
    borderColor: theme.colors.border,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
    gap: theme.spacing.xs,
  },
  prDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.colors.accent,
  },
  prHistoryText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  prHistoryValue: {
    color: theme.colors.text,
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.bold,
  },
  prHistoryMeta: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
    fontFamily: theme.fontFamily.medium,
  },
  prHistoryDate: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
    fontFamily: theme.fontFamily.semiBold,
  },
  weightStack: {
    gap: theme.spacing.sm,
  },
  weightHeroCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    gap: theme.spacing.md,
  },
  weightHeroHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing.md,
  },
  weightHeroIcon: {
    width: 42,
    height: 42,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.accentMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  weightHeroText: {
    flex: 1,
    minWidth: 0,
    gap: 6,
  },
  weightHeroValue: {
    color: theme.colors.text,
    fontSize: 30,
    fontFamily: theme.fontFamily.black,
    includeFontPadding: false,
  },
  weightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  primaryActionButton: {
    flex: 1,
    minHeight: 38,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.accent,
    borderWidth: 1,
    borderColor: theme.colors.accent,
    paddingHorizontal: theme.spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryActionText: {
    color: '#FFFFFF',
    fontSize: theme.fontSize.xs,
    fontFamily: theme.fontFamily.bold,
  },
  bodyWeightMeta: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
    fontFamily: theme.fontFamily.medium,
    lineHeight: 18,
  },
  weightHistoryCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 0.5,
    borderColor: theme.colors.border,
    overflow: 'hidden',
  },
  weightHistoryHeader: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderBottomWidth: 0.5,
    borderBottomColor: theme.colors.border,
  },
  weightHistoryHeaderIcon: {
    width: 34,
    height: 34,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.accentMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  weightHistoryHeaderText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  weightHistoryTitle: {
    color: theme.colors.text,
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.extraBold,
    textTransform: 'uppercase',
    includeFontPadding: false,
  },
  weightHistoryMeta: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
    fontFamily: theme.fontFamily.medium,
    marginTop: 2,
  },
  weightHistoryList: {
    backgroundColor: theme.colors.surface,
  },
  weightHistoryRow: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderBottomWidth: 0.5,
    borderBottomColor: theme.colors.border,
  },
  weightHistoryText: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  weightHistoryValue: {
    color: theme.colors.text,
    fontSize: theme.fontSize.md,
    fontFamily: theme.fontFamily.bold,
  },
  weightHistoryDate: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
    fontFamily: theme.fontFamily.medium,
  },
  weightHistoryActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  weightHistoryIconButton: {
    width: 34,
    height: 34,
    borderRadius: theme.radius.full,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteWeightButton: {
    backgroundColor: theme.colors.dangerMuted,
    borderColor: theme.colors.dangerMuted,
  },
  emptyWeightHistory: {
    minHeight: 72,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.md,
  },
  showMoreWeightButton: {
    minHeight: 42,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surface2,
    borderTopWidth: 0.5,
    borderTopColor: theme.colors.border,
    paddingHorizontal: theme.spacing.md,
  },
  showMoreWeightText: {
    color: theme.colors.accent,
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.bold,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.xl,
    padding: theme.spacing.lg,
    width: '80%',
    gap: theme.spacing.md,
    borderWidth: 0.5,
    borderColor: theme.colors.border,
  },
  modalTitle: {
    color: theme.colors.text,
    fontSize: theme.fontSize.lg,
    fontFamily: theme.fontFamily.bold,
    textAlign: 'center',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface2,
    borderRadius: theme.radius.md,
    borderWidth: 0.5,
    borderColor: theme.colors.border,
    paddingHorizontal: theme.spacing.md,
  },
  weightInput: {
    flex: 1,
    color: theme.colors.text,
    fontSize: theme.fontSize.xl,
    fontFamily: theme.fontFamily.semiBold,
    paddingVertical: theme.spacing.md,
  },
  inputUnitLabel: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.md,
    fontFamily: theme.fontFamily.medium,
  },
  modalActions: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  cancelModalBtn: {
    flex: 1,
    paddingVertical: theme.spacing.md,
    alignItems: 'center',
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surface2,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  cancelModalText: {
    color: theme.colors.text,
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.semiBold,
  },
  saveModalBtn: {
    flex: 1,
    paddingVertical: theme.spacing.md,
    alignItems: 'center',
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.accent,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  saveModalBtnDisabled: {
    opacity: 0.5,
  },
  saveModalText: {
    color: '#FFFFFF',
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.semiBold,
  },
}));
