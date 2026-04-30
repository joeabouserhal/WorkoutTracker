import React from 'react'
import { Modal, Text, TouchableOpacity, View } from 'react-native'
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons'
import { createStyleSheet, useStyles } from 'react-native-unistyles'

export type ThemedDialogAction = {
  label: string
  onPress: () => void
  variant?: 'default' | 'primary' | 'danger'
}

type Props = {
  visible: boolean
  title: string
  message?: string
  actions: ThemedDialogAction[]
}

export default function ThemedDialog({ visible, title, message, actions }: Props) {
  const { styles, theme } = useStyles(stylesheet)
  const isDanger = actions.some((action) => action.variant === 'danger') ||
    /wrong|error|delete|discard|validation/i.test(title)
  const isSuccess = /updated|saved|success/i.test(title)
  const iconName = isDanger
    ? 'alert-circle-outline'
    : isSuccess
      ? 'check-circle-outline'
      : 'information-outline'
  const iconColor = isDanger ? theme.colors.danger : theme.colors.accent

  if (!visible) return null

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent>
      <View style={styles.overlay}>
        <View style={styles.dialog}>
          <View style={styles.header}>
            <View style={styles.iconBadge}>
              <MaterialCommunityIcons name={iconName} size={22} color={iconColor} />
            </View>
            <View style={styles.titleBlock}>
              <Text style={styles.title}>{title}</Text>
              {message ? <Text style={styles.message}>{message}</Text> : null}
            </View>
          </View>
          <View style={styles.actions}>
            {actions.map((action) => (
              <TouchableOpacity
                key={action.label}
                style={[
                  styles.button,
                  action.variant === 'primary' && styles.primaryButton,
                  action.variant === 'danger' && styles.dangerButton,
                ]}
                onPress={action.onPress}
              >
                <Text
                  style={[
                    styles.buttonText,
                    action.variant === 'primary' && styles.filledButtonText,
                    action.variant === 'danger' && styles.dangerButtonText,
                  ]}
                >
                  {action.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </View>
    </Modal>
  )
}

const stylesheet = createStyleSheet((theme) => ({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.58)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.lg,
  },
  dialog: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    padding: theme.spacing.lg,
    gap: theme.spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.32,
    shadowRadius: 22,
    elevation: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing.md,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface2,
    padding: theme.spacing.md,
  },
  iconBadge: {
    width: 42,
    height: 42,
    borderRadius: theme.radius.full,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleBlock: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    color: theme.colors.text,
    fontSize: theme.fontSize.lg,
    fontWeight: '800',
  },
  message: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.sm,
    fontWeight: '600',
    lineHeight: 20,
    marginTop: 4,
  },
  actions: {
    gap: theme.spacing.sm,
  },
  button: {
    minHeight: 48,
    borderRadius: theme.radius.full,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.md,
  },
  primaryButton: {
    backgroundColor: theme.colors.accent,
    borderColor: 'rgba(255, 255, 255, 0.28)',
    shadowColor: theme.colors.accent,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.22,
    shadowRadius: 10,
    elevation: 3,
  },
  dangerButton: {
    backgroundColor: theme.colors.danger + '22',
    borderColor: theme.colors.danger + '70',
  },
  buttonText: {
    color: theme.colors.text,
    fontSize: theme.fontSize.md,
    fontWeight: '800',
  },
  filledButtonText: {
    color: '#FFFFFF',
  },
  dangerButtonText: {
    color: theme.colors.danger,
  },
}))
