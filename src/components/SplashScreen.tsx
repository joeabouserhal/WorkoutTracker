import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, View } from 'react-native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { createStyleSheet, useStyles } from 'react-native-unistyles';

const LOGO_COLOR = '#FFFFFF';
const MINIMUM_SPLASH_MS = 650;

type Props = {
  ready: boolean;
  onFinished: () => void;
};

const stylesheet = createStyleSheet(theme => ({
  container: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: theme.colors.surface,
    elevation: 1000,
    zIndex: 1000,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoWrap: {
    width: 132,
    height: 132,
    alignItems: 'center',
    justifyContent: 'center',
  },
}));

export default function SplashScreen({ ready, onFinished }: Props) {
  const { styles } = useStyles(stylesheet);
  const [minimumElapsed, setMinimumElapsed] = useState(false);
  const logoScale = useRef(new Animated.Value(0.9)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const overlayOpacity = useRef(new Animated.Value(1)).current;
  const finishedRef = useRef(false);

  useEffect(() => {
    const timer = setTimeout(() => setMinimumElapsed(true), MINIMUM_SPLASH_MS);
    Animated.parallel([
      Animated.spring(logoScale, {
        toValue: 1,
        damping: 12,
        stiffness: 150,
        mass: 0.82,
        useNativeDriver: true,
      }),
      Animated.timing(logoOpacity, {
        toValue: 1,
        duration: 220,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();

    return () => clearTimeout(timer);
  }, [logoOpacity, logoScale]);

  useEffect(() => {
    if (!ready || !minimumElapsed || finishedRef.current) return;

    finishedRef.current = true;
    Animated.sequence([
      Animated.delay(80),
      Animated.parallel([
        Animated.spring(logoScale, {
          toValue: 18,
          damping: 18,
          stiffness: 105,
          mass: 0.62,
          useNativeDriver: true,
        }),
        Animated.timing(logoOpacity, {
          toValue: 0,
          duration: 360,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(overlayOpacity, {
          toValue: 0,
          duration: 520,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
    ]).start(({ finished }) => {
      if (finished) onFinished();
    });
  }, [
    logoOpacity,
    logoScale,
    minimumElapsed,
    onFinished,
    overlayOpacity,
    ready,
  ]);

  return (
    <Animated.View
      pointerEvents="auto"
      style={[styles.container, { opacity: overlayOpacity }]}
    >
      <View style={styles.center}>
        <Animated.View
          style={[
            styles.logoWrap,
            {
              opacity: logoOpacity,
              transform: [{ scale: logoScale }],
            },
          ]}
        >
          <MaterialCommunityIcons
            name="dumbbell"
            size={84}
            color={LOGO_COLOR}
          />
        </Animated.View>
      </View>
    </Animated.View>
  );
}
