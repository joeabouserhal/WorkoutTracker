import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable'
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons'
import { createStyleSheet, useStyles } from 'react-native-unistyles'
import ThemedDialog, { type ThemedDialogAction } from '@/components/ui/ThemedDialog'
import {
  createCustomExerciseType,
  createCustomMethod,
  createCustomSection,
  deleteCustomExerciseType,
  deleteCustomMethodFromExercise,
  ExerciseTypeRow,
  getExerciseTypesBySection,
  getMethodName,
  getMethods,
  getMethodsForExerciseType,
  getSections,
  hasHiddenDefaultMethods,
  MethodRow,
  restoreDefaultMethodsForExerciseType,
  SectionRow,
} from '@/db/workoutHelpers'

type Step = 'sections' | 'exerciseTypes' | 'methods'
type CreateMode = 'section' | 'exercise' | 'method'

export default function LibraryScreen() {
  const { styles, theme } = useStyles(stylesheet)
  const [step, setStep] = useState<Step>('sections')
  const [loading, setLoading] = useState(true)
  const [sectionList, setSectionList] = useState<SectionRow[]>([])
  const [exerciseTypeList, setExerciseTypeList] = useState<ExerciseTypeRow[]>([])
  const [methodList, setMethodList] = useState<MethodRow[]>([])
  const [selectedSection, setSelectedSection] = useState<SectionRow | null>(null)
  const [selectedExerciseType, setSelectedExerciseType] = useState<ExerciseTypeRow | null>(null)
  const [lockedMethodName, setLockedMethodName] = useState('')
  const [createMode, setCreateMode] = useState<CreateMode | null>(null)
  const [createName, setCreateName] = useState('')
  const [createError, setCreateError] = useState('')
  const [singleMethodOnly, setSingleMethodOnly] = useState(false)
  const [selectedMethodId, setSelectedMethodId] = useState<string | null>(null)
  const [showRestoreDefaults, setShowRestoreDefaults] = useState(false)
  const [dialog, setDialog] = useState<{
    title: string
    message?: string
    actions: ThemedDialogAction[]
  } | null>(null)

  const loadSections = useCallback(async () => {
    setLoading(true)
    try {
      setSectionList(await getSections())
    } catch (e) {
      console.error('Could not load sections', e)
      setSectionList([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadSections().catch(console.error)
  }, [loadSections])

  const loadMethods = useCallback(async () => {
    try {
      const methods = await getMethods()
      setMethodList(methods)
      if (!selectedMethodId && methods.length > 0) {
        setSelectedMethodId(methods[0].id)
      }
      return methods
    } catch (e) {
      console.error('Could not load methods', e)
      setMethodList([])
      return []
    }
  }, [selectedMethodId])

  async function handleSelectSection(section: SectionRow) {
    setSelectedSection(section)
    setSelectedExerciseType(null)
    setLockedMethodName('')
    setShowRestoreDefaults(false)
    setLoading(true)
    try {
      setExerciseTypeList(await getExerciseTypesBySection(section.id))
      setStep('exerciseTypes')
    } catch (e) {
      console.error('Could not load exercises', e)
      setExerciseTypeList([])
      setStep('exerciseTypes')
    } finally {
      setLoading(false)
    }
  }

  async function handleSelectExerciseType(exerciseType: ExerciseTypeRow) {
    setSelectedExerciseType(exerciseType)
    setLoading(true)
    try {
      setShowRestoreDefaults(
        Boolean(exerciseType.isCustom) && await hasHiddenDefaultMethods(exerciseType.id),
      )
      const methods = await getMethodsForExerciseType(exerciseType.id)
      if (exerciseType.methodLocked && exerciseType.lockedMethodId) {
        setLockedMethodName(await getMethodName(exerciseType.lockedMethodId))
        setMethodList(methods.filter((method) => method.id === exerciseType.lockedMethodId))
      } else {
        setLockedMethodName('')
        setMethodList(methods)
      }
      setStep('methods')
    } catch (e) {
      console.error('Could not load exercise methods', e)
      setStep('methods')
    } finally {
      setLoading(false)
    }
  }

  function closeDialog() {
    setDialog(null)
  }

  function showInfoDialog(title: string, message: string) {
    setDialog({
      title,
      message,
      actions: [{ label: 'OK', variant: 'primary', onPress: closeDialog }],
    })
  }

  function handleBack() {
    if (step === 'methods') {
      setStep('exerciseTypes')
      setSelectedExerciseType(null)
      setLockedMethodName('')
      setShowRestoreDefaults(false)
      return
    }
    if (step === 'exerciseTypes') {
      setStep('sections')
      setSelectedSection(null)
      setExerciseTypeList([])
    }
  }

  const breadcrumbItems = useMemo(() => {
    if (step === 'sections') return ['Library']
    if (step === 'exerciseTypes') return [selectedSection?.name ?? 'Section', 'Exercises']
    return [
      selectedSection?.name ?? 'Section',
      selectedExerciseType?.name ?? 'Exercise',
      selectedExerciseType?.methodLocked ? 'Method' : 'Methods',
    ]
  }, [selectedExerciseType, selectedSection, step])

  const pageTitle = step === 'sections'
    ? 'Library'
    : step === 'exerciseTypes'
      ? selectedSection?.name ?? 'Exercises'
      : selectedExerciseType?.name ?? 'Methods'

  const sectionLabel = step === 'sections'
    ? 'Sections'
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
    ? 'Add Section'
    : createMode === 'exercise'
      ? 'Add Exercise'
      : 'Add Method'

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
      loadMethods().catch(console.error)
    }
  }

  function closeCreateModal() {
    setCreateMode(null)
    setCreateName('')
    setCreateError('')
    setSingleMethodOnly(false)
  }

  async function refreshCurrentStep() {
    if (step === 'sections') {
      await loadSections()
      return
    }
    if (step === 'exerciseTypes' && selectedSection) {
      setExerciseTypeList(await getExerciseTypesBySection(selectedSection.id))
      return
    }
    if (step === 'methods') {
      if (selectedExerciseType) {
        setMethodList(await getMethodsForExerciseType(selectedExerciseType.id))
        setShowRestoreDefaults(
          Boolean(selectedExerciseType.isCustom) &&
            await hasHiddenDefaultMethods(selectedExerciseType.id),
        )
        return
      }
      await loadMethods()
    }
  }

  async function refreshMethodsForSelectedExercise() {
    if (!selectedExerciseType) return
    setLoading(true)
    try {
      const methods = await getMethodsForExerciseType(selectedExerciseType.id)
      setShowRestoreDefaults(
        Boolean(selectedExerciseType.isCustom) &&
          await hasHiddenDefaultMethods(selectedExerciseType.id),
      )
      if (selectedExerciseType.methodLocked && selectedExerciseType.lockedMethodId) {
        setLockedMethodName(await getMethodName(selectedExerciseType.lockedMethodId))
        setMethodList(methods.filter((method) => method.id === selectedExerciseType.lockedMethodId))
      } else {
        setLockedMethodName('')
        setMethodList(methods)
      }
    } catch (e) {
      console.error('Could not refresh methods', e)
      setMethodList([])
    } finally {
      setLoading(false)
    }
  }

  function requestDeleteExercise(exerciseType: ExerciseTypeRow) {
    setDialog({
      title: 'Delete Exercise',
      message: `Delete ${exerciseType.name}? This only works for custom exercises that are not used in saved workouts.`,
      actions: [
        { label: 'Cancel', onPress: closeDialog },
        {
          label: 'Delete Exercise',
          variant: 'danger',
          onPress: () => {
            closeDialog()
            deleteCustomExerciseType(exerciseType.id)
              .then(() => refreshCurrentStep())
              .catch((e) => {
                console.error('Could not delete exercise', e)
                showInfoDialog('Could Not Delete', 'This exercise is either built in or already used in a workout.')
              })
          },
        },
      ],
    })
  }

  function requestDeleteMethod(method: MethodRow) {
    if (!selectedExerciseType) return
    setDialog({
      title: 'Delete Method',
      message: `Remove ${method.name} from ${selectedExerciseType.name}? This only affects this custom exercise.`,
      actions: [
        { label: 'Cancel', onPress: closeDialog },
        {
          label: 'Remove Method',
          variant: 'danger',
          onPress: () => {
            const exerciseTypeId = selectedExerciseType.id
            const methodId = method.id
            const wasLockedMethod = selectedExerciseType.lockedMethodId === methodId
            closeDialog()
            deleteCustomMethodFromExercise(exerciseTypeId, methodId)
              .then(async () => {
                setSelectedExerciseType((current) => {
                  if (current?.lockedMethodId !== methodId) return current
                  return { ...current, methodLocked: 0, lockedMethodId: null }
                })
                if (wasLockedMethod) {
                  setLockedMethodName('')
                  setMethodList(await getMethodsForExerciseType(exerciseTypeId))
                  setShowRestoreDefaults(await hasHiddenDefaultMethods(exerciseTypeId))
                  return
                }
                await refreshMethodsForSelectedExercise()
              })
              .catch((e) => {
                console.error('Could not delete method', e)
                showInfoDialog('Could Not Remove', 'This method is either already used in a workout for this exercise, or the exercise is not custom.')
              })
          },
        },
      ],
    })
  }

  async function submitCreate() {
    const trimmed = createName.trim()
    if (!trimmed) {
      setCreateError('Name is required.')
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
      console.error('Could not create library item', e)
      setCreateError('Could not create this item.')
    } finally {
      setLoading(false)
    }
  }

  function restoreDefaultMethods() {
    if (!selectedExerciseType) return
    const exerciseTypeId = selectedExerciseType.id
    restoreDefaultMethodsForExerciseType(exerciseTypeId)
      .then(async () => {
        setMethodList(await getMethodsForExerciseType(exerciseTypeId))
        setShowRestoreDefaults(false)
      })
      .catch((e) => {
        console.error('Could not restore default methods', e)
        showInfoDialog('Could Not Restore', 'Default methods can only be restored for custom exercises.')
      })
  }

  const renderContent = () => {
    if (loading) {
      return (
        <View style={styles.centered}>
          <ActivityIndicator color={theme.colors.accent} />
        </View>
      )
    }

    if (step === 'sections') {
      return sectionList.length === 0 ? (
        <EmptyState text="No sections found." />
      ) : sectionList.map((section) => (
        <TouchableOpacity
          key={section.id}
          style={styles.row}
          onPress={() => handleSelectSection(section)}
        >
          <View style={styles.rowLeft}>
            <View style={styles.rowIcon}>
              <MaterialCommunityIcons name="folder-outline" size={20} color={theme.colors.accent} />
            </View>
            <Text style={styles.rowText}>{section.name}</Text>
          </View>
          <MaterialCommunityIcons name="chevron-right" size={18} color={theme.colors.textMuted} />
        </TouchableOpacity>
      ))
    }

    if (step === 'exerciseTypes') {
      return exerciseTypeList.length === 0 ? (
        <EmptyState text="No exercises in this section yet." />
      ) : exerciseTypeList.map((exerciseType) => {
        const row = (
          <TouchableOpacity
            style={styles.row}
            onPress={() => handleSelectExerciseType(exerciseType)}
          >
            <View style={styles.rowLeft}>
              <View style={styles.rowIcon}>
                <MaterialCommunityIcons name="dumbbell" size={19} color={theme.colors.accent} />
              </View>
              <View style={styles.rowTextWrap}>
                <Text style={styles.rowText}>{exerciseType.name}</Text>
                <View style={styles.badgeRow}>
                  {exerciseType.isCustom ? (
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>custom</Text>
                    </View>
                  ) : null}
                  {exerciseType.methodLocked ? (
                    <View style={styles.badgeMuted}>
                      <Text style={styles.badgeMutedText}>single method</Text>
                    </View>
                  ) : null}
                </View>
              </View>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={18} color={theme.colors.textMuted} />
          </TouchableOpacity>
        )

        if (!exerciseType.isCustom) {
          return <React.Fragment key={exerciseType.id}>{row}</React.Fragment>
        }

        return (
          <ReanimatedSwipeable
            key={exerciseType.id}
            renderRightActions={() => renderDeleteAction(() => requestDeleteExercise(exerciseType))}
            overshootRight={false}
          >
            {row}
          </ReanimatedSwipeable>
        )
      })
    }

    return methodList.length === 0 ? (
      <EmptyState text="No methods found." />
    ) : methodList.map((method) => {
      const row = (
        <View style={styles.row}>
          <View style={styles.rowLeft}>
            <View style={styles.rowIcon}>
              <MaterialCommunityIcons name="shape-outline" size={19} color={theme.colors.accent} />
            </View>
            <View style={styles.rowTextWrap}>
              <Text style={styles.rowText}>{method.name}</Text>
              <View style={styles.badgeRow}>
                {method.isCustom ? (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>custom</Text>
                  </View>
                ) : null}
                {selectedExerciseType?.methodLocked && method.name === lockedMethodName ? (
                  <View style={styles.badgeMuted}>
                    <Text style={styles.badgeMutedText}>only method</Text>
                  </View>
                ) : null}
              </View>
            </View>
          </View>
        </View>
      )

      if (!selectedExerciseType?.isCustom) {
        return <React.Fragment key={method.id}>{row}</React.Fragment>
      }

      return (
        <ReanimatedSwipeable
          key={method.id}
          renderRightActions={() => renderDeleteAction(() => requestDeleteMethod(method))}
          overshootRight={false}
        >
          {row}
        </ReanimatedSwipeable>
      )
    })
  }

  function renderDeleteAction(onPress: () => void) {
    return (
      <TouchableOpacity style={styles.deleteAction} onPress={onPress}>
        <MaterialCommunityIcons name="trash-can-outline" size={22} color="#FFFFFF" />
      </TouchableOpacity>
    )
  }

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <View style={styles.topRow}>
          {step !== 'sections' ? (
            <TouchableOpacity style={styles.backButton} onPress={handleBack}>
              <MaterialCommunityIcons name="chevron-left" size={17} color={theme.colors.text} />
              <Text style={styles.backButtonText}>Back</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.backButtonSpacer} />
          )}

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.breadcrumbContent}
            style={styles.breadcrumbScroll}
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

          <TouchableOpacity style={styles.addButton} onPress={openCreateModal}>
            <MaterialCommunityIcons name="plus" size={17} color={theme.colors.text} />
            <Text style={styles.addButtonText}>Add</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.titleBlock}>
          <Text style={styles.pageTitle}>{pageTitle}</Text>
          <View style={styles.countPill}>
            <Text style={styles.countPillText}>{itemCount}</Text>
          </View>
        </View>
        <View style={styles.sectionTitleRow}>
          <Text style={styles.sectionTitle}>{sectionLabel}</Text>
          {step === 'methods' && showRestoreDefaults ? (
            <TouchableOpacity style={styles.restoreButton} onPress={restoreDefaultMethods}>
              <MaterialCommunityIcons name="restore" size={14} color={theme.colors.accent} />
              <Text style={styles.restoreButtonText}>Restore Defaults</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.listPanel}>
          {renderContent()}
        </View>
      </ScrollView>

      <CreateLibraryModal
        visible={!!createMode}
        title={createTitle}
        mode={createMode}
        name={createName}
        onChangeName={setCreateName}
        error={createError}
        methods={methodList}
        singleMethodOnly={singleMethodOnly}
        selectedMethodId={selectedMethodId}
        onToggleSingleMethod={setSingleMethodOnly}
        onSelectMethod={setSelectedMethodId}
        onClose={closeCreateModal}
        onSubmit={submitCreate}
      />
      <ThemedDialog
        visible={!!dialog}
        title={dialog?.title ?? ''}
        message={dialog?.message}
        actions={dialog?.actions ?? []}
      />
    </View>
  )
}

function EmptyState({ text }: { text: string }) {
  const { styles, theme } = useStyles(stylesheet)

  return (
    <View style={styles.emptyState}>
      <View style={styles.emptyIcon}>
        <MaterialCommunityIcons name="playlist-plus" size={24} color={theme.colors.accent} />
      </View>
      <Text style={styles.emptyText}>{text}</Text>
    </View>
  )
}

function CreateLibraryModal({
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
      <View style={styles.modalOverlay}>
        <View style={styles.modalPanel}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{title}</Text>
            <TouchableOpacity style={styles.modalCloseButton} onPress={onClose}>
              <MaterialCommunityIcons name="close" size={20} color={theme.colors.textMuted} />
            </TouchableOpacity>
          </View>

          <TextInput
            style={styles.modalInput}
            value={name}
            onChangeText={onChangeName}
            placeholder={
              mode === 'section'
                ? 'Section name'
                : mode === 'exercise'
                  ? 'Exercise name'
                  : 'Method name'
            }
            placeholderTextColor={theme.colors.textMuted}
            autoFocus
            returnKeyType="done"
          />

          {mode === 'exercise' ? (
            <View style={styles.singleMethodBox}>
              <View style={styles.singleMethodTextWrap}>
                <Text style={styles.singleMethodTitle}>Single method only</Text>
                <Text style={styles.singleMethodHint}>
                  Skip method selection for exercises that only use one method.
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

          <View style={styles.modalActions}>
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

const stylesheet = createStyleSheet((theme) => ({
  root: {
    flex: 1,
    backgroundColor: theme.colors.bg,
  },
  header: {
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.xl + theme.spacing.sm,
    paddingBottom: theme.spacing.md,
    backgroundColor: theme.colors.bg,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
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
  breadcrumbScroll: {
    flex: 1,
    minWidth: 0,
  },
  breadcrumbContent: {
    alignItems: 'center',
    flexGrow: 1,
    justifyContent: 'center',
    gap: 2,
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
  deleteAction: {
    width: 72,
    backgroundColor: theme.colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.lg,
  },
  pageTitle: {
    flex: 1,
    minWidth: 0,
    color: theme.colors.text,
    fontSize: theme.fontSize.xxl,
    fontWeight: '700',
  },
  countPill: {
    minWidth: 34,
    height: 28,
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
  sectionTitleRow: {
    minHeight: 28,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.md,
  },
  sectionTitle: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.sm,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0,
  },
  restoreButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    borderRadius: theme.radius.full,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
  },
  restoreButtonText: {
    color: theme.colors.accent,
    fontSize: theme.fontSize.xs,
    fontWeight: '700',
  },
  scroll: {
    flex: 1,
  },
  list: {
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.xs,
    paddingBottom: theme.spacing.xl,
  },
  listPanel: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  centered: {
    flex: 1,
    minHeight: 240,
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    minHeight: 64,
  },
  rowLeft: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  rowIcon: {
    width: 38,
    height: 38,
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
    fontWeight: '700',
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
    width: 52,
    height: 52,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.accentMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.62)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.lg,
  },
  modalPanel: {
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
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  modalTitle: {
    color: theme.colors.text,
    fontSize: theme.fontSize.lg,
    fontWeight: '800',
  },
  modalCloseButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalInput: {
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
  modalActions: {
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
