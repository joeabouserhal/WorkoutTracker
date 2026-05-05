import {
  Text as RNText,
  TextInput as RNTextInput,
  type TextInputProps,
  type TextProps,
} from 'react-native'
import { fontFamily } from './fonts'

type TextWithDefaults = typeof RNText & { defaultProps?: TextProps }
type TextInputWithDefaults = typeof RNTextInput & { defaultProps?: TextInputProps }

const FONT_BOOTSTRAP_KEY = '__workoutTrackerFontsConfigured'

export function configureAppFonts() {
  const globalScope = globalThis as typeof globalThis & {
    [FONT_BOOTSTRAP_KEY]?: boolean
  }

  if (globalScope[FONT_BOOTSTRAP_KEY]) {
    return
  }

  globalScope[FONT_BOOTSTRAP_KEY] = true

  const text = RNText as TextWithDefaults
  const textInput = RNTextInput as TextInputWithDefaults
  const baseTextStyle = { fontFamily: fontFamily.regular }

  text.defaultProps = text.defaultProps ?? {}
  text.defaultProps.style = [baseTextStyle, text.defaultProps.style]

  textInput.defaultProps = textInput.defaultProps ?? {}
  textInput.defaultProps.style = [baseTextStyle, textInput.defaultProps.style]
}
