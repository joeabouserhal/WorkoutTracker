import React, { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native'
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons'
import { createStyleSheet, useStyles } from 'react-native-unistyles'
import { useDataRefreshStore } from '@/store/dataRefreshStore'
import { useSessionStore } from '@/store/sessionStore'
import {
  addExerciseToWorkout,
  createCustomExerciseType,
  createCustomMethod,
  ExerciseTypeRow,
  getExerciseTypesBySection,
  getMethodName,
  getMethods,
  getMethodsForExerciseType,
  getSections,
  MethodRow,
  SectionRow,
} from '@/db/workoutHelpers'

type Step = 'sections' | 'exerciseTypes' | 'methods'
type CreateMode = 'exercise' | 'method'

interface Props {
  visible: boolean
  onClose: () => void
  onPick?: (params: { exerciseTypeId: string; methodId: string }) => void | Promise<void>
}

export default function ExercisePickerModal({ visible, onClose, onPick }: Props) {
  const { styles, theme } = useStyles(stylesheet)

  const activeWorkoutId = useSessionStore((s) => s.activeWorkoutId)
  const exercises = useSessionStore((s) => s.exercises)
  const addExercise = useSessionStore((s) => s.addExercise)
  const dataVersion = useDataRefreshStore((state) => state.version)

  const [step, setStep] = useState<Step>('sections')
  const [loading, setLoading] = useState(false)
  const [adding, setAdding] = useState(false)

  const [sectionList, setSectionList] = useState<SectionRow[]>([])
  const [exerciseTypeList, setExerciseTypeList] = useState<ExerciseTypeRow[]>([])
  const [methodList, setMethodList] = useState<MethodRow[]>([])

  const [selectedSection, setSelectedSection] = useState<SectionRow | null>(null)
  const [selectedExerciseType, setSelectedExerciseType] = useState<ExerciseTypeRow | null>(null)
  const [createMode, setCreateMode] = useState<CreateMode | null>(null)
  const [createName, setCreateName] = useState('')
  const [createError, setCreateError] = useState('')
  const [singleMethodOnly, setSingleMethodOnly] = useState(false)
  const [selectedMethodId, setSelectedMethodId] = useState<string | null>(null)
  const [allMethodList, setAllMethodList] = useState<MethodRow[]>([])

  useEffect(() => {
    if (!visible) return
    getSections()
      .then(setSectionList)
      .catch(() => setSectionList([]))
  }, [dataVersion, visible])

  const resetStep = useCallback(() => {
    setStep('sections')
    setExerciseTypeList([])
    setMethodList([])
    setSelectedSection(null)
    setSelectedExerciseType(null)
    closeCreateModal()
    setLoading(false)
    setAdding(false)
  }, [])

  function handleClose() {
    resetStep()
    onClose()
  }

  const handleBack = useCallback(() => {
    if (step === 'methods') {
      setStep('exerciseTypes')
      setSelectedExerciseType(null)
      setMethodList([])
    } else if (step === 'exerciseTypes') {
      setStep('sections')
      setSelectedSection(null)
      setExerciseTypeList([])
    }
  }, [step])

  function handleRequestClose() {
    if (createMode) {
      closeCreateModal()
      return
    }
    if (step !== 'sections') {
      handleBack()
      return
    }
    handleClose()
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

  async function refreshCurrentStep() {
    if (step === 'sections') {
      setSectionList(await getSections())
      return
    }
    if (step === 'exerciseTypes' && selectedSection) {
      setExerciseTypeList(await getExerciseTypesBySection(selectedSection.id))
      return
    }
    if (step === 'methods' && selectedExerciseType) {
      setMethodList(await getMethodsForExerciseType(selectedExerciseType.id))
    }
  }

  async function loadAllMethodsForCreate() {
    const methods = await getMethods()
    setAllMethodList(methods)
    setSelectedMethodId((current) => current ?? methods[0]?.id ?? null)
    return methods
  }

  function openCreateModal() {
    if (step === 'sections') return
    const mode: CreateMode = step === 'exerciseTypes' ? 'exercise' : 'method'
    setCreateMode(mode)
    setCreateName('')
    setCreateError('')
    setSingleMethodOnly(false)
    if (mode === 'exercise') {
      loadAllMethodsForCreate().catch((e) => {
        console.error('Could not load methods for exercise creation', e)
        setAllMethodList([])
      })
    }
  }

  function closeCreateModal() {
    setCreateMode(null)
    setCreateName('')
    setCreateError('')
    setSingleMethodOnly(false)
  }

  async function submitCreate() {
    const trimmed = createName.trim()
    if (!trimmed) {
      setCreateError('Name is required.')
      return
    }
    if (createMode === 'exercise' && !selectedSection) {
      setCreateError('Choose a body part first.')
      return
    }
    if (createMode === 'exercise' && singleMethodOnly && !selectedMethodId) {
      setCreateError('Choose the only method for this exercise.')
      return
    }

    setLoading(true)
    try {
      if (createMode === 'method') {
        await createCustomMethod(trimmed, selectedExerciseType?.id ?? null)
      } else if (createMode === 'exercise' && selectedSection) {
        await createCustomExerciseType({
          sectionId: selectedSection.id,
          name: trimmed,
          methodLocked: singleMethodOnly,
          lockedMethodId: singleMethodOnly ? selectedMethodId : null,
        })
      }
      closeCreateModal()
      await refreshCurrentStep()
    } catch (e) {
      console.error('Could not create picker item', e)
      setCreateError('Could not create this item.')
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
    if (onPick) {
      if (!et.id || !methodId) {
        Alert.alert('Error', 'This exercise has incomplete data. Please select it again.')
        handleClose()
        return
      }
      setAdding(true)
      setLoading(true)
      try {
        await onPick({
          exerciseTypeId: et.id,
          methodId,
        })
        resetStep()
        onClose()
      } catch (e) {
        console.error('Could not pick exercise', e)
        Alert.alert('Error', 'Could not add exercise.')
        handleClose()
      } finally {
        setAdding(false)
        setLoading(false)
      }
      return
    }

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
        methodLocked: et.methodLocked,
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
  const pageTitle = step === 'sections'
    ? 'Exercise Library'
    : step === 'exerciseTypes'
      ? selectedSection?.name ?? 'Exercises'
      : selectedExerciseType?.name ?? 'Methods'
  const sectionLabel = step === 'sections'
    ? 'Body Parts'
    : step === 'exerciseTypes'
      ? 'Exercises'
      : selectedExerciseType?.methodLocked
        ? 'Method'
        : 'Methods'
  const createTitle = createMode === 'exercise'
      ? 'Add Exercise'
      : 'Add Method'

  if (!visible) return null

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleRequestClose}
      statusBarTranslucent
    >
      <TouchableWithoutFeedback onPress={handleClose}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback>
            <View style={styles.panel}>
              {/* Header */}
              <View style={styles.header}>
                <View style={styles.topRow}>
                  {showBack ? (
                    <TouchableOpacity style={styles.backButton} onPress={handleBack}>
                      <MaterialCommunityIcons name="chevron-left" size={17} color={theme.colors.text} />
                      <Text style={styles.backButtonText}>Back</Text>
                    </TouchableOpacity>
                  ) : (
                    <View style={styles.backButtonSpacer} />
                  )}

                  <View style={styles.topRowSpacer} />
                  <View style={styles.rightActions}>
                    {step !== 'sections' ? (
                      <TouchableOpacity style={styles.addButton} onPress={openCreateModal}>
                        <MaterialCommunityIcons name="plus" size={17} color={theme.colors.text} />
                        <Text style={styles.addButtonText}>Add</Text>
                      </TouchableOpacity>
                    ) : null}
                    <TouchableOpacity style={styles.closeButton} onPress={handleClose}>
                      <MaterialCommunityIcons name="close" size={16} color={theme.colors.text} />
                    </TouchableOpacity>
                  </View>
                </View>

                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.breadcrumbContent}
                  style={styles.breadcrumbWrap}
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

                <View style={styles.titleBlock}>
                  <Text style={styles.pageTitle} numberOfLines={1}>{pageTitle}</Text>
                </View>
                <Text style={styles.sectionTitle}>{sectionLabel}</Text>
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
                  <View style={styles.listPanel}>
                    {step === 'sections' && (
                      sectionList.length === 0
                        ? <EmptyState text="No body parts found." />
                        : sectionList.map((section) => (
                          <TouchableOpacity
                            key={section.id}
                            style={styles.row}
                            onPress={() => handleSelectSection(section)}
                          >
                            <View style={styles.rowLeft}>
                              <View style={styles.rowIcon}>
                                <MaterialCommunityIcons name="folder-outline" size={18} color={theme.colors.accent} />
                              </View>
                              <Text style={styles.rowText}>{section.name}</Text>
                            </View>
                            <View style={styles.rowChevron}>
                              <MaterialCommunityIcons name="chevron-right" size={16} color={theme.colors.textMuted} />
                            </View>
                          </TouchableOpacity>
                        ))
                    )}

                    {step === 'exerciseTypes' && (
                      exerciseTypeList.length === 0
                        ? <EmptyState text="No exercises in this body part yet." />
                        : exerciseTypeList.map((et) => (
                          <TouchableOpacity
                            key={et.id}
                            style={styles.row}
                            onPress={() => handleSelectExerciseType(et)}
                          >
                            <View style={styles.rowLeft}>
                              <View style={styles.rowIcon}>
                                <MaterialCommunityIcons name="dumbbell" size={18} color={theme.colors.accent} />
                              </View>
                              <View style={styles.rowTextWrap}>
                                <Text style={styles.rowText}>{et.name}</Text>
                                <View style={styles.badgeRow}>
                                  {et.isCustom ? (
                                    <View style={styles.badge}>
                                      <Text style={styles.badgeText}>custom</Text>
                                    </View>
                                  ) : null}
                                  {et.methodLocked ? (
                                    <View style={styles.badgeMuted}>
                                      <Text style={styles.badgeMutedText}>single method</Text>
                                    </View>
                                  ) : null}
                                </View>
                              </View>
                            </View>
                            <View style={styles.rowChevron}>
                              <MaterialCommunityIcons name="chevron-right" size={16} color={theme.colors.textMuted} />
                            </View>
                          </TouchableOpacity>
                        ))
                    )}

                    {step === 'methods' && (
                      methodList.length === 0
                        ? <EmptyState text="No methods found." />
                        : methodList.map((method) => (
                          <TouchableOpacity
                            key={method.id}
                            style={styles.row}
                            onPress={() => handleSelectMethod(method)}
                          >
                            <View style={styles.rowLeft}>
                              <View style={styles.rowIcon}>
                                <MaterialCommunityIcons name="shape-outline" size={18} color={theme.colors.accent} />
                              </View>
                              <View style={styles.rowTextWrap}>
                                <Text style={styles.rowText}>{method.name}</Text>
                                {method.isCustom ? (
                                  <View style={styles.badgeRow}>
                                    <View style={styles.badge}>
                                      <Text style={styles.badgeText}>custom</Text>
                                    </View>
                                  </View>
                                ) : null}
                              </View>
                            </View>
                            <View style={styles.rowChevron}>
                              <MaterialCommunityIcons name="chevron-right" size={16} color={theme.colors.textMuted} />
                            </View>
                          </TouchableOpacity>
                        ))
                    )}
                  </View>
                </ScrollView>
              )}
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>

      <CreatePickerItemModal
        visible={!!createMode}
        title={createTitle}
        mode={createMode}
        name={createName}
        onChangeName={setCreateName}
        error={createError}
        methods={allMethodList}
        singleMethodOnly={singleMethodOnly}
        selectedMethodId={selectedMethodId}
        onToggleSingleMethod={setSingleMethodOnly}
        onSelectMethod={setSelectedMethodId}
        onClose={closeCreateModal}
        onSubmit={submitCreate}
      />
    </Modal>
  )
}

function CreatePickerItemModal({
  visible,
  title,
  mode,
  name,
  onChangeName,
  error,
  methods,
  singleMethodOnly,
  selectedMethodId,
  onToggleSingleMethod,
  onSelectMethod,
  onClose,
  onSubmit,
}: {
  visible: boolean
  title: string
  mode: CreateMode | null
  name: string
  onChangeName: (value: string) => void
  error: string
  methods: MethodRow[]
  singleMethodOnly: boolean
  selectedMethodId: string | null
  onToggleSingleMethod: (value: boolean) => void
  onSelectMethod: (id: string) => void
  onClose: () => void
  onSubmit: () => void
}) {
  const { styles, theme } = useStyles(stylesheet)
  if (!visible) return null

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.createOverlay}>
        <View style={styles.createPanel}>
          <View style={styles.createHeader}>
            <Text style={styles.createTitle}>{title}</Text>
            <TouchableOpacity style={styles.headerBtn} onPress={onClose}>
              <MaterialCommunityIcons name="close" size={20} color={theme.colors.textMuted} />
            </TouchableOpacity>
          </View>

          <TextInput
            style={styles.createInput}
            value={name}
            onChangeText={onChangeName}
            placeholder={
              mode === 'exercise'
                  ? 'Exercise name'
                  : 'Method name'
            }
            placeholderTextColor={theme.colors.textMuted}
            returnKeyType="done"
            autoFocus
          />

          {mode === 'exercise' ? (
            <View style={styles.singleMethodBox}>
              <View style={styles.singleMethodTextWrap}>
                <Text style={styles.singleMethodTitle}>Single method only</Text>
                <Text style={styles.singleMethodHint}>
                  Skip method selection when this exercise only uses one method.
                </Text>
              </View>
              <Switch
                value={singleMethodOnly}
                onValueChange={onToggleSingleMethod}
                thumbColor={singleMethodOnly ? theme.colors.accent : theme.colors.textMuted}
                trackColor={{
                  false: theme.colors.surface2,
                  true: theme.colors.accentMuted,
                }}
              />
            </View>
          ) : null}

          {mode === 'exercise' && singleMethodOnly ? (
            <View style={styles.methodPickerBox}>
              <Text style={styles.methodPickerTitle}>Only Method</Text>
              {methods.length === 0 ? (
                <Text style={styles.emptyText}>Create a method first.</Text>
              ) : (
                <ScrollView
                  style={styles.methodChoiceScroll}
                  nestedScrollEnabled
                  keyboardShouldPersistTaps="handled"
                >
                  {methods.map((method) => (
                    <TouchableOpacity
                      key={method.id}
                      style={[
                        styles.methodChoice,
                        selectedMethodId === method.id && styles.methodChoiceActive,
                      ]}
                      onPress={() => onSelectMethod(method.id)}
                    >
                      <Text
                        style={[
                          styles.methodChoiceText,
                          selectedMethodId === method.id && styles.methodChoiceTextActive,
                        ]}
                      >
                        {method.name}
                      </Text>
                      {selectedMethodId === method.id ? (
                        <MaterialCommunityIcons name="check" size={18} color={theme.colors.accent} />
                      ) : null}
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}
            </View>
          ) : null}

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <View style={styles.createActions}>
            <TouchableOpacity style={styles.secondaryButton} onPress={onClose}>
              <Text style={styles.secondaryButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.primaryButton} onPress={onSubmit}>
              <Text style={styles.primaryButtonText}>Create</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  )
}

function EmptyState({ text }: { text: string }) {
  const { styles, theme } = useStyles(stylesheet)

  return (
    <View style={styles.emptyState}>
      <View style={styles.emptyIcon}>
        <MaterialCommunityIcons name="playlist-plus" size={22} color={theme.colors.accent} />
      </View>
      <Text style={styles.emptyText}>{text}</Text>
    </View>
  )
}

const stylesheet = createStyleSheet((theme) => ({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.62)',
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.sm,
  },
  panel: {
    backgroundColor: theme.colors.bg,
    borderRadius: theme.radius.md,
    height: '82%',
    maxHeight: '82%',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  header: {
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.md,
    paddingBottom: theme.spacing.sm,
    backgroundColor: theme.colors.bg,
    gap: theme.spacing.xs,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  topRowSpacer: {
    flex: 1,
  },
  rightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  headerBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    justifyContent: 'center',
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.md,
  },
  backButtonText: {
    color: theme.colors.text,
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.semiBold,
  },
  backButtonSpacer: {
    width: 68,
  },
  breadcrumbWrap: {
    minWidth: 0,
    maxWidth: '100%',
    alignSelf: 'flex-start',
    flexGrow: 0,
    flexShrink: 1,
    borderRadius: theme.radius.full,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  breadcrumbContent: {
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  breadcrumbText: {
    color: theme.colors.text,
    fontSize: theme.fontSize.xs,
    fontFamily: theme.fontFamily.bold,
    maxWidth: 96,
  },
  breadcrumbCurrent: {
    color: theme.colors.accent,
    fontSize: 10,
    fontFamily: theme.fontFamily.extraBold,
    maxWidth: 84,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    justifyContent: 'center',
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.md,
  },
  addButtonText: {
    color: theme.colors.text,
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.semiBold,
  },
  closeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    justifyContent: 'center',
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.sm,
  },
  titleBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  pageTitle: {
    flex: 1,
    minWidth: 0,
    color: theme.colors.text,
    fontSize: theme.fontSize.lg,
    fontFamily: theme.fontFamily.extraBold,
  },
  sectionTitle: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
    fontFamily: theme.fontFamily.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  scroll: {
    flex: 1,
  },
  list: {
    paddingHorizontal: theme.spacing.md,
    paddingBottom: theme.spacing.md,
    paddingTop: theme.spacing.xs,
    flexGrow: 1,
  },
  listPanel: {
    gap: theme.spacing.xs,
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
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
    minHeight: 58,
    gap: theme.spacing.sm,
  },
  rowLeft: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.accentMuted,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  rowChevron: {
    width: 28,
    height: 28,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.surface2,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowTextWrap: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  rowText: {
    flexShrink: 1,
    color: theme.colors.text,
    fontSize: theme.fontSize.md,
    fontFamily: theme.fontFamily.extraBold,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
  },
  badge: {
    backgroundColor: theme.colors.accentMuted,
    borderRadius: theme.radius.full,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  badgeText: {
    color: theme.colors.accent,
    fontSize: theme.fontSize.xs,
    fontFamily: theme.fontFamily.semiBold,
  },
  badgeMuted: {
    backgroundColor: theme.colors.surface2,
    borderRadius: theme.radius.full,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  badgeMutedText: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
    fontFamily: theme.fontFamily.bold,
  },
  emptyText: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.md,
    fontFamily: theme.fontFamily.semiBold,
    textAlign: 'center',
  },
  emptyState: {
    minHeight: 210,
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.sm,
    padding: theme.spacing.xl,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  emptyIcon: {
    width: 52,
    height: 52,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.accentMuted,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  createOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.62)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.lg,
  },
  createPanel: {
    width: '100%',
    maxWidth: 390,
    maxHeight: '84%',
    backgroundColor: theme.colors.bg,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  createHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  createTitle: {
    color: theme.colors.text,
    fontSize: theme.fontSize.lg,
    fontFamily: theme.fontFamily.extraBold,
  },
  createInput: {
    minHeight: 48,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface2,
    paddingHorizontal: theme.spacing.md,
    color: theme.colors.text,
    fontSize: theme.fontSize.md,
    fontFamily: theme.fontFamily.semiBold,
  },
  singleMethodBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.md,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.sm,
    backgroundColor: theme.colors.surface,
  },
  singleMethodTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  singleMethodTitle: {
    color: theme.colors.text,
    fontSize: theme.fontSize.md,
    fontFamily: theme.fontFamily.bold,
  },
  singleMethodHint: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.sm,
    marginTop: 2,
  },
  methodPickerBox: {
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    overflow: 'hidden',
  },
  methodPickerTitle: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
    fontFamily: theme.fontFamily.extraBold,
    textTransform: 'uppercase',
    letterSpacing: 0,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    backgroundColor: theme.colors.surface,
  },
  methodChoiceScroll: {
    maxHeight: 220,
  },
  methodChoice: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.md,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  methodChoiceActive: {
    backgroundColor: theme.colors.accentMuted,
  },
  methodChoiceText: {
    color: theme.colors.text,
    fontSize: theme.fontSize.md,
    fontFamily: theme.fontFamily.semiBold,
  },
  methodChoiceTextActive: {
    color: theme.colors.accent,
    fontFamily: theme.fontFamily.extraBold,
  },
  errorText: {
    color: theme.colors.danger,
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.bold,
  },
  createActions: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  secondaryButton: {
    flex: 1,
    minHeight: 46,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    color: theme.colors.text,
    fontSize: theme.fontSize.md,
    fontFamily: theme.fontFamily.bold,
  },
  primaryButton: {
    flex: 1,
    minHeight: 46,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.accent,
    backgroundColor: theme.colors.accentMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: theme.colors.accent,
    fontSize: theme.fontSize.md,
    fontFamily: theme.fontFamily.extraBold,
  },
}))
