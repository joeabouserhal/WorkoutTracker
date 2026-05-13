import React, { useEffect, useState } from 'react'
import {
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons'
import { createStyleSheet, useStyles } from 'react-native-unistyles'
import ThemedDialog, { type ThemedDialogAction } from '@/components/ui/ThemedDialog'
import ScreenHeader, { useHeaderFade } from '@/components/ui/ScreenHeader'
import { getProfile } from '@/db/profileHelpers'
import type { ProfileStackParamList } from '../navigation/TabNavigator'

type Props = NativeStackScreenProps<ProfileStackParamList, 'Profile'>
type DialogState = {
  title: string
  message: string
  actions: ThemedDialogAction[]
}

export default function ProfileScreen({ navigation }: Props) {
  const { styles, theme } = useStyles(stylesheet)
  const { showHeaderFade, handleHeaderScroll } = useHeaderFade()
  const [profile, setProfile] = useState<{
    name: string | null
    height: number | null
    weight: number | null
    heightUnit: string
    defaultWeightUnit: string
  } | null>(null)
  const [loading, setLoading] = useState(true)
  const [dialog, setDialog] = useState<DialogState | null>(null)

  useEffect(() => {
    loadProfile()
  }, [])

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      loadProfile()
    })
    return unsubscribe
  }, [navigation])

  async function loadProfile() {
    try {
      const p = await getProfile()
      setProfile(p ? {
        name: p.name,
        height: p.height,
        weight: p.weight,
        heightUnit: p.heightUnit || 'cm',
        defaultWeightUnit: p.defaultWeightUnit || 'kg'
      } : null)
    } catch (e) {
      console.error('Failed to load profile', e)
    } finally {
      setLoading(false)
    }
  }

  function getInitials(name: string | null | undefined) {
    if (!name) return '--'
    return name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join('') || '--'
  }

  function formatHeight() {
    if (!profile?.height) return 'Not set'
    if (profile.heightUnit === 'ft') {
      return `${(profile.height / 30.48).toFixed(2)} ft`
    }
    return `${profile.height} cm`
  }

  function formatWeight() {
    if (!profile?.weight) return 'Not set'
    if (profile.defaultWeightUnit === 'lb') {
      return `${(profile.weight * 2.20462).toFixed(1)} lb`
    }
    return `${profile.weight} kg`
  }

  function closeDialog() {
    setDialog(null)
  }

  function confirmDebugNavigation() {
    setDialog({
      title: 'Dangerous Debug Area',
      message:
        'This page contains destructive tools that can remove custom library data from this device. Create a backup before entering.',
      actions: [
        { label: 'Cancel', onPress: closeDialog },
        {
          label: 'Enter Debug',
          variant: 'danger',
          onPress: () => {
            closeDialog()
            navigation.navigate('Debug')
          },
        },
      ],
    })
  }

  if (loading) {
    return (
      <View style={styles.container}>
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    )
  }

  return (
    <View style={styles.root}>
      <ScreenHeader title="Profile" showFade={showHeaderFade} />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        onScroll={handleHeaderScroll}
        scrollEventThrottle={16}
      >
      <Text style={styles.sectionTitle}>Athlete</Text>

      <View style={styles.profileCard}>
        <View style={styles.profileHeader}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{getInitials(profile?.name)}</Text>
          </View>

          <View style={styles.profileHeaderText}>
            <Text style={styles.profileLabel}>Athlete Profile</Text>
            <Text
              style={styles.profileName}
              numberOfLines={1}
              adjustsFontSizeToFit
            >
              {profile?.name || 'Not set'}
            </Text>
          </View>
        </View>

        <View style={styles.statsRow}>
          <View style={styles.statTile}>
            <View style={styles.statIconBadge}>
              <MaterialCommunityIcons
                name="human-male-height"
                size={18}
                color={theme.colors.accent}
              />
            </View>
            <Text style={styles.statLabel}>Height</Text>
            <Text style={styles.statValue}>{formatHeight()}</Text>
          </View>

          <View style={styles.statTile}>
            <View style={styles.statIconBadge}>
              <MaterialCommunityIcons
                name="scale-bathroom"
                size={18}
                color={theme.colors.accent}
              />
            </View>
            <Text style={styles.statLabel}>Weight</Text>
            <Text style={styles.statValue}>{formatWeight()}</Text>
          </View>
        </View>
      </View>

      <Text style={styles.sectionTitle}>Backup</Text>

      <TouchableOpacity
        style={styles.settingsButton}
        onPress={() => navigation.navigate('Backup')}
        activeOpacity={0.75}
      >
        <View style={styles.settingsIconBadge}>
          <MaterialCommunityIcons name="cloud-sync-outline" size={19} color={theme.colors.accent} />
        </View>
        <View style={styles.settingsTextBlock}>
          <Text style={styles.settingsButtonTitle}>Backup</Text>
          <Text style={styles.settingsButtonDescription}>
            Back up and restore your data with Google Drive.
          </Text>
        </View>
        <Text style={styles.settingsChevron}>›</Text>
      </TouchableOpacity>

      <Text style={styles.sectionTitle}>Settings</Text>

      <TouchableOpacity
        style={styles.settingsButton}
        onPress={() => navigation.navigate('EditProfile')}
        activeOpacity={0.75}
      >
        <View style={styles.settingsIconBadge}>
          <MaterialCommunityIcons name="account-edit-outline" size={19} color={theme.colors.accent} />
        </View>
        <View style={styles.settingsTextBlock}>
          <Text style={styles.settingsButtonTitle}>Edit Profile</Text>
          <Text style={styles.settingsButtonDescription}>
            Update your personal information.
          </Text>
        </View>
        <Text style={styles.settingsChevron}>›</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.settingsButton}
        onPress={() => navigation.navigate('Settings')}
        activeOpacity={0.75}
      >
        <View style={styles.settingsIconBadge}>
          <MaterialCommunityIcons name="cog-outline" size={19} color={theme.colors.accent} />
        </View>
        <View style={styles.settingsTextBlock}>
          <Text style={styles.settingsButtonTitle}>Workout settings</Text>
          <Text style={styles.settingsButtonDescription}>
            Manage default units, rest timers, and recovery.
          </Text>
        </View>
        <Text style={styles.settingsChevron}>›</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.settingsButton}
        onPress={() => navigation.navigate('Themes')}
        activeOpacity={0.75}
      >
        <View style={styles.settingsIconBadge}>
          <MaterialCommunityIcons name="palette-outline" size={19} color={theme.colors.accent} />
        </View>
        <View style={styles.settingsTextBlock}>
          <Text style={styles.settingsButtonTitle}>Themes</Text>
          <Text style={styles.settingsButtonDescription}>
            Choose the look and feel of the app.
          </Text>
        </View>
        <Text style={styles.settingsChevron}>›</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.settingsButton}
        onPress={() => navigation.navigate('Schedule')}
        activeOpacity={0.75}
      >
        <View style={styles.settingsIconBadge}>
          <MaterialCommunityIcons name="calendar-clock" size={19} color={theme.colors.accent} />
        </View>
        <View style={styles.settingsTextBlock}>
          <Text style={styles.settingsButtonTitle}>Schedule</Text>
          <Text style={styles.settingsButtonDescription}>
            Plan workout days and reminders.
          </Text>
        </View>
        <Text style={styles.settingsChevron}>›</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.settingsButton}
        onPress={() => navigation.navigate('About')}
        activeOpacity={0.75}
      >
        <View style={styles.settingsIconBadge}>
          <MaterialCommunityIcons name="information-outline" size={19} color={theme.colors.accent} />
        </View>
        <View style={styles.settingsTextBlock}>
          <Text style={styles.settingsButtonTitle}>About</Text>
          <Text style={styles.settingsButtonDescription}>
            Learn why this app exists.
          </Text>
        </View>
        <Text style={styles.settingsChevron}>›</Text>
      </TouchableOpacity>

      <Text style={styles.sectionTitle}>Debug</Text>

      <TouchableOpacity
        style={[styles.settingsButton, styles.debugButton]}
        onPress={confirmDebugNavigation}
        activeOpacity={0.75}
      >
        <View style={styles.debugIconBadge}>
          <MaterialCommunityIcons name="alert-octagon-outline" size={19} color={theme.colors.danger} />
        </View>
        <View style={styles.settingsTextBlock}>
          <Text style={styles.debugButtonTitle}>Debug Menu</Text>
          <Text style={styles.settingsButtonDescription}>
            Dangerous data cleanup tools.
          </Text>
        </View>
        <Text style={styles.debugChevron}>›</Text>
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
  },
  container: {
    flex: 1,
    backgroundColor: theme.colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.md,
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
  profileCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.md,
    gap: theme.spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 5,
    elevation: 2,
  },
  profileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
  },
  avatar: {
    width: 58,
    height: 58,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.accentMuted,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  avatarText: {
    color: theme.colors.accent,
    fontSize: theme.fontSize.lg,
    fontFamily: theme.fontFamily.black,
  },
  profileHeaderText: {
    flex: 1,
    minWidth: 0,
  },
  profileLabel: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
    fontFamily: theme.fontFamily.bold,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 2,
  },
  profileName: {
    color: theme.colors.text,
    fontSize: theme.fontSize.xl,
    fontFamily: theme.fontFamily.extraBold,
  },
  statsRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  statTile: {
    flex: 1,
    minWidth: 0,
    backgroundColor: theme.colors.surface2,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.sm,
    gap: 4,
  },
  statIconBadge: {
    width: 30,
    height: 30,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.accentMuted,
    marginBottom: 2,
  },
  statLabel: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
    fontFamily: theme.fontFamily.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  statValue: {
    color: theme.colors.text,
    fontSize: theme.fontSize.md,
    fontFamily: theme.fontFamily.extraBold,
  },
  settingsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
    gap: theme.spacing.sm,
  },
  settingsIconBadge: {
    width: 38,
    height: 38,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.accentMuted,
  },
  settingsButtonTitle: {
    color: theme.colors.text,
    fontSize: theme.fontSize.md,
    fontFamily: theme.fontFamily.extraBold,
    marginBottom: 2,
  },
  settingsTextBlock: {
    flex: 1,
    minWidth: 0,
    paddingRight: theme.spacing.md,
  },
  settingsButtonDescription: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.sm,
  },
  settingsChevron: {
    color: theme.colors.accent,
    fontSize: theme.fontSize.xl,
    fontFamily: theme.fontFamily.bold,
  },
  debugButton: {
    borderColor: theme.colors.danger + '55',
  },
  debugIconBadge: {
    width: 38,
    height: 38,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.danger + '16',
    borderWidth: 1,
    borderColor: theme.colors.danger + '45',
  },
  debugButtonTitle: {
    color: theme.colors.danger,
    fontSize: theme.fontSize.md,
    fontFamily: theme.fontFamily.extraBold,
    marginBottom: 2,
  },
  debugChevron: {
    color: theme.colors.danger,
    fontSize: theme.fontSize.xl,
    fontFamily: theme.fontFamily.bold,
  },
}))
