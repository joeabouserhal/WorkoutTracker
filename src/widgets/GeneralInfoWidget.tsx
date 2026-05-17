import React from 'react';
import { FlexWidget, TextWidget } from 'react-native-android-widget';
import { type WidgetStatusSnapshot } from './generalInfoWidgetData';
import { GENERAL_INFO_WIDGET_DEEP_LINK } from './widgetConstants';

type Props = {
  snapshot: WidgetStatusSnapshot;
};

export default function GeneralInfoWidget({ snapshot }: Props) {
  const colors = snapshot.theme;
  const statusLabel =
    snapshot.tone === 'fatigue'
      ? 'Recovering'
      : snapshot.tone === 'motivation'
        ? 'Check in'
        : snapshot.tone === 'ready'
          ? 'Ready'
          : 'Status';

  return (
    <FlexWidget
      clickAction="OPEN_URI"
      clickActionData={{ uri: GENERAL_INFO_WIDGET_DEEP_LINK }}
      accessibilityLabel="Open Workout Tracker"
      style={{
        height: 'match_parent',
        width: 'match_parent',
        backgroundColor: colors.bg,
        borderRadius: 28,
        paddingHorizontal: 12,
        paddingVertical: 10,
        flexDirection: 'column',
      }}
    >
      <FlexWidget
        style={{
          height: 'match_parent',
          width: 'match_parent',
          backgroundColor: colors.surface,
          borderColor: colors.border,
          borderWidth: 1,
          borderRadius: 22,
          paddingHorizontal: 13,
          paddingVertical: 11,
          flexDirection: 'column',
          justifyContent: 'space-between',
        }}
      >
        <FlexWidget
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            width: 'match_parent',
            flexGap: 8,
          }}
        >
          <FlexWidget
            style={{
              width: 5,
              height: 34,
              backgroundColor: colors.accent,
              borderRadius: 4,
            }}
          />
          <FlexWidget
            style={{
              flex: 1,
              flexDirection: 'column',
              flexGap: 1,
              overflow: 'hidden',
            }}
          >
            <TextWidget
              text={snapshot.title}
              maxLines={1}
              style={{
                color: colors.text,
                fontSize: 12,
                fontFamily: 'InterTight_800ExtraBold',
              }}
            />
            <TextWidget
              text={`Last: ${snapshot.lastWorkoutLabel}`}
              maxLines={1}
              truncate="END"
              style={{
                color: colors.textMuted,
                fontSize: 10,
                fontFamily: 'InterTight_600SemiBold',
              }}
            />
          </FlexWidget>
          <FlexWidget
            style={{
              backgroundColor: colors.accentMuted,
              borderColor: colors.border,
              borderWidth: 1,
              borderRadius: 16,
              paddingHorizontal: 9,
              paddingVertical: 4,
            }}
          >
            <TextWidget
              text={statusLabel}
              maxLines={1}
              style={{
                color: colors.accent,
                fontSize: 11,
                fontFamily: 'InterTight_700Bold',
              }}
            />
          </FlexWidget>
        </FlexWidget>

        <FlexWidget
          style={{
            width: 'match_parent',
            flexDirection: 'column',
            flexGap: 4,
          }}
        >
          <TextWidget
            text={snapshot.headline}
            maxLines={1}
            truncate="END"
            style={{
              color: colors.text,
              fontSize: 21,
              fontFamily: 'InterTight_800ExtraBold',
            }}
          />
          <TextWidget
            text={snapshot.detail}
            maxLines={1}
            truncate="END"
            style={{
              color: colors.textMuted,
              fontSize: 12,
              fontFamily: 'InterTight_500Medium',
            }}
          />
        </FlexWidget>

        {snapshot.topFatiguedMuscles.length > 0 ? (
          <FlexWidget
            style={{
              flexDirection: 'column',
              width: 'match_parent',
              flexGap: 6,
              overflow: 'hidden',
            }}
          >
            {snapshot.topFatiguedMuscles.map(muscle => {
              const filled = Math.max(
                1,
                Math.min(10, Math.round(muscle.fatigue * 10)),
              );
              const empty = Math.max(1, 10 - filled);

              return (
                <FlexWidget
                  key={muscle.name}
                  style={{
                    width: 'match_parent',
                    flexDirection: 'column',
                    flexGap: 4,
                  }}
                >
                  <FlexWidget
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      width: 'match_parent',
                    }}
                  >
                    <TextWidget
                      text={muscle.name}
                      maxLines={1}
                      truncate="END"
                      style={{
                        color:
                          muscle.status === 'fatigued'
                            ? colors.accent
                            : colors.text,
                        fontSize: 11,
                        fontFamily: 'InterTight_700Bold',
                      }}
                    />
                    <TextWidget
                      text={muscle.recoveryLabel}
                      maxLines={1}
                      style={{
                        color: colors.textMuted,
                        fontSize: 10,
                        fontFamily: 'InterTight_600SemiBold',
                      }}
                    />
                  </FlexWidget>
                  <FlexWidget
                    style={{
                      flexDirection: 'row',
                      width: 'match_parent',
                      height: 5,
                      backgroundColor: colors.surface2,
                      borderRadius: 8,
                      overflow: 'hidden',
                    }}
                  >
                    <FlexWidget
                      style={{
                        flex: filled,
                        height: 'match_parent',
                        backgroundColor: colors.accent,
                      }}
                    />
                    <FlexWidget
                      style={{
                        flex: empty,
                        height: 'match_parent',
                        backgroundColor: colors.accentMuted,
                      }}
                    />
                  </FlexWidget>
                </FlexWidget>
              );
            })}
          </FlexWidget>
        ) : (
          <FlexWidget
            style={{
              width: 'match_parent',
              height: 34,
              backgroundColor: colors.surface2,
              borderColor: colors.border,
              borderWidth: 1,
              borderRadius: 14,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <TextWidget
              text={
                snapshot.tone === 'empty'
                  ? 'Start your log'
                  : 'No recovery bottlenecks'
              }
              maxLines={1}
              style={{
                color: colors.accent,
                fontSize: 12,
                fontFamily: 'InterTight_700Bold',
              }}
            />
          </FlexWidget>
        )}
      </FlexWidget>
    </FlexWidget>
  );
}
