import React, { useEffect, useRef, useState } from 'react'
import {
  Alert,
  AppState,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import {
  BottomSheetModal,
  BottomSheetScrollView,
  BottomSheetView,
} from '@gorhom/bottom-sheet'
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable'
import notifee, { EventType } from '@notifee/react-native'
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons'
import { createStyleSheet, useStyles } from 'react-native-unistyles'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useSessionStore } from '@/store/sessionStore'
import { finishWorkout } from '@/db/workoutHelpers'
import {
  cancelWorkoutNotification,
  setupWorkoutChannel,
  showWorkoutNotification,
} from '@/services/WorkoutNotification'
import ExercisePickerModal from './ExercisePickerModal'

type LocalSet = {
  id: string
  weight: string
  reps: string
  completed: boolean
}

function newLocalSet(): LocalSet {
  return {
    id: `ls_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    weight: '',
    reps: '',
    completed: false,
  }
}

function formatElapsed(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export default function ActiveWorkoutSheet() {
  const { styles, theme } = useStyles(stylesheet)
  const insets = useSafeAreaInsets()
  const sheetRef = useRef<BottomSheetModal>(null)
  const [pickerVisible, setPickerVisible] = useState(false)
  const [localSets, setLocalSets] = useState<Record<string, LocalSet[]>>({})
  const [elapsed, setElapsed] = useState(0)

  const {
    activeWorkoutId,
    startedAt,
    exercises,
    isWorkoutSheetOpen,
    closeWorkoutSheet,
    endWorkout,
    openWorkoutSheet,
    removeExercise,
  } = useSessionStore()

  // Sync new exercises into local set state (one empty set each)
  useEffect(() => {
    setLocalSets((prev) => {
      const next = { ...prev }
      for (const ex of exercises) {
        if (!next[ex.workoutExerciseId]) {
          next[ex.workoutExerciseId] = [newLocalSet()]
        }
      }
      for (const key of Object.keys(next)) {
        if (!exercises.find((ex) => ex.workoutExerciseId === key)) {
          delete next[key]
        }
      }
      return next
    })
  }, [exercises])

  useEffect(() => {
    if (!activeWorkoutId || !startedAt) {
      cancelWorkoutNotification().catch(() => {})
      return
    }
    async function startNotification() {
      await setupWorkoutChannel()
      await notifee.requestPermission()
      const initial = Math.floor((Date.now() - startedAt!) / 1000)
      await showWorkoutNotification(initial)
    }
    startNotification().catch(console.error)
    return () => {
      cancelWorkoutNotification().catch(() => {})
    }
  }, [activeWorkoutId, startedAt])

  useEffect(() => {
    const unsub = notifee.onForegroundEvent(({ type, detail }) => {
      if (type === EventType.PRESS) openWorkoutSheet()
      if (type === EventType.ACTION_PRESS && detail.pressAction?.id === 'end_workout') {
        doEndWorkout()
      }
    })
    return unsub
  }, [])

  useEffect(() => {
    if (!activeWorkoutId) return
    if (isWorkoutSheetOpen) {
      sheetRef.current?.present()
    } else {
      sheetRef.current?.dismiss()
    }
  }, [isWorkoutSheetOpen, activeWorkoutId])

  useEffect(() => {
    if (!startedAt) {
      setElapsed(0)
      return
    }
    setElapsed(Math.floor((Date.now() - startedAt) / 1000))
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAt) / 1000))
    }, 1000)
    const appStateSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') setElapsed(Math.floor((Date.now() - startedAt) / 1000))
    })
    return () => {
      clearInterval(interval)
      appStateSub.remove()
    }
  }, [startedAt])

  async function doEndWorkout() {
    if (activeWorkoutId) await finishWorkout(activeWorkoutId)
    endWorkout()
  }

  function handleEndWorkout() {
    Alert.alert('End Workout', 'Finish this workout?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'End Workout', style: 'destructive', onPress: doEndWorkout },
    ])
  }

  function addLocalSet(weId: string) {
    setLocalSets((prev) => ({
      ...prev,
      [weId]: [...(prev[weId] ?? []), newLocalSet()],
    }))
  }

  function removeLocalSet(weId: string, setId: string) {
    setLocalSets((prev) => ({
      ...prev,
      [weId]: (prev[weId] ?? []).filter((s) => s.id !== setId),
    }))
  }

  function updateSetField(weId: string, setId: string, field: 'weight' | 'reps', value: string) {
    setLocalSets((prev) => ({
      ...prev,
      [weId]: (prev[weId] ?? []).map((s) =>
        s.id === setId ? { ...s, [field]: value } : s,
      ),
    }))
  }

  function toggleSetCompleted(weId: string, setId: string) {
    setLocalSets((prev) => ({
      ...prev,
      [weId]: (prev[weId] ?? []).map((s) =>
        s.id === setId ? { ...s, completed: !s.completed } : s,
      ),
    }))
  }

  function handleDeleteExercise(weId: string) {
    setLocalSets((prev) => {
      const next = { ...prev }
      delete next[weId]
      return next
    })
    removeExercise(weId)
  }

  function renderDeleteAction(onPress: () => void) {
    return (
      <TouchableOpacity style={styles.deleteAction} onPress={onPress}>
        <MaterialCommunityIcons name="trash-can-outline" size={22} color="#fff" />
      </TouchableOpacity>
    )
  }

  if (!activeWorkoutId) return null

  return (
    <>
      <BottomSheetModal
        ref={sheetRef}
        snapPoints={['100%']}
        enablePanDownToClose
        enableDynamicSizing={false}
        onDismiss={closeWorkoutSheet}
        backgroundStyle={styles.background}
        handleIndicatorStyle={styles.handleIndicator}
        topInset={insets.top}
      >
        <BottomSheetView style={styles.root}>
          {/* Fixed header */}
          <View style={styles.header}>
            <TouchableOpacity style={styles.iconBtn} onPress={closeWorkoutSheet}>
              <MaterialCommunityIcons name="chevron-down" size={28} color={theme.colors.textMuted} />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Active Workout</Text>
            <View style={styles.timerPill}>
              <View style={styles.timerDot} />
              <Text style={styles.timerText}>{formatElapsed(elapsed)}</Text>
            </View>
          </View>

          {/* Scrollable exercise list */}
          <BottomSheetScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
          >
            {exercises.length === 0 && (
              <Text style={styles.emptyHint}>Add an exercise to get started</Text>
            )}

            {exercises.map((ex) => {
              const sets = localSets[ex.workoutExerciseId] ?? []
              return (
                <View key={ex.workoutExerciseId} style={styles.exerciseCard}>
                  {/* Exercise header row — swipe left to delete whole exercise */}
                  <ReanimatedSwipeable
                    renderRightActions={() => renderDeleteAction(() => handleDeleteExercise(ex.workoutExerciseId))}
                    overshootRight={false}
                  >
                    <View style={styles.exerciseHeader}>
                      <Text style={styles.exerciseName}>
                        {ex.exerciseTypeName}
                        <Text style={styles.exerciseMethod}>{' — '}{ex.methodName}</Text>
                      </Text>
                    </View>
                  </ReanimatedSwipeable>

                  {/* Column labels */}
                  <View style={styles.setLabelRow}>
                    <Text style={[styles.setLabel, styles.setNumCol]}>SET</Text>
                    <Text style={[styles.setLabel, styles.weightCol]}>WEIGHT</Text>
                    <Text style={[styles.setLabel, styles.repsCol]}>REPS</Text>
                    <View style={styles.checkCol} />
                  </View>

                  {/* Set rows — swipe left to delete set */}
                  {sets.map((s, i) => (
                    <ReanimatedSwipeable
                      key={s.id}
                      renderRightActions={() => renderDeleteAction(() => removeLocalSet(ex.workoutExerciseId, s.id))}
                      overshootRight={false}
                    >
                      <View style={[styles.setRow, s.completed && styles.setRowCompleted]}>
                        <Text style={[styles.setNum, styles.setNumCol]}>{i + 1}</Text>

                        <View style={[styles.inputWrap, styles.weightCol]}>
                          <TextInput
                            style={styles.input}
                            value={s.weight}
                            onChangeText={(v) => updateSetField(ex.workoutExerciseId, s.id, 'weight', v)}
                            keyboardType="decimal-pad"
                            placeholder="0"
                            placeholderTextColor={theme.colors.textMuted}
                            returnKeyType="done"
                          />
                          <Text style={styles.inputUnit}>kg</Text>
                        </View>

                        <View style={[styles.inputWrap, styles.repsCol]}>
                          <TextInput
                            style={styles.input}
                            value={s.reps}
                            onChangeText={(v) => updateSetField(ex.workoutExerciseId, s.id, 'reps', v)}
                            keyboardType="number-pad"
                            placeholder="0"
                            placeholderTextColor={theme.colors.textMuted}
                            returnKeyType="done"
                          />
                          <Text style={styles.inputUnit}>reps</Text>
                        </View>

                        <TouchableOpacity
                          style={styles.checkCol}
                          onPress={() => toggleSetCompleted(ex.workoutExerciseId, s.id)}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          <MaterialCommunityIcons
                            name={s.completed ? 'check-circle' : 'check-circle-outline'}
                            size={26}
                            color={s.completed ? theme.colors.accent : theme.colors.textMuted}
                          />
                        </TouchableOpacity>
                      </View>
                    </ReanimatedSwipeable>
                  ))}

                  {/* Add Set button */}
                  <TouchableOpacity
                    style={styles.addSetBtn}
                    onPress={() => addLocalSet(ex.workoutExerciseId)}
                  >
                    <MaterialCommunityIcons name="plus" size={14} color={theme.colors.textMuted} />
                    <Text style={styles.addSetText}>Add Set</Text>
                  </TouchableOpacity>
                </View>
              )
            })}

            {/* Add Exercise button — below exercises */}
            <TouchableOpacity
              style={styles.addExerciseBtn}
              onPress={() => setPickerVisible(true)}
            >
              <MaterialCommunityIcons name="plus" size={20} color={theme.colors.accent} />
              <Text style={styles.addExerciseText}>Add Exercise</Text>
            </TouchableOpacity>
          </BottomSheetScrollView>

          {/* Fixed footer */}
          <View style={styles.footer}>
            <TouchableOpacity style={styles.endButton} onPress={handleEndWorkout}>
              <Text style={styles.endButtonText}>End Workout</Text>
            </TouchableOpacity>
          </View>
        </BottomSheetView>
      </BottomSheetModal>

      <ExercisePickerModal visible={pickerVisible} onClose={() => setPickerVisible(false)} />
    </>
  )
}

const stylesheet = createStyleSheet((theme) => ({
  background: {
    backgroundColor: theme.colors.bg,
  },
  handleIndicator: {
    backgroundColor: theme.colors.border,
    width: 36,
  },
  root: {
    flex: 1,
  },
  // ── Header ──────────────────────────────────────────────
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  iconBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    color: theme.colors.text,
    fontSize: theme.fontSize.md,
    fontWeight: '700',
  },
  timerPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.full,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  timerDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: theme.colors.accent,
  },
  timerText: {
    color: theme.colors.accent,
    fontSize: theme.fontSize.sm,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  // ── Scroll area ──────────────────────────────────────────
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: theme.spacing.md,
    paddingBottom: theme.spacing.sm,
    gap: theme.spacing.md,
  },
  emptyHint: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.sm,
    textAlign: 'center',
    paddingVertical: theme.spacing.xl,
  },
  // ── Exercise card ────────────────────────────────────────
  exerciseCard: {
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    overflow: 'hidden',
  },
  exerciseHeader: {
    backgroundColor: theme.colors.surface,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 12,
  },
  exerciseName: {
    color: theme.colors.text,
    fontSize: theme.fontSize.md,
    fontWeight: '700',
  },
  exerciseMethod: {
    color: theme.colors.textMuted,
    fontWeight: '400',
  },
  // ── Set rows ─────────────────────────────────────────────
  setLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.bg,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 6,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  setLabel: {
    color: theme.colors.textMuted,
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.8,
  },
  setRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.bg,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  setRowCompleted: {
    backgroundColor: theme.colors.surface,
  },
  setNumCol: {
    width: 28,
  },
  weightCol: {
    flex: 1,
    marginRight: theme.spacing.sm,
  },
  repsCol: {
    flex: 1,
    marginRight: theme.spacing.sm,
  },
  checkCol: {
    width: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  setNum: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.sm,
    fontWeight: '600',
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.sm,
    paddingHorizontal: 8,
    paddingVertical: 6,
    gap: 4,
  },
  input: {
    color: theme.colors.text,
    fontSize: theme.fontSize.md,
    fontWeight: '600',
    minWidth: 36,
    padding: 0,
  },
  inputUnit: {
    color: theme.colors.textMuted,
    fontSize: 11,
    fontWeight: '500',
  },
  // ── Add Set ──────────────────────────────────────────────
  addSetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: theme.colors.bg,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  addSetText: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.sm,
    fontWeight: '600',
  },
  // ── Delete swipe action ──────────────────────────────────
  deleteAction: {
    backgroundColor: theme.colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
    width: 72,
  },
  // ── Add Exercise ─────────────────────────────────────────
  addExerciseBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.sm,
    borderRadius: theme.radius.md,
    paddingVertical: theme.spacing.md,
    borderWidth: 1.5,
    borderColor: theme.colors.accent,
  },
  addExerciseText: {
    color: theme.colors.accent,
    fontSize: theme.fontSize.md,
    fontWeight: '600',
  },
  // ── Footer ───────────────────────────────────────────────
  footer: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  endButton: {
    backgroundColor: theme.colors.danger,
    borderRadius: theme.radius.md,
    paddingVertical: theme.spacing.md,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  endButtonText: {
    color: '#FFFFFF',
    fontSize: theme.fontSize.md,
    fontWeight: '700',
  },
}))
