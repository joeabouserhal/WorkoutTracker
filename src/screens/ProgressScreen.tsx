import React, { useCallback, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  Text as RNText,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import {
  Canvas,
  Circle,
  Group,
  Line as SkiaLine,
  LinearGradient,
  Path,
  Rect,
  Skia,
  vec,
} from '@shopify/react-native-skia'
import { createStyleSheet, useStyles } from 'react-native-unistyles'
import ThemedDialog from '@/components/ui/ThemedDialog'
import ScreenHeader, { useHeaderFade } from '@/components/ui/ScreenHeader'
import { getBodyWeightLogs, logBodyWeight, type WeightLog } from '@/db/bodyWeightHelpers'
import { getProfile } from '@/db/profileHelpers'
import {
  getProgressOverview,
  type ProgressExerciseSummary,
  type ProgressPoint,
} from '@/db/progressHelpers'

const CHART_HEIGHT = 148
const PAD = { top: 14, right: 16, bottom: 38, left: 52 }
const LB_PER_KG = 2.20462
const EXERCISE_SELECTOR_HEIGHT = 64
const METHOD_SELECTOR_HEIGHT = 44

type WeightUnit = 'kg' | 'lb'

function formatShortDate(ts: number): string {
  const d = new Date(ts)
  return `${d.getMonth() + 1}/${d.getDate()}`
}

function normalizeWeightUnit(unit?: string | null): WeightUnit {
  return unit === 'lb' ? 'lb' : 'kg'
}

function convertKg(weightKg: number, unit: WeightUnit): number {
  return unit === 'lb' ? weightKg * LB_PER_KG : weightKg
}

function formatWeightValue(weightKg: number, unit: WeightUnit): string {
  const value = convertKg(weightKg, unit)
  return value >= 100 ? value.toFixed(0) : value.toFixed(1)
}

function formatWeight(weightKg: number, unit: WeightUnit): string {
  return `${formatWeightValue(weightKg, unit)} ${unit}`
}

function formatSignedWeight(weightKg: number, unit: WeightUnit): string {
  const value = convertKg(weightKg, unit)
  const sign = value > 0 ? '+' : ''
  return `${sign}${value.toFixed(1)} ${unit}`
}

function formatDateLabel(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })
}

const emptySheet = createStyleSheet(() => ({}))

interface WeightChartProps {
  logs: WeightLog[]
  displayUnit: 'kg' | 'lb'
}

function WeightChart({ logs, displayUnit }: WeightChartProps) {
  const { theme } = useStyles(emptySheet)
  const [containerWidth, setContainerWidth] = useState(0)

  const chartData = useMemo(() => {
    if (containerWidth === 0 || logs.length < 2) return null

    const plotW = containerWidth - PAD.left - PAD.right
    const plotH = CHART_HEIGHT - PAD.top - PAD.bottom
    const bottomY = PAD.top + plotH

    const displayWeights = logs.map(l =>
      displayUnit === 'lb' ? l.weight * 2.20462 : l.weight,
    )

    const minW = Math.min(...displayWeights) - 1
    const maxW = Math.max(...displayWeights) + 1
    const range = maxW - minW

    const toX = (i: number) => PAD.left + (i / (logs.length - 1)) * plotW
    const toY = (w: number) => PAD.top + (1 - (w - minW) / range) * plotH

    const linePath = Skia.Path.Make()
    const fillPath = Skia.Path.Make()

    displayWeights.forEach((w, i) => {
      const x = toX(i)
      const y = toY(w)
      if (i === 0) {
        linePath.moveTo(x, y)
        fillPath.moveTo(x, y)
      } else {
        linePath.lineTo(x, y)
        fillPath.lineTo(x, y)
      }
    })
    fillPath.lineTo(toX(logs.length - 1), bottomY)
    fillPath.lineTo(toX(0), bottomY)
    fillPath.close()

    const dots = displayWeights.map((w, i) => ({ cx: toX(i), cy: toY(w) }))

    const yTickCount = 4
    const yTicks = Array.from({ length: yTickCount }, (_, i) => ({
      label: (minW + (range * i) / (yTickCount - 1)).toFixed(1),
      y: toY(minW + (range * i) / (yTickCount - 1)),
    }))

    const maxXTicks = 5
    const step = Math.max(1, Math.ceil(logs.length / maxXTicks))
    const xTicks = logs
      .map((log, i) => ({ log, i }))
      .filter(({ i }) => i % step === 0 || i === logs.length - 1)
      .map(({ log, i }) => ({ label: formatShortDate(log.loggedAt), x: toX(i) }))

    return { linePath, fillPath, dots, yTicks, xTicks, bottomY, plotW }
  }, [containerWidth, logs, displayUnit])

  const accentColor = theme.colors.accent
  const gridColor = theme.colors.border
  const bgColor = theme.colors.bg

  return (
    <View
      style={{ height: CHART_HEIGHT }}
      onLayout={e => setContainerWidth(getLayoutWidth(e))}
    >
      {chartData && containerWidth > 0 && (
        <Canvas
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: containerWidth,
            height: CHART_HEIGHT,
          }}
        >
          {chartData.yTicks.map((tick, i) => (
            <SkiaLine
              key={`grid-${i}`}
              p1={vec(PAD.left, tick.y)}
              p2={vec(PAD.left + chartData.plotW, tick.y)}
              color={gridColor}
              strokeWidth={0.5}
            />
          ))}

          <Path path={chartData.fillPath} style="fill">
            <LinearGradient
              start={vec(0, PAD.top)}
              end={vec(0, chartData.bottomY)}
              colors={[accentColor + '55', accentColor + '00']}
            />
          </Path>

          <Path
            path={chartData.linePath}
            style="stroke"
            strokeWidth={2}
            color={accentColor}
            strokeJoin="round"
            strokeCap="round"
          />

          {chartData.dots.map((dot, i) => (
            <Group key={`dot-${i}`}>
              <Circle cx={dot.cx} cy={dot.cy} r={5} color={bgColor} />
              <Circle cx={dot.cx} cy={dot.cy} r={3} color={accentColor} />
            </Group>
          ))}
        </Canvas>
      )}

      {chartData?.yTicks.map((tick, i) => (
        <RNText
          key={`y-${i}`}
          style={{
            position: 'absolute',
            top: tick.y - 7,
            left: 0,
            width: PAD.left - 6,
            textAlign: 'right',
            fontSize: 10,
            color: theme.colors.textMuted,
          }}
        >
          {tick.label}
        </RNText>
      ))}

      {chartData?.xTicks.map((tick, i) => (
        <RNText
          key={`x-${i}`}
          style={{
            position: 'absolute',
            top: chartData.bottomY + 6,
            left: tick.x - 20,
            width: 40,
            textAlign: 'center',
            fontSize: 10,
            color: theme.colors.textMuted,
          }}
        >
          {tick.label}
        </RNText>
      ))}
    </View>
  )
}

interface HorizontalFadeEdgesProps {
  height: number
  showLeft: boolean
  showRight: boolean
}

function HorizontalFadeEdges({ height, showLeft, showRight }: HorizontalFadeEdgesProps) {
  const { theme } = useStyles(emptySheet)
  const fadeWidth = 24

  if (!showLeft && !showRight) return null

  return (
    <View pointerEvents="none" style={stylesForFadeEdges.overlay}>
      {showLeft && (
        <Canvas style={[stylesForFadeEdges.left, { width: fadeWidth, height }]}>
          <Rect x={0} y={0} width={fadeWidth} height={height}>
            <LinearGradient
              start={vec(0, 0)}
              end={vec(fadeWidth, 0)}
              colors={[theme.colors.bg, theme.colors.bg + '00']}
            />
          </Rect>
        </Canvas>
      )}
      {showRight && (
        <Canvas style={[stylesForFadeEdges.right, { width: fadeWidth, height }]}>
          <Rect x={0} y={0} width={fadeWidth} height={height}>
            <LinearGradient
              start={vec(0, 0)}
              end={vec(fadeWidth, 0)}
              colors={[theme.colors.bg + '00', theme.colors.bg]}
            />
          </Rect>
        </Canvas>
      )}
    </View>
  )
}

const stylesForFadeEdges = {
  overlay: {
    position: 'absolute' as const,
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  left: {
    position: 'absolute' as const,
    top: 0,
    left: 0,
  },
  right: {
    position: 'absolute' as const,
    top: 0,
    right: 0,
  },
}

type HorizontalScrollMetrics = {
  x: number
  contentWidth: number
  layoutWidth: number
}

function getHorizontalFadeState(metrics: HorizontalScrollMetrics) {
  const maxScroll = Math.max(0, metrics.contentWidth - metrics.layoutWidth)
  const hasScrolled = metrics.x > 1

  return {
    showLeft: hasScrolled,
    showRight: hasScrolled && metrics.x < maxScroll - 1,
  }
}

function getLayoutWidth(event: { nativeEvent?: { layout?: { width?: number } | null } } | null) {
  return event?.nativeEvent?.layout?.width ?? 0
}

interface ExerciseProgressChartProps {
  points: ProgressPoint[]
  displayUnit: WeightUnit
}

function ExerciseProgressChart({ points, displayUnit }: ExerciseProgressChartProps) {
  const { theme } = useStyles(emptySheet)
  const [containerWidth, setContainerWidth] = useState(0)

  const chartData = useMemo(() => {
    if (containerWidth === 0 || points.length < 2) return null

    const plotW = containerWidth - PAD.left - PAD.right
    const plotH = CHART_HEIGHT - PAD.top - PAD.bottom
    const bottomY = PAD.top + plotH
    const displayWeights = points.map(point => convertKg(point.weightKg, displayUnit))
    const minW = Math.min(...displayWeights) - 1
    const maxW = Math.max(...displayWeights) + 1
    const range = maxW - minW || 1
    const toX = (i: number) => PAD.left + (i / (points.length - 1)) * plotW
    const toY = (w: number) => PAD.top + (1 - (w - minW) / range) * plotH

    const linePath = Skia.Path.Make()
    const fillPath = Skia.Path.Make()

    displayWeights.forEach((w, i) => {
      const x = toX(i)
      const y = toY(w)
      if (i === 0) {
        linePath.moveTo(x, y)
        fillPath.moveTo(x, y)
      } else {
        linePath.lineTo(x, y)
        fillPath.lineTo(x, y)
      }
    })
    fillPath.lineTo(toX(points.length - 1), bottomY)
    fillPath.lineTo(toX(0), bottomY)
    fillPath.close()

    const dots = displayWeights.map((w, i) => ({ cx: toX(i), cy: toY(w) }))
    const yTickCount = 4
    const yTicks = Array.from({ length: yTickCount }, (_, i) => ({
      label: (minW + (range * i) / (yTickCount - 1)).toFixed(1),
      y: toY(minW + (range * i) / (yTickCount - 1)),
    }))
    const maxXTicks = 5
    const step = Math.max(1, Math.ceil(points.length / maxXTicks))
    const xTicks = points
      .map((point, i) => ({ point, i }))
      .filter(({ i }) => i % step === 0 || i === points.length - 1)
      .map(({ point, i }) => ({ label: formatShortDate(point.timestamp), x: toX(i) }))

    return { linePath, fillPath, dots, yTicks, xTicks, bottomY, plotW }
  }, [containerWidth, points, displayUnit])

  const accentColor = theme.colors.accent
  const gridColor = theme.colors.border
  const bgColor = theme.colors.surface

  return (
    <View
      style={{ height: CHART_HEIGHT }}
      onLayout={e => setContainerWidth(getLayoutWidth(e))}
    >
      {chartData && containerWidth > 0 && (
        <Canvas
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: containerWidth,
            height: CHART_HEIGHT,
          }}
        >
          {chartData.yTicks.map((tick, i) => (
            <SkiaLine
              key={`progress-grid-${i}`}
              p1={vec(PAD.left, tick.y)}
              p2={vec(PAD.left + chartData.plotW, tick.y)}
              color={gridColor}
              strokeWidth={0.5}
            />
          ))}

          <Path path={chartData.fillPath} style="fill">
            <LinearGradient
              start={vec(0, PAD.top)}
              end={vec(0, chartData.bottomY)}
              colors={[accentColor + '44', accentColor + '00']}
            />
          </Path>

          <Path
            path={chartData.linePath}
            style="stroke"
            strokeWidth={2}
            color={accentColor}
            strokeJoin="round"
            strokeCap="round"
          />

          {chartData.dots.map((dot, i) => (
            <Group key={`progress-dot-${i}`}>
              <Circle cx={dot.cx} cy={dot.cy} r={5} color={bgColor} />
              <Circle cx={dot.cx} cy={dot.cy} r={3} color={accentColor} />
            </Group>
          ))}
        </Canvas>
      )}

      {chartData?.yTicks.map((tick, i) => (
        <RNText
          key={`progress-y-${i}`}
          style={{
            position: 'absolute',
            top: tick.y - 7,
            left: 0,
            width: PAD.left - 6,
            textAlign: 'right',
            fontSize: 10,
            color: theme.colors.textMuted,
          }}
        >
          {tick.label}
        </RNText>
      ))}

      {chartData?.xTicks.map((tick, i) => (
        <RNText
          key={`progress-x-${i}`}
          style={{
            position: 'absolute',
            top: chartData.bottomY + 6,
            left: tick.x - 20,
            width: 40,
            textAlign: 'center',
            fontSize: 10,
            color: theme.colors.textMuted,
          }}
        >
          {tick.label}
        </RNText>
      ))}
    </View>
  )
}

export default function ProgressScreen() {
  const { styles, theme } = useStyles(stylesheet)
  const { showHeaderFade, handleHeaderScroll } = useHeaderFade()
  const [logs, setLogs] = useState<WeightLog[]>([])
  const [weightUnit, setWeightUnit] = useState<'kg' | 'lb'>('kg')
  const [progressExercises, setProgressExercises] = useState<ProgressExerciseSummary[]>([])
  const [selectedProgressExerciseId, setSelectedProgressExerciseId] = useState<string | null>(null)
  const [selectedProgressMethodId, setSelectedProgressMethodId] = useState<string | null>(null)
  const [exerciseSelectorMetrics, setExerciseSelectorMetrics] = useState<HorizontalScrollMetrics>({
    x: 0,
    contentWidth: 0,
    layoutWidth: 0,
  })
  const [methodSelectorMetrics, setMethodSelectorMetrics] = useState<HorizontalScrollMetrics>({
    x: 0,
    contentWidth: 0,
    layoutWidth: 0,
  })
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [showOneRmInfo, setShowOneRmInfo] = useState(false)
  const [inputWeight, setInputWeight] = useState('')
  const [saving, setSaving] = useState(false)

  useFocusEffect(
    useCallback(() => {
      loadData()
    }, []),
  )

  async function loadData() {
    try {
      const [profile, weightLogs, progressOverview] = await Promise.all([
        getProfile(),
        getBodyWeightLogs(),
        getProgressOverview(),
      ])
      setWeightUnit((profile?.defaultWeightUnit as 'kg' | 'lb') ?? 'kg')
      setLogs(weightLogs)
      setProgressExercises(progressOverview.exercises)
      setSelectedProgressExerciseId(current =>
        progressOverview.exercises.some(exercise => exercise.exerciseTypeId === current)
          ? current
          : progressOverview.exercises[0]?.exerciseTypeId ?? null,
      )
    } catch (e) {
      console.error('Failed to load weight data', e)
    } finally {
      setLoading(false)
    }
  }

  async function handleLogWeight() {
    const val = parseFloat(inputWeight)
    if (isNaN(val) || val <= 0) {
      Alert.alert('Invalid Weight', 'Please enter a valid positive number.')
      return
    }
    setSaving(true)
    try {
      const weightKg = weightUnit === 'lb' ? val / 2.20462 : val
      await logBodyWeight(weightKg)
      setInputWeight('')
      setShowModal(false)
      await loadData()
    } catch (e) {
      Alert.alert('Error', 'Failed to log weight.')
      console.error(e)
    } finally {
      setSaving(false)
    }
  }

  function openModal() {
    const latestLog = logs[logs.length - 1]
    if (latestLog) {
      const displayVal =
        weightUnit === 'lb'
          ? (latestLog.weight * 2.20462).toFixed(1)
          : latestLog.weight.toFixed(1)
      setInputWeight(displayVal)
    }
    setShowModal(true)
  }

  const latestLog = logs[logs.length - 1]
  const currentWeight = latestLog
    ? weightUnit === 'lb'
      ? (latestLog.weight * 2.20462).toFixed(1)
      : latestLog.weight.toFixed(1)
    : null

  const selectedProgressExercise = useMemo(
    () =>
      progressExercises.find(exercise => exercise.exerciseTypeId === selectedProgressExerciseId) ??
      progressExercises[0] ??
      null,
    [progressExercises, selectedProgressExerciseId],
  )
  const selectedProgressMethod = useMemo(
    () =>
      selectedProgressExercise?.methods.find(method => method.methodId === selectedProgressMethodId) ??
      selectedProgressExercise?.methods[0] ??
      null,
    [selectedProgressExercise, selectedProgressMethodId],
  )
  const selectedExerciseRank = selectedProgressExercise
    ? progressExercises.findIndex(
        exercise => exercise.exerciseTypeId === selectedProgressExercise.exerciseTypeId,
      ) + 1
    : 0
  const exerciseFadeState = getHorizontalFadeState(exerciseSelectorMetrics)
  const methodFadeState = getHorizontalFadeState(methodSelectorMetrics)
  const progressDisplayUnit = selectedProgressMethod
    ? normalizeWeightUnit(selectedProgressMethod.latestUnit)
    : weightUnit

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator color={theme.colors.accent} />
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <ScreenHeader title="Progress" showFade={showHeaderFade} />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        onScroll={handleHeaderScroll}
        scrollEventThrottle={16}
      >

        <RNText style={styles.sectionLabel}>BODY WEIGHT</RNText>

        {currentWeight && (
          <View style={styles.currentWeightRow}>
            <RNText style={styles.currentWeightValue}>{currentWeight}</RNText>
            <RNText style={styles.currentWeightUnit}>{weightUnit}</RNText>
          </View>
        )}

        <View style={styles.chartCard}>
          {logs.length >= 2 ? (
            <WeightChart logs={logs} displayUnit={weightUnit} />
          ) : (
            <View style={styles.emptyChart}>
              <RNText style={styles.emptyChartText}>
                {logs.length === 0
                  ? 'No weight logged yet.\nTap "Log Weight" to get started.'
                  : 'Log at least 2 entries to see your chart.'}
              </RNText>
            </View>
          )}
        </View>

        <TouchableOpacity style={styles.logButton} onPress={openModal}>
          <RNText style={styles.logButtonText}>Log Weight</RNText>
        </TouchableOpacity>

        <RNText style={styles.strengthSectionLabel}>STRENGTH PROGRESS</RNText>

        {progressExercises.length === 0 ? (
          <View style={styles.emptyStrengthCard}>
            <RNText style={styles.emptyStrengthTitle}>No strength history yet</RNText>
            <RNText style={styles.emptyStrengthText}>
              Finish workouts with weighted sets to see PR history, estimated 1RM, and weight trends.
            </RNText>
          </View>
        ) : (
          <>
            <View style={styles.selectorFadeWrap}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.exerciseSelector}
                scrollEventThrottle={16}
                onContentSizeChange={(contentWidth) =>
                  setExerciseSelectorMetrics(metrics => ({ ...metrics, contentWidth }))
                }
                onLayout={(event) => {
                  const layoutWidth = getLayoutWidth(event)
                  setExerciseSelectorMetrics(metrics => ({
                    ...metrics,
                    layoutWidth,
                  }))
                }}
                onScroll={(event) => {
                  const x = event.nativeEvent.contentOffset.x
                  setExerciseSelectorMetrics(metrics => ({
                    ...metrics,
                    x,
                  }))
                }}
              >
                {progressExercises.map((exercise, index) => {
                  const selected =
                    selectedProgressExercise?.exerciseTypeId === exercise.exerciseTypeId
                  return (
                    <TouchableOpacity
                      key={exercise.exerciseTypeId}
                      style={[
                        styles.exerciseChip,
                        selected && styles.exerciseChipSelected,
                      ]}
                      onPress={() => {
                        setSelectedProgressExerciseId(exercise.exerciseTypeId)
                        setSelectedProgressMethodId(exercise.methods[0]?.methodId ?? null)
                        setMethodSelectorMetrics(metrics => ({ ...metrics, x: 0 }))
                      }}
                      activeOpacity={0.85}
                    >
                      <RNText
                        style={[
                          styles.exerciseChipRank,
                          selected && styles.exerciseChipRankSelected,
                        ]}
                      >
                        #{index + 1}
                      </RNText>
                      <RNText
                        style={[
                          styles.exerciseChipTitle,
                          selected && styles.exerciseChipTitleSelected,
                        ]}
                        numberOfLines={1}
                      >
                        {exercise.exerciseName}
                      </RNText>
                      <RNText style={styles.exerciseChipMeta}>
                        {exercise.workoutCount} workouts - {exercise.methodCount} methods
                      </RNText>
                    </TouchableOpacity>
                  )
                })}
              </ScrollView>
              <HorizontalFadeEdges
                height={EXERCISE_SELECTOR_HEIGHT}
                showLeft={exerciseFadeState.showLeft}
                showRight={exerciseFadeState.showRight}
              />
            </View>

            {selectedProgressExercise && (
              <View style={styles.selectorFadeWrap}>
                <ScrollView
                  key={selectedProgressExercise.exerciseTypeId}
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.methodSelector}
                  scrollEventThrottle={16}
                  onContentSizeChange={(contentWidth) =>
                    setMethodSelectorMetrics(metrics => ({ ...metrics, contentWidth }))
                  }
                  onLayout={(event) => {
                    const layoutWidth = getLayoutWidth(event)
                    setMethodSelectorMetrics(metrics => ({
                      ...metrics,
                      layoutWidth,
                    }))
                  }}
                  onScroll={(event) => {
                    const x = event.nativeEvent.contentOffset.x
                    setMethodSelectorMetrics(metrics => ({
                      ...metrics,
                      x,
                    }))
                  }}
                >
                  {selectedProgressExercise.methods.map((method) => {
                    const selected = selectedProgressMethod?.methodId === method.methodId
                    return (
                      <TouchableOpacity
                        key={method.methodId}
                        style={[
                          styles.methodChip,
                          selected && styles.methodChipSelected,
                        ]}
                        onPress={() => setSelectedProgressMethodId(method.methodId)}
                        activeOpacity={0.85}
                      >
                        <RNText
                          style={[
                            styles.methodChipTitle,
                            selected && styles.methodChipTitleSelected,
                          ]}
                          numberOfLines={1}
                        >
                          {method.methodName}
                        </RNText>
                        <RNText style={styles.methodChipMeta}>{method.setCount} sets</RNText>
                      </TouchableOpacity>
                    )
                  })}
                </ScrollView>
                <HorizontalFadeEdges
                  height={METHOD_SELECTOR_HEIGHT}
                  showLeft={methodFadeState.showLeft}
                  showRight={methodFadeState.showRight}
                />
              </View>
            )}

            {selectedProgressExercise && selectedProgressMethod && (
              <View style={styles.progressCard}>
                <View style={styles.progressHeader}>
                  <View style={styles.progressHeaderText}>
                    <RNText style={styles.progressTitle}>
                      {selectedProgressExercise.exerciseName}
                    </RNText>
                    <RNText style={styles.progressSubtitle}>
                      {selectedProgressMethod.methodName} - {selectedProgressMethod.setCount} sets -{' '}
                      {selectedProgressMethod.workoutCount} workouts
                    </RNText>
                  </View>
                  <View style={styles.rankPill}>
                    <RNText style={styles.rankPillText}>#{selectedExerciseRank}</RNText>
                  </View>
                </View>

                <View style={styles.progressStats}>
                  <View style={styles.progressStat}>
                    <RNText style={styles.progressStatLabel}>Current PR</RNText>
                    <RNText style={styles.progressStatValue}>
                      {formatWeight(selectedProgressMethod.currentPrKg, progressDisplayUnit)}
                    </RNText>
                    <RNText style={styles.progressStatNote}>
                      {selectedProgressMethod.currentPrReps} reps
                    </RNText>
                  </View>
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
                    <RNText style={styles.progressStatValue}>
                      {formatWeight(selectedProgressMethod.estimatedOneRmKg, progressDisplayUnit)}
                    </RNText>
                    <RNText style={styles.progressStatNote}>
                      from {selectedProgressMethod.estimatedOneRmReps} reps
                    </RNText>
                  </View>
                  <View style={styles.progressStat}>
                    <RNText style={styles.progressStatLabel}>Progression</RNText>
                    <RNText style={styles.progressStatValue}>
                      {formatSignedWeight(selectedProgressMethod.weightDeltaKg, progressDisplayUnit)}
                    </RNText>
                    <RNText style={styles.progressStatNote}>
                      since {formatDateLabel(selectedProgressMethod.firstSetAt)}
                    </RNText>
                  </View>
                </View>

                <View style={styles.trendCard}>
                  <View style={styles.trendHeader}>
                    <RNText style={styles.trendTitle}>Best weight over time</RNText>
                    <RNText style={styles.trendUnit}>{progressDisplayUnit}</RNText>
                  </View>
                  {selectedProgressMethod.trend.length >= 2 ? (
                    <ExerciseProgressChart
                      points={selectedProgressMethod.trend}
                      displayUnit={progressDisplayUnit}
                    />
                  ) : (
                    <View style={styles.emptyTrend}>
                      <RNText style={styles.emptyChartText}>
                        Finish this exercise in another workout to start the trend line.
                      </RNText>
                    </View>
                  )}
                </View>

                <View style={styles.prHistoryHeader}>
                  <RNText style={styles.prHistoryTitle}>PR history</RNText>
                  <RNText style={styles.prHistoryHint}>weight milestones</RNText>
                </View>
                <View style={styles.prHistoryList}>
                  {selectedProgressMethod.prHistory.slice(-4).reverse().map((pr) => (
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
            )}
          </>
        )}
      </ScrollView>

      <Modal
        visible={showModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowModal(false)}
      >
        <Pressable style={styles.overlay} onPress={() => setShowModal(false)}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <RNText style={styles.modalTitle}>Log Weight</RNText>
            <View style={styles.inputRow}>
              <TextInput
                style={[styles.weightInput, { color: theme.colors.text }]}
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
                onPress={() => {
                  setShowModal(false)
                  setInputWeight('')
                }}
              >
                <RNText style={styles.cancelModalText}>Cancel</RNText>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveModalBtn, saving && { opacity: 0.5 }]}
                onPress={handleLogWeight}
                disabled={saving}
              >
                <RNText style={styles.saveModalText}>
                  {saving ? 'Saving...' : 'Save'}
                </RNText>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

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
    paddingTop: theme.spacing.sm,
    paddingBottom: theme.spacing.lg,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: theme.colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionLabel: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
    fontFamily: theme.fontFamily.semiBold,
    letterSpacing: 1,
    marginBottom: theme.spacing.xs,
  },
  currentWeightRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: theme.spacing.xs,
    marginBottom: theme.spacing.sm,
  },
  currentWeightValue: {
    color: theme.colors.text,
    fontSize: 36,
    fontFamily: theme.fontFamily.bold,
  },
  currentWeightUnit: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.lg,
    fontFamily: theme.fontFamily.medium,
  },
  chartCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 0.5,
    borderColor: theme.colors.border,
    padding: theme.spacing.xs,
    marginBottom: theme.spacing.sm,
    overflow: 'hidden',
  },
  emptyChart: {
    height: 80,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyChartText: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.sm,
    textAlign: 'center',
    lineHeight: 22,
  },
  logButton: {
    backgroundColor: theme.colors.accent,
    borderRadius: theme.radius.md,
    paddingVertical: theme.spacing.sm,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 4,
  },
  logButtonText: {
    color: '#FFFFFF',
    fontSize: theme.fontSize.md,
    fontFamily: theme.fontFamily.semiBold,
  },
  strengthSectionLabel: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
    fontFamily: theme.fontFamily.semiBold,
    letterSpacing: 1,
    marginTop: theme.spacing.lg,
    marginBottom: theme.spacing.xs,
  },
  emptyStrengthCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 0.5,
    borderColor: theme.colors.border,
    padding: theme.spacing.md,
    gap: theme.spacing.xs,
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
  selectorFadeWrap: {
    position: 'relative',
  },
  exerciseSelector: {
    gap: theme.spacing.sm,
    paddingRight: theme.spacing.md,
    paddingBottom: theme.spacing.sm,
  },
  exerciseChip: {
    width: 140,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 0.5,
    borderColor: theme.colors.border,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    gap: 2,
  },
  exerciseChipSelected: {
    borderColor: theme.colors.accent,
    backgroundColor: theme.colors.accentMuted,
  },
  exerciseChipRank: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xxs,
    fontFamily: theme.fontFamily.extraBold,
  },
  exerciseChipRankSelected: {
    color: theme.colors.accent,
  },
  exerciseChipTitle: {
    color: theme.colors.text,
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.bold,
  },
  exerciseChipTitleSelected: {
    color: theme.colors.text,
  },
  exerciseChipMeta: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xxs,
    fontFamily: theme.fontFamily.medium,
  },
  methodSelector: {
    gap: theme.spacing.sm,
    paddingRight: theme.spacing.md,
    paddingBottom: theme.spacing.sm,
  },
  methodChip: {
    minWidth: 100,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.full,
    borderWidth: 0.5,
    borderColor: theme.colors.border,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  methodChipSelected: {
    borderColor: theme.colors.accent,
    backgroundColor: theme.colors.accentMuted,
  },
  methodChipTitle: {
    color: theme.colors.text,
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.bold,
    maxWidth: 116,
  },
  methodChipTitleSelected: {
    color: theme.colors.text,
  },
  methodChipMeta: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xxs,
    fontFamily: theme.fontFamily.semiBold,
  },
  progressCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 0.5,
    borderColor: theme.colors.border,
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  progressHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  progressHeaderText: {
    flex: 1,
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
  rankPill: {
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.accentMuted,
    borderWidth: 0.5,
    borderColor: theme.colors.accent,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
  },
  rankPillText: {
    color: theme.colors.accent,
    fontSize: theme.fontSize.xs,
    fontFamily: theme.fontFamily.extraBold,
  },
  progressStats: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  progressStat: {
    flex: 1,
    backgroundColor: theme.colors.surface2,
    borderRadius: theme.radius.md,
    borderWidth: 0.5,
    borderColor: theme.colors.border,
    padding: theme.spacing.sm,
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
    paddingHorizontal: theme.spacing.sm,
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
    height: CHART_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.md,
  },
  prHistoryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
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
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    gap: theme.spacing.sm,
  },
  prDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.colors.accent,
  },
  prHistoryText: {
    flex: 1,
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
  saveModalText: {
    color: '#FFFFFF',
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.semiBold,
  },
}))
