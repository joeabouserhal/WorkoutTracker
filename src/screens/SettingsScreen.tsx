import React, { useEffect, useState } from 'react'
import { ScrollView, Text, TouchableOpacity, View } from 'react-native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { createStyleSheet, useStyles } from 'react-native-unistyles'
import { getProfile, upsertProfile } from '@/db/profileHelpers'
import type { ProfileStackParamList } from '../navigation/TabNavigator'

type WeightUnit = 'kg' | 'lb'

type Props = NativeStackScreenProps<ProfileStackParamList, 'Settings'>

export default function SettingsScreen({ navigation }: Props) {
  const { styles, theme } = useStyles(stylesheet)
  const [weightUnit, setWeightUnit] = useState<WeightUnit>('kg')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadSettings() {
      try {
        const profile = await getProfile()
        if (profile?.defaultWeightUnit) {
          setWeightUnit(profile.defaultWeightUnit as WeightUnit)
        }
      } catch (e) {
        console.error('Failed to load settings', e)
      } finally {
        setLoading(false)
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

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.headerRow}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
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

      <Text style={styles.sectionSubtitle}>Units</Text>

      <View style={styles.unitsCard}>
        <Text style={styles.unitLabel}>Default Weight Unit</Text>
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
    marginTop: theme.spacing.md,
    marginBottom: theme.spacing.lg,
  },
  backButton: {
    alignSelf: 'flex-start',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.full,
    borderWidth: 0.5,
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
    borderWidth: 0.5,
    borderColor: theme.colors.border,
    padding: theme.spacing.md,
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
  unitButton: {
    flex: 1,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surface2,
    borderWidth: 0.5,
    borderColor: theme.colors.border,
    alignItems: 'center',
  },
  unitButtonActive: {
    backgroundColor: theme.colors.accent,
    borderColor: theme.colors.accent,
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
