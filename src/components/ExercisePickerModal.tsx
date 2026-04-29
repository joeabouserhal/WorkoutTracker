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
import { useSessionStore } from '@/store/sessionStore'
import {
  addExerciseToWorkout,
  createCustomExerciseType,
  createCustomMethod,
  createCustomSection,
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
type CreateMode = 'section' | 'exercise' | 'method'

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
  const [createMode, setCreateMode] = useState<CreateMode | null>(null)
  const [createName, setCreateName] = useState('')
  const [createError, setCreateError] = useState('')
  const [singleMethodOnly, setSingleMethodOnly] = useState(false)
  const [selectedMethodId, setSelectedMethodId] = useState<string | null>(null)
  const [allMethodList, setAllMethodList] = useState<MethodRow[]>([])

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
    const mode: CreateMode = step === 'sections'
      ? 'section'
      : step === 'exerciseTypes'
        ? 'exercise'
        : 'method'
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
      if (createMode === 'section') {
        await createCustomSection(trimmed)
      } else if (createMode === 'method') {
        await createCustomMethod(trimmed)
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
  const itemCount = step === 'sections'
    ? sectionList.length
    : step === 'exerciseTypes'
      ? exerciseTypeList.length
      : methodList.length
  const createTitle = createMode === 'section'
    ? 'Add Body Part'
    : createMode === 'exercise'
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
                    <TouchableOpacity style={styles.addButton} onPress={openCreateModal}>
                      <MaterialCommunityIcons name="plus" size={17} color={theme.colors.text} />
                      <Text style={styles.addButtonText}>Add</Text>
                    </TouchableOpacity>
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
                  <View style={styles.countPill}>
                    <Text style={styles.countPillText}>{itemCount}</Text>
                  </View>
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
                                <MaterialCommunityIcons name="folder-outline" size={19} color={theme.colors.accent} />
                              </View>
                              <Text style={styles.rowText}>{section.name}</Text>
                            </View>
                            <MaterialCommunityIcons name="chevron-right" size={18} color={theme.colors.textMuted} />
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
                            <MaterialCommunityIcons name="chevron-right" size={18} color={theme.colors.textMuted} />
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
                            <MaterialCommunityIcons name="chevron-right" size={18} color={theme.colors.textMuted} />
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
              mode === 'section'
                ? 'Body part name'
                : mode === 'exercise'
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
    paddingHorizontal: theme.spacing.md,
  },
  panel: {
    backgroundColor: theme.colors.bg,
    borderRadius: theme.radius.lg,
    height: '80%',
    maxHeight: '80%',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  header: {
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.md,
    paddingBottom: theme.spacing.sm,
    backgroundColor: theme.colors.bg,
    gap: theme.spacing.sm,
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
    fontWeight: '600',
  },
  backButtonSpacer: {
    width: 68,
  },
  breadcrumbWrap: {
    width: '100%',
    minWidth: 0,
  },
  breadcrumbContent: {
    alignItems: 'center',
    gap: 2,
    paddingRight: theme.spacing.md,
  },
  breadcrumbText: {
    color: theme.colors.text,
    fontSize: theme.fontSize.sm,
    fontWeight: '700',
    maxWidth: 104,
  },
  breadcrumbCurrent: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
    fontWeight: '600',
    maxWidth: 92,
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
    fontWeight: '600',
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
    fontSize: theme.fontSize.xl,
    fontWeight: '800',
  },
  countPill: {
    minWidth: 32,
    height: 26,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.sm,
  },
  countPillText: {
    color: theme.colors.accent,
    fontSize: theme.fontSize.sm,
    fontWeight: '800',
  },
  sectionTitle: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.sm,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0,
  },
  scroll: {
    flex: 1,
  },
  list: {
    paddingHorizontal: theme.spacing.md,
    paddingBottom: theme.spacing.md,
    flexGrow: 1,
  },
  listPanel: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    overflow: 'hidden',
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
    paddingVertical: theme.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    minHeight: 58,
  },
  rowLeft: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  rowIcon: {
    width: 34,
    height: 34,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.accentMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowTextWrap: {
    flex: 1,
    minWidth: 0,
    gap: theme.spacing.xs,
  },
  rowText: {
    flexShrink: 1,
    color: theme.colors.text,
    fontSize: theme.fontSize.md,
    fontWeight: '600',
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
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
  badgeMuted: {
    backgroundColor: theme.colors.surface2,
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  badgeMutedText: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
    fontWeight: '700',
  },
  emptyText: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.md,
    fontWeight: '600',
    textAlign: 'center',
  },
  emptyState: {
    minHeight: 220,
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.sm,
    padding: theme.spacing.xl,
  },
  emptyIcon: {
    width: 50,
    height: 50,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.accentMuted,
    alignItems: 'center',
    justifyContent: 'center',
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
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.lg,
    gap: theme.spacing.md,
  },
  createHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  createTitle: {
    color: theme.colors.text,
    fontSize: theme.fontSize.lg,
    fontWeight: '800',
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
    fontWeight: '600',
  },
  singleMethodBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.md,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.md,
    backgroundColor: theme.colors.bg,
  },
  singleMethodTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  singleMethodTitle: {
    color: theme.colors.text,
    fontSize: theme.fontSize.md,
    fontWeight: '700',
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
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    backgroundColor: theme.colors.bg,
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
    fontWeight: '600',
  },
  methodChoiceTextActive: {
    color: theme.colors.accent,
    fontWeight: '800',
  },
  errorText: {
    color: theme.colors.danger,
    fontSize: theme.fontSize.sm,
    fontWeight: '700',
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
    backgroundColor: theme.colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    color: theme.colors.text,
    fontSize: theme.fontSize.md,
    fontWeight: '700',
  },
  primaryButton: {
    flex: 1,
    minHeight: 46,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.28)',
    backgroundColor: theme.colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: theme.fontSize.md,
    fontWeight: '800',
  },
}))
