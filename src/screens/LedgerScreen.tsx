import { cacheDirectory, EncodingType, writeAsStringAsync } from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { memo, useCallback, useState } from 'react';
import { Alert, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';

import { getDatabase } from '../db/database';
import { exportAllData, listSessionsForLedger, type SessionLedgerRow } from '../db/repo';
import { formatBackgroundBreaks, formatDistanceApprox, formatForegroundInApp, formatSteps } from '../metrics/formatSessionMetrics';
import { colors, spacing } from '../theme';

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

const LedgerSessionRow = memo(function LedgerSessionRow({ item }: { item: SessionLedgerRow }) {
  const sub = metricsSubtitle(item);
  return (
    <View style={styles.card}>
      <Text style={styles.intent}>{item.intent}</Text>
      <Text style={styles.meta}>
        {formatWhen(item.started_at)} · {item.status} · {Math.round(item.duration_sec / 60)}m planned
      </Text>
      {sub ? <Text style={styles.metrics}>{sub}</Text> : null}
    </View>
  );
});

export function LedgerScreen() {
  const [rows, setRows] = useState<SessionLedgerRow[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const db = await getDatabase();
    const list = await listSessionsForLedger(db, 200);
    setRows(list);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  };

  const onExport = async () => {
    try {
      const db = await getDatabase();
      const data = await exportAllData(db);
      const json = JSON.stringify(data, null, 2);
      const path = `${cacheDirectory ?? ''}aperture-export.json`;
      await writeAsStringAsync(path, json, { encoding: EncodingType.UTF8 });
      const can = await Sharing.isAvailableAsync();
      if (!can) {
        Alert.alert('Sharing unavailable', 'This platform cannot open the share sheet.');
        return;
      }
      await Sharing.shareAsync(path, { mimeType: 'application/json', dialogTitle: 'Export Aperture data' });
    } catch (e) {
      Alert.alert('Export failed', e instanceof Error ? e.message : 'Unknown error');
    }
  };

  const keyExtractor = useCallback((item: SessionLedgerRow) => item.id, []);

  const renderItem = useCallback(({ item }: { item: SessionLedgerRow }) => <LedgerSessionRow item={item} />, []);

  return (
    <View style={styles.root}>
      <View style={styles.toolbar}>
        <Pressable onPress={onExport} style={styles.exportBtn}>
          <Text style={styles.exportText}>Export JSON</Text>
        </Pressable>
      </View>
      <FlatList
        data={rows}
        keyExtractor={keyExtractor}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
        contentContainerStyle={rows.length === 0 ? styles.emptyContainer : styles.list}
        ListEmptyComponent={
          <Text style={styles.empty}>No sessions yet. Start an intent to create your first aperture.</Text>
        }
        renderItem={renderItem}
        initialNumToRender={12}
        windowSize={7}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  toolbar: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    alignItems: 'flex-end',
  },
  exportBtn: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.accent,
  },
  exportText: { color: colors.accent, fontWeight: '700' },
  list: { padding: spacing.lg, paddingBottom: spacing.xl * 2, gap: spacing.md },
  emptyContainer: { flexGrow: 1, justifyContent: 'center', padding: spacing.xl },
  empty: { color: colors.muted, textAlign: 'center', fontSize: 15, lineHeight: 22 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  intent: { color: colors.text, fontSize: 16, fontWeight: '600', marginBottom: spacing.xs },
  meta: { color: colors.muted, fontSize: 13 },
  metrics: { color: colors.accent, fontSize: 12, marginTop: spacing.xs, lineHeight: 17 },
});
