import React, { useEffect, useState } from 'react'
import { Text, View } from 'react-native'
import { createBottomTabNavigator, BottomTabBar } from '@react-navigation/bottom-tabs'
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons'
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import { runOnJS } from 'react-native-reanimated'
import { createStyleSheet, useStyles } from 'react-native-unistyles'
import HomeScreen from '../screens/HomeScreen'
import CalendarScreen from '../screens/CalendarScreen'
import ProgressScreen from '../screens/ProgressScreen'
import LibraryScreen from '../screens/LibraryScreen'
import ProfileScreen from '../screens/ProfileScreen'
import EditProfileScreen from '../screens/EditProfileScreen'
import SettingsScreen from '../screens/SettingsScreen'
import ThemesScreen from '../screens/ThemesScreen'
import ActiveWorkoutSheet from '../components/ActiveWorkoutSheet'
import { useSessionStore } from '@/store/sessionStore'

const Tab = createBottomTabNavigator()
const HomeStack = createNativeStackNavigator()
const CalendarStack = createNativeStackNavigator()
const ProgressStack = createNativeStackNavigator()
const LibraryStack = createNativeStackNavigator()
export type ProfileStackParamList = {
  Profile: undefined
  EditProfile: undefined
  Settings: undefined
  Themes: undefined
}
const ProfileStack = createNativeStackNavigator<ProfileStackParamList>()

function HomeStackScreen() {
  return (
    <HomeStack.Navigator screenOptions={{ headerShown: false }}>
      <HomeStack.Screen name="Home" component={HomeScreen} />
    </HomeStack.Navigator>
  )
}

function CalendarStackScreen() {
  return (
    <CalendarStack.Navigator screenOptions={{ headerShown: false }}>
      <CalendarStack.Screen name="Calendar" component={CalendarScreen} />
    </CalendarStack.Navigator>
  )
}

function ProgressStackScreen() {
  return (
    <ProgressStack.Navigator screenOptions={{ headerShown: false }}>
      <ProgressStack.Screen name="Progress" component={ProgressScreen} />
    </ProgressStack.Navigator>
  )
}

function LibraryStackScreen() {
  return (
    <LibraryStack.Navigator screenOptions={{ headerShown: false }}>
      <LibraryStack.Screen name="Library" component={LibraryScreen} />
    </LibraryStack.Navigator>
  )
}

function ProfileStackScreen() {
  const { theme } = useStyles(stylesheet)
  return (
    <ProfileStack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: theme.colors.bg },
      }}
    >
      <ProfileStack.Screen name="Profile" component={ProfileScreen} />
      <ProfileStack.Screen name="EditProfile" component={EditProfileScreen} />
      <ProfileStack.Screen name="Settings" component={SettingsScreen} />
      <ProfileStack.Screen name="Themes" component={ThemesScreen} />
    </ProfileStack.Navigator>
  )
}

function formatElapsed(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function WorkoutMiniBar() {
  const { theme } = useStyles(stylesheet)
  const startedAt = useSessionStore((s) => s.startedAt)
  const openWorkoutSheet = useSessionStore((s) => s.openWorkoutSheet)
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    if (!startedAt) return
    setElapsed(Math.floor((Date.now() - startedAt) / 1000))
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAt) / 1000))
    }, 1000)
    return () => clearInterval(interval)
  }, [startedAt])

  const gesture = Gesture.Race(
    Gesture.Tap().onEnd(() => runOnJS(openWorkoutSheet)()),
    Gesture.Pan().onEnd(({ translationY }) => {
      if (translationY < -20) runOnJS(openWorkoutSheet)()
    }),
  )

  return (
    <GestureDetector gesture={gesture}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          backgroundColor: theme.colors.surface,
          borderTopWidth: 1,
          borderTopColor: theme.colors.accent + '40',
          paddingHorizontal: 16,
          paddingVertical: 10,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View
            style={{
              width: 8,
              height: 8,
              borderRadius: 4,
              backgroundColor: theme.colors.accent,
            }}
          />
          <Text
            style={{ color: theme.colors.text, fontSize: 14, fontWeight: '600' }}
          >
            Workout in Progress
          </Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text
            style={{
              color: theme.colors.accent,
              fontSize: 15,
              fontWeight: '700',
            }}
          >
            {formatElapsed(elapsed)}
          </Text>
          <MaterialCommunityIcons
            name="chevron-up"
            size={20}
            color={theme.colors.textMuted}
          />
        </View>
      </View>
    </GestureDetector>
  )
}

function CustomTabBar(props: BottomTabBarProps) {
  const activeWorkoutId = useSessionStore((s) => s.activeWorkoutId)
  return (
    <View>
      {activeWorkoutId ? <WorkoutMiniBar /> : null}
      <BottomTabBar {...props} />
    </View>
  )
}

export default function TabNavigator() {
  const { theme } = useStyles(stylesheet)

  return (
    <BottomSheetModalProvider>
      <Tab.Navigator
        tabBar={(props) => <CustomTabBar {...props} />}
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: theme.colors.accent,
          tabBarInactiveTintColor: theme.colors.textMuted,
          tabBarStyle: {
            backgroundColor: theme.colors.surface,
            borderTopColor: theme.colors.border,
            borderTopWidth: 1,
            height: 76,
            paddingBottom: 10,
            paddingTop: 2,
          },
          tabBarLabelStyle: {
            fontSize: 12,
            fontWeight: '600',
            marginTop: 2,
          },
        }}
      >
        <Tab.Screen
          name="HomeTab"
          component={HomeStackScreen}
          options={{
            title: 'Home',
            tabBarIcon: ({ focused, color, size }) => (
              <MaterialCommunityIcons
                name={focused ? 'home' : 'home-outline'}
                size={size}
                color={color}
              />
            ),
          }}
        />
        <Tab.Screen
          name="CalendarTab"
          component={CalendarStackScreen}
          options={{
            title: 'Calendar',
            tabBarIcon: ({ focused, color, size }) => (
              <MaterialCommunityIcons
                name={focused ? 'calendar' : 'calendar-outline'}
                size={size}
                color={color}
              />
            ),
          }}
        />
        <Tab.Screen
          name="ProgressTab"
          component={ProgressStackScreen}
          options={{
            title: 'Progress',
            tabBarIcon: ({ focused, color, size }) => (
              <MaterialCommunityIcons
                name={focused ? 'chart-line' : 'chart-line-variant'}
                size={size}
                color={color}
              />
            ),
          }}
        />
        <Tab.Screen
          name="LibraryTab"
          component={LibraryStackScreen}
          options={{
            title: 'Library',
            tabBarIcon: ({ color, size }) => (
              <MaterialCommunityIcons
                name="dumbbell"
                size={size}
                color={color}
              />
            ),
          }}
        />
        <Tab.Screen
          name="ProfileTab"
          component={ProfileStackScreen}
          options={{
            title: 'Profile',
            tabBarIcon: ({ focused, color, size }) => (
              <MaterialCommunityIcons
                name={focused ? 'account' : 'account-outline'}
                size={size}
                color={color}
              />
            ),
          }}
        />
      </Tab.Navigator>

      <ActiveWorkoutSheet />
    </BottomSheetModalProvider>
  )
}

const stylesheet = createStyleSheet(() => ({}))
