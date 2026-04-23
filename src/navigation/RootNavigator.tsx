import '../theme/unistyles'
import React from 'react'
import { NavigationContainer, DefaultTheme } from '@react-navigation/native'
import { createStyleSheet, useStyles } from 'react-native-unistyles'
import TabNavigator from './TabNavigator'

const stylesheet = createStyleSheet(() => ({}))

export default function RootNavigator() {
  const { theme } = useStyles(stylesheet)

  const navTheme: typeof DefaultTheme = {
    ...DefaultTheme,
    dark: true,
    colors: {
      ...DefaultTheme.colors,
      background: theme.colors.bg,
      card: theme.colors.surface,
      text: theme.colors.text,
      border: theme.colors.border,
      notification: theme.colors.accent,
      primary: theme.colors.accent,
    },
  }

  return (
    <NavigationContainer theme={navTheme}>
      <TabNavigator />
    </NavigationContainer>
  )
}
