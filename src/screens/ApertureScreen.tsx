import type { RouteProp } from '@react-navigation/native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SETTINGS_METRICS_APP_TIME, SETTINGS_METRICS_MOTION } from '../constants/settingsKeys';
import { getDatabase } from '../db/database';
import {
  abandonSession,
  extendPlannedEnd,
  getSession,
  getSetting,
  insertEvent,
  type SessionRow,
} from '../db/repo';
import { formatDistanceApprox, formatForegroundInApp, formatSteps } from '../metrics/formatSessionMetrics';
import { persistSessionMetrics } from '../metrics/persistSessionMetrics';
import {
  attachSessionMetrics,
  ESTIMATED_STRIDE_M,
  getLiveAndroidSteps,
  getLiveForegroundMs,
  getTrackedSessionId,
} from '../metrics/sessionMetricsRuntime';
import type { RootStackParamList } from '../navigation/types';
import { colors, spacing } from '../theme';

type Nav = NativeStackNavigationProp<RootStackParamList, 'Aperture'>;
type R = RouteProp<RootStackParamList, 'Aperture'>;

function MetricsLive(props: {
  sessionId: string;
  tick: number;
  foregroundEnabled: boolean;
  motionEnabled: boolean;
}) {
  void props.tick;
  if (getTrackedSessionId() !== props.sessionId) {
    return null;
  }
  const fgMs = props.foregroundEnabled ? getLiveForegroundMs() : 0;
  const steps = getLiveAndroidSteps();
  return (
    <View style={styles.metricsBox}>
      <Text style={styles.metricsLine}>
        {props.foregroundEnabled ? formatForegroundInApp(fgMs) : 'In-app time capture off (Settings).'}
      </Text>
      <Text style={styles.metricsLineMuted}>
        {!props.motionEnabled
          ? 'Step / distance capture off (Settings).'
          : Platform.OS === 'android'
            ? `${formatSteps(steps)} · ${formatDistanceApprox(steps * ESTIMATED_STRIDE_M)}`
            : Platform.OS === 'ios'
              ? 'Steps are queried once when you finish the receipt (HealthKit / Motion).'
              : 'Step estimates are not available on web.'}
      </Text>
    </View>
  );
}

function formatRemain(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, '0')}`;
}

export function ApertureScreen() {
  const insets = useSafeAreaInsets();
  const route = useRoute<R>();
  const navigation = useNavigation<Nav>();
  const { sessionId } = route.params;

  const [session, setSession] = useState<SessionRow | null>(null);
  const [tick, setTick] = useState(0);
  const [paused, setPaused] = useState(false);
  const [pauseStartedAt, setPauseStartedAt] = useState<number | null>(null);
  const [pauseModal, setPauseModal] = useState(false);
  const [pauseReason, setPauseReason] = useState('');
  const [metricPreview, setMetricPreview] = useState(0);
  const [metricFgEnabled, setMetricFgEnabled] = useState(true);
  const [metricMotionEnabled, setMetricMotionEnabled] = useState(true);

  const reload = useCallback(async () => {
    const db = await getDatabase();
    const row = await getSession(db, sessionId);
    setSession(row);
  }, [sessionId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const db = await getDatabase();
      const motion = (await getSetting(db, SETTINGS_METRICS_MOTION)) !== '0';
      const fg = (await getSetting(db, SETTINGS_METRICS_APP_TIME)) !== '0';
      if (!cancelled) {
        setMetricFgEnabled(fg);
        setMetricMotionEnabled(motion);
        attachSessionMetrics(sessionId, { recordForeground: fg, recordMotion: motion });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  useEffect(() => {
    const id = setInterval(() => setMetricPreview((n) => n + 1), 2000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!session || session.status !== 'active') return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [session]);

  const remainingMs =
    session && !paused ? Math.max(0, session.planned_end_at - Date.now()) : 0;
  const displayRemain =
    session && paused && pauseStartedAt != null
      ? Math.max(0, session.planned_end_at - pauseStartedAt)
      : remainingMs;

  useEffect(() => {
    if (!session || paused || session.status !== 'active') return;
    if (session.planned_end_at - Date.now() <= 0) {
      navigation.replace('Receipt', { sessionId: session.id });
    }
  }, [session, paused, tick, navigation]);

  const confirmPause = async () => {
    const reason = pauseReason.trim() || 'unspecified';
    const db = await getDatabase();
    const now = Date.now();
    await insertEvent(db, sessionId, 'pause', now, { reason });
    setPauseStartedAt(now);
    setPaused(true);
    setPauseModal(false);
    setPauseReason('');
    await reload();
  };

  const onResume = async () => {
    if (pauseStartedAt == null) return;
    const db = await getDatabase();
    const now = Date.now();
    const delta = now - pauseStartedAt;
    await extendPlannedEnd(db, sessionId, delta);
    await insertEvent(db, sessionId, 'resume', now, {});
    setPaused(false);
    setPauseStartedAt(null);
    await reload();
  };

  const onEnd = () => {
    navigation.navigate('Receipt', { sessionId });
  };

  const onLeave = () => {
    Alert.alert(
      'Leave aperture?',
      'This marks the session as abandoned. You can start a fresh intent afterward.',
      [
        { text: 'Stay', style: 'cancel' },
        {
          text: 'Abandon',
          style: 'destructive',
          onPress: async () => {
            const db = await getDatabase();
            const row = session ?? (await getSession(db, sessionId));
            if (row) {
              await persistSessionMetrics(db, row);
            }
            await abandonSession(db, sessionId, Date.now());
            navigation.reset({ index: 0, routes: [{ name: 'Main' }] });
          },
        },
      ],
    );
  };

  if (!session) {
    return (
      <View style={[styles.center, { paddingBottom: insets.bottom }]}>
        <Text style={styles.muted}>Loading…</Text>
      </View>
    );
  }

  if (session.status !== 'active') {
    return (
      <View style={[styles.center, { paddingBottom: insets.bottom }]}>
        <Text style={styles.body}>This session is no longer active.</Text>
        <Pressable style={styles.secondary} onPress={() => navigation.reset({ index: 0, routes: [{ name: 'Main' }] })}>
          <Text style={styles.secondaryText}>Back home</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.timer}>{formatRemain(displayRemain)}</Text>
        <Text style={styles.strict}>
          {session.strictness === 'hard' ? 'Hard' : 'Soft'} · {paused ? 'Paused' : 'Running'}
        </Text>

        <Text style={styles.section}>Intent</Text>
        <Text style={styles.intent}>{session.intent}</Text>

        {session.parking_note ? (
          <>
            <Text style={styles.section}>Parking lot</Text>
            <Text style={styles.parking}>{session.parking_note}</Text>
          </>
        ) : null}

        <Text style={styles.section}>Cognitive context (live)</Text>
        <Text style={styles.metricsHint}>
          In-app time is how long Aperture stays foreground — not full-device screen time. Distance is a rough
          estimate from steps.
        </Text>
        <MetricsLive
          sessionId={sessionId}
          tick={metricPreview}
          foregroundEnabled={metricFgEnabled}
          motionEnabled={metricMotionEnabled}
        />
      </ScrollView>

      <View style={styles.actions}>
        {paused ? (
          <Pressable style={styles.primary} onPress={onResume}>
            <Text style={styles.primaryText}>Resume</Text>
          </Pressable>
        ) : (
          <Pressable style={styles.secondary} onPress={() => setPauseModal(true)}>
            <Text style={styles.secondaryText}>Pause</Text>
          </Pressable>
        )}
        <Pressable style={styles.primary} onPress={onEnd}>
          <Text style={styles.primaryText}>End</Text>
        </Pressable>
      </View>

      <Pressable onPress={onLeave} style={styles.leave}>
        <Text style={styles.leaveText}>Abandon session</Text>
      </Pressable>

      <Modal visible={pauseModal} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Pause reason</Text>
            <TextInput
              value={pauseReason}
              onChangeText={setPauseReason}
              placeholder="What pulled attention?"
              placeholderTextColor={colors.muted}
              style={styles.modalInput}
            />
            <View style={styles.modalRow}>
              <Pressable style={styles.secondary} onPress={() => setPauseModal(false)}>
                <Text style={styles.secondaryText}>Cancel</Text>
              </Pressable>
              <Pressable style={styles.primary} onPress={confirmPause}>
                <Text style={styles.primaryText}>Pause</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: spacing.lg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.lg, backgroundColor: colors.bg },
  muted: { color: colors.muted },
  body: { color: colors.text, textAlign: 'center', marginBottom: spacing.md },
  timer: { fontSize: 56, fontWeight: '200', color: colors.text, textAlign: 'center', marginTop: spacing.md },
  strict: { color: colors.muted, textAlign: 'center', marginBottom: spacing.xl },
  section: { color: colors.muted, fontSize: 12, textTransform: 'uppercase', letterSpacing: 1, marginBottom: spacing.xs },
  intent: { color: colors.text, fontSize: 18, lineHeight: 26, marginBottom: spacing.lg },
  parking: { color: colors.warn, fontSize: 16, lineHeight: 24 },
  actions: { flexDirection: 'row', gap: spacing.md, paddingHorizontal: spacing.lg, marginTop: spacing.sm },
  primary: {
    flex: 1,
    backgroundColor: colors.accent,
    paddingVertical: spacing.md,
    borderRadius: 12,
    alignItems: 'center',
  },
  primaryText: { color: '#041312', fontWeight: '700', fontSize: 16 },
  secondary: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingVertical: spacing.md,
    borderRadius: 12,
    alignItems: 'center',
  },
  secondaryText: { color: colors.text, fontWeight: '600', fontSize: 16 },
  leave: { alignItems: 'center', paddingVertical: spacing.lg },
  leaveText: { color: colors.danger, fontSize: 15 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  modalCard: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modalTitle: { color: colors.text, fontSize: 17, fontWeight: '700', marginBottom: spacing.md },
  modalInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: spacing.md,
    color: colors.text,
    marginBottom: spacing.lg,
  },
  modalRow: { flexDirection: 'row', gap: spacing.md },
  metricsHint: { color: colors.muted, fontSize: 12, lineHeight: 17, marginBottom: spacing.sm },
  metricsBox: {
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  metricsLine: { color: colors.text, fontSize: 15, fontWeight: '600' },
  metricsLineMuted: { color: colors.muted, fontSize: 13, marginTop: spacing.xs, lineHeight: 18 },
});
