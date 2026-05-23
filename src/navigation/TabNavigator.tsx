import React, { useCallback, useEffect, useState } from 'react'
import { getFocusedRouteNameFromRoute } from '@react-navigation/native'
import { type LayoutChangeEvent, Text, TouchableOpacity, View } from 'react-native'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import type {
  BottomTabBarProps,
  BottomTabNavigationOptions,
} from '@react-navigation/bottom-tabs'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import type { NativeStackNavigationOptions } from '@react-navigation/native-stack'
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, {
  Easing as ReanimatedEasing,
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
import WeightHistoryScreen from '../screens/WeightHistoryScreen'
import LibraryScreen from '../screens/LibraryScreen'
import ProfileScreen from '../screens/ProfileScreen'
import EditProfileScreen from '../screens/EditProfileScreen'
import SettingsScreen from '../screens/SettingsScreen'
import ThemesScreen from '../screens/ThemesScreen'
import ScheduleScreen from '../screens/ScheduleScreen'
import AboutScreen from '../screens/AboutScreen'
import BackupScreen from '../screens/BackupScreen'
import DebugScreen from '../screens/DebugScreen'
import PostWorkoutScreen, { type PostWorkoutRouteParams } from '../screens/PostWorkoutScreen'
import ActiveWorkoutSheet from '../components/ActiveWorkoutSheet'
import { useSessionStore } from '@/store/sessionStore'
import { formatRestTimer } from '@/services/restTimerSettings'
import { showWorkoutNotification } from '@/services/WorkoutNotification'
import { useRestCountdownSeconds } from '@/hooks/useRestCountdownSeconds'

const Tab = createBottomTabNavigator()
export type HomeStackParamList = {
  Home: undefined
  Templates: undefined
  TemplateDetail: { templateId: string; initialEdit?: boolean }
  PostWorkout: PostWorkoutRouteParams
}
const HomeStack = createNativeStackNavigator<HomeStackParamList>()
const CalendarStack = createNativeStackNavigator()
export type ProgressStackParamList = {
  Progress: undefined
  WeightHistory: undefined
}
const ProgressStack = createNativeStackNavigator<ProgressStackParamList>()
const LibraryStack = createNativeStackNavigator()
const TAB_BAR_HORIZONTAL_PADDING = 8
const TAB_ICON_PILL_WIDTH = 52
const TAB_ICON_PILL_TOP = 9
const TAB_BAR_EXTRA_BOTTOM_PADDING = 10
const TAB_TRANSITION_MS = 95
const TAB_ICON_ANIMATION_MS = 80
const TAB_RESET_ANIMATION_MS = 85
const STACK_TRANSITION_MS = 125
const FULL_SCREEN_ROUTES = new Set(['PostWorkout'])
const STACK_SCREEN_OPTIONS: NativeStackNavigationOptions = {
  headerShown: false,
  animationDuration: STACK_TRANSITION_MS,
  freezeOnBlur: true,
}
const TAB_SCREEN_OPTIONS: BottomTabNavigationOptions = {
  headerShown: false,
  lazy: true,
  freezeOnBlur: true,
  animation: 'shift',
  transitionSpec: {
    animation: 'timing',
    config: {
      duration: TAB_TRANSITION_MS,
    },
  },
}
export type ProfileStackParamList = {
  Profile: undefined
  EditProfile: undefined
  Settings: undefined
  Themes: undefined
  Backup: undefined
  Schedule: undefined
  About: undefined
  Debug: undefined
  PostWorkout: PostWorkoutRouteParams
}
const ProfileStack = createNativeStackNavigator<ProfileStackParamList>()

function HomeStackScreen() {
  return (
    <HomeStack.Navigator
      screenOptions={STACK_SCREEN_OPTIONS}
    >
      <HomeStack.Screen name="Home" component={HomeScreen} />
      <HomeStack.Screen name="Templates" component={TemplatesScreen} />
      <HomeStack.Screen name="TemplateDetail" component={TemplateDetailScreen} />
      <HomeStack.Screen name="PostWorkout" component={PostWorkoutScreen} />
    </HomeStack.Navigator>
  )
}

function CalendarStackScreen() {
  return (
    <CalendarStack.Navigator
      screenOptions={STACK_SCREEN_OPTIONS}
    >
      <CalendarStack.Screen name="Calendar" component={CalendarScreen} />
    </CalendarStack.Navigator>
  )
}

function ProgressStackScreen() {
  return (
    <ProgressStack.Navigator
      screenOptions={STACK_SCREEN_OPTIONS}
    >
      <ProgressStack.Screen name="Progress" component={ProgressScreen} />
      <ProgressStack.Screen
        name="WeightHistory"
        component={WeightHistoryScreen}
      />
    </ProgressStack.Navigator>
  )
}

function LibraryStackScreen() {
  return (
    <LibraryStack.Navigator
      screenOptions={STACK_SCREEN_OPTIONS}
    >
      <LibraryStack.Screen name="Library" component={LibraryScreen} />
    </LibraryStack.Navigator>
  )
}

function ProfileStackScreen() {
  const { theme } = useStyles(stylesheet)
  return (
    <ProfileStack.Navigator
      screenOptions={{
        ...STACK_SCREEN_OPTIONS,
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
      <ProfileStack.Screen name="PostWorkout" component={PostWorkoutScreen} />
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
  const restEndsAt = useSessionStore((s) => s.restEndsAt)
  const clearRest = useSessionStore((s) => s.clearRest)
  const restSecondsRemaining = useRestCountdownSeconds(
    isResting ? restEndsAt : null,
  )
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
        <View
          style={[
            styles.miniBar,
            !isResting && styles.miniBarCompact,
            isResting && styles.miniBarResting,
          ]}
        >
          {isResting ? (
            <>
              <TouchableOpacity
                style={styles.miniBarHeader}
                activeOpacity={0.86}
                onPress={openWorkoutSheet}
              >
                <View style={styles.miniBarTitleGroup}>
                  <View style={[styles.miniStatusIcon, styles.miniStatusIconResting]}>
                    <MaterialCommunityIcons
                      name="timer-sand"
                      size={19}
                      color={theme.colors.accent}
                    />
                  </View>
                  <Text style={styles.miniBarTitle} numberOfLines={1}>
                    Rest Timer
                  </Text>
                </View>
                <View style={styles.miniOpenPill}>
                  <MaterialCommunityIcons
                    name="chevron-up"
                    size={20}
                    color={theme.colors.textMuted}
                  />
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.miniStatsRow}
                activeOpacity={0.86}
                onPress={openWorkoutSheet}
              >
                <View style={styles.miniStatBlock}>
                  <Text style={styles.miniStatLabel}>Elapsed</Text>
                  <Text
                    style={styles.miniStatValue}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                  >
                    {formatElapsed(elapsed)}
                  </Text>
                </View>
                <View style={styles.miniStatBlock}>
                  <Text style={styles.miniStatLabel}>Rest</Text>
                  <Text
                    style={[styles.miniStatValue, styles.miniRestValue]}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                  >
                    {formatRestTimer(restSecondsRemaining)}
                  </Text>
                </View>
              </TouchableOpacity>

              <View style={styles.miniActionsRow}>
                <TouchableOpacity
                  style={[styles.miniActionButton, styles.miniEndButton]}
                  onPress={requestEndWorkout}
                  activeOpacity={0.82}
                >
                  <MaterialCommunityIcons
                    name="stop-circle-outline"
                    size={18}
                    color={theme.colors.danger}
                  />
                  <Text
                    style={styles.miniEndButtonText}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                  >
                    End Workout
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.miniActionButton, styles.miniSkipButton]}
                  onPress={skipRest}
                  activeOpacity={0.82}
                >
                  <MaterialCommunityIcons
                    name="skip-next"
                    size={18}
                    color={theme.colors.accent}
                  />
                  <Text
                    style={styles.miniSkipButtonText}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                  >
                    Skip Rest
                  </Text>
                </TouchableOpacity>
              </View>
            </>
          ) : (
            <View style={styles.miniClassicRow}>
              <TouchableOpacity
                style={styles.miniClassicMain}
                activeOpacity={0.86}
                onPress={openWorkoutSheet}
              >
                <View style={styles.miniStatusIcon}>
                  <MaterialCommunityIcons
                    name="dumbbell"
                    size={18}
                    color={theme.colors.accent}
                  />
                </View>
                <View style={styles.miniClassicTextBlock}>
                  <Text style={styles.miniClassicTitle} numberOfLines={1}>
                    Active Workout
                  </Text>
                  <Text
                    style={styles.miniClassicTime}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                  >
                    {formatElapsed(elapsed)}
                  </Text>
                </View>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.miniActionButton,
                  styles.miniEndButton,
                  styles.miniClassicEndButton,
                ]}
                onPress={requestEndWorkout}
                activeOpacity={0.82}
              >
                <MaterialCommunityIcons
                  name="stop-circle-outline"
                  size={18}
                  color={theme.colors.danger}
                />
                <Text
                  style={styles.miniEndButtonText}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                >
                  End Workout
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.miniOpenPill}
                activeOpacity={0.82}
                onPress={openWorkoutSheet}
              >
                <MaterialCommunityIcons
                  name="chevron-up"
                  size={20}
                  color={theme.colors.textMuted}
                />
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    </GestureDetector>
  )
}

const TabBarItem = React.memo(function TabBarItem({
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
    iconScale.value = withTiming(focused ? 1.08 : 1, {
      duration: TAB_ICON_ANIMATION_MS,
      easing: ReanimatedEasing.out(ReanimatedEasing.quad),
    })
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
      activeOpacity={0.82}
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
})

function CustomTabBar(props: BottomTabBarProps) {
  const { state, descriptors, navigation } = props
  const { styles } = useStyles(stylesheet)
  const insets = useSafeAreaInsets()
  const activeWorkoutId = useSessionStore((s) => s.activeWorkoutId)
  const focusedRoute = state.routes[state.index]
  const focusedRouteName = getFocusedRouteNameFromRoute(focusedRoute) ?? focusedRoute.name
  const bottomPadding = Math.max(insets.bottom + TAB_BAR_EXTRA_BOTTOM_PADDING, 18)
  const [tabBarWidth, setTabBarWidth] = useState(0)
  const activeIndex = useSharedValue(state.index)

  useEffect(() => {
    activeIndex.value = withTiming(state.index, {
      duration: TAB_TRANSITION_MS,
      easing: ReanimatedEasing.out(ReanimatedEasing.cubic),
    })
  }, [activeIndex, state.index])

  const handleTabBarLayout = useCallback((event: LayoutChangeEvent) => {
    const nextWidth = event.nativeEvent.layout.width
    setTabBarWidth((currentWidth) =>
      currentWidth === nextWidth ? currentWidth : nextWidth,
    )
  }, [])

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

  if (FULL_SCREEN_ROUTES.has(focusedRouteName)) {
    return null
  }

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
            activeIndex.value = withTiming(index, {
              duration: TAB_TRANSITION_MS,
              easing: ReanimatedEasing.out(ReanimatedEasing.cubic),
            })
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            })

            if (event.defaultPrevented) {
              activeIndex.value = withTiming(state.index, {
                duration: TAB_RESET_ANIMATION_MS,
                easing: ReanimatedEasing.out(ReanimatedEasing.quad),
              })
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

function renderCustomTabBar(props: BottomTabBarProps) {
  return <CustomTabBar {...props} />
}

export default function TabNavigator() {
  const { styles } = useStyles(stylesheet)

  return (
    <View style={styles.navigatorRoot}>
      <Tab.Navigator
        detachInactiveScreens
        tabBar={renderCustomTabBar}
        screenOptions={TAB_SCREEN_OPTIONS}
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
    </View>
  )
}

const stylesheet = createStyleSheet((theme) => ({
  navigatorRoot: {
    flex: 1,
    backgroundColor: theme.colors.bg,
  },
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
    paddingHorizontal: 14,
    paddingVertical: 10,
    minHeight: 108,
    overflow: 'hidden',
    marginHorizontal: -0.5,
    marginBottom: -1,
    gap: 8,
  },
  miniBarCompact: {
    minHeight: 58,
    paddingVertical: 8,
    gap: 0,
  },
  miniBarResting: {
    borderColor: theme.colors.accentMuted,
  },
  miniClassicRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  miniClassicMain: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 40,
  },
  miniClassicTextBlock: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  miniClassicTitle: {
    color: theme.colors.text,
    fontSize: 14,
    fontFamily: theme.fontFamily.semiBold,
  },
  miniClassicTime: {
    color: theme.colors.accent,
    fontSize: 18,
    fontFamily: theme.fontFamily.extraBold,
  },
  miniClassicEndButton: {
    flex: 0,
    minWidth: 128,
    minHeight: 38,
  },
  miniBarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    minHeight: 34,
  },
  miniBarTitleGroup: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  miniStatusIcon: {
    width: 32,
    height: 32,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.surface2,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  miniStatusIconResting: {
    backgroundColor: theme.colors.accentMuted,
    borderColor: theme.colors.accentMuted,
  },
  miniBarTitle: {
    color: theme.colors.text,
    fontSize: 14,
    fontFamily: theme.fontFamily.bold,
  },
  miniOpenPill: {
    width: 30,
    height: 30,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  miniStatsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  miniStatBlock: {
    flex: 1,
    minWidth: 0,
    minHeight: 46,
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface2,
    justifyContent: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 2,
  },
  miniStatLabel: {
    color: theme.colors.textMuted,
    fontSize: 9,
    fontFamily: theme.fontFamily.extraBold,
    textTransform: 'uppercase',
  },
  miniStatValue: {
    color: theme.colors.accent,
    fontSize: 16,
    fontFamily: theme.fontFamily.black,
  },
  miniRestValue: {
    color: theme.colors.text,
  },
  miniActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  miniActionButton: {
    flex: 1,
    minWidth: 0,
    minHeight: 34,
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 10,
  },
  miniEndButton: {
    borderColor: theme.colors.dangerMuted,
    backgroundColor: theme.colors.dangerMuted,
  },
  miniEndButtonText: {
    color: theme.colors.danger,
    fontSize: 13,
    fontFamily: theme.fontFamily.extraBold,
  },
  miniSkipButton: {
    borderColor: theme.colors.accentMuted,
    backgroundColor: theme.colors.accentMuted,
  },
  miniSkipButtonText: {
    color: theme.colors.accent,
    fontSize: 13,
    fontFamily: theme.fontFamily.extraBold,
  },
}))
