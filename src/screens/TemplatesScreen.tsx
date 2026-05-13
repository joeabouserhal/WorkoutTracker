import React, { useCallback, useEffect, useState } from 'react'
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
import { useFocusEffect } from '@react-navigation/native'
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons'
import { createStyleSheet, useStyles } from 'react-native-unistyles'
import ScreenHeader, { useHeaderFade } from '@/components/ui/ScreenHeader'
import ThemedDialog from '@/components/ui/ThemedDialog'
import {
  createCustomExerciseType,
  createCustomMethod,
  createWorkoutTemplate,
  deleteWorkoutTemplate,
  getExerciseTypesBySection,
  getMethodName,
  getMethods,
  getMethodsForExerciseType,
  getSections,
  getWorkoutTemplates,
  setWorkoutTemplateFavorite,
  type ExerciseTypeRow,
  type MethodRow,
  type SectionRow,
  type WorkoutTemplateSummary,
} from '@/db/workoutHelpers'
import type { HomeStackParamList } from '../navigation/TabNavigator'

type Props = NativeStackScreenProps<HomeStackParamList, 'Templates'>
type PickerStep = 'sections' | 'exerciseTypes' | 'methods'
type PickerCreateMode = 'exercise' | 'method'

export default function TemplatesScreen({ navigation }: Props) {
  const { styles, theme } = useStyles(stylesheet)
  const { showHeaderFade, handleHeaderScroll } = useHeaderFade()
  const [templates, setTemplates] = useState<WorkoutTemplateSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [createVisible, setCreateVisible] = useState(false)
  const [templateName, setTemplateName] = useState('')
  const [createError, setCreateError] = useState('')
  const [deleteTemplateTarget, setDeleteTemplateTarget] = useState<WorkoutTemplateSummary | null>(null)
  const [message, setMessage] = useState('')

  const loadTemplates = useCallback(async () => {
    setLoading(true)
    try {
      setTemplates(await getWorkoutTemplates())
    } catch (e) {
      console.error('Could not load templates', e)
      setTemplates([])
    } finally {
      setLoading(false)
    }
  }, [])

  useFocusEffect(
    useCallback(() => {
      loadTemplates().catch(console.error)
    }, [loadTemplates]),
  )

  async function submitTemplate() {
    const trimmed = templateName.trim()
    if (!trimmed) {
      setCreateError('Name is required.')
      return
    }
    try {
      const templateId = await createWorkoutTemplate(trimmed)
      setCreateVisible(false)
      setTemplateName('')
      setCreateError('')
      navigation.navigate('TemplateDetail', { templateId, initialEdit: true })
    } catch (e) {
      console.error('Could not create template', e)
      setCreateError('Could not create this template.')
    }
  }

  async function toggleFavorite(template: WorkoutTemplateSummary) {
    try {
      await setWorkoutTemplateFavorite(template.id, !template.isFavorite)
      setMessage('')
      await loadTemplates()
    } catch (e) {
      console.error('Could not update favorite template', e)
      setMessage('You can favorite up to 6 templates.')
    }
  }

  function requestDeleteTemplate(template: WorkoutTemplateSummary) {
    setDeleteTemplateTarget(template)
  }

  async function confirmDeleteTemplate() {
    const template = deleteTemplateTarget
    if (!template) return
    setDeleteTemplateTarget(null)
    try {
      await deleteWorkoutTemplate(template.id)
      await loadTemplates()
    } catch (e) {
      console.error('Could not delete template', e)
      setMessage('Could not delete this template.')
    }
  }

  function renderDeleteAction(onPress: () => void) {
    return (
      <TouchableOpacity style={styles.deleteAction} onPress={onPress} activeOpacity={0.78}>
        <MaterialCommunityIcons name="trash-can-outline" size={21} color={theme.colors.danger} />
      </TouchableOpacity>
    )
  }

  return (
    <View style={styles.container}>
      <ScreenHeader
        title="Templates"
        onBack={() => navigation.goBack()}
        showFade={showHeaderFade}
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        onScroll={handleHeaderScroll}
        scrollEventThrottle={16}
      >
        {message ? (
          <View style={styles.notice}>
            <MaterialCommunityIcons name="information-outline" size={16} color={theme.colors.accent} />
            <Text style={styles.noticeText}>{message}</Text>
          </View>
        ) : null}

        <TouchableOpacity
          style={styles.createButton}
          onPress={() => {
            setCreateError('')
            setTemplateName('')
            setCreateVisible(true)
          }}
          activeOpacity={0.78}
        >
          <View style={styles.createIcon}>
            <MaterialCommunityIcons name="plus" size={18} color={theme.colors.accent} />
          </View>
          <View style={styles.createTextBlock}>
            <Text style={styles.createTitle}>Create Template</Text>
            <Text style={styles.createSubtitle}>Save exercises and planned set counts.</Text>
          </View>
          <MaterialCommunityIcons name="chevron-right" size={19} color={theme.colors.accent} />
        </TouchableOpacity>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Your Templates</Text>
          <Text style={styles.sectionHint}>{templates.length}</Text>
        </View>

        {loading ? (
          <View style={styles.emptyCard}>
            <ActivityIndicator color={theme.colors.accent} />
          </View>
        ) : templates.length === 0 ? (
          <View style={styles.emptyCard}>
            <MaterialCommunityIcons name="clipboard-text-outline" size={24} color={theme.colors.accent} />
            <Text style={styles.emptyText}>No templates yet.</Text>
          </View>
        ) : (
          <View style={styles.templateList}>
            {templates.map((template) => (
                <ReanimatedSwipeable
                  key={template.id}
                  renderRightActions={() => renderDeleteAction(() => requestDeleteTemplate(template))}
                  overshootRight={false}
                >
                  <View style={styles.templateCard}>
                    <View style={styles.templateTopRow}>
                      <TouchableOpacity
                        style={styles.templateMain}
                        onPress={() => navigation.navigate('TemplateDetail', { templateId: template.id })}
                        activeOpacity={0.78}
                      >
                        <View style={styles.templateIcon}>
                          <MaterialCommunityIcons name="clipboard-text-outline" size={18} color={theme.colors.accent} />
                        </View>
                        <View style={styles.templateTitleBlock}>
                          <Text style={styles.templateName} numberOfLines={1}>{template.name}</Text>
                          <Text style={styles.templateMeta}>
                            {template.exerciseCount} exercises - {template.totalSetCount} sets
                          </Text>
                        </View>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.iconButton}
                        onPress={() => toggleFavorite(template)}
                        activeOpacity={0.78}
                      >
                        <MaterialCommunityIcons
                          name={template.isFavorite ? 'star' : 'star-outline'}
                          size={19}
                          color={template.isFavorite ? theme.colors.accent : theme.colors.textMuted}
                        />
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.iconButton}
                        onPress={() => navigation.navigate('TemplateDetail', { templateId: template.id })}
                        activeOpacity={0.78}
                      >
                        <MaterialCommunityIcons
                          name="chevron-right"
                          size={19}
                          color={theme.colors.textMuted}
                        />
                      </TouchableOpacity>
                    </View>
                  </View>
                </ReanimatedSwipeable>
            ))}
          </View>
        )}
      </ScrollView>

      <TemplateCreateModal
        visible={createVisible}
        name={templateName}
        error={createError}
        onChangeName={setTemplateName}
        onClose={() => setCreateVisible(false)}
        onSubmit={submitTemplate}
      />

      <ThemedDialog
        visible={Boolean(deleteTemplateTarget)}
        title="Delete Template"
        message={
          deleteTemplateTarget
            ? `Delete ${deleteTemplateTarget.name}? This removes the template only.`
            : undefined
        }
        actions={[
          { label: 'Cancel', onPress: () => setDeleteTemplateTarget(null) },
          { label: 'Delete', variant: 'danger', onPress: confirmDeleteTemplate },
        ]}
      />
    </View>
  )
}

function TemplateCreateModal({
  visible,
  name,
  error,
  onChangeName,
  onClose,
  onSubmit,
}: {
  visible: boolean
  name: string
  error: string
  onChangeName: (value: string) => void
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
            <Text style={styles.modalTitle}>New Template</Text>
            <TouchableOpacity style={styles.modalCloseButton} onPress={onClose}>
              <MaterialCommunityIcons name="close" size={18} color={theme.colors.textMuted} />
            </TouchableOpacity>
          </View>
          <TextInput
            style={styles.modalInput}
            value={name}
            onChangeText={onChangeName}
            placeholder="Template name"
            placeholderTextColor={theme.colors.textMuted}
            autoFocus
            returnKeyType="done"
          />
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
          <View style={styles.modalActions}>
            <TouchableOpacity style={styles.modalSecondaryButton} onPress={onClose}>
              <Text style={styles.modalSecondaryText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.modalPrimaryButton} onPress={onSubmit}>
              <Text style={styles.modalPrimaryText}>Create</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  )
}

export function TemplateExercisePickerModal({
  visible,
  templateId,
  onClose,
  onSelect,
}: {
  visible: boolean
  templateId: string | null
  onClose: () => void
  onSelect: (params: { templateId: string; exerciseTypeId: string; methodId: string }) => void
}) {
  const { styles, theme } = useStyles(stylesheet)
  const [step, setStep] = useState<PickerStep>('sections')
  const [loading, setLoading] = useState(false)
  const [sections, setSections] = useState<SectionRow[]>([])
  const [exerciseTypes, setExerciseTypes] = useState<ExerciseTypeRow[]>([])
  const [methods, setMethods] = useState<MethodRow[]>([])
  const [selectedSection, setSelectedSection] = useState<SectionRow | null>(null)
  const [selectedExerciseType, setSelectedExerciseType] = useState<ExerciseTypeRow | null>(null)
  const [createMode, setCreateMode] = useState<PickerCreateMode | null>(null)
  const [createName, setCreateName] = useState('')
  const [createError, setCreateError] = useState('')
  const [singleMethodOnly, setSingleMethodOnly] = useState(false)
  const [selectedMethodId, setSelectedMethodId] = useState<string | null>(null)
  const [allMethods, setAllMethods] = useState<MethodRow[]>([])

  useEffect(() => {
    if (!visible) return
    setStep('sections')
    setSelectedSection(null)
    setSelectedExerciseType(null)
    setExerciseTypes([])
    setMethods([])
    closeCreateModal()
    getSections()
      .then(setSections)
      .catch(() => setSections([]))
  }, [visible])

  async function refreshCurrentStep() {
    if (step === 'sections') {
      setSections(await getSections())
      return
    }
    if (step === 'exerciseTypes' && selectedSection) {
      setExerciseTypes(await getExerciseTypesBySection(selectedSection.id))
      return
    }
    if (step === 'methods' && selectedExerciseType) {
      setMethods(await getMethodsForExerciseType(selectedExerciseType.id))
    }
  }

  async function loadAllMethodsForCreate() {
    const methodRows = await getMethods()
    setAllMethods(methodRows)
    setSelectedMethodId(methodRows[0]?.id ?? null)
  }

  function openCreateModal() {
    if (step === 'sections') return
    const mode: PickerCreateMode = step === 'exerciseTypes' ? 'exercise' : 'method'
    setCreateMode(mode)
    setCreateName('')
    setCreateError('')
    setSingleMethodOnly(false)
    if (mode === 'exercise') {
      loadAllMethodsForCreate().catch((e) => {
        console.error('Could not load methods for template exercise creation', e)
        setAllMethods([])
      })
    }
  }

  function closeCreateModal() {
    setCreateMode(null)
    setCreateName('')
    setCreateError('')
    setSingleMethodOnly(false)
    setSelectedMethodId(null)
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
      console.error('Could not create template picker item', e)
      setCreateError('Could not create this item.')
    } finally {
      setLoading(false)
    }
  }

  async function selectSection(section: SectionRow) {
    setSelectedSection(section)
    setLoading(true)
    try {
      setExerciseTypes(await getExerciseTypesBySection(section.id))
      setStep('exerciseTypes')
    } finally {
      setLoading(false)
    }
  }

  async function selectExerciseType(exerciseType: ExerciseTypeRow) {
    if (!templateId) return
    setSelectedExerciseType(exerciseType)
    setLoading(true)
    try {
      if (exerciseType.methodLocked && exerciseType.lockedMethodId) {
        await getMethodName(exerciseType.lockedMethodId)
        onSelect({
          templateId,
          exerciseTypeId: exerciseType.id,
          methodId: exerciseType.lockedMethodId,
        })
        return
      }
      setMethods(await getMethodsForExerciseType(exerciseType.id))
      setStep('methods')
    } finally {
      setLoading(false)
    }
  }

  function selectMethod(method: MethodRow) {
    if (!templateId || !selectedExerciseType) return
    onSelect({
      templateId,
      exerciseTypeId: selectedExerciseType.id,
      methodId: method.id,
    })
  }

  function goBack() {
    if (step === 'methods') {
      setStep('exerciseTypes')
      setSelectedExerciseType(null)
      setMethods([])
      return
    }
    if (step === 'exerciseTypes') {
      setStep('sections')
      setSelectedSection(null)
      setExerciseTypes([])
    }
  }

  if (!visible) return null

  const title = step === 'sections'
    ? 'Body Part'
    : step === 'exerciseTypes'
      ? selectedSection?.name ?? 'Exercises'
      : selectedExerciseType?.name ?? 'Methods'

  const createTitle = createMode === 'exercise'
      ? 'Add Exercise'
      : 'Add Method'

  return (
    <>
    <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.pickerPanel}>
          <View style={styles.pickerTopRow}>
            {step !== 'sections' ? (
              <TouchableOpacity style={styles.pickerTopButton} onPress={goBack}>
                <MaterialCommunityIcons name="chevron-left" size={16} color={theme.colors.text} />
                <Text style={styles.pickerTopButtonText}>Back</Text>
              </TouchableOpacity>
            ) : <View style={styles.pickerTopButtonSpacer} />}
            <Text style={styles.pickerTitle}>{title}</Text>
            <View style={styles.pickerRightActions}>
              {step !== 'sections' ? (
                <TouchableOpacity style={styles.pickerAddButton} onPress={openCreateModal}>
                  <MaterialCommunityIcons name="plus" size={16} color={theme.colors.text} />
                  <Text style={styles.pickerTopButtonText}>Add</Text>
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity style={styles.pickerIconButton} onPress={onClose}>
                <MaterialCommunityIcons name="close" size={17} color={theme.colors.text} />
              </TouchableOpacity>
            </View>
          </View>

          {loading ? (
            <View style={styles.pickerLoading}>
              <ActivityIndicator color={theme.colors.accent} />
            </View>
          ) : (
            <ScrollView contentContainerStyle={styles.pickerList}>
              {step === 'sections' && sections.map((section) => (
                <PickerRow
                  key={section.id}
                  iconName="folder-outline"
                  title={section.name}
                  onPress={() => selectSection(section)}
                />
              ))}
              {step === 'exerciseTypes' && exerciseTypes.map((exerciseType) => (
                <PickerRow
                  key={exerciseType.id}
                  iconName="dumbbell"
                  title={exerciseType.name}
                  subtitle={exerciseType.methodLocked ? 'single method' : undefined}
                  onPress={() => selectExerciseType(exerciseType)}
                />
              ))}
              {step === 'methods' && methods.map((method) => (
                <PickerRow
                  key={method.id}
                  iconName="shape-outline"
                  title={method.name}
                  onPress={() => selectMethod(method)}
                />
              ))}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
    <PickerCreateModal
      visible={Boolean(createMode)}
      title={createTitle}
      mode={createMode}
      name={createName}
      error={createError}
      methods={allMethods}
      singleMethodOnly={singleMethodOnly}
      selectedMethodId={selectedMethodId}
      onChangeName={setCreateName}
      onToggleSingleMethod={setSingleMethodOnly}
      onSelectMethod={setSelectedMethodId}
      onClose={closeCreateModal}
      onSubmit={submitCreate}
    />
    </>
  )
}

function PickerCreateModal({
  visible,
  title,
  mode,
  name,
  error,
  methods,
  singleMethodOnly,
  selectedMethodId,
  onChangeName,
  onToggleSingleMethod,
  onSelectMethod,
  onClose,
  onSubmit,
}: {
  visible: boolean
  title: string
  mode: PickerCreateMode | null
  name: string
  error: string
  methods: MethodRow[]
  singleMethodOnly: boolean
  selectedMethodId: string | null
  onChangeName: (value: string) => void
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
              <MaterialCommunityIcons name="close" size={18} color={theme.colors.textMuted} />
            </TouchableOpacity>
          </View>
          <TextInput
            style={styles.modalInput}
            value={name}
            onChangeText={onChangeName}
            placeholder={
              mode === 'exercise'
                  ? 'Exercise name'
                  : 'Method name'
            }
            placeholderTextColor={theme.colors.textMuted}
            autoFocus
            returnKeyType="done"
          />
          {mode === 'exercise' ? (
            <View style={styles.singleMethodBox}>
              <View style={styles.singleMethodTextBlock}>
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
                <Text style={styles.emptyDetailText}>Create a method first.</Text>
              ) : (
                <ScrollView style={styles.methodChoiceScroll} nestedScrollEnabled>
                  {methods.map((method) => {
                    const selected = selectedMethodId === method.id
                    return (
                      <TouchableOpacity
                        key={method.id}
                        style={[
                          styles.methodChoice,
                          selected && styles.methodChoiceActive,
                        ]}
                        onPress={() => onSelectMethod(method.id)}
                      >
                        <Text
                          style={[
                            styles.methodChoiceText,
                            selected && styles.methodChoiceTextActive,
                          ]}
                        >
                          {method.name}
                        </Text>
                        {selected ? (
                          <MaterialCommunityIcons name="check" size={17} color={theme.colors.accent} />
                        ) : null}
                      </TouchableOpacity>
                    )
                  })}
                </ScrollView>
              )}
            </View>
          ) : null}
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
          <View style={styles.modalActions}>
            <TouchableOpacity style={styles.modalSecondaryButton} onPress={onClose}>
              <Text style={styles.modalSecondaryText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.modalPrimaryButton} onPress={onSubmit}>
              <Text style={styles.modalPrimaryText}>Create</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  )
}

function PickerRow({
  iconName,
  title,
  subtitle,
  onPress,
}: {
  iconName: string
  title: string
  subtitle?: string
  onPress: () => void
}) {
  const { styles, theme } = useStyles(stylesheet)

  return (
    <TouchableOpacity style={styles.pickerRow} onPress={onPress} activeOpacity={0.78}>
      <View style={styles.pickerRowIcon}>
        <MaterialCommunityIcons name={iconName} size={18} color={theme.colors.accent} />
      </View>
      <View style={styles.pickerRowTextBlock}>
        <Text style={styles.pickerRowTitle} numberOfLines={1}>{title}</Text>
        {subtitle ? <Text style={styles.pickerRowSubtitle}>{subtitle}</Text> : null}
      </View>
      <View style={styles.pickerChevron}>
        <MaterialCommunityIcons name="chevron-right" size={16} color={theme.colors.textMuted} />
      </View>
    </TouchableOpacity>
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
    paddingTop: theme.spacing.md,
    paddingBottom: theme.spacing.xl,
    gap: theme.spacing.md,
  },
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.sm,
  },
  noticeText: {
    flex: 1,
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.semiBold,
  },
  createButton: {
    minHeight: 62,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    backgroundColor: theme.colors.accentMuted,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.accent,
    padding: theme.spacing.md,
  },
  createIcon: {
    width: 34,
    height: 34,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  createTextBlock: {
    flex: 1,
    minWidth: 0,
  },
  createTitle: {
    color: theme.colors.accent,
    fontSize: theme.fontSize.md,
    fontFamily: theme.fontFamily.extraBold,
  },
  createSubtitle: {
    color: theme.colors.text,
    fontSize: theme.fontSize.xs,
    fontFamily: theme.fontFamily.semiBold,
    marginTop: 2,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    color: theme.colors.text,
    fontSize: theme.fontSize.lg,
    fontFamily: theme.fontFamily.extraBold,
  },
  sectionHint: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
    fontFamily: theme.fontFamily.bold,
  },
  templateList: {
    gap: theme.spacing.sm,
  },
  deleteAction: {
    width: 74,
    marginBottom: theme.spacing.sm,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surface2,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  templateCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.sm,
    gap: theme.spacing.sm,
  },
  templateTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  templateMain: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  templateIcon: {
    width: 34,
    height: 34,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.accentMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  templateTitleBlock: {
    flex: 1,
    minWidth: 0,
  },
  templateName: {
    color: theme.colors.text,
    fontSize: theme.fontSize.md,
    fontFamily: theme.fontFamily.extraBold,
  },
  templateMeta: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
    fontFamily: theme.fontFamily.semiBold,
    marginTop: 2,
  },
  iconButton: {
    width: 34,
    height: 34,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.surface2,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  templateDetail: {
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    paddingTop: theme.spacing.sm,
    gap: theme.spacing.sm,
  },
  exerciseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    backgroundColor: theme.colors.surface2,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.sm,
  },
  exerciseTextBlock: {
    flex: 1,
    minWidth: 0,
  },
  exerciseName: {
    color: theme.colors.text,
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.extraBold,
  },
  exerciseMethod: {
    color: theme.colors.textMuted,
    fontFamily: theme.fontFamily.regular,
  },
  exerciseMeta: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
    fontFamily: theme.fontFamily.semiBold,
    marginTop: 2,
  },
  setStepper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: theme.radius.full,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    overflow: 'hidden',
  },
  stepperButton: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  setCount: {
    minWidth: 22,
    color: theme.colors.text,
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.extraBold,
    textAlign: 'center',
  },
  removeButton: {
    width: 32,
    height: 32,
    borderRadius: theme.radius.full,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  templateActions: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  secondaryAction: {
    flex: 1,
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.xs,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface2,
  },
  secondaryActionText: {
    color: theme.colors.text,
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.bold,
  },
  primaryAction: {
    minWidth: 92,
    minHeight: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.accent,
    backgroundColor: theme.colors.accentMuted,
  },
  primaryActionDisabled: {
    opacity: 0.45,
  },
  primaryActionText: {
    color: theme.colors.accent,
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.extraBold,
  },
  emptyCard: {
    minHeight: 116,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.sm,
  },
  emptyText: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.semiBold,
  },
  emptyDetailText: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.semiBold,
    textAlign: 'center',
    paddingVertical: theme.spacing.sm,
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
    backgroundColor: theme.colors.bg,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  modalTitle: {
    color: theme.colors.text,
    fontSize: theme.fontSize.lg,
    fontFamily: theme.fontFamily.extraBold,
  },
  modalCloseButton: {
    width: 34,
    height: 34,
    borderRadius: theme.radius.full,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalInput: {
    minHeight: 46,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    color: theme.colors.text,
    fontSize: theme.fontSize.md,
    fontFamily: theme.fontFamily.semiBold,
    paddingHorizontal: theme.spacing.md,
  },
  errorText: {
    color: theme.colors.danger,
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.bold,
  },
  modalActions: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  modalSecondaryButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalSecondaryText: {
    color: theme.colors.text,
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.bold,
  },
  modalPrimaryButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.accent,
    backgroundColor: theme.colors.accentMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalPrimaryText: {
    color: theme.colors.accent,
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.extraBold,
  },
  pickerPanel: {
    width: '100%',
    maxWidth: 420,
    maxHeight: '82%',
    backgroundColor: theme.colors.bg,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  pickerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  pickerTopButton: {
    minWidth: 72,
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radius.full,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  pickerTopButtonSpacer: {
    width: 72,
  },
  pickerTopButtonText: {
    color: theme.colors.text,
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.semiBold,
  },
  pickerTitle: {
    flex: 1,
    minWidth: 0,
    color: theme.colors.text,
    fontSize: theme.fontSize.lg,
    fontFamily: theme.fontFamily.extraBold,
    textAlign: 'center',
  },
  pickerIconButton: {
    width: 34,
    height: 34,
    borderRadius: theme.radius.full,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickerRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  pickerAddButton: {
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    borderRadius: theme.radius.full,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    paddingHorizontal: theme.spacing.sm,
  },
  pickerLoading: {
    minHeight: 260,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickerList: {
    gap: theme.spacing.xs,
    paddingBottom: theme.spacing.sm,
  },
  pickerRow: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
  },
  pickerRowIcon: {
    width: 34,
    height: 34,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.accentMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickerRowTextBlock: {
    flex: 1,
    minWidth: 0,
  },
  pickerRowTitle: {
    color: theme.colors.text,
    fontSize: theme.fontSize.md,
    fontFamily: theme.fontFamily.extraBold,
  },
  pickerRowSubtitle: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
    fontFamily: theme.fontFamily.semiBold,
  },
  pickerChevron: {
    width: 28,
    height: 28,
    borderRadius: theme.radius.full,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  singleMethodBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.md,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    padding: theme.spacing.sm,
  },
  singleMethodTextBlock: {
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
    fontFamily: theme.fontFamily.semiBold,
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
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    backgroundColor: theme.colors.surface,
  },
  methodChoiceScroll: {
    maxHeight: 220,
  },
  methodChoice: {
    minHeight: 42,
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
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.semiBold,
  },
  methodChoiceTextActive: {
    color: theme.colors.accent,
    fontFamily: theme.fontFamily.extraBold,
  },
}))
