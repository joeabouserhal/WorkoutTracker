import React, { useCallback, useState } from 'react';
import {
  ScrollView,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { WidgetPreview } from 'react-native-android-widget';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { createStyleSheet, useStyles } from 'react-native-unistyles';
import ScreenHeader, { useHeaderFade } from '@/components/ui/ScreenHeader';
import GeneralInfoWidget from '@/widgets/GeneralInfoWidget';
import {
  buildGeneralInfoFallbackSnapshot,
  buildGeneralInfoWidgetSnapshot,
  type WidgetStatusSnapshot,
} from '@/widgets/generalInfoWidgetData';
import type { ProfileStackParamList } from '../navigation/TabNavigator';

type Props = NativeStackScreenProps<ProfileStackParamList, 'Widgets'>;

const WIDGET_ASPECT_RATIO = 250 / 110;

export default function WidgetsScreen({ navigation }: Props) {
  const { styles, theme } = useStyles(stylesheet);
  const { showHeaderFade, handleHeaderScroll } = useHeaderFade();
  const { width: screenWidth } = useWindowDimensions();
  const [snapshot, setSnapshot] = useState<WidgetStatusSnapshot>(
    buildGeneralInfoFallbackSnapshot,
  );
  const previewWidth = Math.min(screenWidth - theme.spacing.md * 2, 360);
  const previewHeight = Math.round(previewWidth / WIDGET_ASPECT_RATIO);

  useFocusEffect(
    useCallback(() => {
      let active = true;

      buildGeneralInfoWidgetSnapshot()
        .then(nextSnapshot => {
          if (active) setSnapshot(nextSnapshot);
        })
        .catch(e => {
          console.error('Failed to load widget preview', e);
          if (active) setSnapshot(buildGeneralInfoFallbackSnapshot());
        });

      return () => {
        active = false;
      };
    }, []),
  );

  const renderGeneralInfoWidget = useCallback(
    () => <GeneralInfoWidget snapshot={snapshot} />,
    [snapshot],
  );

  return (
    <View style={styles.root}>
      <ScreenHeader
        title="Widgets"
        onBack={() => navigation.goBack()}
        showFade={showHeaderFade}
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        onScroll={handleHeaderScroll}
        scrollEventThrottle={16}
      >
        <View style={styles.widgetHeader}>
          <View style={styles.widgetIconBadge}>
            <MaterialCommunityIcons
              name="widgets-outline"
              size={19}
              color={theme.colors.accent}
            />
          </View>
          <View style={styles.widgetHeaderText}>
            <Text style={styles.widgetTitle}>Workout Status</Text>
            <Text style={styles.widgetMeta}>Medium 4x2</Text>
          </View>
        </View>

        <View style={styles.previewShell}>
          <WidgetPreview
            width={previewWidth}
            height={previewHeight}
            renderWidget={renderGeneralInfoWidget}
          />
        </View>
      </ScrollView>
    </View>
  );
}

const stylesheet = createStyleSheet(theme => ({
  root: {
    flex: 1,
    backgroundColor: theme.colors.bg,
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.md,
    paddingBottom: theme.spacing.xl,
  },
  widgetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },
  widgetIconBadge: {
    width: 38,
    height: 38,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.accentMuted,
  },
  widgetHeaderText: {
    flex: 1,
    minWidth: 0,
  },
  widgetTitle: {
    color: theme.colors.text,
    fontSize: theme.fontSize.lg,
    fontFamily: theme.fontFamily.extraBold,
  },
  widgetMeta: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.sm,
    marginTop: 2,
  },
  previewShell: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.md,
    overflow: 'hidden',
  },
}));
