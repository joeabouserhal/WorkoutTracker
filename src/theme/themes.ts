import { fontFamily } from './fonts';

const baseSpacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
} as const;

const baseFontSize = {
  xxs: 9,
  xs: 11,
  sm: 13,
  md: 15,
  lg: 18,
  xl: 22,
  xxl: 28,
} as const;

const baseRadius = {
  sm: 8,
  md: 8,
  lg: 8,
  xl: 8,
  full: 9999,
} as const;

const baseFontFamily = fontFamily;

const createTheme = (colors: {
  bg: string;
  surface: string;
  surface2: string;
  text: string;
  textMuted: string;
  accent: string;
  accentMuted: string;
  danger: string;
  dangerMuted: string;
  border: string;
  borderStrong: string;
}) =>
  ({
    colors,
    spacing: baseSpacing,
    fontSize: baseFontSize,
    fontFamily: baseFontFamily,
    radius: baseRadius,
  } as const);

export const THEME_STORAGE_KEY = 'app_theme';

export const darkTheme = createTheme({
  bg: '#111111',
  surface: '#1C1C1E',
  surface2: '#2C2C2E',
  text: '#F5F5F7',
  textMuted: '#8E8E93',
  accent: '#5ab7d3',
  accentMuted: '#6bdcff26',
  danger: '#FF453A',
  dangerMuted: '#FF453A18',
  border: '#2C2C2E',
  borderStrong: '#48484A',
});

export const oledTheme = createTheme({
  bg: '#000000',
  surface: '#0A0A0A',
  surface2: '#141414',
  text: '#F5F5F7',
  textMuted: '#A1A1A7',
  accent: '#FF6B6B',
  accentMuted: '#FF6B6B26',
  danger: '#FF453A',
  dangerMuted: '#FF453A18',
  border: '#1A1A1A',
  borderStrong: '#2C2C2E',
});

export const draculaTheme = createTheme({
  bg: '#242633',
  surface: '#303342',
  surface2: '#414558',
  text: '#F8F8F2',
  textMuted: '#9BA7D9',
  accent: '#BD93F9',
  accentMuted: '#BD93F926',
  danger: '#FF5555',
  dangerMuted: '#FF555518',
  border: '#44475A',
  borderStrong: '#6272A4',
});

export const oneDarkTheme = createTheme({
  bg: '#23272F',
  surface: '#2D323C',
  surface2: '#3A404D',
  text: '#D7DAE0',
  textMuted: '#9AA3B1',
  accent: '#61AFEF',
  accentMuted: '#61AFEF26',
  danger: '#E06C75',
  dangerMuted: '#E06C7518',
  border: '#3E4451',
  borderStrong: '#5C6370',
});

export const nordTheme = createTheme({
  bg: '#282E39',
  surface: '#353D4D',
  surface2: '#414A5C',
  text: '#ECEFF4',
  textMuted: '#A7B3C8',
  accent: '#88C0D0',
  accentMuted: '#88C0D026',
  danger: '#BF616A',
  dangerMuted: '#BF616A18',
  border: '#434C5E',
  borderStrong: '#4C566A',
});

export const catppuccinTheme = createTheme({
  bg: '#1A1A29',
  surface: '#2C2D40',
  surface2: '#404257',
  text: '#E4E8FA',
  textMuted: '#A7ACC3',
  accent: '#CBA6F7',
  accentMuted: '#CBA6F726',
  danger: '#F38BA8',
  dangerMuted: '#F38BA818',
  border: '#45475A',
  borderStrong: '#6C7086',
});

export const tokyoNightTheme = createTheme({
  bg: '#171829',
  surface: '#202237',
  surface2: '#283044',
  text: '#D7DDF9',
  textMuted: '#9AA7D8',
  accent: '#7AA2F7',
  accentMuted: '#7AA2F726',
  danger: '#F7768E',
  dangerMuted: '#F7768E18',
  border: '#292E42',
  borderStrong: '#565F89',
});

export const gruvboxTheme = createTheme({
  bg: '#242424',
  surface: '#393432',
  surface2: '#4A433F',
  text: '#F3E5BC',
  textMuted: '#B9A98A',
  accent: '#FABD2F',
  accentMuted: '#FABD2F26',
  danger: '#FB4934',
  dangerMuted: '#FB493418',
  border: '#504945',
  borderStrong: '#928374',
});

export const solarizedTheme = createTheme({
  bg: '#002631',
  surface: '#06333F',
  surface2: '#0C4554',
  text: '#AAB8B8',
  textMuted: '#8CA0A5',
  accent: '#268BD2',
  accentMuted: '#268BD226',
  danger: '#DC322F',
  dangerMuted: '#DC322F18',
  border: '#0D4A5A',
  borderStrong: '#586E75',
});

export const whimsyTheme = createTheme({
  bg: '#111714',
  surface: '#181F1A',
  surface2: '#1F2822',
  text: '#DFF0D0',
  textMuted: '#85A882',
  accent: '#7CBD5E',
  accentMuted: '#7CBD5E26',
  danger: '#C96B5C',
  dangerMuted: '#5C2018',
  border: '#252E26',
  borderStrong: '#374A38',
});

export const APP_THEMES = {
  dark: darkTheme,
  oled: oledTheme,
  dracula: draculaTheme,
  oneDark: oneDarkTheme,
  nord: nordTheme,
  catppuccin: catppuccinTheme,
  tokyoNight: tokyoNightTheme,
  gruvbox: gruvboxTheme,
  solarized: solarizedTheme,
  whimsy: whimsyTheme,
} as const;

export type ThemeKey = keyof typeof APP_THEMES;
export type AppTheme = typeof APP_THEMES[ThemeKey];

export const THEME_OPTIONS: Array<{
  key: ThemeKey;
  label: string;
  accent: string;
}> = [
  { key: 'dark', label: 'Dark', accent: darkTheme.colors.accent },
  { key: 'oled', label: 'OLED Black', accent: oledTheme.colors.accent },
  { key: 'dracula', label: 'Dracula', accent: draculaTheme.colors.accent },
  { key: 'oneDark', label: 'One Dark', accent: oneDarkTheme.colors.accent },
  { key: 'nord', label: 'Nord', accent: nordTheme.colors.accent },
  { key: 'catppuccin', label: 'Catppuccin', accent: catppuccinTheme.colors.accent },
  { key: 'tokyoNight', label: 'Tokyo Night', accent: tokyoNightTheme.colors.accent },
  { key: 'gruvbox', label: 'Gruvbox', accent: gruvboxTheme.colors.accent },
  { key: 'solarized', label: 'Solarized', accent: solarizedTheme.colors.accent },
  { key: 'whimsy', label: 'Whimsy', accent: whimsyTheme.colors.accent },
];

export function normalizeThemeKey(value?: string | null): ThemeKey {
  return value && value in APP_THEMES ? (value as ThemeKey) : 'dark';
}
