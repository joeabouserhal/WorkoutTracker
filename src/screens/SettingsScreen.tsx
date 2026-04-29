import React, { useEffect, useState } from 'react'
import { ScrollView, Text, TouchableOpacity, View } from 'react-native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons'
import { createStyleSheet, useStyles } from 'react-native-unistyles'
import { getProfile, upsertProfile } from '@/db/profileHelpers'
import {
  formatRestTimer,
  getDefaultRestSeconds,
  setDefaultRestSeconds,
} from '@/services/restTimerSettings'
import type { ProfileStackParamList } from '../navigation/TabNavigator'

type WeightUnit = 'kg' | 'lb'
type HeightUnit = 'cm' | 'ft'

type Props = NativeStackScreenProps<ProfileStackParamList, 'Settings'>

export default function SettingsScreen({ navigation }: Props) {
  const { styles, theme } = useStyles(stylesheet)
  const [weightUnit, setWeightUnit] = useState<WeightUnit>('kg')
  const [heightUnit, setHeightUnit] = useState<HeightUnit>('cm')
  const [restTimerSeconds, setRestTimerSeconds] = useState(getDefaultRestSeconds)

  useEffect(() => {
    async function loadSettings() {
      try {
        const profile = await getProfile()
        if (profile?.defaultWeightUnit) {
          setWeightUnit(profile.defaultWeightUnit as WeightUnit)
        }
        if (profile?.heightUnit) {
          setHeightUnit(profile.heightUnit as HeightUnit)
        }
        setRestTimerSeconds(getDefaultRestSeconds())
      } catch (e) {
        console.error('Failed to load settings', e)
      }
    }

    loadSettings()
  }, [])

  async function handleWeightUnitChange(unit: WeightUnit) {
    setWeightUnit(unit)
    try {
      await upsertProfile({ defaultWeightUnit: unit })
    } catch (e) {
      console.error('Failed to update weight unit', e)
    }
  }

  async function handleHeightUnitChange(unit: HeightUnit) {
    setHeightUnit(unit)
    try {
      await upsertProfile({ heightUnit: unit })
    } catch (e) {
      console.error('Failed to update height unit', e)
    }
  }

  function handleRestTimerChange(delta: number) {
    const next = Math.max(10, Math.min(600, restTimerSeconds + delta))
    setRestTimerSeconds(next)
    setDefaultRestSeconds(next)
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.headerRow}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <MaterialCommunityIcons name="chevron-left" size={17} color={theme.colors.text} />
          <Text style={styles.backButtonText}>Back</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.sectionTitle}>Settings</Text>

      <TouchableOpacity
        style={styles.cardButton}
        onPress={() => navigation.navigate('Themes')}
      >
        <View>
          <Text style={styles.cardTitle}>Themes</Text>
          <Text style={styles.cardDescription}>
            Choose the look and feel of the app.
          </Text>
        </View>
        <Text style={styles.chevron}>›</Text>
      </TouchableOpacity>

      <Text style={styles.sectionSubtitle}>Default Units</Text>

      <View style={styles.unitsCard}>
        <Text style={styles.unitLabel}>Weight Unit</Text>
        <View style={styles.unitButtonsRow}>
          <TouchableOpacity
            style={[
              styles.unitButton,
              weightUnit === 'kg' && styles.unitButtonActive,
            ]}
            onPress={() => handleWeightUnitChange('kg')}
          >
            <Text
              style={[
                styles.unitButtonText,
                weightUnit === 'kg' && styles.unitButtonTextActive,
              ]}
            >
              kg
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.unitButton,
              weightUnit === 'lb' && styles.unitButtonActive,
            ]}
            onPress={() => handleWeightUnitChange('lb')}
          >
            <Text
              style={[
                styles.unitButtonText,
                weightUnit === 'lb' && styles.unitButtonTextActive,
              ]}
            >
              lb
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.unitsCard}>
        <Text style={styles.unitLabel}>Height Unit</Text>
        <View style={styles.unitButtonsRow}>
          <TouchableOpacity
            style={[
              styles.unitButton,
              heightUnit === 'cm' && styles.unitButtonActive,
            ]}
            onPress={() => handleHeightUnitChange('cm')}
          >
            <Text
              style={[
                styles.unitButtonText,
                heightUnit === 'cm' && styles.unitButtonTextActive,
              ]}
            >
              cm
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.unitButton,
              heightUnit === 'ft' && styles.unitButtonActive,
            ]}
            onPress={() => handleHeightUnitChange('ft')}
          >
            <Text
              style={[
                styles.unitButtonText,
                heightUnit === 'ft' && styles.unitButtonTextActive,
              ]}
            >
              ft
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <Text style={styles.sectionSubtitle}>Workout Defaults</Text>

      <View style={styles.unitsCard}>
        <Text style={styles.unitLabel}>Rest Timer</Text>
        <View style={styles.timerControlRow}>
          <TouchableOpacity
            style={[
              styles.timerAdjustButton,
              restTimerSeconds <= 10 && styles.timerAdjustButtonDisabled,
            ]}
            onPress={() => handleRestTimerChange(-10)}
            disabled={restTimerSeconds <= 10}
          >
            <Text style={styles.timerAdjustText}>-10s</Text>
          </TouchableOpacity>
          <Text style={styles.timerValue}>{formatRestTimer(restTimerSeconds)}</Text>
          <TouchableOpacity
            style={[
              styles.timerAdjustButton,
              restTimerSeconds >= 600 && styles.timerAdjustButtonDisabled,
            ]}
            onPress={() => handleRestTimerChange(10)}
            disabled={restTimerSeconds >= 600}
          >
            <Text style={styles.timerAdjustText}>+10s</Text>
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  )
}

const stylesheet = createStyleSheet((theme) => ({
  container: {
    flex: 1,
    backgroundColor: theme.colors.bg,
  },
  content: {
    padding: theme.spacing.md,
    paddingBottom: theme.spacing.xl,
  },
  headerRow: {
    marginTop: theme.spacing.lg,
    marginBottom: theme.spacing.lg,
  },
  backButton: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.full,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.md,
  },
  backButtonText: {
    color: theme.colors.text,
    fontSize: theme.fontSize.sm,
    fontWeight: '600',
  },
  sectionTitle: {
    color: theme.colors.text,
    fontSize: theme.fontSize.xxl,
    fontWeight: '700',
    marginBottom: theme.spacing.md,
  },
  sectionSubtitle: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.sm,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: theme.spacing.lg,
    marginBottom: theme.spacing.md,
  },
  cardButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.md,
    // Add subtle shadow for depth
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  cardTitle: {
    color: theme.colors.text,
    fontSize: theme.fontSize.md,
    fontWeight: '600',
    marginBottom: theme.spacing.xs,
  },
  cardDescription: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.sm,
  },
  chevron: {
    color: theme.colors.accent,
    fontSize: theme.fontSize.xl,
    fontWeight: '700',
  },
  unitsCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 0.5,
    borderColor: theme.colors.border,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
    gap: theme.spacing.md,
  },
  unitLabel: {
    color: theme.colors.text,
    fontSize: theme.fontSize.md,
    fontWeight: '600',
  },
  unitButtonsRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  timerControlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  timerAdjustButton: {
    flex: 1,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surface2,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center',
  },
  timerAdjustButtonDisabled: {
    opacity: 0.45,
  },
  timerAdjustText: {
    color: theme.colors.text,
    fontSize: theme.fontSize.md,
    fontWeight: '600',
  },
  timerValue: {
    minWidth: 72,
    color: theme.colors.accent,
    fontSize: theme.fontSize.lg,
    fontWeight: '700',
    textAlign: 'center',
  },
  unitButton: {
    flex: 1,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surface2,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center',
    // Add subtle shadow for inactive buttons
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  unitButtonActive: {
    backgroundColor: theme.colors.accent,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    // Add enhanced shadow for active state
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
    // Add visible border with white highlight
    borderWidth: 1.5,
  },
  unitButtonText: {
    color: theme.colors.text,
    fontSize: theme.fontSize.md,
    fontWeight: '600',
  },
  unitButtonTextActive: {
    color: '#FFFFFF',
  },
}))
