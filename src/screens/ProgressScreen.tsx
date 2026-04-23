import React from 'react'
import { View, Text } from 'react-native'
import { createStyleSheet, useStyles } from 'react-native-unistyles'

export default function ProgressScreen() {
  const { styles } = useStyles(stylesheet)
  return (
    <View style={styles.container}>
      <Text style={styles.label}>Progress</Text>
    </View>
  )
}

const stylesheet = createStyleSheet((theme) => ({
  container: {
    flex: 1,
    backgroundColor: theme.colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: theme.fontSize.lg,
    color: theme.colors.text,
  },
}))
