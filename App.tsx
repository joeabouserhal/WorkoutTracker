import React, { useEffect, useState } from 'react'
import { ActivityIndicator, View } from 'react-native'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { createStyleSheet, useStyles } from 'react-native-unistyles'
import RootNavigator from './src/navigation/RootNavigator'
import { seedDatabaseIfEmpty } from './src/db/seedData'

const stylesheet = createStyleSheet(() => ({}))

export default function App() {
  const { theme } = useStyles(stylesheet)
  const [seeded, setSeeded] = useState(false)

  useEffect(() => {
    seedDatabaseIfEmpty()
      .catch(console.error)
      .finally(() => setSeeded(true))
  }, [])

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <SafeAreaProvider>
        {seeded ? (
          <RootNavigator />
        ) : (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.bg }}>
            <ActivityIndicator color={theme.colors.accent} size="large" />
          </View>
        )}
      </SafeAreaProvider>
    </GestureHandlerRootView>
  )
}
