import React, { useState } from 'react'
import { ScrollView, Text, TouchableOpacity, View } from 'react-native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import {
  createStyleSheet,
  UnistylesRuntime,
  useStyles,
} from 'react-native-unistyles'
import ScreenHeader, { useHeaderFade } from '@/components/ui/ScreenHeader'
import { setString } from '@/storage/mmkv'
import {
  darkTheme,
  oledTheme,
  draculaTheme,
  oneDarkTheme,
  nordTheme,
  catppuccinTheme,
  tokyoNightTheme,
  gruvboxTheme,
  solarizedTheme,
} from '../theme/themes'
import type { ProfileStackParamList } from '../navigation/TabNavigator'

const THEME_STORAGE_KEY = 'app_theme'

type ThemeKey =
  | 'dark'
  | 'oled'
  | 'dracula'
  | 'oneDark'
  | 'nord'
  | 'catppuccin'
  | 'tokyoNight'
  | 'gruvbox'
  | 'solarized'

const themeAccents = {
  dark: darkTheme.colors.accent,
  oled: oledTheme.colors.accent,
  dracula: draculaTheme.colors.accent,
  oneDark: oneDarkTheme.colors.accent,
  nord: nordTheme.colors.accent,
  catppuccin: catppuccinTheme.colors.accent,
  tokyoNight: tokyoNightTheme.colors.accent,
  gruvbox: gruvboxTheme.colors.accent,
  solarized: solarizedTheme.colors.accent,
}

const THEMES: { key: ThemeKey; label: string; accent: string }[] = [
  { key: 'dark', label: 'Dark', accent: themeAccents.dark },
  { key: 'oled', label: 'OLED Black', accent: themeAccents.oled },
  { key: 'dracula', label: 'Dracula', accent: themeAccents.dracula },
  { key: 'oneDark', label: 'One Dark', accent: themeAccents.oneDark },
  { key: 'nord', label: 'Nord', accent: themeAccents.nord },
  { key: 'catppuccin', label: 'Catppuccin', accent: themeAccents.catppuccin },
  { key: 'tokyoNight', label: 'Tokyo Night', accent: themeAccents.tokyoNight },
  { key: 'gruvbox', label: 'Gruvbox', accent: themeAccents.gruvbox },
  { key: 'solarized', label: 'Solarized', accent: themeAccents.solarized },
]


type Props = NativeStackScreenProps<ProfileStackParamList, 'Themes'>

export default function ThemesScreen({ navigation }: Props) {
  const { styles, theme } = useStyles(stylesheet)
  const { showHeaderFade, handleHeaderScroll } = useHeaderFade()
  const [activeTheme, setActiveTheme] = useState<ThemeKey>(
    (UnistylesRuntime.themeName as ThemeKey) ?? 'dark'
  )

  function handleThemeChange(themeKey: ThemeKey) {
    UnistylesRuntime.setTheme(themeKey as never)
    setString(THEME_STORAGE_KEY, themeKey)
    setActiveTheme(themeKey)
  }

  return (
    <View style={styles.container}>
      <ScreenHeader
        title="Themes"
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
      <Text style={styles.sectionDescription}>Pick a theme and the app updates instantly.</Text>

      <View style={styles.themeList}>
        {THEMES.map((item) => {
          const isActive = activeTheme === item.key

          return (
            <TouchableOpacity
              key={item.key}
              style={[
                styles.themeRow,
                isActive && styles.themeRowActive,
                {
                  borderColor: isActive
                    ? item.accent
                    : theme.colors.border,
                },
              ]}
              onPress={() => handleThemeChange(item.key)}
            >
              <View style={styles.themeRowLeft}>
                <View
                  style={[
                    styles.themeAccentDot,
                    { backgroundColor: item.accent },
                  ]}
                />
                <Text
                  style={[
                    styles.themeLabel,
                    isActive && { color: item.accent },
                  ]}
                >
                  {item.label}
                </Text>
              </View>

              <Text
                style={[
                  styles.themeStatus,
                  isActive && { color: item.accent },
                ]}
              >
                {isActive ? 'Active' : 'Select'}
              </Text>
            </TouchableOpacity>
          )
        })}
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
  sectionDescription: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.sm,
    marginBottom: theme.spacing.lg,
  },
  themeList: {
    gap: theme.spacing.sm,
  },
  themeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
  },
  themeRowActive: {
    backgroundColor: theme.colors.surface2,
  },
  themeRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  themeAccentDot: {
    width: 10,
    height: 10,
    borderRadius: theme.radius.full,
  },
  themeLabel: {
    color: theme.colors.text,
    fontSize: theme.fontSize.md,
    fontFamily: theme.fontFamily.semiBold,
  },
  themeStatus: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.semiBold,
  },
}))
