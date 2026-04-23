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
  Skia,
  vec,
} from '@shopify/react-native-skia'
import { createStyleSheet, useStyles } from 'react-native-unistyles'
import { getBodyWeightLogs, logBodyWeight, type WeightLog } from '@/db/bodyWeightHelpers'
import { getProfile } from '@/db/profileHelpers'

const CHART_HEIGHT = 160
const PAD = { top: 16, right: 16, bottom: 40, left: 52 }

function formatShortDate(ts: number): string {
  const d = new Date(ts)
  return `${d.getMonth() + 1}/${d.getDate()}`
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
      onLayout={e => setContainerWidth(e.nativeEvent.layout.width)}
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

export default function ProgressScreen() {
  const { styles, theme } = useStyles(stylesheet)
  const [logs, setLogs] = useState<WeightLog[]>([])
  const [weightUnit, setWeightUnit] = useState<'kg' | 'lb'>('kg')
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [inputWeight, setInputWeight] = useState('')
  const [saving, setSaving] = useState(false)

  useFocusEffect(
    useCallback(() => {
      loadData()
    }, []),
  )

  async function loadData() {
    try {
      const [profile, weightLogs] = await Promise.all([
        getProfile(),
        getBodyWeightLogs(),
      ])
      setWeightUnit((profile?.defaultWeightUnit as 'kg' | 'lb') ?? 'kg')
      setLogs(weightLogs)
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

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator color={theme.colors.accent} />
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <RNText style={styles.pageTitle}>Progress</RNText>

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
    padding: theme.spacing.md,
    paddingBottom: theme.spacing.xl,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: theme.colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pageTitle: {
    color: theme.colors.text,
    fontSize: theme.fontSize.xxl,
    fontWeight: '700',
    marginTop: theme.spacing.lg,
    marginBottom: theme.spacing.lg,
  },
  sectionLabel: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
    fontWeight: '600',
    letterSpacing: 1,
    marginBottom: theme.spacing.sm,
  },
  currentWeightRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: theme.spacing.xs,
    marginBottom: theme.spacing.md,
  },
  currentWeightValue: {
    color: theme.colors.text,
    fontSize: 42,
    fontWeight: '700',
  },
  currentWeightUnit: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.lg,
    fontWeight: '500',
  },
  chartCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 0.5,
    borderColor: theme.colors.border,
    padding: theme.spacing.xs,
    marginBottom: theme.spacing.md,
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
    paddingVertical: theme.spacing.md,
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
    fontWeight: '600',
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
    fontWeight: '700',
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
    fontWeight: '600',
    paddingVertical: theme.spacing.md,
  },
  inputUnitLabel: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.md,
    fontWeight: '500',
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
    fontWeight: '600',
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
    fontWeight: '600',
  },
}))
