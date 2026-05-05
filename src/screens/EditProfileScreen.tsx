import React, { useEffect, useState } from 'react'
import {
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons'
import { createStyleSheet, useStyles } from 'react-native-unistyles'
import ScreenHeader, { useHeaderFade } from '@/components/ui/ScreenHeader'
import { getProfile, upsertProfile } from '@/db/profileHelpers'
import { logBodyWeight } from '@/db/bodyWeightHelpers'
import type { ProfileStackParamList } from '../navigation/TabNavigator'
import ThemedDialog, { type ThemedDialogAction } from '@/components/ui/ThemedDialog'

type Props = NativeStackScreenProps<ProfileStackParamList, 'EditProfile'>
type LoadedProfile = NonNullable<Awaited<ReturnType<typeof getProfile>>>

const KG_TO_LB = 2.20462
const FT_TO_CM = 30.48
const VALUE_EPSILON = 0.000001

function valuesEqual(a: number | null | undefined, b: number | null | undefined): boolean {
  if (a == null && b == null) return true
  if (a == null || b == null) return false
  return Math.abs(a - b) < VALUE_EPSILON
}

export default function EditProfileScreen({ navigation }: Props) {
  const { styles, theme } = useStyles(stylesheet)
  const { showHeaderFade, handleHeaderScroll } = useHeaderFade()
  const [name, setName] = useState('')
  const [weight, setWeight] = useState('')
  const [height, setHeight] = useState('')
  const [weightUnit, setWeightUnit] = useState<'kg' | 'lb'>('kg')
  const [heightUnit, setHeightUnit] = useState<'cm' | 'ft'>('cm')
  const [loadedProfile, setLoadedProfile] = useState<LoadedProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [dialog, setDialog] = useState<{
    title: string
    message?: string
    actions: ThemedDialogAction[]
  } | null>(null)

  function closeDialog() {
    setDialog(null)
  }

  function showDialog(
    title: string,
    message: string,
    actions: ThemedDialogAction[] = [{ label: 'OK', variant: 'primary', onPress: closeDialog }],
  ) {
    setDialog({ title, message, actions })
  }

  useEffect(() => {
    async function load() {
      try {
        const p = await getProfile()
        if (p) {
          setLoadedProfile(p)
          setName(p.name || '')
          setWeightUnit((p.defaultWeightUnit === 'lb' ? 'lb' : 'kg') as 'kg' | 'lb')
          setHeightUnit((p.heightUnit === 'ft' ? 'ft' : 'cm') as 'cm' | 'ft')

          // Convert stored values (always in kg/cm) to display units
          if (p.weight) {
            const displayWeight = p.defaultWeightUnit === 'lb'
              ? (p.weight * KG_TO_LB).toFixed(1) // kg to lb
              : p.weight.toString()
            setWeight(displayWeight)
          }

          if (p.height) {
            const displayHeight = p.heightUnit === 'ft'
              ? (p.height / FT_TO_CM).toFixed(2) // cm to ft
              : p.height.toString()
            setHeight(displayHeight)
          }
        }
      } catch (e) {
        console.error('Failed to load profile', e)
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [])

  async function handleSave() {
    setSaving(true)

    try {
      // Convert display values back to kg/cm for storage
      const heightNum = height ? parseFloat(height) : undefined
      const weightNum = weight ? parseFloat(weight) : undefined

      const storedHeight = heightNum && heightUnit === 'ft'
        ? heightNum * FT_TO_CM // ft to cm
        : heightNum

      const storedWeight = weightNum && weightUnit === 'lb'
        ? weightNum / KG_TO_LB // lb to kg
        : weightNum

      const profileChanges: Parameters<typeof upsertProfile>[0] = {}
      const nextName = name.trim()
      if (nextName !== (loadedProfile?.name ?? '')) {
        profileChanges.name = nextName
      }
      if (!valuesEqual(storedHeight, loadedProfile?.height)) {
        profileChanges.height = storedHeight
      }

      if (Object.keys(profileChanges).length > 0) {
        await upsertProfile(profileChanges)
      }

      if (
        storedWeight !== undefined &&
        !valuesEqual(storedWeight, loadedProfile?.weight)
      ) {
        await logBodyWeight(storedWeight)
      }

      if (
        Object.keys(profileChanges).length === 0 &&
        (storedWeight === undefined || valuesEqual(storedWeight, loadedProfile?.weight))
      ) {
        showDialog('No Changes', 'There are no profile changes to save.')
        return
      }

      showDialog('Profile Updated', 'Your profile changes were saved.', [
        {
          label: 'OK',
          variant: 'primary',
          onPress: () => {
            closeDialog()
            navigation.goBack()
          },
        },
      ])
    } catch (e) {
      showDialog('Something went wrong', 'Could not save profile.')
      console.error(e)
    } finally {
      setSaving(false)
    }
  }

  function requestSaveProfile() {
    if (!name.trim()) {
      showDialog('Validation', 'Name cannot be empty.')
      return
    }

    setDialog({
      title: 'Update Profile',
      message: 'Save these profile changes?',
      actions: [
        { label: 'Cancel', onPress: closeDialog },
        {
          label: 'Save Changes',
          variant: 'primary',
          onPress: () => {
            closeDialog()
            handleSave().catch((e) => {
              console.error('Could not save profile', e)
            })
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
    <>
      <View style={styles.root}>
        <ScreenHeader
          title="Edit Profile"
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

        <View style={styles.card}>
          <View style={styles.fieldHeader}>
            <View style={styles.fieldIcon}>
              <MaterialCommunityIcons name="account-outline" size={18} color={theme.colors.accent} />
            </View>
            <Text style={styles.label}>Name</Text>
          </View>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="Enter your name"
            placeholderTextColor={theme.colors.textMuted}
            autoCorrect={false}
          />
        </View>

        <View style={styles.card}>
          <View style={styles.fieldHeader}>
            <View style={styles.fieldIcon}>
              <MaterialCommunityIcons name="human-male-height" size={18} color={theme.colors.accent} />
            </View>
            <Text style={styles.label}>Height</Text>
            <Text style={styles.unitPill}>{heightUnit}</Text>
          </View>
          <TextInput
            style={styles.input}
            value={height}
            onChangeText={setHeight}
            placeholder={`Enter your height in ${heightUnit}`}
            placeholderTextColor={theme.colors.textMuted}
            keyboardType="decimal-pad"
          />
        </View>

        <View style={styles.card}>
          <View style={styles.fieldHeader}>
            <View style={styles.fieldIcon}>
              <MaterialCommunityIcons name="scale-bathroom" size={18} color={theme.colors.accent} />
            </View>
            <Text style={styles.label}>Weight</Text>
            <Text style={styles.unitPill}>{weightUnit}</Text>
          </View>
          <TextInput
            style={styles.input}
            value={weight}
            onChangeText={setWeight}
            placeholder={`Enter your weight in ${weightUnit}`}
            placeholderTextColor={theme.colors.textMuted}
            keyboardType="decimal-pad"
          />
        </View>

        <View style={styles.formActions}>
          <TouchableOpacity
            style={[styles.saveButton, saving && styles.saveButtonDisabled]}
            onPress={requestSaveProfile}
            disabled={saving}
            activeOpacity={0.82}
          >
            <MaterialCommunityIcons
              name={saving ? 'progress-clock' : 'content-save-outline'}
              size={18}
              color="#FFFFFF"
            />
            <Text style={styles.saveButtonText}>
              {saving ? 'Saving...' : 'Save Changes'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.cancelButton}
            onPress={() => navigation.goBack()}
            activeOpacity={0.75}
          >
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>
        </View>
        </ScrollView>
      </View>
      <ThemedDialog
        visible={!!dialog}
        title={dialog?.title ?? ''}
        message={dialog?.message}
        actions={dialog?.actions ?? []}
      />
    </>
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
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 1.5,
    borderColor: theme.colors.textMuted + '35',
    padding: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
    gap: theme.spacing.sm,
  },
  fieldHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  fieldIcon: {
    width: 28,
    height: 28,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.accentMuted,
  },
  label: {
    flex: 1,
    color: theme.colors.text,
    fontSize: theme.fontSize.md,
    fontWeight: '800',
  },
  unitPill: {
    overflow: 'hidden',
    color: theme.colors.accent,
    fontSize: theme.fontSize.xs,
    fontWeight: '900',
    textTransform: 'uppercase',
    backgroundColor: theme.colors.accentMuted,
    borderRadius: theme.radius.full,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 3,
  },
  input: {
    backgroundColor: theme.colors.surface2,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
    color: theme.colors.text,
    fontSize: theme.fontSize.md,
    fontWeight: '700',
    minHeight: 42,
  },
  formActions: {
    gap: theme.spacing.sm,
    marginTop: theme.spacing.md,
  },
  saveButton: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.sm,
    backgroundColor: theme.colors.accent,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.28)',
  },
  saveButtonDisabled: {
    opacity: 0.5,
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: theme.fontSize.md,
    fontWeight: '900',
  },
  cancelButton: {
    minHeight: 46,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surface2,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButtonText: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.sm,
    fontWeight: '800',
  },
}))
