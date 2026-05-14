import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, ScrollView, Text, TouchableOpacity, View } from 'react-native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons'
import { createStyleSheet, useStyles } from 'react-native-unistyles'
import ScreenHeader, { useHeaderFade } from '@/components/ui/ScreenHeader'
import {
  getWorkoutTemplates,
  type WorkoutTemplateSummary,
} from '@/db/workoutHelpers'
import {
  getWeeklyWorkoutSchedule,
  setScheduledTemplateForWeekday,
  WEEKDAYS,
  type WeekdayKey,
  type WeeklyWorkoutSchedule,
} from '@/services/workoutSchedule'
import type { ProfileStackParamList } from '../navigation/TabNavigator'

type Props = NativeStackScreenProps<ProfileStackParamList, 'Schedule'>

export default function ScheduleScreen({ navigation }: Props) {
  const { styles, theme } = useStyles(stylesheet)
  const { showHeaderFade, handleHeaderScroll } = useHeaderFade()
  const [templates, setTemplates] = useState<WorkoutTemplateSummary[]>([])
  const [schedule, setSchedule] = useState<WeeklyWorkoutSchedule>(
    getWeeklyWorkoutSchedule,
  )
  const [loading, setLoading] = useState(true)

  const templateById = useMemo(
    () => new Map(templates.map((template) => [template.id, template])),
    [templates],
  )

  const loadTemplates = useCallback(async () => {
    setLoading(true)
    try {
      setTemplates(await getWorkoutTemplates())
      setSchedule(getWeeklyWorkoutSchedule())
    } catch (e) {
      console.error('Could not load schedule templates', e)
      setTemplates([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadTemplates().catch(console.error)
  }, [loadTemplates])

  function chooseTemplate(dayKey: WeekdayKey, templateId: string | null) {
    setSchedule(setScheduledTemplateForWeekday(dayKey, templateId))
  }

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
        <View style={styles.summaryCard}>
          <View style={styles.summaryIcon}>
            <MaterialCommunityIcons
              name="calendar-clock"
              size={20}
              color={theme.colors.accent}
            />
          </View>
          <View style={styles.summaryText}>
            <Text style={styles.summaryTitle}>Weekly plan</Text>
            <Text style={styles.summaryDescription}>
              Pick one template for each day, or leave it as a rest day.
            </Text>
          </View>
        </View>

        {loading ? (
          <View style={styles.loadingCard}>
            <ActivityIndicator color={theme.colors.accent} />
          </View>
        ) : templates.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No templates yet</Text>
            <Text style={styles.emptyText}>
              Create a template first, then come back to build a weekly plan.
            </Text>
          </View>
        ) : (
          WEEKDAYS.map((day) => {
            const selectedTemplateId = schedule[day.key]
            const selectedTemplate = selectedTemplateId
              ? templateById.get(selectedTemplateId)
              : null

            return (
              <View key={day.key} style={styles.dayCard}>
                <View style={styles.dayHeader}>
                  <View style={styles.dayBadge}>
                    <Text style={styles.dayBadgeText}>{day.shortLabel}</Text>
                  </View>
                  <View style={styles.dayTextBlock}>
                    <Text style={styles.dayTitle}>{day.label}</Text>
                    <Text style={styles.daySubtitle} numberOfLines={1}>
                      {selectedTemplate ? selectedTemplate.name : 'Rest day'}
                    </Text>
                  </View>
                </View>

                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.templateChips}
                >
                  <TouchableOpacity
                    style={[
                      styles.templateChip,
                      !selectedTemplateId && styles.templateChipActive,
                    ]}
                    onPress={() => chooseTemplate(day.key, null)}
                    activeOpacity={0.78}
                  >
                    <Text
                      style={[
                        styles.templateChipText,
                        !selectedTemplateId && styles.templateChipTextActive,
                      ]}
                    >
                      Rest
                    </Text>
                  </TouchableOpacity>
                  {templates.map((template) => {
                    const selected = selectedTemplateId === template.id
                    return (
                      <TouchableOpacity
                        key={template.id}
                        style={[
                          styles.templateChip,
                          selected && styles.templateChipActive,
                        ]}
                        onPress={() => chooseTemplate(day.key, template.id)}
                        activeOpacity={0.78}
                      >
                        <Text
                          style={[
                            styles.templateChipText,
                            selected && styles.templateChipTextActive,
                          ]}
                          numberOfLines={1}
                        >
                          {template.name}
                        </Text>
                      </TouchableOpacity>
                    )
                  })}
                </ScrollView>
              </View>
            )
          })
        )}
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
    gap: theme.spacing.sm,
  },
  summaryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  summaryIcon: {
    width: 38,
    height: 38,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.accentMuted,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  summaryText: {
    flex: 1,
    minWidth: 0,
  },
  summaryTitle: {
    color: theme.colors.text,
    fontSize: theme.fontSize.md,
    fontFamily: theme.fontFamily.extraBold,
  },
  summaryDescription: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.medium,
    lineHeight: 19,
    marginTop: 2,
  },
  loadingCard: {
    minHeight: 120,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  emptyCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.md,
    gap: theme.spacing.xs,
  },
  emptyTitle: {
    color: theme.colors.text,
    fontSize: theme.fontSize.md,
    fontFamily: theme.fontFamily.extraBold,
  },
  emptyText: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.medium,
    lineHeight: 19,
  },
  dayCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.sm,
    gap: theme.spacing.sm,
  },
  dayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  dayBadge: {
    width: 42,
    height: 34,
    borderRadius: theme.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.accentMuted,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  dayBadgeText: {
    color: theme.colors.accent,
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.black,
  },
  dayTextBlock: {
    flex: 1,
    minWidth: 0,
  },
  dayTitle: {
    color: theme.colors.text,
    fontSize: theme.fontSize.md,
    fontFamily: theme.fontFamily.extraBold,
  },
  daySubtitle: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
    fontFamily: theme.fontFamily.semiBold,
    marginTop: 1,
  },
  templateChips: {
    gap: theme.spacing.xs,
    paddingRight: theme.spacing.md,
  },
  templateChip: {
    minHeight: 34,
    maxWidth: 180,
    borderRadius: theme.radius.full,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.md,
  },
  templateChipActive: {
    backgroundColor: theme.colors.accentMuted,
    borderColor: theme.colors.accent,
  },
  templateChipText: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.extraBold,
  },
  templateChipTextActive: {
    color: theme.colors.accent,
  },
}))
