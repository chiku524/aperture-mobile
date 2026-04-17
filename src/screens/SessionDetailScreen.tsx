import type { RouteProp } from '@react-navigation/native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { ActivityIndicator, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getDatabase } from '../db/database';
import { getLatestDigestForSession, getSessionLedgerRow, type DigestRow, type SessionLedgerRow } from '../db/repo';
import {
  formatBackgroundBreaks,
  formatDistanceApprox,
  formatForegroundInApp,
  formatSteps,
} from '../metrics/formatSessionMetrics';
import type { RootStackParamList } from '../navigation/types';
import { colors, spacing } from '../theme';

type R = RouteProp<RootStackParamList, 'SessionDetail'>;
type Nav = NativeStackNavigationProp<RootStackParamList, 'SessionDetail'>;

function formatWhen(ts: number): string {
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return String(ts);
  }
}

function metricsSubtitle(row: SessionLedgerRow): string | null {
  if (row.app_foreground_ms == null && row.steps_delta == null) {
    return null;
  }
  const fgMs = row.app_foreground_ms ?? 0;
  const steps = row.steps_delta ?? 0;
  const dist = row.distance_estimate_m ?? 0;
  const breaks = row.background_transitions ?? 0;
  if (fgMs === 0 && steps === 0 && breaks === 0) {
    return null;
  }
  const parts = [formatForegroundInApp(fgMs), formatBackgroundBreaks(breaks)];
  if (steps > 0) {
    parts.push(formatSteps(steps));
    parts.push(formatDistanceApprox(dist));
  }
  return parts.join(' · ');
}

export function SessionDetailScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Nav>();
  const route = useRoute<R>();
  const { sessionId } = route.params;

  const [session, setSession] = useState<SessionLedgerRow | null>(null);
  const [digest, setDigest] = useState<DigestRow | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const db = await getDatabase();
      const [s, d] = await Promise.all([
        getSessionLedgerRow(db, sessionId),
        getLatestDigestForSession(db, sessionId),
      ]);
      setSession(s);
      setDigest(d);
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    void load();
  }, [load]);

  useLayoutEffect(() => {
    if (!session) return;
    const t = session.intent.trim();
    const title = t.length <= 36 ? t || 'Session' : `${t.slice(0, 36)}…`;
    navigation.setOptions({ title });
  }, [navigation, session]);

  if (loading) {
    return (
      <View style={[styles.center, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  if (!session) {
    return (
      <View style={[styles.center, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <Text style={styles.muted}>This session was not found. It may have been removed.</Text>
      </View>
    );
  }

  const sub = metricsSubtitle(session);
  const statusLabel =
    session.status === 'completed' ? 'Completed' : session.status === 'abandoned' ? 'Abandoned' : session.status;

  return (
    <ScrollView
      contentContainerStyle={[
        styles.scroll,
        { paddingTop: spacing.md, paddingBottom: insets.bottom + spacing.xl },
      ]}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.statusPill}>{statusLabel}</Text>
      <Text style={styles.section}>Session id</Text>
      <Text selectable style={styles.monoId}>
        {session.id}
      </Text>
      <Text style={styles.idHint}>Select the id above to copy (for support or sync debugging).</Text>
      <Text style={styles.intent}>{session.intent}</Text>

      {session.parking_note ? (
        <>
          <Text style={styles.section}>Parking lot</Text>
          <Text style={styles.parking}>{session.parking_note}</Text>
        </>
      ) : null}

      <Text style={styles.section}>When</Text>
      <Text style={styles.body}>Started {formatWhen(session.started_at)}</Text>
      {session.ended_at != null ? (
        <Text style={styles.body}>Ended {formatWhen(session.ended_at)}</Text>
      ) : null}
      <Text style={styles.bodyMuted}>
        {session.strictness === 'hard' ? 'Hard' : 'Soft'} strictness · {Math.round(session.duration_sec / 60)}m planned
        block
      </Text>

      {sub ? (
        <>
          <Text style={[styles.section, styles.mt]}>Cognitive metrics (snapshot)</Text>
          <View style={styles.metricsBox}>
            <Text style={styles.metricsText}>{sub}</Text>
          </View>
        </>
      ) : (
        <>
          <Text style={[styles.section, styles.mt]}>Cognitive metrics</Text>
          <Text style={styles.bodyMuted}>No metrics were recorded for this session.</Text>
        </>
      )}

      <Text style={[styles.section, styles.mt]}>Receipt</Text>
      {digest ? (
        <View style={styles.receiptBox}>
          <Text style={styles.receiptLabel}>Summary</Text>
          <Text style={styles.receiptBody}>{digest.summary}</Text>
          {digest.risks ? (
            <>
              <Text style={[styles.receiptLabel, styles.receiptGap]}>Risks / unknowns</Text>
              <Text style={styles.receiptBody}>{digest.risks}</Text>
            </>
          ) : null}
          {digest.next_step ? (
            <>
              <Text style={[styles.receiptLabel, styles.receiptGap]}>Next step</Text>
              <Text style={styles.receiptBody}>{digest.next_step}</Text>
            </>
          ) : null}
          <Text style={styles.digestMeta}>Saved {formatWhen(digest.created_at)}</Text>
        </View>
      ) : (
        <Text style={styles.bodyMuted}>
          No receipt was saved for this session{session.status === 'abandoned' ? ' (session was abandoned).' : '.'}
        </Text>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.lg },
  scroll: { paddingHorizontal: spacing.lg },
  muted: { color: colors.muted, textAlign: 'center', fontSize: 15, lineHeight: 22 },
  statusPill: {
    alignSelf: 'flex-start',
    color: colors.accent,
    fontWeight: '700',
    fontSize: 12,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
  },
  monoId: {
    color: colors.text,
    fontSize: 12,
    lineHeight: 18,
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
  },
  idHint: { color: colors.muted, fontSize: 12, lineHeight: 17, marginBottom: spacing.md },
  intent: { color: colors.text, fontSize: 20, fontWeight: '600', lineHeight: 28, marginBottom: spacing.md },
  section: {
    color: colors.muted,
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: spacing.xs,
  },
  parking: { color: colors.warn, fontSize: 16, lineHeight: 24, marginBottom: spacing.md },
  body: { color: colors.text, fontSize: 15, lineHeight: 22, marginBottom: spacing.xs },
  bodyMuted: { color: colors.muted, fontSize: 14, lineHeight: 21 },
  mt: { marginTop: spacing.lg },
  metricsBox: {
    padding: spacing.md,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  metricsText: { color: colors.text, fontSize: 14, lineHeight: 21 },
  receiptBox: {
    padding: spacing.md,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  receiptLabel: { color: colors.muted, fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  receiptGap: { marginTop: spacing.md },
  receiptBody: { color: colors.text, fontSize: 15, lineHeight: 22, marginTop: spacing.xs },
  digestMeta: { color: colors.muted, fontSize: 12, marginTop: spacing.lg },
});
