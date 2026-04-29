import React, { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native'
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons'
import { createStyleSheet, useStyles } from 'react-native-unistyles'
import { useSessionStore } from '@/store/sessionStore'
import {
  addExerciseToWorkout,
  ExerciseTypeRow,
  getExerciseTypesBySection,
  getMethodName,
  getMethodsForExerciseType,
  getSections,
  MethodRow,
  SectionRow,
} from '@/db/workoutHelpers'

type Step = 'sections' | 'exerciseTypes' | 'methods'

interface Props {
  visible: boolean
  onClose: () => void
}

export default function ExercisePickerModal({ visible, onClose }: Props) {
  const { styles, theme } = useStyles(stylesheet)

  const activeWorkoutId = useSessionStore((s) => s.activeWorkoutId)
  const exercises = useSessionStore((s) => s.exercises)
  const addExercise = useSessionStore((s) => s.addExercise)

  const [step, setStep] = useState<Step>('sections')
  const [loading, setLoading] = useState(false)
  const [adding, setAdding] = useState(false)

  const [sectionList, setSectionList] = useState<SectionRow[]>([])
  const [exerciseTypeList, setExerciseTypeList] = useState<ExerciseTypeRow[]>([])
  const [methodList, setMethodList] = useState<MethodRow[]>([])

  const [selectedSection, setSelectedSection] = useState<SectionRow | null>(null)
  const [selectedExerciseType, setSelectedExerciseType] = useState<ExerciseTypeRow | null>(null)

  // Load sections once on mount
  useEffect(() => {
    getSections()
      .then(setSectionList)
      .catch(() => setSectionList([]))
  }, [])

  const resetStep = useCallback(() => {
    setStep('sections')
    setExerciseTypeList([])
    setMethodList([])
    setSelectedSection(null)
    setSelectedExerciseType(null)
    setLoading(false)
    setAdding(false)
  }, [])

  function handleClose() {
    resetStep()
    onClose()
  }

  function handleBack() {
    if (step === 'methods') {
      setStep('exerciseTypes')
    } else if (step === 'exerciseTypes') {
      setStep('sections')
      setSelectedSection(null)
      setExerciseTypeList([])
    }
  }

  async function handleSelectSection(section: SectionRow) {
    if (loading || adding) return
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
    if (loading || adding) return
    setSelectedExerciseType(et)
    if (et.methodLocked) {
      setLoading(true)
      try {
        const mName = await getMethodName(et.lockedMethodId!)
        await confirmAdd(et, et.lockedMethodId!, mName)
      } finally {
        setLoading(false)
      }
      return
    }
    setLoading(true)
    try {
      const mList = await getMethodsForExerciseType(et.id)
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
    if (loading || adding) return
    if (!selectedExerciseType) {
      Alert.alert('Error', 'Please select an exercise again.')
      resetStep()
      return
    }
    await confirmAdd(selectedExerciseType, method.id, method.name)
  }

  async function confirmAdd(et: ExerciseTypeRow, methodId: string, methodName: string) {
    if (!activeWorkoutId) {
      Alert.alert('Start a workout first')
      handleClose()
      return
    }
    if (!et.id || !et.name || !methodId || !methodName) {
      Alert.alert('Error', 'This exercise has incomplete data. Please select it again.')
      handleClose()
      return
    }
    setAdding(true)
    setLoading(true)
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
        exerciseTypeName: et.name,
        methodId,
        methodName,
        weightUnit: 'kg',
      })
      resetStep()
      onClose()
    } catch (e) {
      console.error('Could not add exercise', e)
      Alert.alert('Error', 'Could not add exercise.')
      handleClose()
    } finally {
      setAdding(false)
      setLoading(false)
    }
  }

  const breadcrumbItems =
    step === 'sections'
      ? ['Select Body Part']
      : step === 'exerciseTypes'
        ? [selectedSection?.name ?? 'Body Part', 'Select Exercise']
        : [
            selectedSection?.name ?? 'Body Part',
            selectedExerciseType?.name ?? 'Exercise',
            'Select Method',
          ]

  const showBack = step !== 'sections'

  if (!visible) return null

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
      statusBarTranslucent
    >
      <TouchableWithoutFeedback onPress={handleClose}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback>
            <View style={styles.panel}>
              {/* Header */}
              <View style={styles.header}>
                {showBack ? (
                  <TouchableOpacity style={styles.headerBtn} onPress={handleBack}>
                    <MaterialCommunityIcons name="chevron-left" size={24} color={theme.colors.textMuted} />
                  </TouchableOpacity>
                ) : (
                  <View style={styles.headerBtn} />
                )}
                <View style={styles.breadcrumbWrap}>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.breadcrumbContent}
                  >
                    {breadcrumbItems.map((item, index) => {
                      const isLast = index === breadcrumbItems.length - 1
                      return (
                        <React.Fragment key={`${item}-${index}`}>
                          <Text
                            style={[
                              styles.breadcrumbText,
                              isLast && styles.breadcrumbCurrent,
                            ]}
                            numberOfLines={1}
                          >
                            {item}
                          </Text>
                          {!isLast ? (
                            <MaterialCommunityIcons
                              name="chevron-right"
                              size={16}
                              color={theme.colors.textMuted}
                            />
                          ) : null}
                        </React.Fragment>
                      )
                    })}
                  </ScrollView>
                </View>
                <TouchableOpacity style={styles.headerBtn} onPress={handleClose}>
                  <MaterialCommunityIcons name="close" size={20} color={theme.colors.textMuted} />
                </TouchableOpacity>
              </View>

              {/* Content */}
              {loading || adding ? (
                <View style={styles.centered}>
                  <ActivityIndicator color={theme.colors.accent} />
                </View>
              ) : (
                <ScrollView
                  style={styles.scroll}
                  contentContainerStyle={styles.list}
                  keyboardShouldPersistTaps="handled"
                >
                  {step === 'sections' && (
                    sectionList.length === 0
                      ? <Text style={styles.emptyText}>No sections found. Add some in the library.</Text>
                      : sectionList.map((section) => (
                          <TouchableOpacity
                            key={section.id}
                            style={styles.row}
                            onPress={() => handleSelectSection(section)}
                          >
                            <Text style={styles.rowText}>{section.name}</Text>
                            <MaterialCommunityIcons name="chevron-right" size={18} color={theme.colors.textMuted} />
                          </TouchableOpacity>
                        ))
                  )}

                  {step === 'exerciseTypes' && (
                    exerciseTypeList.length === 0
                      ? <Text style={styles.emptyText}>No exercises in this section yet.</Text>
                      : exerciseTypeList.map((et) => (
                          <TouchableOpacity
                            key={et.id}
                            style={styles.row}
                            onPress={() => handleSelectExerciseType(et)}
                          >
                            <View style={styles.rowLeft}>
                              <Text style={styles.rowText}>{et.name}</Text>
                              {et.isCustom ? (
                                <View style={styles.badge}>
                                  <Text style={styles.badgeText}>custom</Text>
                                </View>
                              ) : null}
                            </View>
                            <MaterialCommunityIcons name="chevron-right" size={18} color={theme.colors.textMuted} />
                          </TouchableOpacity>
                        ))
                  )}

                  {step === 'methods' && (
                    methodList.length === 0
                      ? <Text style={styles.emptyText}>No methods found.</Text>
                      : methodList.map((method) => (
                          <TouchableOpacity
                            key={method.id}
                            style={styles.row}
                            onPress={() => handleSelectMethod(method)}
                          >
                            <Text style={styles.rowText}>{method.name}</Text>
                            <MaterialCommunityIcons name="chevron-right" size={18} color={theme.colors.textMuted} />
                          </TouchableOpacity>
                        ))
                  )}
                </ScrollView>
              )}
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  )
}

const stylesheet = createStyleSheet((theme) => ({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.md,
  },
  panel: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    height: '75%',
    maxHeight: '75%',
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  headerBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  breadcrumbWrap: {
    flex: 1,
    minWidth: 0,
    marginHorizontal: theme.spacing.xs,
  },
  breadcrumbContent: {
    alignItems: 'center',
    justifyContent: 'center',
    flexGrow: 1,
    gap: 2,
  },
  breadcrumbText: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.md,
    fontWeight: '700',
    maxWidth: 128,
  },
  breadcrumbCurrent: {
    color: theme.colors.text,
    fontSize: theme.fontSize.sm,
    fontWeight: '600',
  },
  scroll: {
    flex: 1,
  },
  list: {
    paddingVertical: theme.spacing.xs,
    flexGrow: 1,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 14,
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
