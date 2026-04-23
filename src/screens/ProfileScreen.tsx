import React, { useEffect, useState } from 'react'
import {
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { createStyleSheet, useStyles } from 'react-native-unistyles'
import { getProfile } from '@/db/profileHelpers'
import type { ProfileStackParamList } from '../navigation/TabNavigator'

type Props = NativeStackScreenProps<ProfileStackParamList, 'Profile'>

export default function ProfileScreen({ navigation }: Props) {
  const { styles, theme } = useStyles(stylesheet)
  const [profile, setProfile] = useState<{
    name: string | null
    height: number | null
    weight: number | null
  } | null>(null)
  const [loading, setLoading] = useState(true)

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
      setProfile(p ? { name: p.name, height: p.height, weight: p.weight } : null)
    } catch (e) {
      console.error('Failed to load profile', e)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <View style={styles.container}>
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    )
  }

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.sectionTitle}>Profile</Text>

      <View style={styles.card}>
        <Text style={styles.label}>Name</Text>
        <Text style={styles.profileName}>
          {profile?.name || 'Not set'}
        </Text>
        {profile?.height && (
          <>
            <Text style={styles.label}>Height</Text>
            <Text style={styles.profileValue}>
              {profile.height} cm
            </Text>
          </>
        )}
        {profile?.weight && (
          <>
            <Text style={styles.label}>Weight</Text>
            <Text style={styles.profileValue}>
              {profile.weight} kg
            </Text>
          </>
        )}
        <TouchableOpacity
          style={styles.editButton}
          onPress={() => navigation.navigate('EditProfile')}
        >
          <Text style={styles.editButtonText}>Edit Profile</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.sectionTitle}>Settings</Text>

      <TouchableOpacity
        style={styles.settingsButton}
        onPress={() => navigation.navigate('Settings')}
      >
        <View>
          <Text style={styles.settingsButtonTitle}>Open settings</Text>
          <Text style={styles.settingsButtonDescription}>
            Manage themes and future preferences.
          </Text>
        </View>
        <Text style={styles.settingsChevron}>›</Text>
      </TouchableOpacity>
    </ScrollView>
  )
}

const stylesheet = createStyleSheet((theme) => ({
  scroll: {
    flex: 1,
    backgroundColor: theme.colors.bg,
  },
  content: {
    padding: theme.spacing.md,
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
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: theme.spacing.sm,
    marginTop: theme.spacing.lg,
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 0.5,
    borderColor: theme.colors.border,
    padding: theme.spacing.md,
    gap: theme.spacing.xs,
  },
  label: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  profileName: {
    color: theme.colors.text,
    fontSize: theme.fontSize.xl,
    fontWeight: '700',
    paddingBottom: theme.spacing.sm,
  },
  profileValue: {
    color: theme.colors.text,
    fontSize: theme.fontSize.lg,
    fontWeight: '600',
    paddingBottom: theme.spacing.sm,
  },
  editButton: {
    marginTop: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.accent,
    alignItems: 'center',
  },
  editButtonText: {
    color: '#FFFFFF',
    fontSize: theme.fontSize.sm,
    fontWeight: '600',
  },
  settingsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 0.5,
    borderColor: theme.colors.border,
    padding: theme.spacing.md,
  },
  settingsButtonTitle: {
    color: theme.colors.text,
    fontSize: theme.fontSize.md,
    fontWeight: '600',
    marginBottom: theme.spacing.xs,
  },
  settingsButtonDescription: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.sm,
  },
  settingsChevron: {
    color: theme.colors.accent,
    fontSize: theme.fontSize.xl,
    fontWeight: '700',
  },
}))
