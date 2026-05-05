import React from 'react'
import { Linking, ScrollView, Text, TouchableOpacity, View } from 'react-native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons'
import { createStyleSheet, useStyles } from 'react-native-unistyles'
import ScreenHeader, { useHeaderFade } from '@/components/ui/ScreenHeader'
import type { ProfileStackParamList } from '../navigation/TabNavigator'

const GITHUB_URL = 'https://github.com/joeabouserhal/WorkoutTracker'

type Props = NativeStackScreenProps<ProfileStackParamList, 'About'>

export default function AboutScreen({ navigation }: Props) {
  const { styles, theme } = useStyles(stylesheet)
  const { showHeaderFade, handleHeaderScroll } = useHeaderFade()

  function openGithub() {
    Linking.openURL(GITHUB_URL).catch((error) => {
      console.error('Failed to open GitHub link', error)
    })
  }

  return (
    <View style={styles.container}>
      <ScreenHeader
        title="About"
        onBack={() => navigation.goBack()}
        showFade={showHeaderFade}
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        onScroll={handleHeaderScroll}
        scrollEventThrottle={16}
      >

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
    flexGrow: 1,
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.md,
    paddingBottom: theme.spacing.xl,
  },
  aboutCard: {
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.xl,
    gap: theme.spacing.md,
  },
  logoMark: {
    width: 82,
    height: 82,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surface2,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  appName: {
    color: theme.colors.text,
    fontSize: theme.fontSize.xl,
    fontFamily: theme.fontFamily.extraBold,
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
    fontFamily: theme.fontFamily.light,
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
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    marginTop: 'auto',
  },
  githubButtonText: {
    color: theme.colors.text,
    fontSize: theme.fontSize.md,
    fontFamily: theme.fontFamily.bold,
  },
}))
