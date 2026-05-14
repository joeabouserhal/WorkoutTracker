import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { createStyleSheet, useStyles } from 'react-native-unistyles';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  MuscleTargetBodyPair,
  buildTargetIntensityMap,
  buildWorkoutTargetStats,
} from '@/components/MuscleTargetBodyMap';
import ScreenHeader, { useHeaderFade } from '@/components/ui/ScreenHeader';
import {
  getWorkoutDetail,
  getWorkoutWeightPrAchievements,
  type WorkoutDetail,
  type WorkoutWeightPrAchievement,
} from '@/db/workoutHelpers';

export type PostWorkoutRouteParams = {
  workoutId?: string;
  debugVariant?: 'standard' | 'celebration';
};

const LB_PER_KG = 2.20462;
const PR_GOLD = '#D9A441';
const PR_CONFETTI_COLORS = [
  PR_GOLD,
  '#F7D774',
  '#FFFFFF',
  '#75C7E6',
  '#8FE3B0',
];
const PR_CELEBRATION_TITLES = [
  'That one counts.',
  'New ceiling unlocked.',
  'Strength moved up.',
  'That weight is yours now.',
  'Progress made official.',
  'The bar just got higher.',
  'Top set, new standard.',
  'That rep changed the board.',
];
const PR_CONFETTI = Array.from({ length: 28 }, (_, index) => {
  const column = index % 14;
  const row = Math.floor(index / 14);
  return {
    left: `${3 + column * 7.2}%`,
    top: 20 + row * 16,
    size: 6 + (index % 3) * 2,
    color: PR_CONFETTI_COLORS[index % PR_CONFETTI_COLORS.length],
    translateX: (column - 6.5) * (7 + row * 3),
    translateY: 118 + (index % 5) * 15,
    rotate: column % 2 === 0 ? 170 : -170,
    delay: index * 10,
  };
});

function formatDuration(startedAt: number, endedAt: number) {
  const minutes = Math.max(1, Math.round((endedAt - startedAt) / 60000));
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${minutes}m`;
}

function formatDate(timestamp: number) {
  return new Date(timestamp).toLocaleDateString([], {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });
}

function formatCompactNumber(value: number) {
  return Number.parseFloat(value.toFixed(2)).toString();
}

function formatPrWeight(weightKg: number, unit: string): string {
  if (unit === 'lb') return `${formatCompactNumber(weightKg * LB_PER_KG)} lb`;
  return `${formatCompactNumber(weightKg)} kg`;
}

function getDebugWorkout(): WorkoutDetail {
  const endedAt = Date.now();
  const startedAt = endedAt - 74 * 60 * 1000;

  return {
    id: 'debug_post_workout',
    name: 'Upper Body Session',
    startedAt,
    endedAt,
    exerciseCount: 4,
    setCount: 14,
    volume: 8150,
    weightPrCount: 0,
    currentWeightPrCount: 0,
    exercises: [
      {
        id: 'debug_ex_1',
        exerciseTypeId: 'bench_press',
        exerciseName: 'Bench Press',
        sectionName: 'Chest',
        targetMuscles: ['Mid Chest', 'Upper Chest'],
        methodName: 'Barbell',
        defaultWeightUnit: 'kg',
        hasWeightPr: false,
        hasCurrentWeightPr: false,
        sets: Array.from({ length: 4 }, (_, index) => ({
          id: `debug_bench_${index}`,
          setType: 'working',
          weightKg: 90,
          weightUnit: 'kg',
          reps: index === 0 ? 8 : 6,
          volume: 90 * (index === 0 ? 8 : 6),
          isWeightPr: false,
          isCurrentWeightPr: false,
          completedAt: startedAt + index * 120000,
        })),
      },
      {
        id: 'debug_ex_2',
        exerciseTypeId: 'lat_pulldown',
        exerciseName: 'Lat Pulldown',
        sectionName: 'Back',
        targetMuscles: ['Lats'],
        methodName: 'Cable',
        defaultWeightUnit: 'kg',
        hasWeightPr: false,
        hasCurrentWeightPr: false,
        sets: Array.from({ length: 4 }, (_, index) => ({
          id: `debug_lat_${index}`,
          setType: 'working',
          weightKg: 75,
          weightUnit: 'kg',
          reps: 10,
          volume: 750,
          isWeightPr: false,
          isCurrentWeightPr: false,
          completedAt: startedAt + 600000 + index * 120000,
        })),
      },
      {
        id: 'debug_ex_3',
        exerciseTypeId: 'lateral_raise',
        exerciseName: 'Lateral Raise',
        sectionName: 'Shoulders',
        targetMuscles: ['Side Delts'],
        methodName: 'Dumbbell',
        defaultWeightUnit: 'kg',
        hasWeightPr: false,
        hasCurrentWeightPr: false,
        sets: Array.from({ length: 3 }, (_, index) => ({
          id: `debug_lateral_${index}`,
          setType: 'working',
          weightKg: 12,
          weightUnit: 'kg',
          reps: 14,
          volume: 168,
          isWeightPr: false,
          isCurrentWeightPr: false,
          completedAt: startedAt + 1100000 + index * 120000,
        })),
      },
      {
        id: 'debug_ex_4',
        exerciseTypeId: 'rear_delt_fly',
        exerciseName: 'Rear Delt Fly',
        sectionName: 'Shoulders',
        targetMuscles: ['Rear Delts', 'Upper Back'],
        methodName: 'Machine',
        defaultWeightUnit: 'kg',
        hasWeightPr: false,
        hasCurrentWeightPr: false,
        sets: Array.from({ length: 3 }, (_, index) => ({
          id: `debug_rear_${index}`,
          setType: 'working',
          weightKg: 42,
          weightUnit: 'kg',
          reps: 12,
          volume: 504,
          isWeightPr: false,
          isCurrentWeightPr: false,
          completedAt: startedAt + 1500000 + index * 120000,
        })),
      },
    ],
  };
}

function getDebugAchievements(): WorkoutWeightPrAchievement[] {
  return [
    {
      setId: 'debug_pr_1',
      exerciseName: 'Bench Press',
      methodName: 'Barbell',
      previousWeightKg: 95,
      newWeightKg: 100,
      weightUnit: 'kg',
      reps: 4,
      isCurrentWeightPr: true,
      hasPriorExerciseHistory: true,
    },
    {
      setId: 'debug_pr_2',
      exerciseName: 'Lat Pulldown',
      methodName: 'Cable',
      previousWeightKg: 80,
      newWeightKg: 85,
      weightUnit: 'kg',
      reps: 7,
      isCurrentWeightPr: true,
      hasPriorExerciseHistory: true,
    },
  ];
}

export default function PostWorkoutScreen() {
  const { styles, theme } = useStyles(stylesheet);
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const route = useRoute();
  const params = (route.params ?? {}) as PostWorkoutRouteParams;
  const { showHeaderFade, handleHeaderScroll } = useHeaderFade();
  const [workout, setWorkout] = useState<WorkoutDetail | null>(null);
  const [achievements, setAchievements] = useState<
    WorkoutWeightPrAchievement[]
  >([]);
  const [loading, setLoading] = useState(true);
  const confettiAnimations = useRef(
    PR_CONFETTI.map(() => new Animated.Value(0)),
  ).current;
  const spotlightAnimation = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let cancelled = false;

    async function loadPostWorkout() {
      setLoading(true);
      try {
        if (params.debugVariant) {
          if (cancelled) return;
          setWorkout(getDebugWorkout());
          setAchievements(
            params.debugVariant === 'celebration' ? getDebugAchievements() : [],
          );
          return;
        }

        if (!params.workoutId) {
          if (!cancelled) {
            setWorkout(null);
            setAchievements([]);
          }
          return;
        }

        const [detail, prs] = await Promise.all([
          getWorkoutDetail(params.workoutId),
          getWorkoutWeightPrAchievements(params.workoutId),
        ]);
        if (cancelled) return;
        setWorkout(detail);
        setAchievements(
          prs.filter(
            achievement =>
              achievement.previousWeightKg !== null &&
              achievement.hasPriorExerciseHistory,
          ),
        );
      } catch (e) {
        console.error('Could not load post workout screen', e);
        if (!cancelled) {
          setWorkout(null);
          setAchievements([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadPostWorkout().catch(console.error);

    return () => {
      cancelled = true;
    };
  }, [params.debugVariant, params.workoutId]);

  useEffect(() => {
    confettiAnimations.forEach(animation => animation.setValue(0));
    spotlightAnimation.stopAnimation();
    spotlightAnimation.setValue(0);
    if (achievements.length === 0) return;

    Animated.parallel(
      confettiAnimations.map((animation, index) =>
        Animated.timing(animation, {
          toValue: 1,
          duration: 760 + (index % 4) * 60,
          delay: PR_CONFETTI[index].delay,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ),
    ).start();

    const breatheAnimation = Animated.loop(
      Animated.sequence([
        Animated.timing(spotlightAnimation, {
          toValue: 1,
          duration: 1350,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(spotlightAnimation, {
          toValue: 0,
          duration: 1350,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    breatheAnimation.start();
    return () => breatheAnimation.stop();
  }, [achievements.length, confettiAnimations, spotlightAnimation]);

  const targetStats = useMemo(
    () => (workout ? buildWorkoutTargetStats(workout) : []),
    [workout],
  );
  const targetIntensityByName = useMemo(
    () => buildTargetIntensityMap(targetStats),
    [targetStats],
  );

  function handleDone() {
    navigation.goBack();
  }

  return (
    <View style={styles.root}>
      {achievements.length > 0 ? (
        <View pointerEvents="none" style={styles.confettiLayer}>
          {PR_CONFETTI.map((piece, index) => {
            const animation = confettiAnimations[index];
            return (
              <Animated.View
                key={`${piece.left}-${index}`}
                style={[
                  styles.confettiPiece,
                  {
                    left: piece.left as `${number}%`,
                    top: piece.top + insets.top,
                    width: piece.size,
                    height: piece.size * 1.45,
                    backgroundColor: piece.color,
                    opacity: animation.interpolate({
                      inputRange: [0, 0.12, 0.72, 1],
                      outputRange: [0, 1, 1, 0],
                    }),
                    transform: [
                      {
                        translateX: animation.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0, piece.translateX],
                        }),
                      },
                      {
                        translateY: animation.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0, piece.translateY],
                        }),
                      },
                      {
                        rotate: animation.interpolate({
                          inputRange: [0, 1],
                          outputRange: ['0deg', `${piece.rotate}deg`],
                        }),
                      },
                    ],
                  },
                ]}
              />
            );
          })}
        </View>
      ) : null}

      <ScreenHeader
        title="Post Workout"
        onBack={() => navigation.goBack()}
        showFade={showHeaderFade}
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + theme.spacing.xl },
        ]}
        onScroll={handleHeaderScroll}
        scrollEventThrottle={16}
      >
        {loading ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>Loading workout summary...</Text>
          </View>
        ) : !workout ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>Workout summary unavailable.</Text>
          </View>
        ) : (
          <>
            {achievements.length > 0 ? (
              <PrCelebrationBlock
                achievements={achievements}
                spotlightAnimation={spotlightAnimation}
              />
            ) : null}

            <View style={styles.summaryCard}>
              <View style={styles.summaryHeader}>
                <View style={styles.summaryTitleBlock}>
                  <Text style={styles.eyebrow}>Workout Complete</Text>
                  <Text style={styles.workoutTitle} numberOfLines={1}>
                    {workout.name || 'Workout'}
                  </Text>
                  <Text style={styles.workoutMeta}>
                    {formatDate(workout.startedAt)}
                  </Text>
                </View>
                <View style={styles.doneBadge}>
                  <MaterialCommunityIcons
                    name="check"
                    size={20}
                    color={theme.colors.accent}
                  />
                </View>
              </View>

              <View style={styles.statGrid}>
                <StatTile
                  label="Duration"
                  value={formatDuration(workout.startedAt, workout.endedAt)}
                  icon="timer-outline"
                />
                <StatTile
                  label="Exercises"
                  value={String(workout.exerciseCount)}
                  icon="dumbbell"
                />
                <StatTile
                  label="Sets"
                  value={String(workout.setCount)}
                  icon="check-circle-outline"
                />
                <StatTile
                  label="Volume"
                  value={`${Math.round(workout.volume)} kg`}
                  icon="weight-lifter"
                />
              </View>
            </View>

            <View style={styles.bodyCard}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Muscles Targeted</Text>
                <Text style={styles.sectionHint}>
                  {targetStats.length === 0
                    ? 'No targets'
                    : `${targetStats.length} areas`}
                </Text>
              </View>

              <View style={styles.bodyVisualPanel}>
                <MuscleTargetBodyPair
                  targetIntensityByName={targetIntensityByName}
                  bottomSafe
                />
              </View>

              {targetStats.length === 0 ? (
                <Text style={styles.emptyText}>No targeted muscles found.</Text>
              ) : (
                <View style={styles.targetGrid}>
                  {targetStats.map(target => (
                    <View key={target.name} style={styles.targetPill}>
                      <Text style={styles.targetName} numberOfLines={1}>
                        {target.name}
                      </Text>
                      <Text style={styles.targetMeta}>
                        {target.setCount} sets
                      </Text>
                    </View>
                  ))}
                </View>
              )}
            </View>

            <View style={styles.exerciseCard}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Exercise Breakdown</Text>
                <Text style={styles.sectionHint}>
                  {workout.exercises.length}
                </Text>
              </View>
              <View style={styles.exerciseList}>
                {workout.exercises.map(exercise => (
                  <View key={exercise.id} style={styles.exerciseRow}>
                    <View style={styles.exerciseIcon}>
                      <MaterialCommunityIcons
                        name={
                          exercise.hasWeightPr ? 'trophy-outline' : 'dumbbell'
                        }
                        size={15}
                        color={
                          exercise.hasWeightPr ? PR_GOLD : theme.colors.accent
                        }
                      />
                    </View>
                    <View style={styles.exerciseTextBlock}>
                      <Text style={styles.exerciseName} numberOfLines={1}>
                        {exercise.exerciseName}
                      </Text>
                      <Text style={styles.exerciseMeta} numberOfLines={1}>
                        {exercise.methodName} - {exercise.sets.length} sets
                      </Text>
                    </View>
                    <Text style={styles.exerciseVolume}>
                      {Math.round(
                        exercise.sets.reduce(
                          (total, set) => total + set.volume,
                          0,
                        ),
                      )}{' '}
                      kg
                    </Text>
                  </View>
                ))}
              </View>
            </View>

            <TouchableOpacity
              style={styles.doneButton}
              onPress={handleDone}
              activeOpacity={0.82}
            >
              <Text style={styles.doneButtonText}>Done</Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </View>
  );
}

function StatTile({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: string;
}) {
  const { styles, theme } = useStyles(stylesheet);

  return (
    <View style={styles.statTile}>
      <MaterialCommunityIcons
        name={icon}
        size={15}
        color={theme.colors.accent}
      />
      <Text style={styles.statValue} numberOfLines={1}>
        {value}
      </Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function PrCelebrationBlock({
  achievements,
  spotlightAnimation,
}: {
  achievements: WorkoutWeightPrAchievement[];
  spotlightAnimation: Animated.Value;
}) {
  const { styles, theme } = useStyles(stylesheet);
  const celebrationTitle = useMemo(
    () =>
      PR_CELEBRATION_TITLES[
        Math.floor(Math.random() * PR_CELEBRATION_TITLES.length)
      ],
    [],
  );

  return (
    <View style={styles.prCard}>
      <View style={styles.prHero}>
        <View style={styles.prCelebrationIconHalo}>
          <Animated.View
            pointerEvents="none"
            style={[
              styles.prCelebrationGlow,
              {
                opacity: spotlightAnimation.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.45, 0.9],
                }),
                transform: [
                  {
                    scale: spotlightAnimation.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.86, 1.18],
                    }),
                  },
                ],
              },
            ]}
          />
          <View style={styles.prCelebrationIcon}>
            <MaterialCommunityIcons
              name="trophy-variant-outline"
              size={38}
              color={PR_GOLD}
            />
          </View>
        </View>
        <Text style={styles.prCelebrationEyebrow}>New Personal Record</Text>
        <Text style={styles.prCelebrationTitle}>{celebrationTitle}</Text>
        <Text style={styles.prCelebrationMessage}>
          You pushed your top weight higher this workout.
        </Text>
        <View style={styles.prSummaryPill}>
          <MaterialCommunityIcons
            name="weight-lifter"
            size={14}
            color={PR_GOLD}
          />
          <Text style={styles.prSummaryPillText}>
            {achievements.length === 1
              ? '1 weight PR'
              : `${achievements.length} weight PRs`}
          </Text>
        </View>
      </View>

      <View style={styles.prList}>
        {achievements.map(achievement => (
          <View key={achievement.setId} style={styles.prResultCard}>
            <View style={styles.prResultHeader}>
              <View style={styles.prResultTitleBlock}>
                <Text style={styles.prExerciseName} numberOfLines={1}>
                  {achievement.exerciseName}
                </Text>
                <Text style={styles.prMethodName} numberOfLines={1}>
                  {achievement.methodName}
                </Text>
              </View>
              <View style={styles.prMiniBadge}>
                <Text style={styles.prMiniBadgeText}>
                  {achievement.isCurrentWeightPr ? 'Current PR' : 'PR'}
                </Text>
              </View>
            </View>

            <View style={styles.prValuesRow}>
              <View style={styles.prValueBox}>
                <Text style={styles.prValueLabel}>Previous</Text>
                <Text style={styles.prPreviousValue}>
                  {achievement.previousWeightKg === null
                    ? 'No previous PR'
                    : formatPrWeight(
                        achievement.previousWeightKg,
                        achievement.weightUnit,
                      )}
                </Text>
              </View>
              <MaterialCommunityIcons
                name="arrow-right"
                size={18}
                color={theme.colors.textMuted}
              />
              <View style={[styles.prValueBox, styles.prNewValueBox]}>
                <Text style={styles.prValueLabel}>Now</Text>
                <Text style={styles.prNewValue}>
                  {formatPrWeight(
                    achievement.newWeightKg,
                    achievement.weightUnit,
                  )}
                  <Text style={styles.prRepsText}> x {achievement.reps}</Text>
                </Text>
              </View>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

const stylesheet = createStyleSheet(theme => ({
  root: {
    flex: 1,
    backgroundColor: theme.colors.bg,
  },
  confettiLayer: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 4,
  },
  confettiPiece: {
    position: 'absolute',
    borderRadius: 2,
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.md,
    gap: theme.spacing.md,
  },
  emptyCard: {
    minHeight: 180,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing.lg,
  },
  emptyText: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.semiBold,
    textAlign: 'center',
  },
  summaryCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.md,
    gap: theme.spacing.md,
  },
  summaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.md,
  },
  summaryTitleBlock: {
    flex: 1,
    minWidth: 0,
  },
  eyebrow: {
    color: theme.colors.accent,
    fontSize: theme.fontSize.xs,
    fontFamily: theme.fontFamily.black,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  workoutTitle: {
    color: theme.colors.text,
    fontSize: theme.fontSize.xl,
    fontFamily: theme.fontFamily.black,
    marginTop: 2,
  },
  workoutMeta: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
    fontFamily: theme.fontFamily.semiBold,
    marginTop: 2,
  },
  doneBadge: {
    width: 38,
    height: 38,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.accentMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  statTile: {
    width: '48.6%',
    minHeight: 74,
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface2,
    padding: theme.spacing.sm,
    justifyContent: 'center',
    gap: 4,
  },
  statValue: {
    color: theme.colors.text,
    fontSize: theme.fontSize.lg,
    fontFamily: theme.fontFamily.black,
  },
  statLabel: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
    fontFamily: theme.fontFamily.bold,
    textTransform: 'uppercase',
  },
  bodyCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.sm,
    gap: theme.spacing.sm,
  },
  bodyVisualPanel: {
    backgroundColor: theme.colors.surface2,
    borderRadius: theme.radius.md,
    paddingTop: 2,
    paddingHorizontal: 2,
    paddingBottom: theme.spacing.xs,
    overflow: 'hidden',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
  },
  sectionTitle: {
    color: theme.colors.text,
    fontSize: theme.fontSize.md,
    fontFamily: theme.fontFamily.extraBold,
  },
  sectionHint: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
    fontFamily: theme.fontFamily.bold,
    textTransform: 'uppercase',
  },
  targetGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  targetPill: {
    minHeight: 25,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: theme.radius.full,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface2,
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  targetName: {
    color: theme.colors.text,
    fontSize: theme.fontSize.xs,
    fontFamily: theme.fontFamily.extraBold,
  },
  targetMeta: {
    color: theme.colors.textMuted,
    fontSize: 10,
    fontFamily: theme.fontFamily.bold,
  },
  exerciseCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  exerciseList: {
    gap: theme.spacing.xs,
  },
  exerciseRow: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.surface2,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 7,
  },
  exerciseIcon: {
    width: 28,
    height: 28,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  exerciseTextBlock: {
    flex: 1,
    minWidth: 0,
  },
  exerciseName: {
    color: theme.colors.text,
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.extraBold,
  },
  exerciseMeta: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
    fontFamily: theme.fontFamily.semiBold,
    marginTop: 1,
  },
  exerciseVolume: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
    fontFamily: theme.fontFamily.extraBold,
  },
  doneButton: {
    minHeight: 48,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.28)',
  },
  doneButtonText: {
    color: '#FFFFFF',
    fontSize: theme.fontSize.md,
    fontFamily: theme.fontFamily.black,
  },
  prCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: PR_GOLD + '44',
    padding: theme.spacing.lg,
    gap: 10,
    position: 'relative',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.22,
    shadowRadius: 20,
    elevation: 10,
  },
  prHero: {
    alignItems: 'center',
    gap: theme.spacing.xs,
    paddingTop: theme.spacing.xs,
    zIndex: 1,
  },
  prCelebrationIconHalo: {
    width: 88,
    height: 88,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
    backgroundColor: PR_GOLD + '14',
    borderWidth: 1,
    borderColor: PR_GOLD + '2E',
    marginBottom: theme.spacing.md,
  },
  prCelebrationGlow: {
    position: 'absolute',
    width: 104,
    height: 104,
    borderRadius: theme.radius.full,
    backgroundColor: PR_GOLD + '2A',
    zIndex: 0,
  },
  prCelebrationIcon: {
    width: 66,
    height: 66,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: PR_GOLD + '77',
    zIndex: 1,
    shadowColor: PR_GOLD,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.38,
    shadowRadius: 16,
    elevation: 5,
  },
  prCelebrationEyebrow: {
    color: PR_GOLD,
    fontSize: theme.fontSize.xs,
    fontFamily: theme.fontFamily.black,
    letterSpacing: 1,
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  prCelebrationTitle: {
    color: theme.colors.text,
    fontSize: theme.fontSize.xxl,
    fontFamily: theme.fontFamily.black,
    textAlign: 'center',
    marginTop: -2,
  },
  prCelebrationMessage: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.md,
    fontFamily: theme.fontFamily.semiBold,
    lineHeight: 22,
    textAlign: 'center',
  },
  prSummaryPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: theme.radius.full,
    borderWidth: 1,
    borderColor: PR_GOLD + '66',
    backgroundColor: PR_GOLD + '18',
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 4,
    marginTop: 2,
  },
  prSummaryPillText: {
    color: PR_GOLD,
    fontSize: theme.fontSize.xs,
    fontFamily: theme.fontFamily.black,
  },
  prList: {
    gap: 5,
    zIndex: 1,
  },
  prResultCard: {
    backgroundColor: theme.colors.surface2,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 4,
    gap: 4,
  },
  prResultHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.xs,
  },
  prResultTitleBlock: {
    flex: 1,
    minWidth: 0,
  },
  prExerciseName: {
    color: theme.colors.text,
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.bold,
    lineHeight: 16,
  },
  prMethodName: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xxs,
    fontFamily: theme.fontFamily.semiBold,
    lineHeight: 12,
    marginTop: 0,
  },
  prMiniBadge: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radius.full,
    borderWidth: 1,
    borderColor: PR_GOLD,
    backgroundColor: PR_GOLD + '22',
    height: 22,
    paddingHorizontal: 6,
    paddingVertical: 0,
  },
  prMiniBadgeText: {
    color: PR_GOLD,
    fontSize: theme.fontSize.xxs,
    fontFamily: theme.fontFamily.black,
    lineHeight: 12,
  },
  prValuesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  prValueBox: {
    flex: 1,
    minHeight: 32,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 5,
    justifyContent: 'center',
  },
  prNewValueBox: {
    borderColor: PR_GOLD + '66',
    backgroundColor: PR_GOLD + '18',
  },
  prValueLabel: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xxs,
    fontFamily: theme.fontFamily.semiBold,
    textTransform: 'uppercase',
    lineHeight: 10,
    marginBottom: 0,
  },
  prPreviousValue: {
    color: theme.colors.text,
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.extraBold,
    lineHeight: 16,
  },
  prNewValue: {
    color: PR_GOLD,
    fontSize: theme.fontSize.md,
    fontFamily: theme.fontFamily.black,
    lineHeight: 18,
  },
  prRepsText: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
    fontFamily: theme.fontFamily.extraBold,
    lineHeight: 14,
  },
}));
