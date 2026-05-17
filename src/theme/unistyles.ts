import { UnistylesRegistry } from 'react-native-unistyles';
import { getString } from '../storage/mmkv';
import {
  APP_THEMES,
  THEME_STORAGE_KEY,
  normalizeThemeKey,
} from './themes';

type AppThemes = typeof APP_THEMES;

declare module 'react-native-unistyles' {
  export interface UnistylesThemes extends AppThemes {}
}

UnistylesRegistry.addThemes(APP_THEMES).addConfig({
  initialTheme: normalizeThemeKey(getString(THEME_STORAGE_KEY)) as never,
});
