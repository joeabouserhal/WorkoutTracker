import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  InteractionManager,
  Modal,
  Pressable,
  ScrollView,
  Text as RNText,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import { createStyleSheet, useStyles } from 'react-native-unistyles';
import ThemedDialog, {
  type ThemedDialogAction,
} from '@/components/ui/ThemedDialog';
import ScreenHeader, { useHeaderFade } from '@/components/ui/ScreenHeader';
import {
  deleteBodyWeightLog,
  getBodyWeightLogs,
  updateBodyWeightLog,
  type WeightLog,
} from '@/db/bodyWeightHelpers';
import { getProfile } from '@/db/profileHelpers';
import type { ProgressStackParamList } from '@/navigation/TabNavigator';

const LB_PER_KG = 2.20462;

type WeightUnit = 'kg' | 'lb';

type DialogState = {
  title: string;
  message?: string;
  actions: ThemedDialogAction[];
};

function normalizeWeightUnit(unit?: string | null): WeightUnit {
  return unit === 'lb' ? 'lb' : 'kg';
}

function convertKg(weightKg: number, unit: WeightUnit): number {
  return unit === 'lb' ? weightKg * LB_PER_KG : weightKg;
}

function formatWeightValue(weightKg: number, unit: WeightUnit): string {
  const value = convertKg(weightKg, unit);
  return value >= 100 ? value.toFixed(0) : value.toFixed(1);
}

function formatWeight(weightKg: number, unit: WeightUnit): string {
  return `${formatWeightValue(weightKg, unit)} ${unit}`;
}

function formatWeightLogDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export default function WeightHistoryScreen() {
  const { styles, theme } = useStyles(stylesheet);
  const navigation =
    useNavigation<NativeStackNavigationProp<ProgressStackParamList>>();
  const { showHeaderFade, handleHeaderScroll } = useHeaderFade();
  const [logs, setLogs] = useState<WeightLog[]>([]);
  const [weightUnit, setWeightUnit] = useState<WeightUnit>('kg');
  const [loading, setLoading] = useState(true);
  const [inputWeight, setInputWeight] = useState('');
  const [editingWeightLog, setEditingWeightLog] = useState<WeightLog | null>(
    null,
  );
  const [deleteWeightLogTarget, setDeleteWeightLogTarget] =
    useState<WeightLog | null>(null);
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [saving, setSaving] = useState(false);
  const loadRequestRef = useRef(0);

  const loadData = useCallback(async () => {
    const requestId = loadRequestRef.current + 1;
    loadRequestRef.current = requestId;
    try {
      const [profile, weightLogs] = await Promise.all([
        getProfile(),
        getBodyWeightLogs(),
      ]);
      if (loadRequestRef.current !== requestId) return;
      setWeightUnit(normalizeWeightUnit(profile?.defaultWeightUnit));
      setLogs(weightLogs);
    } catch (e) {
      if (loadRequestRef.current !== requestId) return;
      console.error('Failed to load weight history', e);
    } finally {
      if (loadRequestRef.current === requestId) {
        setLoading(false);
      }
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      let isActive = true;
      const task = InteractionManager.runAfterInteractions(() => {
        if (!isActive) return;
        setLoading(true);
        loadData().catch(console.error);
      });

      return () => {
        isActive = false;
        task.cancel();
        loadRequestRef.current += 1;
      };
    }, [loadData]),
  );

  const history = useMemo(() => logs.slice().reverse(), [logs]);

  function closeDialog() {
    setDialog(null);
  }

  function showWeightDialog(title: string, message: string) {
    setDialog({
      title,
      message,
      actions: [{ label: 'OK', variant: 'primary', onPress: closeDialog }],
    });
  }

  function openEditModal(log: WeightLog) {
    const displayValue = convertKg(log.weight, weightUnit).toFixed(1);
    setEditingWeightLog(log);
    setInputWeight(displayValue);
  }

  function closeWeightModal() {
    setEditingWeightLog(null);
    setInputWeight('');
  }

  async function handleUpdateWeight() {
    if (!editingWeightLog) return;
    const val = parseFloat(inputWeight);
    if (isNaN(val) || val <= 0) {
      showWeightDialog(
        'Invalid Weight',
        'Please enter a valid positive number.',
      );
      return;
    }

    const previousLogs = logs;
    const previousInputWeight = inputWeight;
    const target = editingWeightLog;
    const weightKg = weightUnit === 'lb' ? val / LB_PER_KG : val;
    setSaving(true);
    setLogs(current =>
      current.map(log =>
        log.id === target.id ? { ...log, weight: weightKg } : log,
      ),
    );
    closeWeightModal();
    try {
      await updateBodyWeightLog(target.id, weightKg);
      await loadData();
    } catch (e) {
      setLogs(previousLogs);
      setEditingWeightLog(target);
      setInputWeight(previousInputWeight);
      showWeightDialog('Something Went Wrong', 'Failed to update weight.');
      console.error(e);
    } finally {
      setSaving(false);
    }
  }

  async function confirmDeleteWeightLog() {
    const target = deleteWeightLogTarget;
    if (!target) return;

    setSaving(true);
    const previousLogs = logs;
    setDeleteWeightLogTarget(null);
    setLogs(current => current.filter(log => log.id !== target.id));
    try {
      await deleteBodyWeightLog(target.id);
      await loadData();
    } catch (e) {
      setLogs(previousLogs);
      setDeleteWeightLogTarget(target);
      showWeightDialog('Something Went Wrong', 'Failed to delete weight log.');
      console.error(e);
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={styles.container}>
      <ScreenHeader
        title="Weight History"
        showFade={showHeaderFade}
        onBack={() => navigation.goBack()}
      />

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator color={theme.colors.accent} />
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          onScroll={handleHeaderScroll}
          scrollEventThrottle={16}
        >
          <View style={styles.summaryCard}>
            <View style={styles.summaryIcon}>
              <MaterialCommunityIcons
                name="scale-bathroom"
                size={22}
                color={theme.colors.accent}
              />
            </View>
            <View style={styles.summaryText}>
              <RNText style={styles.summaryTitle}>Body Weight</RNText>
              <RNText style={styles.summaryMeta}>
                {logs.length === 0
                  ? 'No entries yet'
                  : `${logs.length} ${logs.length === 1 ? 'entry' : 'entries'}`}
              </RNText>
            </View>
          </View>

          {history.length > 0 ? (
            <View style={styles.historyList}>
              {history.map(log => (
                <View key={log.id} style={styles.historyRow}>
                  <View style={styles.historyText}>
                    <RNText style={styles.historyValue}>
                      {formatWeight(log.weight, weightUnit)}
                    </RNText>
                    <RNText style={styles.historyDate}>
                      {formatWeightLogDate(log.loggedAt)}
                    </RNText>
                  </View>
                  <View style={styles.historyActions}>
                    <TouchableOpacity
                      style={styles.iconButton}
                      onPress={() => openEditModal(log)}
                      activeOpacity={0.78}
                      accessibilityLabel="Edit weight log"
                    >
                      <MaterialCommunityIcons
                        name="pencil"
                        size={16}
                        color={theme.colors.text}
                      />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.iconButton, styles.deleteButton]}
                      onPress={() => setDeleteWeightLogTarget(log)}
                      activeOpacity={0.78}
                      accessibilityLabel="Delete weight log"
                    >
                      <MaterialCommunityIcons
                        name="delete-outline"
                        size={16}
                        color={theme.colors.danger}
                      />
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
          ) : (
            <View style={styles.emptyCard}>
              <RNText style={styles.emptyTitle}>No weight logged yet</RNText>
              <RNText style={styles.emptyText}>
                Log your first weight from Progress, then your entries will show
                here.
              </RNText>
            </View>
          )}
        </ScrollView>
      )}

      <Modal
        visible={Boolean(editingWeightLog)}
        transparent
        animationType="fade"
        onRequestClose={closeWeightModal}
      >
        <Pressable style={styles.overlay} onPress={closeWeightModal}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <RNText style={styles.modalTitle}>Edit Weight</RNText>
            <View style={styles.inputRow}>
              <TextInput
                style={styles.weightInput}
                value={inputWeight}
                onChangeText={setInputWeight}
                keyboardType="decimal-pad"
                placeholder="0.0"
                placeholderTextColor={theme.colors.textMuted}
                autoFocus
              />
              <RNText style={styles.inputUnitLabel}>{weightUnit}</RNText>
            </View>
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.cancelModalBtn}
                onPress={closeWeightModal}
              >
                <RNText style={styles.cancelModalText}>Cancel</RNText>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.saveModalBtn,
                  saving && styles.saveModalBtnDisabled,
                ]}
                onPress={handleUpdateWeight}
                disabled={saving}
              >
                <RNText style={styles.saveModalText}>
                  {saving ? 'Saving...' : 'Update'}
                </RNText>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <ThemedDialog
        visible={Boolean(deleteWeightLogTarget)}
        title="Delete Weight Log"
        message={
          deleteWeightLogTarget
            ? `Delete ${formatWeight(deleteWeightLogTarget.weight, weightUnit)} from ${formatWeightLogDate(deleteWeightLogTarget.loggedAt)}?`
            : undefined
        }
        actions={[
          { label: 'Cancel', onPress: () => setDeleteWeightLogTarget(null) },
          {
            label: saving ? 'Deleting...' : 'Delete',
            variant: 'danger',
            onPress: confirmDeleteWeightLog,
          },
        ]}
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

const stylesheet = createStyleSheet(theme => ({
  container: {
    flex: 1,
    backgroundColor: theme.colors.bg,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: theme.colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.sm,
    paddingBottom: theme.spacing.lg,
    gap: theme.spacing.sm,
  },
  summaryCard: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 0.5,
    borderColor: theme.colors.border,
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  summaryIcon: {
    width: 42,
    height: 42,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.accentMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  summaryTitle: {
    color: theme.colors.text,
    fontSize: theme.fontSize.md,
    fontFamily: theme.fontFamily.extraBold,
  },
  summaryMeta: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
    fontFamily: theme.fontFamily.semiBold,
  },
  historyList: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 0.5,
    borderColor: theme.colors.border,
    overflow: 'hidden',
  },
  historyRow: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderBottomWidth: 0.5,
    borderBottomColor: theme.colors.border,
  },
  historyText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  historyValue: {
    color: theme.colors.text,
    fontSize: theme.fontSize.md,
    fontFamily: theme.fontFamily.bold,
  },
  historyDate: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
    fontFamily: theme.fontFamily.medium,
  },
  historyActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  iconButton: {
    width: 34,
    height: 34,
    borderRadius: theme.radius.full,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteButton: {
    backgroundColor: theme.colors.dangerMuted,
    borderColor: theme.colors.dangerMuted,
  },
  emptyCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 0.5,
    borderColor: theme.colors.border,
    padding: theme.spacing.md,
    gap: theme.spacing.xs,
  },
  emptyTitle: {
    color: theme.colors.text,
    fontSize: theme.fontSize.md,
    fontFamily: theme.fontFamily.bold,
  },
  emptyText: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.medium,
    lineHeight: 19,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.xl,
    padding: theme.spacing.lg,
    width: '80%',
    gap: theme.spacing.md,
    borderWidth: 0.5,
    borderColor: theme.colors.border,
  },
  modalTitle: {
    color: theme.colors.text,
    fontSize: theme.fontSize.lg,
    fontFamily: theme.fontFamily.bold,
    textAlign: 'center',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface2,
    borderRadius: theme.radius.md,
    borderWidth: 0.5,
    borderColor: theme.colors.border,
    paddingHorizontal: theme.spacing.md,
  },
  weightInput: {
    flex: 1,
    color: theme.colors.text,
    fontSize: theme.fontSize.xl,
    fontFamily: theme.fontFamily.semiBold,
    paddingVertical: theme.spacing.md,
  },
  inputUnitLabel: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.md,
    fontFamily: theme.fontFamily.medium,
  },
  modalActions: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  cancelModalBtn: {
    flex: 1,
    paddingVertical: theme.spacing.md,
    alignItems: 'center',
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surface2,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  cancelModalText: {
    color: theme.colors.text,
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.semiBold,
  },
  saveModalBtn: {
    flex: 1,
    paddingVertical: theme.spacing.md,
    alignItems: 'center',
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.accent,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  saveModalBtnDisabled: {
    opacity: 0.5,
  },
  saveModalText: {
    color: '#FFFFFF',
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.semiBold,
  },
}));
