import React from 'react'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { createStyleSheet, useStyles } from 'react-native-unistyles'
import RootNavigator from './src/navigation/RootNavigator'

const stylesheet = createStyleSheet(() => ({}))

export default function App() {
  const { theme } = useStyles(stylesheet)

  return (
    <GestureHandlerRootView
      style={{
        flex: 1,
        backgroundColor: theme.colors.bg,
      }}
    >
      <SafeAreaProvider>
        <RootNavigator />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  )
}
