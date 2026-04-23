const baseSpacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
} as const

const baseFontSize = {
  xs: 11,
  sm: 13,
  md: 15,
  lg: 18,
  xl: 22,
  xxl: 28,
} as const

const baseRadius = {
  sm: 6,
  md: 10,
  lg: 16,
  xl: 24,
  full: 9999,
} as const

const createTheme = (colors: {
  bg: string
  surface: string
  surface2: string
  text: string
  textMuted: string
  accent: string
  accentMuted: string
  danger: string
  border: string
  borderStrong: string
}) =>
  ({
    colors,
    spacing: baseSpacing,
    fontSize: baseFontSize,
    radius: baseRadius,
  }) as const

export const darkTheme = createTheme({
  bg: '#111111',
  surface: '#1C1C1E',
  surface2: '#2C2C2E',
  text: '#F5F5F7',
  textMuted: '#8E8E93',
  accent: '#7cd35a',
  accentMuted: '#FF6B6B26',
  danger: '#FF453A',
  border: '#2C2C2E',
  borderStrong: '#48484A',
})

export const oledTheme = createTheme({
  bg: '#000000',
  surface: '#0A0A0A',
  surface2: '#141414',
  text: '#F5F5F7',
  textMuted: '#8E8E93',
  accent: '#FF6B6B',
  accentMuted: '#FF6B6B26',
  danger: '#FF453A',
  border: '#1A1A1A',
  borderStrong: '#2C2C2E',
})

export const draculaTheme = createTheme({
  bg: '#282A36',
  surface: '#343746',
  surface2: '#44475A',
  text: '#F8F8F2',
  textMuted: '#6272A4',
  accent: '#BD93F9',
  accentMuted: '#BD93F926',
  danger: '#FF5555',
  border: '#44475A',
  borderStrong: '#6272A4',
})

export const oneDarkTheme = createTheme({
  bg: '#282C34',
  surface: '#31353F',
  surface2: '#3E4451',
  text: '#ABB2BF',
  textMuted: '#5C6370',
  accent: '#61AFEF',
  accentMuted: '#61AFEF26',
  danger: '#E06C75',
  border: '#3E4451',
  borderStrong: '#5C6370',
})

export const nordTheme = createTheme({
  bg: '#2E3440',
  surface: '#3B4252',
  surface2: '#434C5E',
  text: '#ECEFF4',
  textMuted: '#4C566A',
  accent: '#88C0D0',
  accentMuted: '#88C0D026',
  danger: '#BF616A',
  border: '#434C5E',
  borderStrong: '#4C566A',
})

export const catppuccinTheme = createTheme({
  bg: '#1E1E2E',
  surface: '#313244',
  surface2: '#45475A',
  text: '#CDD6F4',
  textMuted: '#6C7086',
  accent: '#CBA6F7',
  accentMuted: '#CBA6F726',
  danger: '#F38BA8',
  border: '#45475A',
  borderStrong: '#6C7086',
})

export const tokyoNightTheme = createTheme({
  bg: '#1A1B2E',
  surface: '#24253A',
  surface2: '#292E42',
  text: '#C0CAF5',
  textMuted: '#565F89',
  accent: '#7AA2F7',
  accentMuted: '#7AA2F726',
  danger: '#F7768E',
  border: '#292E42',
  borderStrong: '#565F89',
})

export const gruvboxTheme = createTheme({
  bg: '#282828',
  surface: '#3C3836',
  surface2: '#504945',
  text: '#EBDBB2',
  textMuted: '#928374',
  accent: '#FABD2F',
  accentMuted: '#FABD2F26',
  danger: '#FB4934',
  border: '#504945',
  borderStrong: '#928374',
})

export const solarizedTheme = createTheme({
  bg: '#002B36',
  surface: '#073642',
  surface2: '#0D4A5A',
  text: '#839496',
  textMuted: '#586E75',
  accent: '#268BD2',
  accentMuted: '#268BD226',
  danger: '#DC322F',
  border: '#0D4A5A',
  borderStrong: '#586E75',
})
