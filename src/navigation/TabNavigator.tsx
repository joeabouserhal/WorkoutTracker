import React, { useEffect, useState } from 'react'
import { Text, TouchableOpacity, View } from 'react-native'
import { createBottomTabNavigator, BottomTabBar } from '@react-navigation/bottom-tabs'
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons'
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
import { formatRestTimer } from '@/services/restTimerSettings'
import { showWorkoutNotification } from '@/services/WorkoutNotification'

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
  const { styles, theme } = useStyles(stylesheet)
  const startedAt = useSessionStore((s) => s.startedAt)
  const openWorkoutSheet = useSessionStore((s) => s.openWorkoutSheet)
  const requestEndWorkout = useSessionStore((s) => s.requestEndWorkout)
  const isResting = useSessionStore((s) => s.isResting)
  const restSecondsRemaining = useSessionStore((s) => s.restSecondsRemaining)
  const clearRest = useSessionStore((s) => s.clearRest)
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    if (!startedAt) return
    setElapsed(Math.floor((Date.now() - startedAt) / 1000))
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAt) / 1000))
    }, 1000)
    return () => clearInterval(interval)
  }, [startedAt])

  function skipRest() {
    clearRest()
    showWorkoutNotification(elapsed).catch(console.error)
  }

  const swipeUpGesture = Gesture.Pan()
    .activeOffsetY(-8)
    .failOffsetX([-14, 14])
    .onEnd(({ translationY, velocityY }) => {
      if (translationY < -34 || velocityY < -520) {
        runOnJS(openWorkoutSheet)()
      }
    })

  return (
    <GestureDetector gesture={swipeUpGesture}>
      <View style={[styles.miniBar, isResting && styles.miniBarResting]}>
        <View style={styles.miniBarTopRow}>
          <TouchableOpacity
            style={[styles.miniBarMain, isResting && styles.miniBarHeader]}
            activeOpacity={0.75}
            onPress={openWorkoutSheet}
          >
            <View style={styles.miniBarTitleRow}>
              <View style={styles.miniBarDot} />
              <Text
                style={styles.miniBarTitle}
              >
                Workout in Progress
              </Text>
            </View>
            <View style={styles.miniBarTimeRow}>
              <Text
                style={styles.miniBarTime}
              >
                {formatElapsed(elapsed)}
              </Text>
              <MaterialCommunityIcons
                name="chevron-up"
                size={isResting ? 18 : 20}
                color={theme.colors.textMuted}
              />
            </View>
          </TouchableOpacity>

          {!isResting ? (
            <TouchableOpacity
              style={styles.miniEndButton}
              onPress={requestEndWorkout}
              activeOpacity={0.75}
            >
              <Text style={styles.miniEndButtonText}>
                End
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>

        {isResting ? (
          <>
            <TouchableOpacity
              style={styles.miniTimerGrid}
              activeOpacity={0.75}
              onPress={openWorkoutSheet}
            >
              <View style={styles.miniTimerChip}>
                <Text style={styles.miniTimerLabel}>
                  Workout
                </Text>
                <Text style={styles.miniTimerValue}>
                  {formatElapsed(elapsed)}
                </Text>
              </View>
              <View style={[styles.miniTimerChip, styles.miniRestTimerChip]}>
                <Text style={styles.miniTimerLabel}>
                  Rest
                </Text>
                <Text style={styles.miniRestTime}>
                  {formatRestTimer(restSecondsRemaining)}
                </Text>
              </View>
            </TouchableOpacity>

            <View style={styles.miniRestRow}>
              <TouchableOpacity
                style={[styles.miniActionButton, styles.miniEndRestButton]}
                onPress={requestEndWorkout}
                activeOpacity={0.75}
              >
                <Text style={styles.miniEndButtonText}>
                  End Workout
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.miniActionButton, styles.miniSkipButton]}
                onPress={skipRest}
                activeOpacity={0.75}
              >
                <Text style={styles.miniSkipButtonText}>
                  Skip Rest
                </Text>
              </TouchableOpacity>
            </View>
          </>
        ) : null}
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
    <>
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
    </>
  )
}

const stylesheet = createStyleSheet((theme) => ({
  miniBar: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: theme.colors.border,
    paddingHorizontal: 16,
    paddingVertical: 14,
    minHeight: 72,
  },
  miniBarResting: {
    gap: 9,
    paddingVertical: 12,
  },
  miniBarTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  miniBarMain: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  miniBarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  miniBarTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  miniBarDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.colors.accent,
  },
  miniBarTitle: {
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  miniBarTimeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  miniBarTime: {
    color: theme.colors.accent,
    fontSize: 18,
    fontWeight: '800',
  },
  miniRestRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  miniTimerGrid: {
    flexDirection: 'row',
    gap: 10,
  },
  miniTimerChip: {
    flex: 1,
    minHeight: 44,
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface2,
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 7,
    gap: 2,
  },
  miniRestTimerChip: {
    backgroundColor: theme.colors.accentMuted,
  },
  miniTimerLabel: {
    color: theme.colors.textMuted,
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  miniTimerValue: {
    color: theme.colors.accent,
    fontSize: 16,
    fontWeight: '900',
  },
  miniRestTime: {
    color: theme.colors.accent,
    fontSize: 16,
    fontWeight: '900',
  },
  miniActionButton: {
    flex: 1,
    minHeight: 38,
    borderRadius: theme.radius.full,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  miniSkipButton: {
    backgroundColor: theme.colors.accentMuted,
  },
  miniSkipButtonText: {
    color: theme.colors.accent,
    fontSize: 13,
    fontWeight: '800',
  },
  miniEndRestButton: {
    backgroundColor: theme.colors.surface2,
  },
  miniEndButton: {
    minHeight: 38,
    borderRadius: theme.radius.full,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  miniEndButtonText: {
    color: theme.colors.textMuted,
    fontSize: 13,
    fontWeight: '800',
  },
}))
