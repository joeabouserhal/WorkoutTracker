import React, { useEffect, useState } from 'react'
import { View, Text, TouchableOpacity, ScrollView } from 'react-native'
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons'
import { createStyleSheet, useStyles } from 'react-native-unistyles'
import { getProfile } from '@/db/profileHelpers'

export default function HomeScreen() {
  const { styles, theme } = useStyles(stylesheet)
  const [name, setName] = useState<string>('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadProfile() {
      try {
        const profile = await getProfile()
        if (profile?.name) {
          setName(profile.name)
        }
      } catch (e) {
        console.error('Failed to load profile', e)
      } finally {
        setLoading(false)
      }
    }

    loadProfile()
  }, [])

  function handleStartWorkout() {
    // TODO: Navigate to workout screen or start workout
    console.log('Start workout pressed')
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
    >
      <View style={styles.welcomeSection}>
        <Text style={styles.welcomeText}>Welcome back,</Text>
        <Text style={styles.nameText}>{loading ? 'Loading...' : name || 'Athlete'}</Text>
      </View>

      <TouchableOpacity
        style={styles.startWorkoutButton}
        onPress={handleStartWorkout}
      >
        <MaterialCommunityIcons
          name="plus"
          size={32}
          color="#FFFFFF"
          style={styles.plusIcon}
        />
        <Text style={styles.startWorkoutText}>Start Workout</Text>
      </TouchableOpacity>
    </ScrollView>
  )
}

const stylesheet = createStyleSheet((theme) => ({
  container: {
    flex: 1,
    backgroundColor: theme.colors.bg,
    paddingTop: theme.spacing.lg,
  },
  content: {
    padding: theme.spacing.md,
    paddingTop: theme.spacing.lg,
    gap: theme.spacing.xl,
  },
  welcomeSection: {
    marginTop: theme.spacing.md,
  },
  welcomeText: {
    fontSize: theme.fontSize.md,
    color: theme.colors.textMuted,
    fontWeight: '500',
    marginBottom: theme.spacing.xs,
  },
  nameText: {
    fontSize: theme.fontSize.xxl,
    color: theme.colors.text,
    fontWeight: '700',
  },
  startWorkoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    backgroundColor: theme.colors.accent,
    borderRadius: theme.radius.lg,
    paddingVertical: theme.spacing.lg,
    paddingHorizontal: theme.spacing.md,
    marginVertical: theme.spacing.xs,
    gap: theme.spacing.md,
  },
  plusIcon: {
    marginRight: theme.spacing.sm,
  },
  startWorkoutText: {
    fontSize: theme.fontSize.lg,
    color: '#FFFFFF',
    fontWeight: '700',
  },
}))
