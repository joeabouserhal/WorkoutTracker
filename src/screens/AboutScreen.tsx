import React from 'react'
import { Linking, ScrollView, Text, TouchableOpacity, View } from 'react-native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons'
import { createStyleSheet, useStyles } from 'react-native-unistyles'
import type { ProfileStackParamList } from '../navigation/TabNavigator'

const GITHUB_URL = 'https://github.com/joeabouserhal/WorkoutTracker'

type Props = NativeStackScreenProps<ProfileStackParamList, 'About'>

export default function AboutScreen({ navigation }: Props) {
  const { styles, theme } = useStyles(stylesheet)

  function openGithub() {
    Linking.openURL(GITHUB_URL).catch((error) => {
      console.error('Failed to open GitHub link', error)
    })
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.headerRow}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          activeOpacity={0.75}
        >
          <MaterialCommunityIcons name="chevron-left" size={17} color={theme.colors.text} />
          <Text style={styles.backButtonText}>Back</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.sectionTitle}>About</Text>

      <View style={styles.aboutCard}>
        <View style={styles.logoMark}>
          <MaterialCommunityIcons
            name="dumbbell"
            size={38}
            color={theme.colors.text}
          />
        </View>
        <Text style={styles.appName}>Workout Tracker</Text>
        <Text style={styles.description}>
          Built with love and the need for an open-source workout app with features usually found only in premium apps. ❤️
        </Text>
        <Text style={styles.signature}>~ Joe Abou Serhal</Text>
      </View>

      <TouchableOpacity
        style={styles.githubButton}
        onPress={openGithub}
        activeOpacity={0.75}
      >
        <MaterialCommunityIcons name="github" size={20} color={theme.colors.text} />
        <Text style={styles.githubButtonText}>GitHub</Text>
        <MaterialCommunityIcons name="open-in-new" size={17} color={theme.colors.textMuted} />
      </TouchableOpacity>
    </ScrollView>
  )
}

const stylesheet = createStyleSheet((theme) => ({
  container: {
    flex: 1,
    backgroundColor: theme.colors.bg,
  },
  content: {
    flexGrow: 1,
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
  aboutCard: {
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.xl,
    gap: theme.spacing.md,
  },
  logoMark: {
    width: 82,
    height: 82,
    borderRadius: 41,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surface2,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  appName: {
    color: theme.colors.text,
    fontSize: theme.fontSize.xl,
    fontWeight: '800',
    textAlign: 'center',
  },
  description: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.md,
    lineHeight: 23,
    textAlign: 'center',
  },
  signature: {
    alignSelf: 'flex-end',
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.md,
    fontStyle: 'italic',
    fontWeight: '300',
    letterSpacing: 0.6,
    marginTop: theme.spacing.sm,
    opacity: 0.9,
  },
  githubButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.sm,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.full,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    marginTop: 'auto',
  },
  githubButtonText: {
    color: theme.colors.text,
    fontSize: theme.fontSize.md,
    fontWeight: '700',
  },
}))
