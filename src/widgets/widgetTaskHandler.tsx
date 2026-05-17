import React from 'react';
import type { WidgetTaskHandlerProps } from 'react-native-android-widget';
import GeneralInfoWidget from './GeneralInfoWidget';
import {
  buildGeneralInfoFallbackSnapshot,
  buildGeneralInfoWidgetSnapshot,
} from './generalInfoWidgetData';

export async function widgetTaskHandler({
  widgetAction,
  renderWidget,
}: WidgetTaskHandlerProps) {
  if (widgetAction === 'WIDGET_DELETED' || widgetAction === 'WIDGET_CLICK') {
    return;
  }

  try {
    renderWidget(
      <GeneralInfoWidget snapshot={await buildGeneralInfoWidgetSnapshot()} />,
    );
  } catch (e) {
    console.warn('Could not render general info widget', e);
    renderWidget(
      <GeneralInfoWidget snapshot={buildGeneralInfoFallbackSnapshot()} />,
    );
  }
}
