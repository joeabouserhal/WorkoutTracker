import React from 'react'
import {
  Pressable,
  StyleProp,
  Text,
  ViewStyle,
} from 'react-native'
import Animated, {
  Easing as ReanimatedEasing,
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated'
import { createStyleSheet, useStyles } from 'react-native-unistyles'

interface ButtonProps {
  label: string
  onPress: () => void
  variant?: 'filled' | 'ghost'
  style?: StyleProp<ViewStyle>
}

export default function Button({
  label,
  onPress,
  variant = 'filled',
  style,
}: ButtonProps) {
  const { styles } = useStyles(stylesheet, { variant })
  const scale = useSharedValue(1)

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }))

  return (
    <Pressable
      onPressIn={() => {
        scale.value = withTiming(0.97, {
          duration: 70,
          easing: ReanimatedEasing.out(ReanimatedEasing.quad),
        })
      }}
      onPressOut={() => {
        scale.value = withTiming(1, {
          duration: 105,
          easing: ReanimatedEasing.out(ReanimatedEasing.cubic),
        })
      }}
      onPress={onPress}
    >
      <Animated.View style={[styles.button, animatedStyle, style]}>
        <Text style={styles.label}>{label}</Text>
      </Animated.View>
    </Pressable>
  )
}

const stylesheet = createStyleSheet((theme) => ({
  button: {
    borderRadius: theme.radius.md,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    shadowColor: theme.colors.bg,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    variants: {
      variant: {
        filled: {
          backgroundColor: theme.colors.accent,
          borderWidth: 1.5,
          borderColor: theme.colors.accentMuted,
        },
        ghost: {
          backgroundColor: 'transparent',
          borderWidth: 2,
          borderColor: theme.colors.accent,
        },
      },
    },
  },
  label: {
    fontSize: theme.fontSize.md,
    fontFamily: theme.fontFamily.semiBold,
    variants: {
      variant: {
        filled: {
          color: theme.colors.bg,
        },
        ghost: {
          color: theme.colors.accent,
        },
      },
    },
  },
}))
