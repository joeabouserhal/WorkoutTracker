import React from 'react';
import { View } from 'react-native';
import { Canvas, Group, Path } from '@shopify/react-native-skia';
import {
  BACK_MUSCLES,
  FRONT_MUSCLES,
  getMuscleColor,
  type MuscleDef,
} from 'body-muscles';
import { createStyleSheet, useStyles } from 'react-native-unistyles';
import type { WorkoutDetail } from '@/db/workoutHelpers';

export type TargetStat = {
  name: string;
  setCount: number;
  exerciseCount: number;
};

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

export function buildWorkoutTargetStats(workout: WorkoutDetail): TargetStat[] {
  const stats = new Map<string, TargetStat>();

  for (const exercise of workout.exercises) {
    const setCount = exercise.sets.length;
    if (setCount === 0) continue;

    for (const targetName of exercise.targetMuscles) {
      const current = stats.get(targetName) ?? {
        name: targetName,
        setCount: 0,
        exerciseCount: 0,
      };
      current.setCount += setCount;
      current.exerciseCount += 1;
      stats.set(targetName, current);
    }
  }

  return [...stats.values()].sort((a, b) =>
    b.setCount === a.setCount
      ? a.name.localeCompare(b.name)
      : b.setCount - a.setCount,
  );
}

export function buildTargetIntensityMap(targetStats: TargetStat[]) {
  const maxSetCount = Math.max(
    1,
    ...targetStats.map(target => target.setCount),
  );

  return targetStats.reduce<Record<string, number>>((acc, target) => {
    acc[target.name.toLowerCase()] = Math.max(
      3,
      Math.min(10, Math.ceil((target.setCount / maxSetCount) * 10)),
    );
    return acc;
  }, {});
}

export function MuscleTargetBodyPair({
  targetIntensityByName,
  bottomSafe = false,
  highlightColor,
}: {
  targetIntensityByName: Record<string, number>;
  bottomSafe?: boolean;
  highlightColor?: string;
}) {
  const { styles } = useStyles(stylesheet);

  return (
    <View style={styles.bodyPair}>
      <TargetBodyDiagram
        side="front"
        targetIntensityByName={targetIntensityByName}
        bottomSafe={bottomSafe}
        highlightColor={highlightColor}
      />
      <TargetBodyDiagram
        side="back"
        targetIntensityByName={targetIntensityByName}
        bottomSafe={bottomSafe}
        highlightColor={highlightColor}
      />
    </View>
  );
}

function TargetBodyDiagram({
  side,
  targetIntensityByName,
  bottomSafe,
  highlightColor,
}: {
  side: 'front' | 'back';
  targetIntensityByName: Record<string, number>;
  bottomSafe: boolean;
  highlightColor?: string;
}) {
  const { styles, theme } = useStyles(stylesheet);
  const isFront = side === 'front';
  const muscles = isFront ? FRONT_BODY_MUSCLES : BACK_BODY_MUSCLES;
  const transform = isFront
    ? [{ translateX: 35 }, { translateY: 8 }, { scale: 3.08 }]
    : [{ translateX: -92 }, { translateY: 8 }, { scale: 3.08 }];

  function getPartColors(muscle: MuscleDef) {
    const groupNames = BODY_MUSCLE_GROUP_BY_ID[muscle.id] ?? [];
    const intensity = Math.max(
      0,
      ...groupNames.map(name => targetIntensityByName[name.toLowerCase()] ?? 0),
    );

    if (intensity > 0) {
      return {
        backgroundColor:
          highlightColor ??
          getMuscleColor(
            { intensity: Math.min(10, intensity), selected: false },
            false,
          ),
        intensity,
      };
    }

    return {
      backgroundColor: theme.colors.bg,
      intensity: 0,
    };
  }

  const renderedMuscles = muscles
    .map(muscle => ({
      muscle,
      colors: getPartColors(muscle),
    }))
    .sort((a, b) => a.colors.intensity - b.colors.intensity);

  return (
    <View
      style={[
        styles.bodyMapFrame,
        bottomSafe && styles.bodyMapFrameBottomSafe,
      ]}
    >
      <Canvas
        style={[styles.bodyCanvas, bottomSafe && styles.bodyCanvasBottomSafe]}
      >
        <Group transform={transform}>
          {renderedMuscles.map(({ muscle, colors }) => (
            <Path
              key={muscle.id}
              path={muscle.path}
              color={colors.backgroundColor}
            />
          ))}
        </Group>
      </Canvas>
    </View>
  );
}

const stylesheet = createStyleSheet(() => ({
  bodyPair: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 0,
  },
  bodyMapFrame: {
    width: 150,
    height: 280,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  bodyMapFrameBottomSafe: {
    height: 296,
  },
  bodyCanvas: {
    width: 150,
    height: 280,
  },
  bodyCanvasBottomSafe: {
    height: 296,
  },
}));
