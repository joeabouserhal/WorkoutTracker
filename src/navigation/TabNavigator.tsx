import React, { useEffect, useState } from 'react'
import { type LayoutChangeEvent, Text, TouchableOpacity, View } from 'react-native'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import { createStyleSheet, useStyles } from 'react-native-unistyles'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import HomeScreen from '../screens/HomeScreen'
import TemplatesScreen from '../screens/TemplatesScreen'
import TemplateDetailScreen from '../screens/TemplateDetailScreen'
import CalendarScreen from '../screens/CalendarScreen'
import ProgressScreen from '../screens/ProgressScreen'
import LibraryScreen from '../screens/LibraryScreen'
import ProfileScreen from '../screens/ProfileScreen'
import EditProfileScreen from '../screens/EditProfileScreen'
import SettingsScreen from '../screens/SettingsScreen'
import ThemesScreen from '../screens/ThemesScreen'
import ScheduleScreen from '../screens/ScheduleScreen'
import AboutScreen from '../screens/AboutScreen'
import BackupScreen from '../screens/BackupScreen'
import DebugScreen from '../screens/DebugScreen'
import ActiveWorkoutSheet from '../components/ActiveWorkoutSheet'
import { useSessionStore } from '@/store/sessionStore'
import { formatRestTimer } from '@/services/restTimerSettings'
import { showWorkoutNotification } from '@/services/WorkoutNotification'

const Tab = createBottomTabNavigator()
export type HomeStackParamList = {
  Home: undefined
  Templates: undefined
  TemplateDetail: { templateId: string; initialEdit?: boolean }
}
const HomeStack = createNativeStackNavigator<HomeStackParamList>()
const CalendarStack = createNativeStackNavigator()
const ProgressStack = createNativeStackNavigator()
const LibraryStack = createNativeStackNavigator()
const TAB_BAR_HORIZONTAL_PADDING = 8
const TAB_ICON_PILL_WIDTH = 52
const TAB_ICON_PILL_TOP = 9
const TAB_BAR_EXTRA_BOTTOM_PADDING = 10
export type ProfileStackParamList = {
  Profile: undefined
  EditProfile: undefined
  Settings: undefined
  Themes: undefined
  Backup: undefined
  Schedule: undefined
  About: undefined
  Debug: undefined
}
const ProfileStack = createNativeStackNavigator<ProfileStackParamList>()

function HomeStackScreen() {
  return (
    <HomeStack.Navigator screenOptions={{ headerShown: false }}>
      <HomeStack.Screen name="Home" component={HomeScreen} />
      <HomeStack.Screen name="Templates" component={TemplatesScreen} />
      <HomeStack.Screen name="TemplateDetail" component={TemplateDetailScreen} />
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
      <ProfileStack.Screen name="Backup" component={BackupScreen} />
      <ProfileStack.Screen name="Schedule" component={ScheduleScreen} />
      <ProfileStack.Screen name="About" component={AboutScreen} />
      <ProfileStack.Screen name="Debug" component={DebugScreen} />
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

function getTabIcon(routeName: string, focused: boolean) {
  switch (routeName) {
    case 'HomeTab':
      return focused ? 'home' : 'home-outline'
    case 'CalendarTab':
      return focused ? 'calendar' : 'calendar-outline'
    case 'ProgressTab':
      return focused ? 'chart-line' : 'chart-line-variant'
    case 'LibraryTab':
      return 'dumbbell'
    case 'ProfileTab':
      return focused ? 'account' : 'account-outline'
    default:
      return 'circle-outline'
  }
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
    showWorkoutNotification(elapsed, 0, startedAt).catch(console.error)
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
      <View style={styles.miniBarWrap}>
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
      </View>
    </GestureDetector>
  )
}

function TabBarItem({
  focused,
  label,
  iconName,
  accessibilityLabel,
  testID,
  onPress,
  onLongPress,
}: {
  focused: boolean
  label: string
  iconName: string
  accessibilityLabel?: string
  testID?: string
  onPress: () => void
  onLongPress: () => void
}) {
  const { styles, theme } = useStyles(stylesheet)
  const iconScale = useSharedValue(focused ? 1.08 : 1)

  useEffect(() => {
    iconScale.value = withTiming(focused ? 1.08 : 1, { duration: 110 })
  }, [focused, iconScale])

  const iconAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: iconScale.value }],
  }))

  return (
    <TouchableOpacity
      accessibilityRole="tab"
      accessibilityState={focused ? { selected: true } : {}}
      accessibilityLabel={accessibilityLabel}
      testID={testID}
      style={styles.tabItem}
      activeOpacity={0.78}
      onPress={onPress}
      onLongPress={onLongPress}
    >
      <View style={styles.tabIconPill}>
        <Animated.View style={iconAnimatedStyle}>
          <MaterialCommunityIcons
            name={iconName}
            size={22}
            color={focused ? theme.colors.accent : theme.colors.textMuted}
          />
        </Animated.View>
      </View>
      <Text
        numberOfLines={1}
        adjustsFontSizeToFit
        style={[
          styles.tabLabel,
          focused && styles.tabLabelActive,
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  )
}

function CustomTabBar(props: BottomTabBarProps) {
  const { state, descriptors, navigation } = props
  const { styles } = useStyles(stylesheet)
  const insets = useSafeAreaInsets()
  const activeWorkoutId = useSessionStore((s) => s.activeWorkoutId)
  const bottomPadding = Math.max(insets.bottom + TAB_BAR_EXTRA_BOTTOM_PADDING, 18)
  const [tabBarWidth, setTabBarWidth] = useState(0)
  const activeIndex = useSharedValue(state.index)

  useEffect(() => {
    activeIndex.value = withTiming(state.index, { duration: 180 })
  }, [activeIndex, state.index])

  function handleTabBarLayout(event: LayoutChangeEvent) {
    setTabBarWidth(event.nativeEvent.layout.width)
  }

  const highlightAnimatedStyle = useAnimatedStyle(() => {
    const routeCount = Math.max(state.routes.length, 1)
    const innerWidth = Math.max(tabBarWidth - TAB_BAR_HORIZONTAL_PADDING * 2, 0)
    const tabWidth = innerWidth / routeCount
    return {
      opacity: tabBarWidth > 0 ? 1 : 0,
      transform: [{
        translateX:
          TAB_BAR_HORIZONTAL_PADDING +
          (tabWidth * activeIndex.value) +
          ((tabWidth - TAB_ICON_PILL_WIDTH) / 2),
      }],
    }
  })

  return (
    <View style={styles.tabArea}>
      {activeWorkoutId ? <WorkoutMiniBar /> : null}
      <View
        style={[
          styles.tabBar,
          activeWorkoutId && styles.tabBarDocked,
          {
            paddingBottom: bottomPadding,
            minHeight: 62 + bottomPadding,
          },
        ]}
        onLayout={handleTabBarLayout}
      >
        <Animated.View style={[styles.tabIconHighlight, highlightAnimatedStyle]} />
        {state.routes.map((route, index) => {
          const focused = state.index === index
          const { options } = descriptors[route.key]
          const label = typeof options.title === 'string'
            ? options.title
            : route.name.replace('Tab', '')

          function handlePress() {
            activeIndex.value = withTiming(index, { duration: 180 })
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            })

            if (event.defaultPrevented) {
              activeIndex.value = withTiming(state.index, { duration: 120 })
              return
            }

            if (!focused) {
              navigation.navigate(route.name, route.params)
            }
          }

          function handleLongPress() {
            navigation.emit({
              type: 'tabLongPress',
              target: route.key,
            })
          }

          return (
            <TabBarItem
              key={route.key}
              focused={focused}
              label={label}
              iconName={getTabIcon(route.name, focused)}
              accessibilityLabel={options.tabBarAccessibilityLabel}
              testID={options.tabBarButtonTestID}
              onPress={handlePress}
              onLongPress={handleLongPress}
            />
          )
        })}
      </View>
    </View>
  )
}

export default function TabNavigator() {
  return (
    <>
      <Tab.Navigator
        tabBar={(props) => <CustomTabBar {...props} />}
        screenOptions={{
          headerShown: false,
          lazy: false,
          animation: 'shift',
          transitionSpec: {
            animation: 'timing',
            config: {
              duration: 180,
            },
          },
        }}
      >
        <Tab.Screen
          name="HomeTab"
          component={HomeStackScreen}
          options={{
            title: 'Home',
          }}
        />
        <Tab.Screen
          name="CalendarTab"
          component={CalendarStackScreen}
          options={{
            title: 'Calendar',
          }}
        />
        <Tab.Screen
          name="ProgressTab"
          component={ProgressStackScreen}
          options={{
            title: 'Progress',
          }}
        />
        <Tab.Screen
          name="LibraryTab"
          component={LibraryStackScreen}
          options={{
            title: 'Library',
          }}
        />
        <Tab.Screen
          name="ProfileTab"
          component={ProfileStackScreen}
          options={{
            title: 'Profile',
          }}
        />
      </Tab.Navigator>

      <ActiveWorkoutSheet />
    </>
  )
}

const stylesheet = createStyleSheet((theme) => ({
  tabArea: {
    backgroundColor: 'transparent',
  },
  tabBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    paddingHorizontal: TAB_BAR_HORIZONTAL_PADDING,
    paddingTop: 8,
    position: 'relative',
  },
  tabBarDocked: {
    borderTopWidth: 1,
  },
  tabItem: {
    flex: 1,
    minWidth: 0,
    minHeight: 50,
    borderRadius: theme.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingHorizontal: 2,
    zIndex: 1,
  },
  tabIconHighlight: {
    position: 'absolute',
    top: TAB_ICON_PILL_TOP,
    width: TAB_ICON_PILL_WIDTH,
    height: 30,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.accentMuted,
    zIndex: 0,
  },
  tabIconPill: {
    width: TAB_ICON_PILL_WIDTH,
    height: 30,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  tabLabel: {
    color: theme.colors.textMuted,
    fontSize: 11,
    fontFamily: theme.fontFamily.bold,
    textAlign: 'center',
  },
  tabLabelActive: {
    color: theme.colors.accent,
    fontFamily: theme.fontFamily.extraBold,
  },
  miniBarWrap: {
    backgroundColor: 'transparent',
    paddingHorizontal: 0,
  },
  miniBar: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: theme.radius.lg,
    borderTopRightRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderBottomWidth: 1,
    paddingHorizontal: 18,
    paddingVertical: 14,
    minHeight: 72,
    overflow: 'hidden',
    marginBottom: -1,
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
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.accent,
  },
  miniBarTitle: {
    color: theme.colors.text,
    fontSize: 14,
    fontFamily: theme.fontFamily.semiBold,
  },
  miniBarTimeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  miniBarTime: {
    color: theme.colors.accent,
    fontSize: 18,
    fontFamily: theme.fontFamily.extraBold,
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
    fontFamily: theme.fontFamily.extraBold,
    textTransform: 'uppercase',
  },
  miniTimerValue: {
    color: theme.colors.accent,
    fontSize: 16,
    fontFamily: theme.fontFamily.black,
  },
  miniRestTime: {
    color: theme.colors.accent,
    fontSize: 16,
    fontFamily: theme.fontFamily.black,
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
    fontFamily: theme.fontFamily.extraBold,
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
    fontFamily: theme.fontFamily.extraBold,
  },
}))
