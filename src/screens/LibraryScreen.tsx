import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  BackHandler,
  type GestureResponderEvent,
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
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons'
import { createStyleSheet, useStyles } from 'react-native-unistyles'
import {
  getSubMuscleLabels,
  getSubsectionsForSection,
  type MuscleSubsection,
} from '@/constants/muscleSubsections'
import ScreenHeader, { ScreenHeaderButton, useHeaderFade } from '@/components/ui/ScreenHeader'
import ThemedDialog, { type ThemedDialogAction } from '@/components/ui/ThemedDialog'
import { useDataRefreshStore } from '@/store/dataRefreshStore'
import {
  createCustomExerciseType,
  createCustomMethod,
  deleteCustomExerciseType,
  deleteCustomMethodFromExercise,
  ExerciseTypeRow,
  ExercisePrSummary,
  getExerciseTypesBySection,
  getExercisePrSummariesBySection,
  getMethodName,
  getMethods,
  getMethodsForExerciseType,
  getMethodPrSummariesForExerciseType,
  getSections,
  hasHiddenDefaultMethods,
  MethodPrSummary,
  MethodRow,
  restoreDefaultMethodsForExerciseType,
  SectionRow,
  updateCustomExerciseTypeSubMuscles,
} from '@/db/workoutHelpers'

type Step = 'sections' | 'exerciseTypes' | 'methods'
type CreateMode = 'exercise' | 'method'
const PR_GOLD = '#D9A441'
const LB_PER_KG = 2.20462
const LIBRARY_HEADER_TOP_ROW_HEIGHT = 29
const LIBRARY_BREADCRUMB_SLOT_HEIGHT = 20

function formatCompactNumber(value: number) {
  return Number.parseFloat(value.toFixed(2)).toString()
}

function formatPrWeight(weightKg: number, unit: string) {
  const value = unit === 'lb' ? weightKg * LB_PER_KG : weightKg
  return `${formatCompactNumber(value)} ${unit}`
}

function getOtherWeightUnit(unit: string) {
  return unit === 'lb' ? 'kg' : 'lb'
}

function hasPrValue(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

export default function LibraryScreen() {
  const { styles, theme } = useStyles(stylesheet)
  const { showHeaderFade, handleHeaderScroll } = useHeaderFade()
  const dataVersion = useDataRefreshStore((state) => state.version)
  const handledDataVersionRef = useRef(dataVersion)
  const [step, setStep] = useState<Step>('sections')
  const [loading, setLoading] = useState(true)
  const [sectionList, setSectionList] = useState<SectionRow[]>([])
  const [exerciseTypeList, setExerciseTypeList] = useState<ExerciseTypeRow[]>([])
  const [methodList, setMethodList] = useState<MethodRow[]>([])
  const [exercisePrSummaries, setExercisePrSummaries] = useState<Record<string, ExercisePrSummary>>({})
  const [methodPrSummaries, setMethodPrSummaries] = useState<Record<string, MethodPrSummary>>({})
  const [selectedSection, setSelectedSection] = useState<SectionRow | null>(null)
  const [selectedExerciseType, setSelectedExerciseType] = useState<ExerciseTypeRow | null>(null)
  const [lockedMethodName, setLockedMethodName] = useState('')
  const [createMode, setCreateMode] = useState<CreateMode | null>(null)
  const [createName, setCreateName] = useState('')
  const [createError, setCreateError] = useState('')
  const [singleMethodOnly, setSingleMethodOnly] = useState(false)
  const [selectedMethodId, setSelectedMethodId] = useState<string | null>(null)
  const [showRestoreDefaults, setShowRestoreDefaults] = useState(false)
  const [convertedPrUnits, setConvertedPrUnits] = useState<Record<string, boolean>>({})
  const [subMuscleEditor, setSubMuscleEditor] = useState<{
    exerciseType: ExerciseTypeRow
    selectedIds: string[]
    error: string
  } | null>(null)
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
      const [exercises, prSummaries] = await Promise.all([
        getExerciseTypesBySection(section.id),
        getExercisePrSummariesBySection(section.id),
      ])
      setExerciseTypeList(exercises)
      setExercisePrSummaries(prSummaries)
      setMethodPrSummaries({})
      setStep('exerciseTypes')
    } catch (e) {
      console.error('Could not load exercises', e)
      setExerciseTypeList([])
      setExercisePrSummaries({})
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
        await hasHiddenDefaultMethods(exerciseType.id),
      )
      const [methods, prSummaries] = await Promise.all([
        getMethodsForExerciseType(exerciseType.id),
        getMethodPrSummariesForExerciseType(exerciseType.id),
      ])
      setMethodPrSummaries(prSummaries)
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

  const handleBack = useCallback(() => {
    if (step === 'methods') {
      setStep('exerciseTypes')
      setSelectedExerciseType(null)
      setLockedMethodName('')
      setShowRestoreDefaults(false)
      setMethodPrSummaries({})
      return
    }
    if (step === 'exerciseTypes') {
      setStep('sections')
      setSelectedSection(null)
      setExerciseTypeList([])
      setExercisePrSummaries({})
    }
  }, [step])

  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        if (createMode) {
          setCreateMode(null)
          setCreateName('')
          setCreateError('')
          setSingleMethodOnly(false)
          return true
        }
        if (subMuscleEditor) {
          setSubMuscleEditor(null)
          return true
        }
        if (dialog) {
          setDialog(null)
          return true
        }
        if (step !== 'sections') {
          handleBack()
          return true
        }
        return false
      }

      const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress)
      return () => subscription.remove()
    }, [createMode, dialog, handleBack, step, subMuscleEditor]),
  )

  const breadcrumbItems = useMemo(() => {
    if (step === 'sections') return []
    if (step === 'exerciseTypes') return [selectedSection?.name ?? 'Section', 'Exercises']
    return [
      selectedSection?.name ?? 'Section',
      selectedExerciseType?.methodLocked ? 'Method' : 'Methods',
    ]
  }, [selectedExerciseType, selectedSection, step])
  const headerTitle = step === 'methods'
    ? selectedExerciseType?.name ?? 'Exercise'
    : step === 'exerciseTypes'
      ? selectedSection?.name ?? 'Library'
      : 'Library'
  const selectedSubMuscleLabels = useMemo(
    () => selectedExerciseType ? getSubMuscleLabels(selectedExerciseType.subMuscleIds) : [],
    [selectedExerciseType],
  )

  const createTitle = createMode === 'exercise'
      ? 'Add Exercise'
      : 'Add Method'

  function openCreateModal() {
    if (step === 'sections') return
    const mode: CreateMode = step === 'exerciseTypes' ? 'exercise' : 'method'
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

  const refreshCurrentStep = useCallback(async () => {
    if (step === 'sections') {
      await loadSections()
      return
    }
    if (step === 'exerciseTypes' && selectedSection) {
      const [exercises, prSummaries] = await Promise.all([
        getExerciseTypesBySection(selectedSection.id),
        getExercisePrSummariesBySection(selectedSection.id),
      ])
      setExerciseTypeList(exercises)
      setExercisePrSummaries(prSummaries)
      return
    }
    if (step === 'methods') {
      if (selectedExerciseType) {
        const [methods, prSummaries] = await Promise.all([
          getMethodsForExerciseType(selectedExerciseType.id),
          getMethodPrSummariesForExerciseType(selectedExerciseType.id),
        ])
        setMethodList(methods)
        setMethodPrSummaries(prSummaries)
        setShowRestoreDefaults(
          await hasHiddenDefaultMethods(selectedExerciseType.id),
        )
        return
      }
      await loadMethods()
    }
  }, [loadMethods, loadSections, selectedExerciseType, selectedSection, step])

  useEffect(() => {
    if (handledDataVersionRef.current === dataVersion) return
    handledDataVersionRef.current = dataVersion
    setStep('sections')
    setSelectedSection(null)
    setSelectedExerciseType(null)
    setExerciseTypeList([])
    setMethodList([])
    setExercisePrSummaries({})
    setMethodPrSummaries({})
    setShowRestoreDefaults(false)
    setSubMuscleEditor(null)
    loadSections().catch(console.error)
  }, [dataVersion, loadSections])

  async function refreshMethodsForSelectedExercise() {
    if (!selectedExerciseType) return
    setLoading(true)
    try {
      const [methods, prSummaries] = await Promise.all([
        getMethodsForExerciseType(selectedExerciseType.id),
        getMethodPrSummariesForExerciseType(selectedExerciseType.id),
      ])
      setMethodPrSummaries(prSummaries)
      setShowRestoreDefaults(
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
      message: `Remove ${method.name} from ${selectedExerciseType.name}? This only affects this exercise.`,
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
                showInfoDialog('Could Not Remove', 'This method is already used by this exercise, or it cannot be removed from this exercise.')
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
      if (createMode === 'method') {
        await createCustomMethod(trimmed, selectedExerciseType?.id ?? null)
        if (selectedExerciseType) {
          setSelectedExerciseType((current) => (
            current ? { ...current, methodLocked: 0, lockedMethodId: null } : current
          ))
          setLockedMethodName('')
        }
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
      .then(async (restoredExerciseType) => {
        setSelectedExerciseType(restoredExerciseType)
        const [methods, prSummaries] = await Promise.all([
          getMethodsForExerciseType(restoredExerciseType.id),
          getMethodPrSummariesForExerciseType(restoredExerciseType.id),
        ])
        setMethodPrSummaries(prSummaries)
        setShowRestoreDefaults(await hasHiddenDefaultMethods(restoredExerciseType.id))
        if (restoredExerciseType.methodLocked && restoredExerciseType.lockedMethodId) {
          setLockedMethodName(await getMethodName(restoredExerciseType.lockedMethodId))
          setMethodList(methods.filter((method) => method.id === restoredExerciseType.lockedMethodId))
        } else {
          setLockedMethodName('')
          setMethodList(methods)
        }
      })
      .catch((e) => {
        console.error('Could not restore default methods', e)
        showInfoDialog('Could Not Restore', 'Could not restore the default methods for this exercise.')
      })
  }

  function togglePrUnit(key: string, event?: GestureResponderEvent) {
    event?.stopPropagation()
    setConvertedPrUnits((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  function renderPrBadge(
    key: string,
    weightKg: number,
    recordedUnit: string | null | undefined,
    suffix?: string,
  ) {
    const originalUnit = recordedUnit === 'lb' ? 'lb' : 'kg'
    const displayUnit = convertedPrUnits[key] ? getOtherWeightUnit(originalUnit) : originalUnit
    const nextUnit = getOtherWeightUnit(displayUnit)

    return (
      <View style={styles.prBadge}>
        <MaterialCommunityIcons name="trophy-outline" size={13} color={PR_GOLD} />
        <Text style={styles.prBadgeText}>
          Current PR {formatPrWeight(weightKg, displayUnit)}{suffix ? ` - ${suffix}` : ''}
        </Text>
        <TouchableOpacity
          style={styles.prUnitToggle}
          onPress={(event) => togglePrUnit(key, event)}
          activeOpacity={0.78}
        >
          <Text style={styles.prUnitToggleText}>{nextUnit}</Text>
        </TouchableOpacity>
      </View>
    )
  }

  function openSubMuscleEditor(
    exerciseType: ExerciseTypeRow,
    event?: GestureResponderEvent,
  ) {
    event?.stopPropagation()
    if (!exerciseType.isCustom) return
    if (getSubsectionsForSection(selectedSection?.name ?? '').length === 0) return
    setSubMuscleEditor({
      exerciseType,
      selectedIds: exerciseType.subMuscleIds,
      error: '',
    })
  }

  function toggleSubMuscleEditorSelection(id: string) {
    setSubMuscleEditor((current) => {
      if (!current) return current
      const selected = current.selectedIds.includes(id)
        ? current.selectedIds.filter((item) => item !== id)
        : [...current.selectedIds, id]
      return { ...current, selectedIds: selected, error: '' }
    })
  }

  async function saveSubMuscleEditor() {
    if (!subMuscleEditor) return
    if (subMuscleEditor.selectedIds.length === 0) {
      setSubMuscleEditor((current) =>
        current ? { ...current, error: 'Choose at least one sub-muscle.' } : current,
      )
      return
    }

    setLoading(true)
    try {
      const updatedExerciseType = await updateCustomExerciseTypeSubMuscles(
        subMuscleEditor.exerciseType.id,
        subMuscleEditor.selectedIds,
      )
      setExerciseTypeList((current) =>
        current.map((exerciseType) =>
          exerciseType.id === updatedExerciseType.id ? updatedExerciseType : exerciseType,
        ),
      )
      setSelectedExerciseType((current) =>
        current?.id === updatedExerciseType.id ? updatedExerciseType : current,
      )
      setSubMuscleEditor(null)
    } catch (e) {
      console.error('Could not update exercise sub-muscles', e)
      setSubMuscleEditor((current) =>
        current ? { ...current, error: 'Could not save these sub-muscles.' } : current,
      )
    } finally {
      setLoading(false)
    }
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
              <MaterialCommunityIcons name="folder-outline" size={18} color={theme.colors.accent} />
            </View>
            <Text style={styles.rowText}>{section.name}</Text>
          </View>
          <View style={styles.rowChevron}>
            <MaterialCommunityIcons name="chevron-right" size={16} color={theme.colors.textMuted} />
          </View>
        </TouchableOpacity>
      ))
    }

    if (step === 'exerciseTypes') {
      return exerciseTypeList.length === 0 ? (
        <EmptyState text="No exercises in this section yet." />
      ) : exerciseTypeList.map((exerciseType) => {
        const prSummary = exercisePrSummaries[exerciseType.id]
        const row = (
          <TouchableOpacity
            style={[styles.row, Boolean(exerciseType.isCustom) && styles.swipeableRow]}
            onPress={() => handleSelectExerciseType(exerciseType)}
          >
            <View style={styles.rowLeft}>
              <View style={styles.rowIcon}>
                <MaterialCommunityIcons name="dumbbell" size={18} color={theme.colors.accent} />
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
                  {hasPrValue(prSummary?.weightKg)
                    ? renderPrBadge(
                      `exercise:${exerciseType.id}`,
                      prSummary.weightKg,
                      prSummary.weightUnit,
                      prSummary.weightMethodName ?? 'Method',
                    )
                    : null}
                </View>
              </View>
            </View>
            <View style={styles.rowActions}>
              {exerciseType.isCustom && getSubsectionsForSection(selectedSection?.name ?? '').length > 0 ? (
                <TouchableOpacity
                  style={styles.editSubMuscleButton}
                  onPress={(event) => openSubMuscleEditor(exerciseType, event)}
                  activeOpacity={0.78}
                >
                  <MaterialCommunityIcons name="pencil-outline" size={15} color={theme.colors.accent} />
                </TouchableOpacity>
              ) : null}
              <View style={styles.rowChevron}>
                <MaterialCommunityIcons name="chevron-right" size={16} color={theme.colors.textMuted} />
              </View>
            </View>
          </TouchableOpacity>
        )

        if (!exerciseType.isCustom) {
          return <React.Fragment key={exerciseType.id}>{row}</React.Fragment>
        }

        return (
          <ReanimatedSwipeable
            key={exerciseType.id}
            renderRightActions={() => renderDeleteAction(() => requestDeleteExercise(exerciseType))}
            containerStyle={styles.swipeableRowContainer}
            childrenContainerStyle={styles.swipeableRowContent}
            dragOffsetFromRightEdge={3}
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
      const prSummary = methodPrSummaries[method.id]
      const canRemoveMethod = Boolean(selectedExerciseType)
      const row = (
        <View style={[styles.row, canRemoveMethod && styles.swipeableRow]}>
          <View style={styles.rowLeft}>
            <View style={styles.rowIcon}>
              <MaterialCommunityIcons name="shape-outline" size={18} color={theme.colors.accent} />
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
                {hasPrValue(prSummary?.weightKg)
                  ? renderPrBadge(
                    `method:${method.id}`,
                    prSummary.weightKg,
                    prSummary.weightUnit,
                  )
                  : null}
              </View>
            </View>
          </View>
        </View>
      )

      if (!canRemoveMethod) {
        return <React.Fragment key={method.id}>{row}</React.Fragment>
      }

      return (
        <ReanimatedSwipeable
          key={method.id}
          renderRightActions={() => renderDeleteAction(() => requestDeleteMethod(method))}
          containerStyle={styles.swipeableRowContainer}
          childrenContainerStyle={styles.swipeableRowContent}
          dragOffsetFromRightEdge={3}
          overshootRight={false}
        >
          {row}
        </ReanimatedSwipeable>
      )
    })
  }

  function renderDeleteAction(onPress: () => void) {
    return (
      <TouchableOpacity style={styles.deleteAction} onPress={onPress} activeOpacity={0.82}>
        <MaterialCommunityIcons name="trash-can-outline" size={22} color="#FFFFFF" />
      </TouchableOpacity>
    )
  }

  return (
    <View style={styles.root}>
      <ScreenHeader
        title={headerTitle}
        onBack={step !== 'sections' ? handleBack : undefined}
        showFade={showHeaderFade}
        beforeTitle={step === 'sections' ? <View style={styles.headerTopSpacer} /> : null}
        titleRight={step !== 'sections' ? (
          <ScreenHeaderButton label="Add" iconName="plus" onPress={openCreateModal} />
        ) : undefined}
        afterTitle={(
          <>
            {breadcrumbItems.length > 0 ? (
              <View style={styles.breadcrumbSlot}>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.breadcrumbContent}
                  style={styles.breadcrumbScroll}
                  scrollEnabled
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
            ) : null}
            {step === 'methods' && selectedSubMuscleLabels.length > 0 ? (
              <View style={styles.exerciseTargetCard}>
                <View style={styles.exerciseTargetHeader}>
                  <View style={styles.exerciseTargetIcon}>
                    <MaterialCommunityIcons name="target-variant" size={14} color={theme.colors.textMuted} />
                  </View>
                  <View style={styles.exerciseTargetTitleBlock}>
                    <Text style={styles.exerciseTargetTitle}>Muscles Hit</Text>
                    <Text style={styles.exerciseTargetSubtitle} numberOfLines={1}>
                      {selectedSubMuscleLabels.join(', ')}
                    </Text>
                  </View>
                </View>
              </View>
            ) : null}
          </>
        )}
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        onScroll={handleHeaderScroll}
        scrollEventThrottle={16}
      >
        {step === 'methods'
          && selectedExerciseType?.isCustom
          && getSubsectionsForSection(selectedSection?.name ?? '').length > 0 ? (
          <View style={styles.restoreRow}>
            <TouchableOpacity
              style={styles.restoreButton}
              onPress={() => openSubMuscleEditor(selectedExerciseType)}
            >
              <MaterialCommunityIcons name="pencil-outline" size={14} color={theme.colors.accent} />
              <Text style={styles.restoreButtonText}>Edit Sub-Muscles</Text>
            </TouchableOpacity>
          </View>
        ) : null}
        {step === 'methods' && showRestoreDefaults ? (
          <View style={styles.restoreRow}>
            <TouchableOpacity style={styles.restoreButton} onPress={restoreDefaultMethods}>
              <MaterialCommunityIcons name="restore" size={14} color={theme.colors.accent} />
              <Text style={styles.restoreButtonText}>Restore Defaults</Text>
            </TouchableOpacity>
          </View>
        ) : null}
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
      <SubMuscleEditorModal
        visible={!!subMuscleEditor}
        exerciseName={subMuscleEditor?.exerciseType.name ?? ''}
        sectionName={selectedSection?.name ?? ''}
        options={getSubsectionsForSection(selectedSection?.name ?? '')}
        selectedIds={subMuscleEditor?.selectedIds ?? []}
        error={subMuscleEditor?.error ?? ''}
        onToggle={toggleSubMuscleEditorSelection}
        onClose={() => setSubMuscleEditor(null)}
        onSave={saveSubMuscleEditor}
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

function SubMuscleEditorModal({
  visible,
  exerciseName,
  sectionName,
  options,
  selectedIds,
  error,
  onToggle,
  onClose,
  onSave,
}: {
  visible: boolean
  exerciseName: string
  sectionName: string
  options: MuscleSubsection[]
  selectedIds: string[]
  error: string
  onToggle: (id: string) => void
  onClose: () => void
  onSave: () => void
}) {
  const { styles, theme } = useStyles(stylesheet)
  if (!visible) return null

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalPanel}>
          <View style={styles.modalHeader}>
            <View style={styles.modalTitleBlock}>
              <Text style={styles.modalTitle}>Edit Sub-Muscles</Text>
              <Text style={styles.modalSubtitle} numberOfLines={1}>
                {exerciseName} - {sectionName}
              </Text>
            </View>
            <TouchableOpacity style={styles.modalCloseButton} onPress={onClose}>
              <MaterialCommunityIcons name="close" size={20} color={theme.colors.textMuted} />
            </TouchableOpacity>
          </View>

          <View style={styles.methodPickerBox}>
            <Text style={styles.methodPickerTitle}>Preset Sub-Muscles</Text>
            {options.length === 0 ? (
              <Text style={styles.emptyText}>No preset sub-muscles for this section.</Text>
            ) : (
              <ScrollView
                style={styles.methodChoiceScroll}
                nestedScrollEnabled
                keyboardShouldPersistTaps="handled"
              >
                {options.map((option) => {
                  const selected = selectedIds.includes(option.id)
                  return (
                    <TouchableOpacity
                      key={option.id}
                      style={[
                        styles.methodChoice,
                        selected && styles.methodChoiceActive,
                      ]}
                      onPress={() => onToggle(option.id)}
                    >
                      <Text
                        style={[
                          styles.methodChoiceText,
                          selected && styles.methodChoiceTextActive,
                        ]}
                      >
                        {option.label}
                      </Text>
                      {selected ? (
                        <MaterialCommunityIcons name="check" size={18} color={theme.colors.accent} />
                      ) : null}
                    </TouchableOpacity>
                  )
                })}
              </ScrollView>
            )}
          </View>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <View style={styles.modalActions}>
            <TouchableOpacity style={styles.secondaryButton} onPress={onClose}>
              <Text style={styles.secondaryButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.primaryButton} onPress={onSave}>
              <Text style={styles.primaryButtonText}>Save</Text>
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
  headerTopSpacer: {
    height: LIBRARY_HEADER_TOP_ROW_HEIGHT,
  },
  breadcrumbSlot: {
    height: LIBRARY_BREADCRUMB_SLOT_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  breadcrumbScroll: {
    minWidth: 0,
    alignSelf: 'center',
    maxWidth: '100%',
    flexGrow: 0,
    flexShrink: 1,
    borderRadius: theme.radius.full,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  breadcrumbContent: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 0,
    minHeight: 18,
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
  deleteAction: {
    width: 72,
    backgroundColor: theme.colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  swipeableRowContainer: {
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    overflow: 'hidden',
  },
  swipeableRowContent: {
    width: '100%',
  },
  exerciseTargetCard: {
    backgroundColor: theme.colors.bg,
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 7,
    marginTop: theme.spacing.xs,
  },
  exerciseTargetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  exerciseTargetIcon: {
    width: 22,
    height: 22,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.surface2,
    borderWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  exerciseTargetTitleBlock: {
    flex: 1,
    minWidth: 0,
  },
  exerciseTargetTitle: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
    fontFamily: theme.fontFamily.extraBold,
    textTransform: 'uppercase',
    letterSpacing: 0,
  },
  exerciseTargetSubtitle: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
    fontFamily: theme.fontFamily.bold,
    marginTop: 1,
  },
  restoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginBottom: theme.spacing.sm,
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
    fontFamily: theme.fontFamily.bold,
  },
  scroll: {
    flex: 1,
  },
  list: {
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.sm,
    paddingBottom: theme.spacing.xl,
  },
  listPanel: {
    gap: theme.spacing.xs,
  },
  centered: {
    flex: 1,
    minHeight: 240,
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: {
    width: '100%',
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
  swipeableRow: {
    borderRadius: 0,
    borderWidth: 0,
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
  rowActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  editSubMuscleButton: {
    width: 28,
    height: 28,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.accentMuted,
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
    fontFamily: theme.fontFamily.bold,
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
  prBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: PR_GOLD + '26',
    borderRadius: theme.radius.full,
    borderWidth: 1,
    borderColor: PR_GOLD + '55',
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 2,
  },
  prBadgeText: {
    flexShrink: 1,
    color: PR_GOLD,
    fontSize: theme.fontSize.xs,
    fontFamily: theme.fontFamily.extraBold,
  },
  prUnitToggle: {
    minHeight: 20,
    borderRadius: theme.radius.full,
    borderWidth: 1,
    borderColor: PR_GOLD + '66',
    backgroundColor: theme.colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  prUnitToggleText: {
    color: PR_GOLD,
    fontSize: 10,
    fontFamily: theme.fontFamily.black,
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
    backgroundColor: theme.colors.bg,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
  },
  modalTitleBlock: {
    flex: 1,
    minWidth: 0,
  },
  modalTitle: {
    color: theme.colors.text,
    fontSize: theme.fontSize.lg,
    fontFamily: theme.fontFamily.extraBold,
  },
  modalSubtitle: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.semiBold,
    marginTop: 2,
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
