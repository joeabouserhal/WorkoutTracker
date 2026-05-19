import React, { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  InteractionManager,
  ScrollView,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons'
import { createStyleSheet, useStyles } from 'react-native-unistyles'
import ScreenHeader, { useHeaderFade } from '@/components/ui/ScreenHeader'
import ThemedDialog from '@/components/ui/ThemedDialog'
import {
  backupToGoogleDrive,
  deleteGoogleDriveBackup,
  exportBackupLocally,
  getAutoBackupAfterWorkoutEnabled,
  getGoogleDriveAccount,
  importBackupLocally,
  restoreFromGoogleDrive,
  signInToGoogleDrive,
  signOutFromGoogleDrive,
  setAutoBackupAfterWorkoutEnabled,
  validateGoogleDriveConnection,
  type DriveBackupFile,
  type GoogleDriveAccount,
} from '@/services/backupService'
import { hasGoogleDriveConfig } from '@/config/googleDrive'
import { useDataRefreshStore } from '@/store/dataRefreshStore'
import { useSessionStore } from '@/store/sessionStore'
import type { ProfileStackParamList } from '../navigation/TabNavigator'

type Props = NativeStackScreenProps<ProfileStackParamList, 'Backup'>

function formatBackupDate(value?: string) {
  if (!value) return 'No backup yet'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Unknown date'
  return date.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export default function BackupScreen({ navigation }: Props) {
  const { styles, theme } = useStyles(stylesheet)
  const { showHeaderFade, handleHeaderScroll } = useHeaderFade()
  const activeWorkoutId = useSessionStore((state) => state.activeWorkoutId)
  const bumpDataVersion = useDataRefreshStore((state) => state.bumpDataVersion)
  const [account, setAccount] = useState<GoogleDriveAccount | null>(null)
  const [driveBackup, setDriveBackup] = useState<DriveBackupFile | null>(null)
  const [loading, setLoading] = useState(true)
  const [busyAction, setBusyAction] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [restoreVisible, setRestoreVisible] = useState(false)
  const [localRestoreVisible, setLocalRestoreVisible] = useState(false)
  const [deleteVisible, setDeleteVisible] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [driveVerified, setDriveVerified] = useState(false)
  const [autoBackupEnabled, setAutoBackupEnabled] = useState(false)
  const configured = hasGoogleDriveConfig()

  const refreshStatus = useCallback(async () => {
    setLoading(true)
    try {
      if (!configured) {
        setAccount(null)
        setDriveBackup(null)
        setDriveVerified(false)
        return
      }

      const currentAccount = getGoogleDriveAccount()
      setAccount(currentAccount)
      if (!currentAccount) {
        setDriveBackup(null)
        setDriveVerified(false)
        return
      }

      const status = await validateGoogleDriveConnection()
      setAccount(status.account)
      setDriveBackup(status.latestBackup)
      setDriveVerified(true)
    } catch (e) {
      console.error('Could not load backup status', e)
      setDriveBackup(null)
      setDriveVerified(false)
    } finally {
      setLoading(false)
    }
  }, [configured])

  useEffect(() => {
    setAutoBackupEnabled(getAutoBackupAfterWorkoutEnabled())
    refreshStatus().catch(console.error)
  }, [refreshStatus])

  async function runAction<T>(label: string, action: () => Promise<T>, pendingMessage?: string) {
    setBusyAction(label)
    setMessage(pendingMessage ?? '')
    setErrorMessage('')
    try {
      return await action()
    } catch (e) {
      const nextMessage = e instanceof Error ? e.message : 'Something went wrong.'
      setMessage('')
      setErrorMessage(nextMessage)
      return null
    } finally {
      setBusyAction(null)
    }
  }

  async function connectGoogleDrive() {
    const nextAccount = await runAction('connect', signInToGoogleDrive)
    if (!nextAccount) return
    setAccount(nextAccount)
    setDriveVerified(false)
    setMessage('Google account connected. Checking Drive access...')
    refreshStatus().catch(console.error)
  }

  async function backupNow() {
    if (activeWorkoutId) return
    const result = await runAction(
      'backup',
      backupToGoogleDrive,
      'Creating backup, checking Drive permission, and uploading...',
    )
    if (!result) return
    setMessage(`Backup saved privately to Google Drive app data with ${result.rowCount} rows.`)
    setDriveBackup({
      id: result.fileId,
      name: 'workouttracker-backup.json',
      modifiedTime: result.createdAt,
    })
    setDriveVerified(true)
  }

  async function restoreNow() {
    if (activeWorkoutId) return
    setRestoreVisible(false)
    const result = await runAction(
      'restore',
      restoreFromGoogleDrive,
      'Checking Google Drive for your latest private backup...',
    )
    if (!result) return
    bumpDataVersion()
    setMessage(`Restored ${result.rowCount} rows from ${formatBackupDate(result.createdAt)}.`)
  }

  async function importLocalNow() {
    if (activeWorkoutId) return
    const result = await runAction(
      'import',
      importBackupLocally,
      'Opening file picker...',
    )
    if (!result) {
      setMessage('')
      return
    }
    bumpDataVersion()
    setMessage(`Imported ${result.rowCount} rows from ${result.fileName}.`)
  }

  function chooseLocalBackupFile() {
    setLocalRestoreVisible(false)
    InteractionManager.runAfterInteractions(() => {
      setTimeout(() => {
        importLocalNow().catch(console.error)
      }, 120)
    })
  }

  async function deleteBackupNow() {
    setDeleteVisible(false)
    const result = await runAction(
      'delete',
      deleteGoogleDriveBackup,
      'Removing your private Google Drive backup...',
    )
    if (!result) return
    setDriveBackup(null)
    setDriveVerified(true)
    setMessage(`Deleted ${result.fileName} from Google Drive app data.`)
  }

  async function exportLocal() {
    if (activeWorkoutId) return
    const result = await runAction('export', exportBackupLocally, 'Opening save picker...')
    if (!result) {
      setMessage('')
      return
    }
    setMessage(`Local backup exported as ${result.fileName}.`)
  }

  async function toggleAutoBackup(enabled: boolean) {
    setMessage('')
    setErrorMessage('')

    if (enabled && !account) {
      setErrorMessage('Connect Google Drive before enabling auto backup.')
      return
    }

    if (enabled && !driveVerified) {
      const status = await runAction(
        'validate',
        validateGoogleDriveConnection,
        'Checking Drive access before enabling auto backup...',
      )
      if (!status) return
      setAccount(status.account)
      setDriveBackup(status.latestBackup)
      setDriveVerified(true)
    }

    setAutoBackupAfterWorkoutEnabled(enabled)
    setAutoBackupEnabled(enabled)
    setMessage(enabled ? 'Auto backup enabled after finishing workouts.' : 'Auto backup disabled.')
  }

  async function signOut() {
    await runAction('signout', signOutFromGoogleDrive, 'Signing out...')
    setAccount(null)
    setDriveBackup(null)
    setDriveVerified(false)
    setAutoBackupAfterWorkoutEnabled(false)
    setAutoBackupEnabled(false)
    setMessage('Signed out of Google Drive.')
  }

  const isBusy = Boolean(busyAction)
  const blockedByWorkout = Boolean(activeWorkoutId)
  const statusLabel = account
    ? driveVerified
      ? 'Connected'
      : loading
        ? 'Checking Drive access'
        : 'Account connected'
    : configured
      ? 'Not connected'
      : 'Waiting for setup'
  const busyTitle = busyAction === 'backup'
    ? 'Backing up'
    : busyAction === 'restore'
      ? 'Restoring'
      : busyAction === 'export'
        ? 'Exporting'
        : busyAction === 'import'
          ? 'Importing'
          : busyAction === 'delete'
            ? 'Deleting'
            : busyAction === 'connect'
              ? 'Connecting'
              : busyAction === 'signout'
                ? 'Signing out'
                : busyAction === 'validate'
                  ? 'Checking'
                  : ''

  return (
    <View style={styles.root}>
      <ScreenHeader
        title="Backup"
        onBack={() => navigation.goBack()}
        showFade={showHeaderFade}
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        onScroll={handleHeaderScroll}
        scrollEventThrottle={16}
      >
        {!configured ? (
          <View style={styles.setupCard}>
            <View style={styles.setupIcon}>
              <MaterialCommunityIcons name="key-variant" size={22} color={theme.colors.accent} />
            </View>
            <Text style={styles.setupTitle}>Google Drive setup needed</Text>
            <Text style={styles.setupText}>
              Enable the Google Drive API and create an Android OAuth client for package
              com.joeabouserhal.workouttracker.
            </Text>
            <Text style={styles.setupHint}>
              Get SHA-1 with: cd android && ./gradlew signingReport
            </Text>
          </View>
        ) : null}

        {blockedByWorkout ? (
          <View style={styles.noticeCard}>
            <MaterialCommunityIcons name="dumbbell" size={17} color={theme.colors.accent} />
            <Text style={styles.noticeText}>
              Finish or cancel the active workout before backing up or restoring.
            </Text>
          </View>
        ) : null}

        {message ? (
          <View style={styles.noticeCard}>
            <MaterialCommunityIcons name="check-circle-outline" size={17} color={theme.colors.accent} />
            <Text style={styles.noticeText}>{message}</Text>
          </View>
        ) : null}

        {errorMessage ? (
          <View style={styles.errorCard}>
            <MaterialCommunityIcons name="alert-circle-outline" size={17} color={theme.colors.danger} />
            <Text style={styles.errorText}>{errorMessage}</Text>
          </View>
        ) : null}

        {isBusy ? (
          <View style={styles.progressCard}>
            <ActivityIndicator size="small" color={theme.colors.accent} />
            <View style={styles.progressTextBlock}>
              <Text style={styles.progressTitle}>{busyTitle}</Text>
              <Text style={styles.progressText}>
                {message || 'Working with your backup...'}
              </Text>
            </View>
          </View>
        ) : null}

        <View style={styles.statusCard}>
          <View style={styles.statusHeader}>
            <View style={styles.statusIcon}>
              <MaterialCommunityIcons name="google-drive" size={22} color={theme.colors.accent} />
            </View>
            <View style={styles.statusTextBlock}>
              <Text style={styles.statusTitle}>Google Drive</Text>
              <Text
                style={[
                  styles.statusSubtitle,
                  driveVerified && styles.statusSubtitleConnected,
                ]}
              >
                {statusLabel}
              </Text>
            </View>
            {loading ? <ActivityIndicator color={theme.colors.accent} /> : null}
          </View>

          {account ? (
            <View style={styles.accountCard}>
              <View style={styles.accountAvatar}>
                <MaterialCommunityIcons name="account" size={20} color={theme.colors.accent} />
              </View>
              <View style={styles.accountTextBlock}>
                <Text style={styles.accountName} numberOfLines={1}>
                  {account.name || 'Google Account'}
                </Text>
                <Text style={styles.accountEmail} numberOfLines={1}>
                  {account.email}
                </Text>
              </View>
            </View>
          ) : (
            <TouchableOpacity
              style={[styles.primaryButton, (!configured || isBusy) && styles.disabledButton]}
              onPress={connectGoogleDrive}
              disabled={!configured || isBusy}
              activeOpacity={0.78}
            >
              <MaterialCommunityIcons name="google" size={18} color={theme.colors.accent} />
              <Text style={styles.primaryButtonText}>
                {busyAction === 'connect' ? 'Connecting...' : 'Connect Google Drive'}
              </Text>
            </TouchableOpacity>
          )}
        </View>
        {account ? (
          <>
            <View style={styles.backupInfoCard}>
              <Text style={styles.cardEyebrow}>Latest Drive Backup</Text>
              <Text style={styles.backupDate}>
                {formatBackupDate(driveBackup?.modifiedTime)}
              </Text>
              <Text style={styles.backupDescription}>
                Backups are stored in Google Drive app data. They will not appear in your normal Drive files.
              </Text>
            </View>

            <View style={styles.autoBackupCard}>
              <View style={styles.autoBackupIcon}>
                <MaterialCommunityIcons name="cloud-sync-outline" size={19} color={theme.colors.accent} />
              </View>
              <View style={styles.autoBackupTextBlock}>
                <Text style={styles.autoBackupTitle}>Auto backup</Text>
                <Text style={styles.autoBackupDescription}>
                  Save to Drive after a workout is finished.
                </Text>
              </View>
              <Switch
                value={autoBackupEnabled}
                onValueChange={toggleAutoBackup}
                disabled={isBusy || blockedByWorkout}
                thumbColor={autoBackupEnabled ? theme.colors.accent : theme.colors.textMuted}
                trackColor={{
                  false: theme.colors.surface2,
                  true: theme.colors.accentMuted,
                }}
              />
            </View>

            <View style={styles.actionsCard}>
              <BackupActionButton
                iconName="cloud-upload-outline"
                title="Backup now"
                description="Save a fresh copy to Google Drive."
                disabled={isBusy || blockedByWorkout}
                busy={busyAction === 'backup'}
                onPress={backupNow}
              />
              <BackupActionButton
                iconName="cloud-download-outline"
                title="Restore from Drive"
                description="Replace local app data with your latest backup."
                disabled={isBusy || blockedByWorkout}
                busy={busyAction === 'restore'}
                onPress={() => setRestoreVisible(true)}
              />
              <BackupActionButton
                iconName="trash-can-outline"
                title="Delete Drive backup"
                description="Remove the private Drive copy for this app."
                disabled={isBusy || blockedByWorkout || !driveBackup}
                busy={busyAction === 'delete'}
                onPress={() => setDeleteVisible(true)}
                tone="danger"
              />
              
            </View>
<View style={styles.backupInfoCard}>
          <Text style={styles.cardEyebrow}>Local Backup</Text>
          <Text style={styles.backupDate}>Device JSON</Text>
          <Text style={styles.backupDescription}>
            Export or import a backup file directly from this phone. No Google account required.
          </Text>
        </View>

        <View style={styles.actionsCard}>
          <BackupActionButton
            iconName="file-export-outline"
            title="Export locally"
            description="Choose where to save a backup JSON file."
            disabled={isBusy || blockedByWorkout}
            busy={busyAction === 'export'}
            onPress={exportLocal}
          />
          <BackupActionButton
            iconName="file-import-outline"
            title="Import local backup"
            description="Choose a backup JSON file to restore."
            disabled={isBusy || blockedByWorkout}
            busy={busyAction === 'import'}
            onPress={() => setLocalRestoreVisible(true)}
          />
        </View>
            <TouchableOpacity
              style={[styles.signOutButton, isBusy && styles.disabledButton]}
              onPress={signOut}
              disabled={isBusy}
              activeOpacity={0.78}
            >
              <MaterialCommunityIcons name="logout" size={17} color={theme.colors.danger} />
              <Text style={styles.signOutText}>
                {busyAction === 'signout' ? 'Signing out...' : 'Sign out'}
              </Text>
            </TouchableOpacity>
            
          </>
        ) : 
        (<>
        <View style={styles.backupInfoCard}>
          <Text style={styles.cardEyebrow}>Local Backup</Text>
          <Text style={styles.backupDate}>Device JSON</Text>
          <Text style={styles.backupDescription}>
            Export or import a backup file directly from this phone. No Google account required.
          </Text>
        </View>

        <View style={styles.actionsCard}>
          <BackupActionButton
            iconName="file-export-outline"
            title="Export locally"
            description="Choose where to save a backup JSON file."
            disabled={isBusy || blockedByWorkout}
            busy={busyAction === 'export'}
            onPress={exportLocal}
          />
          <BackupActionButton
            iconName="file-import-outline"
            title="Import local backup"
            description="Choose a backup JSON file to restore."
            disabled={isBusy || blockedByWorkout}
            busy={busyAction === 'import'}
            onPress={() => setLocalRestoreVisible(true)}
          />
        </View></>)}
      </ScrollView>

      <ThemedDialog
        visible={restoreVisible}
        title="Restore Backup"
        message="This will replace all local workouts, library changes, templates, profile data, and progress with your latest Google Drive backup."
        actions={[
          { label: 'Cancel', onPress: () => setRestoreVisible(false) },
          { label: 'Restore', variant: 'danger', onPress: restoreNow },
        ]}
      />
      <ThemedDialog
        visible={localRestoreVisible}
        title="Import Local Backup"
        message="This will replace all local workouts, library changes, templates, profile data, and progress with the backup JSON you choose from this device."
        actions={[
          { label: 'Cancel', onPress: () => setLocalRestoreVisible(false) },
          { label: 'Choose File', variant: 'danger', onPress: chooseLocalBackupFile },
        ]}
      />
      <ThemedDialog
        visible={deleteVisible}
        title="Delete Backup"
        message="This removes the latest private Google Drive backup for this app. Your workouts on this phone stay untouched."
        actions={[
          { label: 'Cancel', onPress: () => setDeleteVisible(false) },
          { label: 'Delete', variant: 'danger', onPress: deleteBackupNow },
        ]}
      />
    </View>
  )
}

function BackupActionButton({
  iconName,
  title,
  description,
  disabled,
  busy,
  onPress,
  tone = 'default',
}: {
  iconName: string
  title: string
  description: string
  disabled: boolean
  busy: boolean
  onPress: () => void
  tone?: 'default' | 'danger'
}) {
  const { styles, theme } = useStyles(stylesheet)
  const isDanger = tone === 'danger'

  return (
    <TouchableOpacity
      style={[
        styles.actionButton,
        disabled && styles.disabledButton,
      ]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.78}
    >
      <View style={styles.actionIcon}>
        {busy ? (
          <ActivityIndicator
            size="small"
            color={isDanger ? theme.colors.danger : theme.colors.accent}
          />
        ) : (
          <MaterialCommunityIcons
            name={iconName}
            size={19}
            color={isDanger ? theme.colors.danger : theme.colors.accent}
          />
        )}
      </View>
      <View style={styles.actionTextBlock}>
        <Text style={[styles.actionTitle, isDanger && styles.actionTitleDanger]}>
          {title}
        </Text>
        <Text style={styles.actionDescription}>{description}</Text>
      </View>
      <MaterialCommunityIcons
        name="chevron-right"
        size={18}
        color={isDanger ? theme.colors.danger : theme.colors.textMuted}
      />
    </TouchableOpacity>
  )
}

const stylesheet = createStyleSheet((theme) => ({
  root: {
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
  setupCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.md,
    gap: theme.spacing.xs,
  },
  setupIcon: {
    width: 38,
    height: 38,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.accentMuted,
    marginBottom: theme.spacing.xs,
  },
  setupTitle: {
    color: theme.colors.text,
    fontSize: theme.fontSize.md,
    fontFamily: theme.fontFamily.extraBold,
  },
  setupText: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.sm,
    lineHeight: 20,
  },
  setupHint: {
    color: theme.colors.accent,
    fontSize: theme.fontSize.xs,
    fontFamily: theme.fontFamily.bold,
    marginTop: theme.spacing.xs,
  },
  noticeCard: {
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
  errorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    backgroundColor: theme.colors.dangerMuted,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.danger,
    padding: theme.spacing.sm,
  },
  errorText: {
    flex: 1,
    color: theme.colors.text,
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.semiBold,
  },
  progressCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.md,
  },
  progressTextBlock: {
    flex: 1,
    minWidth: 0,
  },
  progressTitle: {
    color: theme.colors.text,
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.extraBold,
  },
  progressText: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
    fontFamily: theme.fontFamily.semiBold,
    marginTop: 2,
  },
  statusCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.md,
    gap: theme.spacing.md,
  },
  statusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  statusIcon: {
    width: 42,
    height: 42,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.accentMuted,
  },
  statusTextBlock: {
    flex: 1,
    minWidth: 0,
  },
  statusTitle: {
    color: theme.colors.text,
    fontSize: theme.fontSize.md,
    fontFamily: theme.fontFamily.extraBold,
  },
  statusSubtitle: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.semiBold,
    marginTop: 2,
  },
  statusSubtitleConnected: {
    color: '#3DBE72',
    fontFamily: theme.fontFamily.extraBold,
  },
  accountCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    backgroundColor: theme.colors.surface2,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.sm,
  },
  accountAvatar: {
    width: 36,
    height: 36,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.accentMuted,
  },
  accountTextBlock: {
    flex: 1,
    minWidth: 0,
  },
  accountName: {
    color: theme.colors.text,
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.extraBold,
  },
  accountEmail: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
    fontFamily: theme.fontFamily.semiBold,
    marginTop: 2,
  },
  primaryButton: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.xs,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface2,
    paddingHorizontal: theme.spacing.md,
  },
  primaryButtonText: {
    color: theme.colors.text,
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.extraBold,
  },
  backupInfoCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.md,
    gap: 4,
  },
  cardEyebrow: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
    fontFamily: theme.fontFamily.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  backupDate: {
    color: theme.colors.text,
    fontSize: theme.fontSize.md,
    fontFamily: theme.fontFamily.extraBold,
  },
  backupDescription: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.sm,
  },
  autoBackupCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  autoBackupIcon: {
    width: 36,
    height: 36,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.accentMuted,
  },
  autoBackupTextBlock: {
    flex: 1,
    minWidth: 0,
  },
  autoBackupTitle: {
    color: theme.colors.text,
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.extraBold,
  },
  autoBackupDescription: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
    fontFamily: theme.fontFamily.semiBold,
    marginTop: 2,
  },
  actionsCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    overflow: 'hidden',
  },
  actionButton: {
    minHeight: 62,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  actionIcon: {
    width: 36,
    height: 36,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.accentMuted,
  },
  actionTextBlock: {
    flex: 1,
    minWidth: 0,
  },
  actionTitle: {
    color: theme.colors.text,
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.extraBold,
  },
  actionTitleDanger: {
    color: theme.colors.danger,
  },
  actionDescription: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
    fontFamily: theme.fontFamily.semiBold,
    marginTop: 2,
  },
  disabledButton: {
    opacity: 0.45,
  },
  signOutButton: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.xs,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.dangerMuted,
    backgroundColor: theme.colors.dangerMuted,
    paddingHorizontal: theme.spacing.md,
  },
  signOutText: {
    color: theme.colors.danger,
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.extraBold,
  },
}))
