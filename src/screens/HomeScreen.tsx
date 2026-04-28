import React, { useCallback, useState } from 'react'
import { Alert, View, Text, TouchableOpacity, ScrollView } from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons'
import { createStyleSheet, useStyles } from 'react-native-unistyles'
import { getProfile } from '@/db/profileHelpers'
import { createWorkout } from '@/db/workoutHelpers'
import { useSessionStore } from '@/store/sessionStore'

export default function HomeScreen() {
  const { styles } = useStyles(stylesheet)
  const [name, setName] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const startWorkout = useSessionStore((s) => s.startWorkout)
  const openWorkoutSheet = useSessionStore((s) => s.openWorkoutSheet)
  const activeWorkoutId = useSessionStore((s) => s.activeWorkoutId)

  useFocusEffect(
    useCallback(() => {
      let isActive = true

      async function loadProfile() {
        setLoading(true)
        try {
          const profile = await getProfile()
          if (isActive) {
            setName(profile?.name ?? '')
          }
        } catch (e) {
          console.error('Failed to load profile', e)
        } finally {
          if (isActive) {
            setLoading(false)
          }
        }
      }

      loadProfile()

      return () => {
        isActive = false
      }
    }, []),
  )

  async function handleStartWorkout() {
    if (activeWorkoutId) {
      openWorkoutSheet()
      return
    }

    try {
      const workoutId = await createWorkout()
      startWorkout(workoutId)
    } catch (e) {
      Alert.alert('Error', 'Could not start workout.')
      console.error(e)
    }
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
    // Add subtle shadow and border for depth
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 5,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.3)',
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
