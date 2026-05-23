import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  InteractionManager,
  LayoutAnimation,
  Platform,
  ScrollView,
  Text,
  TouchableOpacity,
  UIManager,
  View,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  BACK_MUSCLES,
  FRONT_MUSCLES,
  getMuscleColor,
  type MuscleDef,
} from 'body-muscles';
import { Canvas, Group, Path } from '@shopify/react-native-skia';
import Reanimated, {
  Easing as ReanimatedEasing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { createStyleSheet, useStyles } from 'react-native-unistyles';
import ScreenHeader, { useHeaderFade } from '@/components/ui/ScreenHeader';
import ThemedDialog, { type ThemedDialogAction } from '@/components/ui/ThemedDialog';
import {
  WorkoutDetailModal,
  WorkoutSummaryCard,
} from '@/components/WorkoutHistory';
import { getProfile } from '@/db/profileHelpers';
import {
  createWorkout,
  createWorkoutId,
  getFavoriteWorkoutTemplates,
  getMuscleGroupFatigue,
  getRecentCompletedWorkouts,
  getWorkoutTemplates,
  getWorkoutDetail,
  type MuscleGroupFatigue,
  type WorkoutTemplateSummary,
  type WorkoutDetail,
  type WorkoutSummary,
} from '@/db/workoutHelpers';
import { getDefaultMuscleRecoveryHours } from '@/services/muscleRecoverySettings';
import { getScheduledTemplateForToday } from '@/services/workoutSchedule';
import { useSessionStore } from '@/store/sessionStore';
import type { HomeStackParamList } from '../navigation/TabNavigator';

type DialogState = {
  title: string;
  message?: string;
  actions: ThemedDialogAction[];
};

function formatRecoveryHours(hours: number) {
  if (hours <= 0) return 'Ready';
  if (hours < 1) return '<1h';
  const roundedHours = Math.ceil(hours);
  if (roundedHours < 24) return `${roundedHours}h`;
  const days = Math.floor(roundedHours / 24);
  const remainderHours = roundedHours % 24;
  return remainderHours > 0 ? `${days}d ${remainderHours}h` : `${days}d`;
}

function getFatigueIntensity(fatigue: number) {
  if (fatigue <= 0) return 0;
  return Math.max(1, Math.min(10, Math.ceil(fatigue * 10)));
}

function formatFatigueSummary(groups: MuscleGroupFatigue[], loading: boolean) {
  if (loading) return 'Calculating recovery from recent workouts.';
  if (groups.length === 0) return 'Body is fully recovered.';

  const names = groups.map(group => group.name);
  const muscleText =
    names.length === 1
      ? names[0]
      : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  const longestWait = Math.max(
    ...groups.map(group => group.restHoursRemaining),
  );

  return `${muscleText} ${
    names.length === 1 ? 'is' : 'are'
  } fatigued. Longest wait ${formatRecoveryHours(longestWait)}.`;
}

function formatDate(timestamp: number) {
  return new Date(timestamp).toLocaleDateString([], {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });
}

function getDayKey(timestamp: number) {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function formatCount(count: number, singular: string) {
  return `${count} ${count === 1 ? singular : `${singular}s`}`;
}

const BODY_MUSCLE_GROUP_BY_ID: Record<string, string[]> = {
  head: [],
  face: [],
  'head-back': [],
  'neck-left': [],
  'neck-right': [],
  nape: [],
  'shoulder-front-left': ['Front Delts', 'Shoulders'],
  'shoulder-side-left': ['Side Delts', 'Shoulders'],
  'shoulder-front-right': ['Front Delts', 'Shoulders'],
  'shoulder-side-right': ['Side Delts', 'Shoulders'],
  'deltoid-rear-left': ['Rear Delts', 'Shoulders'],
  'deltoid-rear-right': ['Rear Delts', 'Shoulders'],
  'traps-upper-left': ['Traps', 'Upper Back', 'Back'],
  'traps-mid-left': ['Traps', 'Upper Back', 'Back'],
  'traps-lower-left': ['Traps', 'Upper Back', 'Back'],
  'traps-upper-right': ['Traps', 'Upper Back', 'Back'],
  'traps-mid-right': ['Traps', 'Upper Back', 'Back'],
  'traps-lower-right': ['Traps', 'Upper Back', 'Back'],
  'biceps-left': ['Biceps'],
  'biceps-right': ['Biceps'],
  'elbow-left': [],
  'elbow-right': [],
  'triceps-long-left': ['Triceps'],
  'triceps-lateral-left': ['Triceps'],
  'triceps-long-right': ['Triceps'],
  'triceps-lateral-right': ['Triceps'],
  'hand-left': [],
  'hand-right': [],
  'hand-back-left': [],
  'hand-back-right': [],
  'forearm-left': ['Forearms'],
  'forearm-right': ['Forearms'],
  'forearm-flexors-left': ['Forearms'],
  'forearm-extensors-left': ['Forearms'],
  'forearm-flexors-right': ['Forearms'],
  'forearm-extensors-right': ['Forearms'],
  'chest-upper-left': ['Upper Chest', 'Chest'],
  'chest-lower-left': ['Mid Chest', 'Chest'],
  'chest-upper-right': ['Upper Chest', 'Chest'],
  'chest-lower-right': ['Mid Chest', 'Chest'],
  'abs-upper-left': ['Abs', 'Core'],
  'abs-upper-right': ['Abs', 'Core'],
  'abs-lower-left': ['Abs', 'Core'],
  'abs-lower-right': ['Abs', 'Core'],
  'serratus-anterior-left': ['Obliques', 'Core'],
  'serratus-anterior-right': ['Obliques', 'Core'],
  'obliques-left': ['Obliques', 'Core'],
  'obliques-right': ['Obliques', 'Core'],
  'hip-flexor-left': ['Core'],
  'hip-flexor-right': ['Core'],
  spine: ['Upper Back', 'Lower Back', 'Back'],
  'lats-upper-left': ['Lats', 'Back'],
  'lats-mid-left': ['Lats', 'Back'],
  'lats-lower-left': ['Lats', 'Back'],
  'lats-upper-right': ['Lats', 'Back'],
  'lats-mid-right': ['Lats', 'Back'],
  'lats-lower-right': ['Lats', 'Back'],
  'lower-back-erectors-left': ['Lower Back', 'Back'],
  'lower-back-ql-left': ['Lower Back', 'Back'],
  'lower-back-erectors-right': ['Lower Back', 'Back'],
  'lower-back-ql-right': ['Lower Back', 'Back'],
  'gluteus-medius-left': ['Abductors', 'Glutes'],
  'gluteus-maximus-left': ['Glutes'],
  'gluteus-medius-right': ['Abductors', 'Glutes'],
  'gluteus-maximus-right': ['Glutes'],
  'quads-left': ['Quads', 'Legs'],
  'quads-right': ['Quads', 'Legs'],
  'adductors-left': ['Adductors', 'Legs'],
  'adductors-right': ['Adductors', 'Legs'],
  'knee-left': [],
  'knee-right': [],
  'knee-back-left': [],
  'knee-back-right': [],
  'tibialis-anterior-left': ['Legs'],
  'tibialis-anterior-right': ['Legs'],
  'foot-left': [],
  'foot-right': [],
  'foot-back-left': [],
  'foot-back-right': [],
  'hamstrings-medial-left': ['Hamstrings', 'Legs'],
  'hamstrings-lateral-left': ['Hamstrings', 'Legs'],
  'hamstrings-medial-right': ['Hamstrings', 'Legs'],
  'hamstrings-lateral-right': ['Hamstrings', 'Legs'],
  'calves-gastroc-medial-left': ['Calves', 'Legs'],
  'calves-gastroc-lateral-left': ['Calves', 'Legs'],
  'calves-soleus-left': ['Calves', 'Legs'],
  'calves-gastroc-medial-right': ['Calves', 'Legs'],
  'calves-gastroc-lateral-right': ['Calves', 'Legs'],
  'calves-soleus-right': ['Calves', 'Legs'],
};

const FRONT_BODY_MUSCLES = FRONT_MUSCLES.filter(muscle =>
  Object.prototype.hasOwnProperty.call(BODY_MUSCLE_GROUP_BY_ID, muscle.id),
);

const BACK_BODY_MUSCLES = BACK_MUSCLES.filter(muscle =>
  Object.prototype.hasOwnProperty.call(BODY_MUSCLE_GROUP_BY_ID, muscle.id),
);

const BODY_CARD_ANIMATION_MS = 180;

if (Platform.OS === 'android') {
  UIManager.setLayoutAnimationEnabledExperimental?.(true);
}

function animateBodyCardLayout() {
  LayoutAnimation.configureNext({
    duration: BODY_CARD_ANIMATION_MS,
    create: {
      type: LayoutAnimation.Types.easeInEaseOut,
      property: LayoutAnimation.Properties.opacity,
    },
    update: {
      type: LayoutAnimation.Types.easeInEaseOut,
    },
    delete: {
      type: LayoutAnimation.Types.easeInEaseOut,
      property: LayoutAnimation.Properties.opacity,
    },
  });
}

export default function HomeScreen() {
  const { styles, theme } = useStyles(stylesheet);
  const navigation =
    useNavigation<NativeStackNavigationProp<HomeStackParamList>>();
  const [name, setName] = useState<string>('');
  const [recentWorkouts, setRecentWorkouts] = useState<WorkoutSummary[]>([]);
  const [favoriteTemplates, setFavoriteTemplates] = useState<
    WorkoutTemplateSummary[]
  >([]);
  const [todayScheduledTemplate, setTodayScheduledTemplate] =
    useState<WorkoutTemplateSummary | null>(null);
  const [muscleFatigue, setMuscleFatigue] = useState<MuscleGroupFatigue[]>([]);
  const [selectedWorkoutId, setSelectedWorkoutId] = useState<string | null>(
    null,
  );
  const [selectedWorkout, setSelectedWorkout] = useState<WorkoutDetail | null>(
    null,
  );
  const [workoutDetailLoading, setWorkoutDetailLoading] = useState(false);
  const [expandedWorkoutIds, setExpandedWorkoutIds] = useState<
    Record<string, boolean>
  >({});
  const [workoutPreviews, setWorkoutPreviews] = useState<
    Record<string, WorkoutDetail | null>
  >({});
  const [previewLoading, setPreviewLoading] = useState<Record<string, boolean>>(
    {},
  );
  const [loading, setLoading] = useState(true);
  const [homeLoaded, setHomeLoaded] = useState(false);
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const { showHeaderFade, handleHeaderScroll } = useHeaderFade();
  const startWorkout = useSessionStore(s => s.startWorkout);
  const endWorkout = useSessionStore(s => s.endWorkout);
  const openWorkoutSheet = useSessionStore(s => s.openWorkoutSheet);
  const activeWorkoutId = useSessionStore(s => s.activeWorkoutId);
  const previousActiveWorkoutIdRef = useRef<string | null>(activeWorkoutId);
  const homeLoadRequestRef = useRef(0);
  const homeLoadedRef = useRef(false);
  const workoutDetailRequestRef = useRef(0);
  const previewRequestRef = useRef<Record<string, number>>({});

  const loadHome = useCallback(async (showLoading = true) => {
    const requestId = homeLoadRequestRef.current + 1;
    homeLoadRequestRef.current = requestId;
    if (showLoading) setLoading(true);
    try {
      const recoveryHours = getDefaultMuscleRecoveryHours();
      const todayScheduledTemplateId = getScheduledTemplateForToday();
      const allTemplatesPromise = todayScheduledTemplateId
        ? getWorkoutTemplates()
        : Promise.resolve<WorkoutTemplateSummary[]>([]);
      const [profile, workouts, templates, fatigue, allTemplates] = await Promise.all([
        getProfile(),
        getRecentCompletedWorkouts(3),
        getFavoriteWorkoutTemplates(),
        getMuscleGroupFatigue(recoveryHours),
        allTemplatesPromise,
      ]);
      if (homeLoadRequestRef.current !== requestId) return;
      setName(profile?.name ?? '');
      setRecentWorkouts(workouts);
      setFavoriteTemplates(templates);
      setMuscleFatigue(fatigue);
      setTodayScheduledTemplate(
        todayScheduledTemplateId
          ? allTemplates.find((template) => template.id === todayScheduledTemplateId) ?? null
          : null,
      );
      setExpandedWorkoutIds({});
      setWorkoutPreviews({});
      setPreviewLoading({});
      previewRequestRef.current = {};
      homeLoadedRef.current = true;
      setHomeLoaded(true);
    } catch (e) {
      if (homeLoadRequestRef.current !== requestId) return;
      console.error('Failed to load home screen', e);
      if (!homeLoadedRef.current) {
        setRecentWorkouts([]);
        setFavoriteTemplates([]);
        setMuscleFatigue([]);
        setTodayScheduledTemplate(null);
      }
    } finally {
      if (homeLoadRequestRef.current === requestId) {
        setLoading(false);
      }
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      let isActive = true;
      const task = InteractionManager.runAfterInteractions(() => {
        if (!isActive) return;

        loadHome(!homeLoadedRef.current).catch(console.error);
      });

      return () => {
        isActive = false;
        task.cancel();
        homeLoadRequestRef.current += 1;
      };
    }, [loadHome]),
  );

  useEffect(() => {
    const previousActiveWorkoutId = previousActiveWorkoutIdRef.current;
    previousActiveWorkoutIdRef.current = activeWorkoutId;

    if (previousActiveWorkoutId && !activeWorkoutId) {
      loadHome(false).catch(console.error);
    }
  }, [activeWorkoutId, loadHome]);

  function handleStartWorkout() {
    if (activeWorkoutId) {
      openWorkoutSheet();
      return;
    }

    const workoutId = createWorkoutId();
    const startedAt = Date.now();
    startWorkout(workoutId, startedAt);
    createWorkout({ id: workoutId, startedAt }).catch(e => {
      if (useSessionStore.getState().activeWorkoutId === workoutId) {
        endWorkout();
      }
      setDialog({
        title: 'Could Not Start Workout',
        message: 'Could not start workout.',
        actions: [{ label: 'OK', variant: 'primary', onPress: () => setDialog(null) }],
      });
      console.error(e);
    });
  }

  function handleTemplatesPress() {
    navigation.navigate('Templates');
  }

  function toggleWorkoutPreview(workoutId: string) {
    setExpandedWorkoutIds(prev => ({ ...prev, [workoutId]: !prev[workoutId] }));
    if (workoutPreviews[workoutId] !== undefined || previewLoading[workoutId])
      return;

    const requestId = (previewRequestRef.current[workoutId] ?? 0) + 1;
    previewRequestRef.current[workoutId] = requestId;
    setPreviewLoading(prev => ({ ...prev, [workoutId]: true }));
    getWorkoutDetail(workoutId)
      .then(detail => {
        if (previewRequestRef.current[workoutId] !== requestId) return;
        setWorkoutPreviews(prev => ({ ...prev, [workoutId]: detail }));
      })
      .catch(e => {
        if (previewRequestRef.current[workoutId] !== requestId) return;
        console.error('Failed to load workout preview', e);
        setWorkoutPreviews(prev => ({ ...prev, [workoutId]: null }));
      })
      .finally(() => {
        if (previewRequestRef.current[workoutId] !== requestId) return;
        setPreviewLoading(prev => ({ ...prev, [workoutId]: false }));
      });
  }

  function openWorkout(workoutId: string) {
    const requestId = workoutDetailRequestRef.current + 1;
    workoutDetailRequestRef.current = requestId;
    setSelectedWorkoutId(workoutId);
    setSelectedWorkout(null);
    setWorkoutDetailLoading(true);

    getWorkoutDetail(workoutId)
      .then(detail => {
        if (workoutDetailRequestRef.current !== requestId) return;
        setSelectedWorkout(detail);
      })
      .catch(e => {
        if (workoutDetailRequestRef.current !== requestId) return;
        console.error('Failed to load workout detail', e);
      })
      .finally(() => {
        if (workoutDetailRequestRef.current !== requestId) return;
        setWorkoutDetailLoading(false);
      });
  }

  function closeWorkoutDetail() {
    workoutDetailRequestRef.current += 1;
    setSelectedWorkoutId(null);
    setSelectedWorkout(null);
    setWorkoutDetailLoading(false);
  }

  function handleWorkoutRenamed(workoutId: string, workoutName: string) {
    setRecentWorkouts(prev =>
      prev.map(workout =>
        workout.id === workoutId
          ? { ...workout, name: workoutName.trim() || null }
          : workout,
      ),
    );
    setSelectedWorkout(prev =>
      prev?.id === workoutId
        ? { ...prev, name: workoutName.trim() || null }
        : prev,
    );
  }

  function handleWorkoutUpdated(workoutId: string, workout: WorkoutDetail) {
    setSelectedWorkout(workout);
    setWorkoutPreviews(prev => ({ ...prev, [workoutId]: workout }));
    loadHome(false).catch(console.error);
  }

  function handleWorkoutDeleted(workoutId: string) {
    workoutDetailRequestRef.current += 1;
    setSelectedWorkoutId(null);
    setSelectedWorkout(null);
    setWorkoutDetailLoading(false);
    setRecentWorkouts(prev => prev.filter(workout => workout.id !== workoutId));
    setExpandedWorkoutIds(prev => {
      const next = { ...prev };
      delete next[workoutId];
      return next;
    });
    setWorkoutPreviews(prev => {
      const next = { ...prev };
      delete next[workoutId];
      return next;
    });
    setPreviewLoading(prev => {
      const next = { ...prev };
      delete next[workoutId];
      return next;
    });
    delete previewRequestRef.current[workoutId];
    loadHome(false).catch(console.error);
  }

  const isWorkoutActive = Boolean(activeWorkoutId);
  const isInitialLoading = loading && !homeLoaded;
  const recentWorkoutGroups = useMemo(
    () =>
      recentWorkouts.reduce<
        Array<{ dayKey: string; dateLabel: string; workouts: WorkoutSummary[] }>
      >((groups, workout) => {
        const dayKey = getDayKey(workout.startedAt);
        const existingGroup = groups.find(group => group.dayKey === dayKey);

        if (existingGroup) {
          existingGroup.workouts.push(workout);
        } else {
          groups.push({
            dayKey,
            dateLabel: formatDate(workout.startedAt),
            workouts: [workout],
          });
        }

        return groups;
      }, []),
    [recentWorkouts],
  );
  const favoriteTemplateRows = useMemo(
    () =>
      favoriteTemplates.reduce<WorkoutTemplateSummary[][]>(
        (rows, template, index) => {
          if (index % 2 === 0) {
            rows.push([template]);
          } else {
            rows[rows.length - 1].push(template);
          }

          return rows;
        },
        [],
      ),
    [favoriteTemplates],
  );

  return (
    <View style={styles.container}>
      <ScreenHeader
        title={name || 'Athlete'}
        eyebrow="Welcome back"
        showFade={showHeaderFade}
        titleRight={
          <View style={styles.heroIcon}>
            <MaterialCommunityIcons
              name="dumbbell"
              size={24}
              color={theme.colors.accent}
            />
          </View>
        }
      />

      <ScrollView
        style={styles.scrollArea}
        contentContainerStyle={styles.content}
        onScroll={handleHeaderScroll}
        scrollEventThrottle={16}
      >
        <MuscleRecoveryCard fatigue={muscleFatigue} loading={isInitialLoading} />

        <View
          style={[
            styles.startWorkoutGlow,
            isWorkoutActive && styles.startWorkoutGlowDisabled,
          ]}
        >
          <TouchableOpacity
            style={[
              styles.startWorkoutButton,
              isWorkoutActive && styles.startWorkoutButtonDisabled,
            ]}
            onPress={handleStartWorkout}
            accessibilityRole="button"
            accessibilityLabel={
              isWorkoutActive ? 'Open active workout' : 'Start workout'
            }
            activeOpacity={0.82}
          >
            <View
              style={[
                styles.primaryIcon,
                isWorkoutActive && styles.primaryIconDisabled,
              ]}
            >
              <MaterialCommunityIcons
                name={isWorkoutActive ? 'timer-sand' : 'plus'}
                size={21}
                color={isWorkoutActive ? theme.colors.textMuted : '#FFFFFF'}
              />
            </View>
            <View style={styles.primaryTextBlock}>
              <Text
                style={[
                  styles.startWorkoutText,
                  isWorkoutActive && styles.startWorkoutTextDisabled,
                ]}
              >
                {isWorkoutActive
                  ? 'Active Workout'
                  : 'Start Workout'}
              </Text>
              <Text
                style={[
                  styles.actionSubtitle,
                  !isWorkoutActive && styles.primaryActionSubtitle,
                ]}
              >
                {isWorkoutActive
                  ? 'Tap to open your current session.'
                  : 'Track sets and rest live.'}
              </Text>
            </View>
          </TouchableOpacity>
        </View>

        {todayScheduledTemplate ? (
          <TouchableOpacity
            style={styles.scheduledTemplateCard}
            onPress={() =>
              navigation.navigate('TemplateDetail', {
                templateId: todayScheduledTemplate.id,
              })
            }
            accessibilityRole="button"
            accessibilityLabel={`Open ${todayScheduledTemplate.name}`}
            activeOpacity={0.82}
          >
            <View style={styles.scheduledTemplateIcon}>
              <MaterialCommunityIcons
                name="calendar-check-outline"
                size={20}
                color={theme.colors.accent}
              />
            </View>
            <View style={styles.scheduledTemplateTextBlock}>
              <View style={styles.scheduledTemplateLabelPill}>
                <MaterialCommunityIcons
                  name="clock-outline"
                  size={12}
                  color={theme.colors.accent}
                />
                <Text style={styles.scheduledTemplateEyebrow}>
                  Scheduled Today
                </Text>
              </View>
              <Text style={styles.scheduledTemplateTitle} numberOfLines={1}>
                {todayScheduledTemplate.name}
              </Text>
              <Text style={styles.scheduledTemplateMeta} numberOfLines={1}>
                {formatCount(todayScheduledTemplate.exerciseCount, 'exercise')}{' '}
                - {formatCount(todayScheduledTemplate.totalSetCount, 'set')}
              </Text>
            </View>
            <View style={styles.scheduledTemplateActionIcon}>
              <MaterialCommunityIcons
                name="chevron-right"
                size={20}
                color={theme.colors.accent}
              />
            </View>
          </TouchableOpacity>
        ) : null}

        <TouchableOpacity
          style={styles.templatesButton}
          onPress={handleTemplatesPress}
          accessibilityRole="button"
          accessibilityLabel="Open templates"
          activeOpacity={0.82}
        >
          <View style={styles.secondaryIcon}>
            <MaterialCommunityIcons
              name="clipboard-text-outline"
              size={21}
              color={theme.colors.accent}
            />
          </View>
          <View style={styles.templatesTextBlock}>
            <Text style={styles.templatesTitle}>Templates</Text>
            <Text style={styles.actionSubtitle}>
              Build repeatable workout plans.
            </Text>
          </View>
          <MaterialCommunityIcons
            name="chevron-right"
            size={20}
            color={theme.colors.textMuted}
          />
        </TouchableOpacity>

        {favoriteTemplates.length > 0 ? (
          <View style={styles.favoriteTemplatesBlock}>
            <View style={styles.favoriteTemplatesHeader}>
              <Text style={styles.favoriteTemplatesTitle}>
                Favorite Templates
              </Text>
              <Text style={styles.sectionHint}>
                {favoriteTemplates.length}/6
              </Text>
            </View>
            <View style={styles.favoriteTemplateGrid}>
              {favoriteTemplateRows.map(row => (
                <View
                  key={row.map(template => template.id).join('-')}
                  style={styles.favoriteTemplateRow}
                >
                  {row.map(template => (
                    <TouchableOpacity
                      key={template.id}
                      style={styles.favoriteTemplateCard}
                      onPress={() =>
                        navigation.navigate('TemplateDetail', {
                          templateId: template.id,
                        })
                      }
                      accessibilityRole="button"
                      accessibilityLabel={`Open ${template.name}`}
                      activeOpacity={0.82}
                    >
                      <View style={styles.favoriteTemplateIcon}>
                        <MaterialCommunityIcons
                          name="star"
                          size={14}
                          color={theme.colors.accent}
                        />
                      </View>
                      <View style={styles.favoriteTemplateTextBlock}>
                        <Text
                          style={styles.favoriteTemplateName}
                          numberOfLines={1}
                        >
                          {template.name}
                        </Text>
                        <Text
                          style={styles.favoriteTemplateMeta}
                          numberOfLines={1}
                        >
                          {formatCount(template.exerciseCount, 'exercise')} -{' '}
                          {formatCount(template.totalSetCount, 'set')}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                  {row.length === 1 ? (
                    <View style={styles.favoriteTemplatePlaceholder} />
                  ) : null}
                </View>
              ))}
            </View>
          </View>
        ) : null}

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Recent Workouts</Text>
          <Text style={styles.sectionHint}>Last 3</Text>
        </View>

        {isInitialLoading ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>Loading recent workouts...</Text>
          </View>
        ) : recentWorkouts.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>No completed workouts yet.</Text>
          </View>
        ) : (
          recentWorkoutGroups.map(group => (
            <View key={group.dayKey} style={styles.workoutGroup}>
              <Text style={styles.workoutDateLabel}>{group.dateLabel}</Text>
              <View style={styles.workoutList}>
                {group.workouts.map(workout => (
                  <WorkoutSummaryCard
                    key={workout.id}
                    workout={workout}
                    expanded={Boolean(expandedWorkoutIds[workout.id])}
                    preview={workoutPreviews[workout.id]}
                    previewLoading={Boolean(previewLoading[workout.id])}
                    onOpen={() => openWorkout(workout.id)}
                    onToggle={() => toggleWorkoutPreview(workout.id)}
                  />
                ))}
              </View>
            </View>
          ))
        )}
      </ScrollView>

      <WorkoutDetailModal
        workoutId={selectedWorkoutId}
        workout={selectedWorkout}
        loading={workoutDetailLoading}
        onClose={closeWorkoutDetail}
        onDeleted={handleWorkoutDeleted}
        onRename={handleWorkoutRenamed}
        onUpdated={handleWorkoutUpdated}
      />
      <ThemedDialog
        visible={Boolean(dialog)}
        title={dialog?.title ?? ''}
        message={dialog?.message}
        actions={dialog?.actions ?? []}
      />
    </View>
  );
}

function MuscleRecoveryCard({
  fatigue,
  loading,
}: {
  fatigue: MuscleGroupFatigue[];
  loading: boolean;
}) {
  const { styles, theme } = useStyles(stylesheet);
  const [expanded, setExpanded] = useState(false);
  const cardProgress = useSharedValue(0);
  const fatigueByName = useMemo(
    () => Object.fromEntries(fatigue.map(group => [group.name, group])),
    [fatigue],
  );
  const fatigueByKey = useMemo(
    () =>
      Object.fromEntries(
        fatigue.map(group => [group.name.toLowerCase(), group]),
      ),
    [fatigue],
  );
  const fatiguedGroups = useMemo(
    () =>
      fatigue
        .filter(group => group.fatigue >= 0.1)
        .sort((a, b) => b.fatigue - a.fatigue)
        .slice(0, 4),
    [fatigue],
  );
  const peakFatigue = fatiguedGroups[0];
  const summary = formatFatigueSummary(fatiguedGroups, loading);
  const collapsedSummary = useMemo(() => {
    if (loading) return 'calculating';
    if (fatiguedGroups.length === 0) return 'fully recovered';
    return fatiguedGroups.map(group => group.name).join(', ');
  }, [fatiguedGroups, loading]);
  useEffect(() => {
    cardProgress.value = withTiming(expanded ? 1 : 0, {
      duration: BODY_CARD_ANIMATION_MS,
      easing: ReanimatedEasing.out(ReanimatedEasing.cubic),
    });
  }, [cardProgress, expanded]);

  const fatigueContentStyle = useAnimatedStyle(() => ({
    opacity: cardProgress.value,
    transform: [
      {
        translateY: -5 + cardProgress.value * 5,
      },
      {
        scale: 0.992 + cardProgress.value * 0.008,
      },
    ],
  }));
  const fatigueChevronStyle = useAnimatedStyle(() => ({
    transform: [
      {
        rotate: `${cardProgress.value * 180}deg`,
      },
    ],
  }));

  function expandCard() {
    animateBodyCardLayout();
    setExpanded(true);
  }

  function collapseCard() {
    animateBodyCardLayout();
    setExpanded(false);
  }

  function getMuscleColors(names: string | string[]) {
    const candidateNames = Array.isArray(names) ? names : [names];
    const value = Math.max(
      0,
      ...candidateNames.map(
        name =>
          fatigueByName[name]?.fatigue ??
          fatigueByKey[name.toLowerCase()]?.fatigue ??
          0,
      ),
    );
    const intensity = getFatigueIntensity(value);
    if (intensity > 0) {
      return {
        backgroundColor: getMuscleColor({ intensity, selected: false }, false),
        fatigue: value,
        intensity,
      };
    }
    return {
      backgroundColor: theme.colors.bg,
      fatigue: value,
      intensity,
    };
  }

  function getLegendStyle(intensity: 1 | 5 | 10) {
    return {
      backgroundColor: getMuscleColor({ intensity, selected: false }, false),
      borderColor: getMuscleColor({ intensity, selected: false }, false),
    };
  }

  if (!expanded) {
    return (
      <View style={styles.fatigueAnimationFrame}>
        <TouchableOpacity
          style={styles.fatigueMiniCard}
          onPress={expandCard}
          accessibilityRole="button"
          accessibilityLabel="Expand muscle fatigue"
          activeOpacity={0.82}
        >
          <View style={styles.fatigueMiniIcon}>
            <MaterialCommunityIcons
              name="battery-medium"
              size={21}
              color={theme.colors.accent}
            />
          </View>
          <View style={styles.fatigueMiniTextBlock}>
            <Text style={styles.fatigueMiniTitle} numberOfLines={1}>
              Muscle Fatigue
            </Text>
            <View style={styles.fatigueMiniMetaRow}>
              <View
                style={[
                  styles.fatigueMiniDot,
                  peakFatigue && styles.fatigueMiniDotActive,
                ]}
              />
              <Text style={styles.fatigueMiniMuscles} numberOfLines={1}>
                {collapsedSummary}
              </Text>
            </View>
          </View>
          {peakFatigue ? (
            <View style={styles.fatigueMiniTime}>
              <MaterialCommunityIcons
                name="timer-sand"
                size={11}
                color={theme.colors.accent}
              />
              <Text style={styles.fatigueMiniTimeText}>
                {formatRecoveryHours(peakFatigue.restHoursRemaining)}
              </Text>
            </View>
          ) : null}
          <View style={styles.fatigueChevronButton}>
            <MaterialCommunityIcons
              name="chevron-down"
              size={17}
              color={theme.colors.textMuted}
            />
          </View>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.fatigueAnimationFrame}>
      <View style={[styles.fatigueCard, styles.fatigueCardExpanded]}>
        <TouchableOpacity
          style={styles.fatigueHeader}
          onPress={expanded ? collapseCard : expandCard}
          accessibilityRole="button"
          accessibilityLabel="Collapse muscle fatigue"
          activeOpacity={0.82}
        >
          <View style={styles.fatigueHeaderIcon}>
            <MaterialCommunityIcons
              name="battery-medium"
              size={21}
              color={theme.colors.accent}
            />
          </View>
          <View style={styles.fatigueTitleBlock}>
            <Text style={styles.fatigueTitle} numberOfLines={1}>
              Muscle Fatigue
            </Text>
            <Text style={styles.fatigueSummaryText} numberOfLines={2}>
              {summary}
            </Text>
          </View>
          {peakFatigue ? (
            <View style={styles.recoveryPill}>
              <MaterialCommunityIcons
                name="timer-sand"
                size={11}
                color={theme.colors.accent}
              />
              <Text style={styles.recoveryPillText}>
                {formatRecoveryHours(peakFatigue.restHoursRemaining)}
              </Text>
            </View>
          ) : null}
          <View style={styles.fatigueChevronButton}>
            <Reanimated.View style={fatigueChevronStyle}>
              <MaterialCommunityIcons
                name="chevron-down"
                size={17}
                color={theme.colors.textMuted}
              />
            </Reanimated.View>
          </View>
        </TouchableOpacity>

        <Reanimated.View
          pointerEvents={expanded ? 'auto' : 'none'}
          style={[styles.fatigueExpandable, fatigueContentStyle]}
        >
          <View style={styles.fatigueExpandedContent}>
            <View style={styles.fatigueVisualPanel}>
              <View style={styles.bodyMapPair}>
                <BodyFatigueDiagram
                  side="front"
                  getMuscleColors={getMuscleColors}
                />
                <BodyFatigueDiagram
                  side="back"
                  getMuscleColors={getMuscleColors}
                />
              </View>

              <View style={styles.fatigueLegend}>
                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, getLegendStyle(10)]} />
                  <Text style={styles.legendText}>Recent</Text>
                </View>
                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, getLegendStyle(5)]} />
                  <Text style={styles.legendText}>Recovering</Text>
                </View>
                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, getLegendStyle(1)]} />
                  <Text style={styles.legendText}>Nearly ready</Text>
                </View>
              </View>
            </View>

            <View style={styles.fatigueRecoveryPanel}>
              {loading ? (
                <Text style={styles.fatigueEmptyText}>Loading recovery...</Text>
              ) : fatiguedGroups.length === 0 ? (
                <Text style={styles.fatigueEmptyText}>
                  Body is fully recovered.
                </Text>
              ) : (
                <View style={styles.fatigueList}>
                  {fatiguedGroups.map(group => (
                    <View key={group.name} style={styles.fatigueRow}>
                      <View style={styles.fatigueRowNameBlock}>
                        <Text
                          style={styles.fatigueMuscleName}
                          numberOfLines={1}
                        >
                          {group.name}
                        </Text>
                      </View>
                      <Text style={styles.fatigueTime}>
                        {formatRecoveryHours(group.restHoursRemaining)}
                      </Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          </View>
        </Reanimated.View>
      </View>
    </View>
  );
}

function BodyFatigueDiagram({
  side,
  getMuscleColors,
}: {
  side: 'front' | 'back';
  getMuscleColors: (names: string | string[]) => {
    backgroundColor: string;
    fatigue: number;
    intensity: number;
  };
}) {
  const { styles, theme } = useStyles(stylesheet);
  const isFront = side === 'front';
  const muscles = isFront ? FRONT_BODY_MUSCLES : BACK_BODY_MUSCLES;
  const transform = isFront
    ? [{ translateX: 35 }, { translateY: 8 }, { scale: 3.28 }]
    : [{ translateX: -95 }, { translateY: 8 }, { scale: 3.28 }];

  function getPartColors(muscle: MuscleDef) {
    const groupNames = BODY_MUSCLE_GROUP_BY_ID[muscle.id] ?? [];
    if (groupNames.length === 0) {
      return {
        backgroundColor: theme.colors.bg,
        fatigue: 0,
        intensity: 0,
      };
    }

    return getMuscleColors(groupNames);
  }

  const renderedMuscles = muscles
    .map(muscle => ({
      muscle,
      colors: getPartColors(muscle),
    }))
    .sort((a, b) => a.colors.fatigue - b.colors.fatigue);

  function musclePath({
    muscle,
    colors,
  }: {
    muscle: MuscleDef;
    colors: { backgroundColor: string; fatigue: number; intensity: number };
  }) {
    return (
      <Path key={muscle.id} path={muscle.path} color={colors.backgroundColor} />
    );
  }

  return (
    <View style={styles.bodyMapFrame}>
      <Canvas style={styles.bodyCanvas}>
        <Group transform={transform}>{renderedMuscles.map(musclePath)}</Group>
      </Canvas>
    </View>
  );
}

const stylesheet = createStyleSheet(theme => ({
  container: {
    flex: 1,
    backgroundColor: theme.colors.bg,
  },
  scrollArea: {
    flex: 1,
  },
  content: {
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.md,
    paddingBottom: theme.spacing.xl,
    gap: theme.spacing.md,
  },
  heroIcon: {
    width: 48,
    height: 48,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.accentMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fatigueAnimationFrame: {
    width: '100%',
    overflow: 'hidden',
  },
  fatigueMiniCard: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 8,
    gap: theme.spacing.sm,
  },
  fatigueMiniIcon: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fatigueMiniTextBlock: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
    gap: 2,
  },
  fatigueMiniTitle: {
    color: theme.colors.text,
    fontSize: theme.fontSize.xs,
    fontFamily: theme.fontFamily.extraBold,
    lineHeight: 14,
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
  fatigueMiniMetaRow: {
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  fatigueMiniDot: {
    width: 5,
    height: 5,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.textMuted,
    opacity: 0.58,
  },
  fatigueMiniDotActive: {
    backgroundColor: theme.colors.accent,
    opacity: 1,
  },
  fatigueMiniMuscles: {
    flex: 1,
    minWidth: 0,
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
    lineHeight: 14,
    fontFamily: theme.fontFamily.semiBold,
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
  fatigueMiniTime: {
    height: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.surface2,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: 8,
  },
  fatigueMiniTimeText: {
    color: theme.colors.text,
    fontSize: 10,
    lineHeight: 12,
    fontFamily: theme.fontFamily.extraBold,
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
  fatigueChevronButton: {
    width: 24,
    height: 24,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.surface2,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fatigueCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
    gap: theme.spacing.sm,
  },
  fatigueCardCollapsed: {
    height: 40,
    paddingHorizontal: 7,
    paddingVertical: 0,
    justifyContent: 'center',
  },
  fatigueCardExpanded: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
    gap: theme.spacing.sm,
  },
  fatigueHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
    minHeight: 30,
  },
  fatigueHeaderCollapsed: {
    minHeight: 34,
    height: 34,
    alignItems: 'center',
  },
  fatigueHeaderIcon: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fatigueTitleBlock: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
  },
  fatigueEyebrow: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
    fontFamily: theme.fontFamily.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  fatigueTitle: {
    color: theme.colors.text,
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.extraBold,
  },
  fatigueSummaryText: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
    fontFamily: theme.fontFamily.semiBold,
    marginTop: 1,
    lineHeight: 15,
  },
  fatigueCollapsedIcon: {
    width: 22,
    height: 22,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fatigueCollapsedCopy: {
    flex: 1,
    minWidth: 0,
    height: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  fatigueCollapsedTitle: {
    color: theme.colors.text,
    fontSize: theme.fontSize.xs,
    lineHeight: 18,
    fontFamily: theme.fontFamily.extraBold,
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
  fatigueCollapsedText: {
    flex: 1,
    minWidth: 0,
    color: theme.colors.textMuted,
    fontSize: 10,
    lineHeight: 18,
    fontFamily: theme.fontFamily.semiBold,
    fontStyle: 'italic',
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
  recoveryPill: {
    height: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.surface2,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: 8,
  },
  recoveryPillText: {
    color: theme.colors.text,
    fontSize: 10,
    lineHeight: 12,
    fontFamily: theme.fontFamily.extraBold,
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
  fatigueExpandable: {
    overflow: 'hidden',
  },
  fatigueExpandedContent: {
    gap: theme.spacing.sm,
    paddingTop: theme.spacing.xs,
  },
  fatigueVisualPanel: {
    backgroundColor: theme.colors.surface2,
    borderRadius: theme.radius.md,
    paddingTop: 2,
    paddingHorizontal: 2,
    paddingBottom: theme.spacing.xs,
    overflow: 'hidden',
  },
  bodyMapPair: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 0,
    width: '100%',
    marginBottom: -2,
  },
  bodyMapFrame: {
    width: 158,
    height: 320,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 0,
    overflow: 'hidden',
  },
  bodyCanvas: {
    width: 158,
    height: 320,
  },
  fatigueEmptyText: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
    fontFamily: theme.fontFamily.semiBold,
    textAlign: 'center',
    paddingVertical: theme.spacing.xs,
  },
  fatigueList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
  },
  fatigueRow: {
    minHeight: 26,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
    maxWidth: '100%',
    backgroundColor: theme.colors.surface2,
    borderRadius: theme.radius.full,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  fatigueRowNameBlock: {
    flexShrink: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  fatigueMuscleName: {
    color: theme.colors.text,
    fontSize: 10,
    lineHeight: 14,
    fontFamily: theme.fontFamily.semiBold,
    flexShrink: 1,
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
  fatigueMuscleMeta: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
    fontFamily: theme.fontFamily.semiBold,
  },
  fatigueTime: {
    color: theme.colors.textMuted,
    fontSize: 10,
    lineHeight: 14,
    fontFamily: theme.fontFamily.bold,
    opacity: 0.62,
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
  fatigueRecoveryPanel: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
  },
  fatigueLegend: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: theme.spacing.xs,
    paddingTop: 1,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minHeight: 22,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.surface,
    paddingHorizontal: 7,
  },
  legendDot: {
    width: 7,
    height: 7,
    borderRadius: theme.radius.full,
  },
  legendText: {
    color: theme.colors.textMuted,
    fontSize: 10,
    lineHeight: 13,
    fontFamily: theme.fontFamily.semiBold,
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
  startWorkoutGlow: {
    borderRadius: theme.radius.md,
    shadowColor: theme.colors.accent,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.62,
    shadowRadius: 24,
    elevation: 10,
  },
  startWorkoutGlowDisabled: {
    shadowOpacity: 0,
    elevation: 0,
  },
  startWorkoutButton: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    backgroundColor: theme.colors.accent,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.28)',
  },
  startWorkoutButtonDisabled: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
  },
  primaryIcon: {
    width: 38,
    height: 38,
    borderRadius: theme.radius.full,
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryIconDisabled: {
    backgroundColor: theme.colors.surface2,
  },
  primaryTextBlock: {
    flex: 1,
    minWidth: 0,
  },
  startWorkoutText: {
    fontSize: theme.fontSize.md,
    color: '#FFFFFF',
    fontFamily: theme.fontFamily.extraBold,
  },
  startWorkoutTextDisabled: {
    color: theme.colors.textMuted,
  },
  actionSubtitle: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
    fontFamily: theme.fontFamily.semiBold,
    marginTop: 2,
  },
  primaryActionSubtitle: {
    color: 'rgba(255, 255, 255, 0.78)',
  },
  templatesButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.md,
  },
  secondaryIcon: {
    width: 38,
    height: 38,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.accentMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  templatesTextBlock: {
    flex: 1,
    minWidth: 0,
  },
  templatesTitle: {
    color: theme.colors.text,
    fontSize: theme.fontSize.md,
    fontFamily: theme.fontFamily.extraBold,
  },
  scheduledTemplateCard: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  scheduledTemplateIcon: {
    width: 38,
    height: 38,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.accentMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scheduledTemplateTextBlock: {
    flex: 1,
    minWidth: 0,
  },
  scheduledTemplateLabelPill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: theme.colors.accentMuted,
    borderRadius: theme.radius.full,
    paddingHorizontal: 7,
    paddingVertical: 3,
    marginBottom: 4,
  },
  scheduledTemplateEyebrow: {
    color: theme.colors.accent,
    fontSize: theme.fontSize.xxs,
    fontFamily: theme.fontFamily.extraBold,
    textTransform: 'uppercase',
  },
  scheduledTemplateTitle: {
    color: theme.colors.text,
    fontSize: theme.fontSize.md,
    fontFamily: theme.fontFamily.extraBold,
  },
  scheduledTemplateMeta: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
    fontFamily: theme.fontFamily.semiBold,
    marginTop: 1,
  },
  scheduledTemplateActionIcon: {
    width: 32,
    height: 32,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.surface2,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  favoriteTemplatesBlock: {
    gap: theme.spacing.sm,
  },
  favoriteTemplatesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  favoriteTemplatesTitle: {
    color: theme.colors.text,
    fontSize: theme.fontSize.md,
    fontFamily: theme.fontFamily.extraBold,
  },
  favoriteTemplateGrid: {
    gap: theme.spacing.xs,
  },
  favoriteTemplateRow: {
    flexDirection: 'row',
    gap: theme.spacing.xs,
  },
  favoriteTemplateCard: {
    flex: 1,
    minWidth: 0,
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    justifyContent: 'flex-start',
  },
  favoriteTemplatePlaceholder: {
    flex: 1,
    minWidth: 0,
  },
  favoriteTemplateIcon: {
    width: 23,
    height: 23,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.accentMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  favoriteTemplateTextBlock: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  favoriteTemplateName: {
    color: theme.colors.text,
    fontSize: theme.fontSize.xs,
    fontFamily: theme.fontFamily.extraBold,
  },
  favoriteTemplateMeta: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
    fontFamily: theme.fontFamily.semiBold,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: theme.spacing.sm,
  },
  sectionTitle: {
    color: theme.colors.text,
    fontSize: theme.fontSize.lg,
    fontFamily: theme.fontFamily.extraBold,
  },
  sectionHint: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
    fontFamily: theme.fontFamily.bold,
    textTransform: 'uppercase',
  },
  workoutGroup: {
    gap: theme.spacing.xs,
  },
  workoutList: {
    gap: theme.spacing.md,
  },
  workoutDateLabel: {
    alignSelf: 'flex-start',
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
    fontFamily: theme.fontFamily.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  emptyCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.lg,
    alignItems: 'center',
  },
  emptyText: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.semiBold,
    textAlign: 'center',
  },
}));
