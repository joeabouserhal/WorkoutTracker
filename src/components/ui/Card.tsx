import React from 'react'
import { View, ViewProps } from 'react-native'
import { createStyleSheet, useStyles } from 'react-native-unistyles'

interface CardProps extends ViewProps {
  variant?: 'default' | 'elevated'
  children: React.ReactNode
}

export default function Card({
  variant = 'default',
  style,
  children,
  ...rest
}: CardProps) {
  const { styles } = useStyles(
    stylesheet,
    variant === 'elevated' ? { variant: 'elevated' } : undefined
  )
  return (
    <View style={[styles.card, style]} {...rest}>
      {children}
    </View>
  )
}

const stylesheet = createStyleSheet((theme) => ({
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 0.5,
    borderColor: theme.colors.border,
    padding: theme.spacing.md,
    variants: {
      variant: {
        elevated: {
          backgroundColor: theme.colors.surface2,
        },
      },
    },
  },
}))
