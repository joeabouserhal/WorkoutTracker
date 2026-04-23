import React from 'react'
import {
  Pressable,
  StyleProp,
  Text,
  ViewStyle,
} from 'react-native'
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
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
        scale.value = withSpring(0.96, { damping: 15, stiffness: 300 })
      }}
      onPressOut={() => {
        scale.value = withSpring(1, { damping: 15, stiffness: 300 })
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
    // Add subtle shadow for depth
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    variants: {
      variant: {
        filled: {
          backgroundColor: theme.colors.accent,
          // Add visible border with white highlight
          borderWidth: 1.5,
          borderColor: 'rgba(255, 255, 255, 0.3)',
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
    fontWeight: '600' as const,
    variants: {
      variant: {
        filled: {
          color: '#FFFFFF',
        },
        ghost: {
          color: theme.colors.accent,
        },
      },
    },
  },
}))
