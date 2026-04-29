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
import { getProfile, upsertProfile } from '@/db/profileHelpers'
import { logBodyWeight } from '@/db/bodyWeightHelpers'
import type { ProfileStackParamList } from '../navigation/TabNavigator'
import ThemedDialog, { type ThemedDialogAction } from '@/components/ui/ThemedDialog'

type Props = NativeStackScreenProps<ProfileStackParamList, 'EditProfile'>

export default function EditProfileScreen({ navigation }: Props) {
  const { styles, theme } = useStyles(stylesheet)
  const [name, setName] = useState('')
  const [weight, setWeight] = useState('')
  const [height, setHeight] = useState('')
  const [weightUnit, setWeightUnit] = useState<'kg' | 'lb'>('kg')
  const [heightUnit, setHeightUnit] = useState<'cm' | 'ft'>('cm')
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
          setName(p.name || '')
          setWeightUnit((p.defaultWeightUnit === 'lb' ? 'lb' : 'kg') as 'kg' | 'lb')
          setHeightUnit((p.heightUnit === 'ft' ? 'ft' : 'cm') as 'cm' | 'ft')

          // Convert stored values (always in kg/cm) to display units
          if (p.weight) {
            const displayWeight = p.defaultWeightUnit === 'lb'
              ? (p.weight * 2.20462).toFixed(1) // kg to lb
              : p.weight.toString()
            setWeight(displayWeight)
          }

          if (p.height) {
            const displayHeight = p.heightUnit === 'ft'
              ? (p.height / 30.48).toFixed(2) // cm to ft
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
        ? heightNum * 30.48 // ft to cm
        : heightNum

      const storedWeight = weightNum && weightUnit === 'lb'
        ? weightNum / 2.20462 // lb to kg
        : weightNum

      await upsertProfile({
        name: name.trim(),
        height: storedHeight,
      })

      if (storedWeight !== undefined) {
        await logBodyWeight(storedWeight)
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
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.headerRow}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
          >
            <MaterialCommunityIcons name="chevron-left" size={17} color={theme.colors.text} />
            <Text style={styles.backButtonText}>Back</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.sectionTitle}>Edit Profile</Text>

        <View style={styles.card}>
          <Text style={styles.label}>Name</Text>
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
          <Text style={styles.label}>Height ({heightUnit})</Text>
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
          <Text style={styles.label}>Weight ({weightUnit})</Text>
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
          >
            <Text style={styles.saveButtonText}>
              {saving ? 'Saving...' : 'Save Changes'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.cancelButton}
            onPress={() => navigation.goBack()}
          >
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
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
    marginBottom: theme.spacing.lg,
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 0.5,
    borderColor: theme.colors.border,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  label: {
    color: theme.colors.text,
    fontSize: theme.fontSize.sm,
    fontWeight: '500',
  },
  input: {
    backgroundColor: theme.colors.surface2,
    borderRadius: theme.radius.md,
    borderWidth: 0.5,
    borderColor: theme.colors.border,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    color: theme.colors.text,
    fontSize: theme.fontSize.md,
  },
  formActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.lg,
  },
  saveButton: {
    flex: 1,
    backgroundColor: theme.colors.accent,
    borderRadius: theme.radius.md,
    paddingVertical: theme.spacing.md,
    alignItems: 'center',
    // Add subtle shadow and border for depth
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 4,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  saveButtonDisabled: {
    opacity: 0.5,
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: theme.fontSize.sm,
    fontWeight: '600',
  },
  cancelButton: {
    flex: 1,
    paddingVertical: theme.spacing.md,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surface2,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center',
    // Add subtle shadow for consistency
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  cancelButtonText: {
    color: theme.colors.text,
    fontSize: theme.fontSize.sm,
    fontWeight: '600',
  },
}))
