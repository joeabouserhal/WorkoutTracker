import React, { useEffect, useState } from 'react'
import { StatusBar, View } from 'react-native'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { createStyleSheet, useStyles } from 'react-native-unistyles'
import RootNavigator from './src/navigation/RootNavigator'
import SplashScreen from './src/components/SplashScreen'
import { seedDatabaseIfEmpty } from './src/db/seedData'
import { restoreActiveWorkoutSession } from './src/services/activeWorkoutRecovery'
import { configureAppFonts } from './src/theme/fontBootstrap'

configureAppFonts()

const stylesheet = createStyleSheet((theme) => ({
  bootBackground: {
    flex: 1,
    backgroundColor: theme.colors.bg,
  },
  root: {
    flex: 1,
    backgroundColor: theme.colors.bg,
  },
}))

export default function App() {
  const { styles, theme } = useStyles(stylesheet)
  const [bootstrapped, setBootstrapped] = useState(false)
  const [showSplash, setShowSplash] = useState(true)

  useEffect(() => {
    async function bootstrapApp() {
      try {
        await seedDatabaseIfEmpty()
        await restoreActiveWorkoutSession()
      } catch (e) {
        console.error(e)
      } finally {
        setBootstrapped(true)
      }
    }

    bootstrapApp()
  }, [])

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <StatusBar backgroundColor={theme.colors.bg} barStyle="light-content" />
        {bootstrapped ? (
          <RootNavigator />
        ) : (
          <View style={styles.bootBackground} />
        )}
        {showSplash ? (
          <SplashScreen
            ready={bootstrapped}
            onFinished={() => setShowSplash(false)}
          />
        ) : null}
      </SafeAreaProvider>
    </GestureHandlerRootView>
  )
}
