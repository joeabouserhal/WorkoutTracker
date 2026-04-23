import React, { useCallback, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Alert, Text, TouchableOpacity, View } from 'react-native'
import { BottomSheetModal, BottomSheetScrollView } from '@gorhom/bottom-sheet'
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons'
import { createStyleSheet, useStyles } from 'react-native-unistyles'
import { useSessionStore } from '@/store/sessionStore'
import {
  addExerciseToWorkout,
  ExerciseTypeRow,
  getExerciseTypesBySection,
  getMethods,
  getSections,
  MethodRow,
  SectionRow,
} from '@/db/workoutHelpers'

type Step = 'sections' | 'exerciseTypes' | 'methods'

export default function ExercisePickerSheet() {
  const { styles, theme } = useStyles(stylesheet)
  const sheetRef = useRef<BottomSheetModal>(null)

  const activeWorkoutId = useSessionStore((s) => s.activeWorkoutId)
  const exercises = useSessionStore((s) => s.exercises)
  const addExercise = useSessionStore((s) => s.addExercise)
  const isExercisePickerOpen = useSessionStore((s) => s.isExercisePickerOpen)
  const closeExercisePicker = useSessionStore((s) => s.closeExercisePicker)

  const [step, setStep] = useState<Step>('sections')
  const [loading, setLoading] = useState(false)

  // Sections are stable — load once on mount, never clear them
  const [sectionList, setSectionList] = useState<SectionRow[]>([])
  const [exerciseTypeList, setExerciseTypeList] = useState<ExerciseTypeRow[]>([])
  const [methodList, setMethodList] = useState<MethodRow[]>([])

  const [selectedSection, setSelectedSection] = useState<SectionRow | null>(null)
  const [selectedExerciseType, setSelectedExerciseType] = useState<ExerciseTypeRow | null>(null)
  const [selectedMethod, setSelectedMethod] = useState<MethodRow | null>(null)

  useEffect(() => {
    getSections()
      .then(setSectionList)
      .catch(() => setSectionList([]))
  }, [])

  // Present/dismiss in response to store flag
  useEffect(() => {
    if (isExercisePickerOpen) {
      sheetRef.current?.present()
    } else {
      sheetRef.current?.dismiss()
    }
  }, [isExercisePickerOpen])

  const resetStep = useCallback(() => {
    setStep('sections')
    setExerciseTypeList([])
    setMethodList([])
    setSelectedSection(null)
    setSelectedExerciseType(null)
    setSelectedMethod(null)
  }, [])

  function handleDismiss() {
    resetStep()
    closeExercisePicker()
  }

  async function handleSelectSection(section: SectionRow) {
    setSelectedSection(section)
    setLoading(true)
    try {
      const types = await getExerciseTypesBySection(section.id)
      setExerciseTypeList(types)
      setStep('exerciseTypes')
    } catch {
      setExerciseTypeList([])
      setStep('exerciseTypes')
    } finally {
      setLoading(false)
    }
  }

  async function handleSelectExerciseType(et: ExerciseTypeRow) {
    setSelectedExerciseType(et)
    if (et.methodLocked) {
      await confirmAdd(et, et.lockedMethodId!)
      return
    }
    setLoading(true)
    try {
      const mList = await getMethods()
      setMethodList(mList)
      setStep('methods')
    } catch {
      setMethodList([])
      setStep('methods')
    } finally {
      setLoading(false)
    }
  }

  async function handleSelectMethod(method: MethodRow) {
    setSelectedMethod(method)
    await confirmAdd(selectedExerciseType!, method.id)
  }

  async function confirmAdd(et: ExerciseTypeRow, methodId: string) {
    if (!activeWorkoutId) {
      Alert.alert('Start a workout first')
      closeExercisePicker()
      return
    }
    try {
      const workoutExerciseId = await addExerciseToWorkout({
        workoutId: activeWorkoutId,
        exerciseTypeId: et.id,
        methodId,
        weightUnit: 'kg',
        orderIndex: exercises.length,
      })
      addExercise({
        workoutExerciseId,
        exerciseTypeId: et.id,
        methodId,
        weightUnit: 'kg',
      })
      resetStep()
      closeExercisePicker()
    } catch {
      Alert.alert('Error', 'Could not add exercise.')
    }
  }

  function handleBack() {
    if (step === 'methods') {
      setStep('exerciseTypes')
      setSelectedMethod(null)
    } else if (step === 'exerciseTypes') {
      setStep('sections')
      setSelectedExerciseType(null)
      setExerciseTypeList([])
    }
  }

  const stepTitle =
    step === 'sections' ? 'Select Body Part' :
    step === 'exerciseTypes' ? selectedSection?.name ?? 'Select Exercise' :
    'Select Method'

  return (
    <BottomSheetModal
      ref={sheetRef}
      snapPoints={['60%']}
      enablePanDownToClose
      onDismiss={handleDismiss}
      backgroundStyle={styles.background}
      handleIndicatorStyle={styles.handle}
    >
      <View style={styles.header}>
        {step === 'sections' ? (
          <TouchableOpacity style={styles.headerBtn} onPress={() => closeExercisePicker()}>
            <MaterialCommunityIcons name="close" size={22} color={theme.colors.textMuted} />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={styles.headerBtn} onPress={handleBack}>
            <MaterialCommunityIcons name="chevron-left" size={26} color={theme.colors.textMuted} />
          </TouchableOpacity>
        )}
        <Text style={styles.headerTitle}>{stepTitle}</Text>
        <View style={styles.headerBtn} />
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={theme.colors.accent} />
        </View>
      ) : (
        <BottomSheetScrollView contentContainerStyle={styles.list}>
          {step === 'sections' && (
            sectionList.length === 0 ? (
              <Text style={styles.emptyText}>No sections found. Add some in the library.</Text>
            ) : (
              sectionList.map((section) => (
                <TouchableOpacity
                  key={section.id}
                  style={styles.row}
                  onPress={() => handleSelectSection(section)}
                >
                  <Text style={styles.rowText}>{section.name}</Text>
                  <MaterialCommunityIcons name="chevron-right" size={20} color={theme.colors.textMuted} />
                </TouchableOpacity>
              ))
            )
          )}

          {step === 'exerciseTypes' && (
            exerciseTypeList.length === 0 ? (
              <Text style={styles.emptyText}>No exercises in this section yet.</Text>
            ) : (
              exerciseTypeList.map((et) => {
                const isSelected = selectedExerciseType?.id === et.id
                return (
                  <TouchableOpacity
                    key={et.id}
                    style={styles.row}
                    onPress={() => handleSelectExerciseType(et)}
                  >
                    <View style={styles.rowLeft}>
                      <Text style={[styles.rowText, isSelected && styles.rowTextAccent]}>
                        {et.name}
                      </Text>
                      {et.isCustom ? (
                        <View style={styles.badge}>
                          <Text style={styles.badgeText}>custom</Text>
                        </View>
                      ) : null}
                    </View>
                    {isSelected ? (
                      <MaterialCommunityIcons name="check" size={20} color={theme.colors.accent} />
                    ) : (
                      <MaterialCommunityIcons name="chevron-right" size={20} color={theme.colors.textMuted} />
                    )}
                  </TouchableOpacity>
                )
              })
            )
          )}

          {step === 'methods' && (
            methodList.length === 0 ? (
              <Text style={styles.emptyText}>No methods found.</Text>
            ) : (
              methodList.map((method) => {
                const isSelected = selectedMethod?.id === method.id
                return (
                  <TouchableOpacity
                    key={method.id}
                    style={styles.row}
                    onPress={() => handleSelectMethod(method)}
                  >
                    <Text style={[styles.rowText, isSelected && styles.rowTextAccent]}>
                      {method.name}
                    </Text>
                    {isSelected ? (
                      <MaterialCommunityIcons name="check" size={20} color={theme.colors.accent} />
                    ) : null}
                  </TouchableOpacity>
                )
              })
            )
          )}
        </BottomSheetScrollView>
      )}
    </BottomSheetModal>
  )
}

const stylesheet = createStyleSheet((theme) => ({
  background: {
    backgroundColor: theme.colors.surface,
  },
  handle: {
    backgroundColor: theme.colors.borderStrong,
    width: 36,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  headerBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    color: theme.colors.text,
    fontSize: theme.fontSize.md,
    fontWeight: '600',
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: theme.spacing.xl,
  },
  list: {
    paddingVertical: theme.spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  rowText: {
    color: theme.colors.text,
    fontSize: theme.fontSize.md,
  },
  rowTextAccent: {
    color: theme.colors.accent,
    fontWeight: '600',
  },
  badge: {
    backgroundColor: theme.colors.accentMuted,
    borderRadius: theme.radius.sm,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  badgeText: {
    color: theme.colors.accent,
    fontSize: theme.fontSize.xs,
    fontWeight: '600',
  },
  emptyText: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.sm,
    textAlign: 'center',
    paddingVertical: theme.spacing.xl,
    paddingHorizontal: theme.spacing.md,
  },
}))
