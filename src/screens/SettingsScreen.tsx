import React, { useEffect, useState } from 'react'
import { ScrollView, Text, TouchableOpacity, View } from 'react-native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons'
import { createStyleSheet, useStyles } from 'react-native-unistyles'
import ScreenHeader, { useHeaderFade } from '@/components/ui/ScreenHeader'
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
  const { showHeaderFade, handleHeaderScroll } = useHeaderFade()
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
    <View style={styles.container}>
      <ScreenHeader
        title="Settings"
        onBack={() => navigation.goBack()}
        showFade={showHeaderFade}
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        onScroll={handleHeaderScroll}
        scrollEventThrottle={16}
      >
      <TouchableOpacity
        style={styles.cardButton}
        onPress={() => navigation.navigate('Themes')}
        activeOpacity={0.75}
      >
        <View style={styles.cardIconBadge}>
          <MaterialCommunityIcons name="palette-outline" size={19} color={theme.colors.accent} />
        </View>
        <View style={styles.cardTextBlock}>
          <Text style={styles.cardTitle}>Themes</Text>
          <Text style={styles.cardDescription}>
            Choose the look and feel of the app.
          </Text>
        </View>
        <Text style={styles.chevron}>›</Text>
      </TouchableOpacity>

      <Text style={styles.sectionSubtitle}>Default Units</Text>

      <View style={styles.unitsCard}>
        <View style={styles.settingCardHeader}>
          <View style={styles.cardIconBadge}>
            <MaterialCommunityIcons name="weight-kilogram" size={19} color={theme.colors.accent} />
          </View>
          <Text style={styles.unitLabel}>Weight Unit</Text>
        </View>
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
        <View style={styles.settingCardHeader}>
          <View style={styles.cardIconBadge}>
            <MaterialCommunityIcons name="human-male-height" size={19} color={theme.colors.accent} />
          </View>
          <Text style={styles.unitLabel}>Height Unit</Text>
        </View>
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
        <View style={styles.settingCardHeader}>
          <View style={styles.cardIconBadge}>
            <MaterialCommunityIcons name="timer-sand" size={19} color={theme.colors.accent} />
          </View>
          <Text style={styles.unitLabel}>Rest Timer</Text>
        </View>
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
  sectionSubtitle: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.semiBold,
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
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    gap: theme.spacing.sm,
  },
  cardIconBadge: {
    width: 38,
    height: 38,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.accentMuted,
  },
  cardTextBlock: {
    flex: 1,
    minWidth: 0,
  },
  cardTitle: {
    color: theme.colors.text,
    fontSize: theme.fontSize.md,
    fontFamily: theme.fontFamily.extraBold,
    marginBottom: 2,
  },
  cardDescription: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.sm,
  },
  chevron: {
    color: theme.colors.accent,
    fontSize: theme.fontSize.xl,
    fontFamily: theme.fontFamily.bold,
  },
  unitsCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
    gap: theme.spacing.md,
  },
  settingCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  unitLabel: {
    flex: 1,
    color: theme.colors.text,
    fontSize: theme.fontSize.md,
    fontFamily: theme.fontFamily.extraBold,
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
    backgroundColor: theme.colors.surface,
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
    fontFamily: theme.fontFamily.semiBold,
  },
  timerValue: {
    minWidth: 72,
    color: theme.colors.accent,
    fontSize: theme.fontSize.lg,
    fontFamily: theme.fontFamily.bold,
    textAlign: 'center',
  },
  unitButton: {
    flex: 1,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center',
  },
  unitButtonActive: {
    backgroundColor: theme.colors.accent,
    borderColor: theme.colors.border,
  },
  unitButtonText: {
    color: theme.colors.text,
    fontSize: theme.fontSize.md,
    fontFamily: theme.fontFamily.semiBold,
  },
  unitButtonTextActive: {
    color: '#FFFFFF',
  },
}))
