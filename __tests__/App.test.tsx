/**
 * @format
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import App from '../App';

jest.mock('../src/navigation/RootNavigator', () => {
  const TestReact = require('react');
  const { View } = require('react-native');
  return function MockRootNavigator() {
    return TestReact.createElement(View, { testID: 'root-navigator' });
  };
});

jest.mock('../src/components/SplashScreen', () => {
  const TestReact = require('react');
  const { View } = require('react-native');
  return function MockSplashScreen() {
    return TestReact.createElement(View, { testID: 'splash-screen' });
  };
});

jest.mock('../src/db/seedData', () => ({
  seedDatabaseIfEmpty: jest.fn(() => Promise.resolve()),
}));

jest.mock('../src/services/activeWorkoutRecovery', () => ({
  restoreActiveWorkoutSession: jest.fn(() => Promise.resolve(false)),
}));

test('renders correctly', async () => {
  await ReactTestRenderer.act(() => {
    ReactTestRenderer.create(<App />);
  });
});
