import React from 'react'
import { ScrollView, Text, View } from 'react-native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons'
import { createStyleSheet, useStyles } from 'react-native-unistyles'
import ScreenHeader, { useHeaderFade } from '@/components/ui/ScreenHeader'
import type { ProfileStackParamList } from '../navigation/TabNavigator'

type Props = NativeStackScreenProps<ProfileStackParamList, 'Schedule'>

export default function ScheduleScreen({ navigation }: Props) {
  const { styles, theme } = useStyles(stylesheet)
  const { showHeaderFade, handleHeaderScroll } = useHeaderFade()

  return (
    <View style={styles.container}>
      <ScreenHeader
        title="Schedule"
        onBack={() => navigation.goBack()}
        showFade={showHeaderFade}
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        onScroll={handleHeaderScroll}
        scrollEventThrottle={16}
      >
        <View style={styles.placeholderCard}>
          <View style={styles.iconBadge}>
            <MaterialCommunityIcons
              name="calendar-clock"
              size={30}
              color={theme.colors.text}
            />
          </View>
          <Text style={styles.cardTitle}>Workout scheduling is coming soon.</Text>
          <Text style={styles.cardDescription}>
            This page will eventually help you plan workout days, reminders, and recurring routines.
          </Text>
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
  placeholderCard: {
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.xl,
    gap: theme.spacing.md,
  },
  iconBadge: {
    width: 68,
    height: 68,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surface2,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  cardTitle: {
    color: theme.colors.text,
    fontSize: theme.fontSize.lg,
    fontFamily: theme.fontFamily.bold,
    textAlign: 'center',
  },
  cardDescription: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.sm,
    lineHeight: 21,
    textAlign: 'center',
  },
}))
