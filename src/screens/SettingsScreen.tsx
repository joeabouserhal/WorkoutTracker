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
import {
  DEFAULT_MUSCLE_RECOVERY_HOURS,
  getDefaultMuscleRecoveryHours,
  setDefaultMuscleRecoveryHours,
} from '@/services/muscleRecoverySettings'
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
  const [muscleRecoveryHours, setMuscleRecoveryHours] = useState(getDefaultMuscleRecoveryHours)

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
        setMuscleRecoveryHours(getDefaultMuscleRecoveryHours())
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

  function handleMuscleRecoveryChange(delta: number) {
    const next = Math.max(12, Math.min(168, muscleRecoveryHours + delta))
    setMuscleRecoveryHours(next)
    setDefaultMuscleRecoveryHours(next)
  }

  function handleMuscleRecoveryReset() {
    setMuscleRecoveryHours(DEFAULT_MUSCLE_RECOVERY_HOURS)
    setDefaultMuscleRecoveryHours(DEFAULT_MUSCLE_RECOVERY_HOURS)
  }

  return (
    <View style={styles.container}>
      <ScreenHeader
        title="Workout Settings"
        onBack={() => navigation.goBack()}
        showFade={showHeaderFade}
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        onScroll={handleHeaderScroll}
        scrollEventThrottle={16}
      >
        <Text style={styles.sectionSubtitle}>Default Units</Text>

        <View style={styles.unitsCard}>
          <View style={styles.settingCardRow}>
            <View style={styles.settingCardHeader}>
              <View style={styles.cardIconBadge}>
                <MaterialCommunityIcons name="weight-kilogram" size={18} color={theme.colors.accent} />
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
                activeOpacity={0.78}
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
                activeOpacity={0.78}
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
        </View>

        <View style={styles.unitsCard}>
          <View style={styles.settingCardRow}>
            <View style={styles.settingCardHeader}>
              <View style={styles.cardIconBadge}>
                <MaterialCommunityIcons name="human-male-height" size={18} color={theme.colors.accent} />
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
                activeOpacity={0.78}
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
                activeOpacity={0.78}
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
        </View>

        <Text style={styles.sectionSubtitle}>Workout Defaults</Text>

        <View style={styles.unitsCard}>
          <View style={styles.settingCardRow}>
            <View style={styles.settingCardHeader}>
              <View style={styles.cardIconBadge}>
                <MaterialCommunityIcons name="timer-sand" size={18} color={theme.colors.accent} />
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
                activeOpacity={0.78}
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
                activeOpacity={0.78}
              >
                <Text style={styles.timerAdjustText}>+10s</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        <View style={styles.unitsCard}>
          <View style={styles.settingCardRow}>
            <View style={styles.settingCardHeader}>
              <View style={styles.cardIconBadge}>
                <MaterialCommunityIcons name="arm-flex-outline" size={18} color={theme.colors.accent} />
              </View>
              <View style={styles.settingTextBlock}>
                <Text style={styles.unitLabel}>Muscle Recovery</Text>
                <Text style={styles.settingDescription}>Full rest window</Text>
              </View>
            </View>
            <View style={styles.recoveryControlBlock}>
              <View style={styles.timerControlRow}>
                <TouchableOpacity
                  style={[
                    styles.timerAdjustButton,
                    muscleRecoveryHours <= 12 && styles.timerAdjustButtonDisabled,
                  ]}
                  onPress={() => handleMuscleRecoveryChange(-6)}
                  disabled={muscleRecoveryHours <= 12}
                  activeOpacity={0.78}
                >
                  <Text style={styles.timerAdjustText}>-6h</Text>
                </TouchableOpacity>
                <Text style={styles.timerValue}>{muscleRecoveryHours}h</Text>
                <TouchableOpacity
                  style={[
                    styles.timerAdjustButton,
                    muscleRecoveryHours >= 168 && styles.timerAdjustButtonDisabled,
                  ]}
                  onPress={() => handleMuscleRecoveryChange(6)}
                  disabled={muscleRecoveryHours >= 168}
                  activeOpacity={0.78}
                >
                  <Text style={styles.timerAdjustText}>+6h</Text>
                </TouchableOpacity>
              </View>
              {muscleRecoveryHours !== DEFAULT_MUSCLE_RECOVERY_HOURS ? (
                <TouchableOpacity
                  style={styles.resetRecoveryButton}
                  onPress={handleMuscleRecoveryReset}
                  activeOpacity={0.78}
                >
                  <Text style={styles.resetRecoveryText}>Reset 48h</Text>
                </TouchableOpacity>
              ) : null}
            </View>
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
    paddingTop: theme.spacing.sm,
    paddingBottom: theme.spacing.xl,
  },
  sectionSubtitle: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
    fontFamily: theme.fontFamily.semiBold,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginTop: theme.spacing.md,
    marginBottom: theme.spacing.xs,
  },
  cardIconBadge: {
    width: 34,
    height: 34,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.accentMuted,
  },
  unitsCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    marginBottom: theme.spacing.xs,
  },
  settingCardRow: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
  },
  settingCardHeader: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  settingTextBlock: {
    flex: 1,
    minWidth: 0,
  },
  unitLabel: {
    color: theme.colors.text,
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.extraBold,
  },
  settingDescription: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
    fontFamily: theme.fontFamily.semiBold,
    marginTop: 2,
  },
  unitButtonsRow: {
    width: 132,
    flexDirection: 'row',
    gap: theme.spacing.xs,
  },
  timerControlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  recoveryControlBlock: {
    alignItems: 'flex-end',
    gap: theme.spacing.xs,
  },
  timerAdjustButton: {
    minWidth: 48,
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.sm,
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
    fontSize: theme.fontSize.xs,
    fontFamily: theme.fontFamily.semiBold,
  },
  timerValue: {
    minWidth: 58,
    color: theme.colors.accent,
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.bold,
    textAlign: 'center',
    backgroundColor: theme.colors.accentMuted,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.xs,
  },
  resetRecoveryButton: {
    minHeight: 26,
    borderRadius: theme.radius.full,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.sm,
  },
  resetRecoveryText: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
    fontFamily: theme.fontFamily.bold,
  },
  unitButton: {
    flex: 1,
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.sm,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surface2,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center',
  },
  unitButtonActive: {
    backgroundColor: theme.colors.accentMuted,
    borderColor: theme.colors.accent,
  },
  unitButtonText: {
    color: theme.colors.text,
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.semiBold,
  },
  unitButtonTextActive: {
    color: theme.colors.accent,
  },
}))
