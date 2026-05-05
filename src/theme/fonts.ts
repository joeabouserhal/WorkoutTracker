import { Platform } from 'react-native'

const selectFont = (android: string, ios: string) =>
  Platform.select({
    android,
    ios,
    default: android,
  }) as string

export const fontFamily = {
  light: selectFont('InterTight_300Light', 'InterTight-Light'),
  regular: selectFont('InterTight_400Regular', 'InterTight-Regular'),
  medium: selectFont('InterTight_500Medium', 'InterTight-Medium'),
  semiBold: selectFont('InterTight_600SemiBold', 'InterTight-SemiBold'),
  bold: selectFont('InterTight_700Bold', 'InterTight-Bold'),
  extraBold: selectFont('InterTight_800ExtraBold', 'InterTight-ExtraBold'),
  black: selectFont('InterTight_900Black', 'InterTight-Black'),
} as const
