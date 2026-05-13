import React, { useState } from 'react'
import { ScrollView, Text, TouchableOpacity, View } from 'react-native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons'
import { createStyleSheet, useStyles } from 'react-native-unistyles'
import ThemedDialog, { type ThemedDialogAction } from '@/components/ui/ThemedDialog'
import ScreenHeader, { useHeaderFade } from '@/components/ui/ScreenHeader'
import { reseedDefaultExercises } from '@/db/seedData'
import {
  deleteAllCustomExercises,
  deleteAllCustomMethods,
} from '@/db/workoutHelpers'
import { useDataRefreshStore } from '@/store/dataRefreshStore'
import type { ProfileStackParamList } from '../navigation/TabNavigator'

type Props = NativeStackScreenProps<ProfileStackParamList, 'Debug'>

type BusyAction = 'methods' | 'exercises' | 'reseed' | null

type DialogState = {
  title: string
  message: string
  actions: ThemedDialogAction[]
}

export default function DebugScreen({ navigation }: Props) {
  const { styles, theme } = useStyles(stylesheet)
  const { showHeaderFade, handleHeaderScroll } = useHeaderFade()
  const bumpDataVersion = useDataRefreshStore((state) => state.bumpDataVersion)
  const [busyAction, setBusyAction] = useState<BusyAction>(null)
  const [dialog, setDialog] = useState<DialogState | null>(null)

  function closeDialog() {
    setDialog(null)
  }

  function getErrorMessage(error: unknown) {
    return error instanceof Error ? error.message : 'Something went wrong.'
  }

  function showResult(title: string, message: string) {
    setDialog({
      title,
      message,
      actions: [{ label: 'OK', onPress: closeDialog, variant: 'primary' }],
    })
  }

  function confirmDeleteMethods() {
    setDialog({
      title: 'Delete Custom Methods?',
      message:
        'This removes unused custom methods. Custom methods used by workouts or templates are hidden instead so old records do not break. This cannot be undone without a backup.',
      actions: [
        { label: 'Cancel', onPress: closeDialog },
        {
          label: 'Delete Methods',
          variant: 'danger',
          onPress: handleDeleteMethods,
        },
      ],
    })
  }

  function confirmReseedDefaults() {
    setDialog({
      title: 'Reseed Default Exercises?',
      message:
        'This refreshes built-in exercises, locked method defaults, and muscle subsections. Custom exercises and workout history are preserved.',
      actions: [
        { label: 'Cancel', onPress: closeDialog },
        {
          label: 'Reseed Defaults',
          variant: 'primary',
          onPress: handleReseedDefaults,
        },
      ],
    })
  }

  function confirmDeleteExercises() {
    setDialog({
      title: 'Delete Custom Exercises?',
      message:
        'This removes unused custom exercises. Custom exercises used by workouts or templates are hidden instead so old records do not break. This cannot be undone without a backup.',
      actions: [
        { label: 'Cancel', onPress: closeDialog },
        {
          label: 'Delete Exercises',
          variant: 'danger',
          onPress: handleDeleteExercises,
        },
      ],
    })
  }

  async function handleDeleteMethods() {
    closeDialog()
    setBusyAction('methods')
    try {
      const result = await deleteAllCustomMethods()
      bumpDataVersion()
      showResult(
        'Custom Methods Deleted',
        `${result.deleted} custom method${result.deleted === 1 ? '' : 's'} deleted. ${result.hidden} used custom method${result.hidden === 1 ? '' : 's'} hidden to preserve history and templates.`,
      )
    } catch (error) {
      showResult('Debug Action Failed', getErrorMessage(error))
    } finally {
      setBusyAction(null)
    }
  }

  async function handleReseedDefaults() {
    closeDialog()
    setBusyAction('reseed')
    try {
      const result = await reseedDefaultExercises()
      bumpDataVersion()
      showResult(
        'Default Exercises Reseeded',
        `${result.exercisesUpdated} default exercise${result.exercisesUpdated === 1 ? '' : 's'} updated. ${result.exercisesInserted} missing default exercise${result.exercisesInserted === 1 ? '' : 's'} added.`,
      )
    } catch (error) {
      showResult('Debug Action Failed', getErrorMessage(error))
    } finally {
      setBusyAction(null)
    }
  }

  async function handleDeleteExercises() {
    closeDialog()
    setBusyAction('exercises')
    try {
      const result = await deleteAllCustomExercises()
      bumpDataVersion()
      showResult(
        'Custom Exercises Deleted',
        `${result.deleted} custom exercise${result.deleted === 1 ? '' : 's'} deleted. ${result.hidden} used custom exercise${result.hidden === 1 ? '' : 's'} hidden to preserve history and templates.`,
      )
    } catch (error) {
      showResult('Debug Action Failed', getErrorMessage(error))
    } finally {
      setBusyAction(null)
    }
  }

  return (
    <View style={styles.container}>
      <ScreenHeader
        title="Debug"
        onBack={() => navigation.goBack()}
        showFade={showHeaderFade}
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        onScroll={handleHeaderScroll}
        scrollEventThrottle={16}
      >
        <View style={styles.warningPanel}>
          <View style={styles.warningIconBadge}>
            <MaterialCommunityIcons
              name="alert-octagon-outline"
              size={24}
              color={theme.colors.danger}
            />
          </View>
          <View style={styles.warningTextBlock}>
            <Text style={styles.warningTitle}>Very Dangerous Page</Text>
            <Text style={styles.warningText}>
              These tools can remove custom library data from this device. Create a backup before using anything here.
            </Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Maintenance</Text>

        <TouchableOpacity
          style={[styles.utilityButton, busyAction === 'reseed' && styles.disabledButton]}
          onPress={confirmReseedDefaults}
          activeOpacity={0.75}
          disabled={busyAction !== null}
        >
          <View style={styles.utilityIconBadge}>
            <MaterialCommunityIcons
              name="database-refresh-outline"
              size={20}
              color={theme.colors.accent}
            />
          </View>
          <View style={styles.buttonTextBlock}>
            <Text style={styles.utilityButtonTitle}>
              {busyAction === 'reseed' ? 'Reseeding defaults...' : 'Reseed default exercises'}
            </Text>
            <Text style={styles.buttonDescription}>
              Refreshes built-in exercises and muscle subsections without changing workout history.
            </Text>
          </View>
        </TouchableOpacity>

        <Text style={styles.sectionTitle}>Destructive Actions</Text>

        <TouchableOpacity
          style={[styles.dangerButton, busyAction === 'methods' && styles.disabledButton]}
          onPress={confirmDeleteMethods}
          activeOpacity={0.75}
          disabled={busyAction !== null}
        >
          <View style={styles.dangerIconBadge}>
            <MaterialCommunityIcons
              name="delete-alert-outline"
              size={20}
              color={theme.colors.danger}
            />
          </View>
          <View style={styles.buttonTextBlock}>
            <Text style={styles.dangerButtonTitle}>
              {busyAction === 'methods' ? 'Deleting custom methods...' : 'Delete all custom methods'}
            </Text>
            <Text style={styles.buttonDescription}>
              Clears custom methods from the library while preserving referenced records.
            </Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.dangerButton, busyAction === 'exercises' && styles.disabledButton]}
          onPress={confirmDeleteExercises}
          activeOpacity={0.75}
          disabled={busyAction !== null}
        >
          <View style={styles.dangerIconBadge}>
            <MaterialCommunityIcons
              name="trash-can-outline"
              size={20}
              color={theme.colors.danger}
            />
          </View>
          <View style={styles.buttonTextBlock}>
            <Text style={styles.dangerButtonTitle}>
              {busyAction === 'exercises' ? 'Deleting custom exercises...' : 'Delete all custom exercises'}
            </Text>
            <Text style={styles.buttonDescription}>
              Clears custom exercises from the library while preserving referenced records.
            </Text>
          </View>
        </TouchableOpacity>
      </ScrollView>

      <ThemedDialog
        visible={Boolean(dialog)}
        title={dialog?.title ?? ''}
        message={dialog?.message}
        actions={dialog?.actions ?? []}
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
    paddingTop: theme.spacing.md,
    paddingBottom: theme.spacing.xl,
  },
  warningPanel: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: theme.colors.danger + '14',
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.danger + '70',
    padding: theme.spacing.md,
    gap: theme.spacing.md,
  },
  warningIconBadge: {
    width: 42,
    height: 42,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.danger + '55',
  },
  warningTextBlock: {
    flex: 1,
    minWidth: 0,
  },
  warningTitle: {
    color: theme.colors.danger,
    fontSize: theme.fontSize.lg,
    fontFamily: theme.fontFamily.extraBold,
    marginBottom: 4,
  },
  warningText: {
    color: theme.colors.text,
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.semiBold,
    lineHeight: 20,
  },
  sectionTitle: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
    fontFamily: theme.fontFamily.semiBold,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: theme.spacing.sm,
    marginTop: theme.spacing.lg,
  },
  dangerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.danger + '55',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    marginBottom: theme.spacing.sm,
    gap: theme.spacing.sm,
  },
  disabledButton: {
    opacity: 0.55,
  },
  utilityButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    marginBottom: theme.spacing.sm,
    gap: theme.spacing.sm,
  },
  utilityIconBadge: {
    width: 38,
    height: 38,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.accentMuted,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  utilityButtonTitle: {
    color: theme.colors.text,
    fontSize: theme.fontSize.md,
    fontFamily: theme.fontFamily.extraBold,
    marginBottom: 2,
  },
  dangerIconBadge: {
    width: 38,
    height: 38,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.danger + '16',
    borderWidth: 1,
    borderColor: theme.colors.danger + '45',
  },
  buttonTextBlock: {
    flex: 1,
    minWidth: 0,
  },
  dangerButtonTitle: {
    color: theme.colors.text,
    fontSize: theme.fontSize.md,
    fontFamily: theme.fontFamily.extraBold,
    marginBottom: 2,
  },
  buttonDescription: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.sm,
    lineHeight: 19,
  },
}))
