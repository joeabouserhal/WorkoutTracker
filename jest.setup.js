/* eslint-env jest */

require('react-native-gesture-handler/jestSetup');

jest.mock('react-native-reanimated', () => {
  const Reanimated = require('react-native-reanimated/mock');
  Reanimated.default.call = () => {};
  return Reanimated;
});

jest.mock('react-native-keyboard-controller', () => {
  const React = require('react');
  const { ScrollView } = require('react-native');

  return {
    KeyboardProvider: ({ children }) => React.createElement(React.Fragment, null, children),
    KeyboardAwareScrollView: ScrollView,
  };
});

jest.mock('react-native-mmkv', () => ({
  createMMKV: () => {
    const values = new Map();
    return {
      getString: (key) => {
        const value = values.get(key);
        return typeof value === 'string' ? value : undefined;
      },
      getBoolean: (key) => {
        const value = values.get(key);
        return typeof value === 'boolean' ? value : undefined;
      },
      set: (key, value) => {
        values.set(key, value);
      },
      remove: (key) => {
        values.delete(key);
      },
      clearAll: () => {
        values.clear();
      },
    };
  },
}));

const testTheme = {
  colors: {
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
  },
  spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 },
  fontSize: { xxs: 9, xs: 11, sm: 13, md: 15, lg: 18, xl: 22, xxl: 28 },
  fontFamily: {
    light: 'System',
    regular: 'System',
    medium: 'System',
    semiBold: 'System',
    bold: 'System',
    extraBold: 'System',
    black: 'System',
  },
  radius: { sm: 8, md: 8, lg: 8, xl: 8, full: 9999 },
};

jest.mock('react-native-unistyles', () => ({
  createStyleSheet: (factory) => factory,
  useStyles: (stylesheet) => ({
    styles: typeof stylesheet === 'function' ? stylesheet(testTheme) : stylesheet,
    theme: testTheme,
  }),
  UnistylesRegistry: {
    addThemes: jest.fn(() => ({
      addConfig: jest.fn(),
    })),
  },
}));
