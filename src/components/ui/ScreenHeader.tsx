import React, { ReactNode, useCallback, useMemo, useState } from 'react'
import {
  NativeScrollEvent,
  NativeSyntheticEvent,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native'
import { Canvas, LinearGradient, Rect, vec } from '@shopify/react-native-skia'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons'
import { createStyleSheet, useStyles } from 'react-native-unistyles'

type ScreenHeaderProps = {
  title: string
  eyebrow?: string
  showFade?: boolean
  onBack?: () => void
  backLabel?: string
  rightContent?: ReactNode
  titleLeft?: ReactNode
  titleRight?: ReactNode
  beforeTitle?: ReactNode
  afterTitle?: ReactNode
}

type ScreenHeaderButtonProps = {
  label: string
  iconName?: string
  onPress: () => void
}

export function useHeaderFade() {
  const [showHeaderFade, setShowHeaderFade] = useState(false)

  const handleHeaderScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const shouldShowFade = event.nativeEvent.contentOffset.y > 4
      setShowHeaderFade((prev) => (prev === shouldShowFade ? prev : shouldShowFade))
    },
    [],
  )

  return { showHeaderFade, handleHeaderScroll }
}

export function ScreenHeaderButton({
  label,
  iconName,
  onPress,
}: ScreenHeaderButtonProps) {
  const { styles, theme } = useStyles(stylesheet)

  return (
    <TouchableOpacity
      style={styles.headerButton}
      onPress={onPress}
      activeOpacity={0.75}
    >
      {iconName ? (
        <MaterialCommunityIcons name={iconName} size={17} color={theme.colors.text} />
      ) : null}
      <Text style={styles.headerButtonText}>{label}</Text>
    </TouchableOpacity>
  )
}

function HeaderFade() {
  const { styles, theme } = useStyles(stylesheet)
  const { width } = useWindowDimensions()

  return (
    <View pointerEvents="none" style={styles.headerFade}>
      <Canvas style={styles.headerFadeCanvas}>
        <Rect x={0} y={0} width={width} height={44}>
          <LinearGradient
            start={vec(0, 0)}
            end={vec(0, 44)}
            colors={[theme.colors.bg, theme.colors.bg + '00']}
          />
        </Rect>
      </Canvas>
    </View>
  )
}

export default function ScreenHeader({
  title,
  eyebrow,
  showFade = false,
  onBack,
  backLabel = 'Back',
  rightContent,
  titleLeft,
  titleRight,
  beforeTitle,
  afterTitle,
}: ScreenHeaderProps) {
  const { styles, theme } = useStyles(stylesheet)
  const insets = useSafeAreaInsets()
  const headerStyle = useMemo(
    () => [styles.header, { paddingTop: insets.top + theme.spacing.md }],
    [insets.top, styles.header, theme.spacing.md],
  )
  const hasTopRow = Boolean(onBack || rightContent)

  return (
    <View style={headerStyle}>
      {hasTopRow ? (
        <View style={styles.topRow}>
          {onBack ? (
            <TouchableOpacity
              style={styles.headerButton}
              onPress={onBack}
              activeOpacity={0.75}
            >
              <MaterialCommunityIcons name="chevron-left" size={17} color={theme.colors.text} />
              <Text style={styles.headerButtonText}>{backLabel}</Text>
            </TouchableOpacity>
          ) : null}
          <View style={styles.topRowSpacer} />
          {rightContent}
        </View>
      ) : null}

      {beforeTitle}

      <View style={styles.titleRow}>
        {titleLeft}
        <View style={styles.titleTextBlock}>
          {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
          <Text style={styles.title} numberOfLines={2}>
            {title}
          </Text>
        </View>
        {titleRight}
      </View>

      {afterTitle}
      {showFade ? <HeaderFade /> : null}
    </View>
  )
}

const stylesheet = createStyleSheet((theme) => ({
  header: {
    paddingHorizontal: theme.spacing.md,
    paddingBottom: theme.spacing.xs,
    backgroundColor: theme.colors.bg,
    zIndex: 2,
    elevation: 2,
    overflow: 'visible',
    gap: theme.spacing.sm,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  topRowSpacer: {
    flex: 1,
  },
  headerButton: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.full,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.md,
  },
  headerButtonText: {
    color: theme.colors.text,
    fontSize: theme.fontSize.sm,
    fontWeight: '600',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.md,
  },
  titleTextBlock: {
    flex: 1,
    minWidth: 0,
  },
  eyebrow: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: theme.spacing.xs,
  },
  title: {
    color: theme.colors.text,
    fontSize: theme.fontSize.xxl,
    fontWeight: '800',
  },
  headerFade: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: -44,
    height: 44,
  },
  headerFadeCanvas: {
    flex: 1,
  },
}))
