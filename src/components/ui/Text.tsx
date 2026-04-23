import React from 'react'
import { Text as RNText, TextProps } from 'react-native'
import { createStyleSheet, useStyles } from 'react-native-unistyles'

type SizeKey = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'xxl'

interface ThemedTextProps extends TextProps {
  size?: SizeKey
  muted?: boolean
  children: React.ReactNode
}

export default function Text({
  size = 'md',
  muted = false,
  style,
  children,
  ...rest
}: ThemedTextProps) {
  const { styles } = useStyles(stylesheet)
  return (
    <RNText
      style={[styles.base(size), muted && styles.muted, style]}
      {...rest}
    >
      {children}
    </RNText>
  )
}

const stylesheet = createStyleSheet((theme) => ({
  base: (size: SizeKey) => ({
    fontSize: theme.fontSize[size],
    color: theme.colors.text,
  }),
  muted: {
    color: theme.colors.textMuted,
  },
}))
