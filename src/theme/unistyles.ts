import { UnistylesRegistry } from 'react-native-unistyles'
import { getString } from '../storage/mmkv'
import {
  darkTheme,
  oledTheme,
  draculaTheme,
  oneDarkTheme,
  nordTheme,
  catppuccinTheme,
  tokyoNightTheme,
  gruvboxTheme,
  solarizedTheme,
} from './themes'

type AppThemes = {
  dark: typeof darkTheme
  oled: typeof oledTheme
  dracula: typeof draculaTheme
  oneDark: typeof oneDarkTheme
  nord: typeof nordTheme
  catppuccin: typeof catppuccinTheme
  tokyoNight: typeof tokyoNightTheme
  gruvbox: typeof gruvboxTheme
  solarized: typeof solarizedTheme
}

declare module 'react-native-unistyles' {
  export interface UnistylesThemes extends AppThemes {}
}

const THEME_STORAGE_KEY = 'app_theme'

UnistylesRegistry
  .addThemes({
    dark: darkTheme,
    oled: oledTheme,
    dracula: draculaTheme,
    oneDark: oneDarkTheme,
    nord: nordTheme,
    catppuccin: catppuccinTheme,
    tokyoNight: tokyoNightTheme,
    gruvbox: gruvboxTheme,
    solarized: solarizedTheme,
  })
  .addConfig({
    initialTheme: (getString(THEME_STORAGE_KEY) as never) ?? 'dark',
  })
