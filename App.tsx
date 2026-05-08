import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { createStyleSheet, useStyles } from 'react-native-unistyles';
import RootNavigator from './src/navigation/RootNavigator';
import SplashScreen from './src/components/SplashScreen';
import { seedDatabaseIfEmpty } from './src/db/seedData';
import { restoreActiveWorkoutSession } from './src/services/activeWorkoutRecovery';
import { configureAppFonts } from './src/theme/fontBootstrap';
import { KeyboardProvider } from 'react-native-keyboard-controller';

configureAppFonts();

const stylesheet = createStyleSheet(theme => ({
  bootBackground: {
    flex: 1,
    backgroundColor: theme.colors.bg,
  },
  root: {
    flex: 1,
    backgroundColor: theme.colors.bg,
  },
}));

export default function App() {
  const { styles } = useStyles(stylesheet);
  const [bootstrapped, setBootstrapped] = useState(false);
  const [showSplash, setShowSplash] = useState(true);

  useEffect(() => {
    async function bootstrapApp() {
      try {
        await seedDatabaseIfEmpty();
        await restoreActiveWorkoutSession();
      } catch (e) {
        console.error(e);
      } finally {
        setBootstrapped(true);
      }
    }

    bootstrapApp();
  }, []);

  return (
    <GestureHandlerRootView style={styles.root}>
      <KeyboardProvider statusBarTranslucent navigationBarTranslucent>
        <SafeAreaProvider>
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
      </KeyboardProvider>
    </GestureHandlerRootView>
  );
}
