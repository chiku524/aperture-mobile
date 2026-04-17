import { cacheDirectory, EncodingType, writeAsStringAsync } from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { getDatabase } from '../db/database';
import { exportAllData, listSessionsForLedger, searchSessionsForLedger, type SessionLedgerRow } from '../db/repo';
import { formatBackgroundBreaks, formatDistanceApprox, formatForegroundInApp, formatSteps } from '../metrics/formatSessionMetrics';
import type { RootStackParamList } from '../navigation/types';
import { colors, spacing } from '../theme';
import { impactLight } from '../utils/haptics';

const PAGE_SIZE = 40;
const SEARCH_DEBOUNCE_MS = 280;

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

const LedgerSessionRow = memo(function LedgerSessionRow({
  item,
  onPress,
}: {
  item: SessionLedgerRow;
  onPress: (item: SessionLedgerRow) => void;
}) {
  const sub = metricsSubtitle(item);
  return (
    <Pressable
      onPress={() => onPress(item)}
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      accessibilityRole="button"
      accessibilityLabel={`Session ${item.status}: ${item.intent}`}
      accessibilityHint={item.status === 'active' ? 'Opens active aperture' : 'Opens session details and receipt'}
    >
      <Text style={styles.intent}>{item.intent}</Text>
      <Text style={styles.meta}>
        {formatWhen(item.started_at)} · {item.status} · {Math.round(item.duration_sec / 60)}m planned
      </Text>
      {sub ? <Text style={styles.metrics}>{sub}</Text> : null}
      <Text style={styles.tapHint}>{item.status === 'active' ? 'Tap to resume in Aperture' : 'Tap for session detail'}</Text>
    </Pressable>
  );
});

export function LedgerScreen() {
  const rootNav = useNavigation().getParent<NativeStackNavigationProp<RootStackParamList>>();
  const [search, setSearch] = useState('');
  const [needle, setNeedle] = useState('');
  const [rows, setRows] = useState<SessionLedgerRow[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const nextOffsetRef = useRef(0);
  const fetchMoreLockRef = useRef(false);
  const listGen = useRef(0);

  useEffect(() => {
    const id = setTimeout(() => setNeedle(search.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [search]);

  const reloadFirstPage = useCallback(async () => {
    const gen = ++listGen.current;
    fetchMoreLockRef.current = false;
    const db = await getDatabase();
    const q = needle;
    const list = q
      ? await searchSessionsForLedger(db, q, PAGE_SIZE, 0)
      : await listSessionsForLedger(db, PAGE_SIZE, 0);
    if (gen !== listGen.current) return;
    setRows(list);
    nextOffsetRef.current = list.length;
    setHasMore(list.length === PAGE_SIZE);
  }, [needle]);

  useFocusEffect(
    useCallback(() => {
      void reloadFirstPage();
    }, [reloadFirstPage]),
  );

  const loadMore = useCallback(async () => {
    if (!hasMore || refreshing || fetchMoreLockRef.current) return;
    const capturedGen = listGen.current;
    fetchMoreLockRef.current = true;
    setLoadingMore(true);
    try {
      const db = await getDatabase();
      const offset = nextOffsetRef.current;
      const q = needle;
      const next = q
        ? await searchSessionsForLedger(db, q, PAGE_SIZE, offset)
        : await listSessionsForLedger(db, PAGE_SIZE, offset);
      if (capturedGen !== listGen.current) return;
      if (next.length === 0) {
        setHasMore(false);
        return;
      }
      nextOffsetRef.current += next.length;
      setRows((prev) => [...prev, ...next]);
      setHasMore(next.length === PAGE_SIZE);
    } finally {
      fetchMoreLockRef.current = false;
      setLoadingMore(false);
    }
  }, [needle, hasMore, refreshing]);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await reloadFirstPage();
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

  const onRowPress = useCallback(
    (item: SessionLedgerRow) => {
      if (!rootNav) return;
      impactLight();
      if (item.status === 'active') {
        rootNav.navigate('Aperture', { sessionId: item.id });
        return;
      }
      rootNav.navigate('SessionDetail', { sessionId: item.id });
    },
    [rootNav],
  );

  const keyExtractor = useCallback((item: SessionLedgerRow) => item.id, []);

  const renderItem = useCallback(
    ({ item }: { item: SessionLedgerRow }) => <LedgerSessionRow item={item} onPress={onRowPress} />,
    [onRowPress],
  );

  const searchPending = search.trim() !== needle;

  const emptyMessage =
    needle.length > 0
      ? 'No sessions match your search in saved history.'
      : 'No sessions yet. Start an intent to create your first aperture.';

  const countParts: string[] = [];
  if (rows.length > 0) {
    if (needle) {
      countParts.push(`${rows.length} match${rows.length === 1 ? '' : 'es'} for "${needle}"`);
    } else {
      countParts.push(`${rows.length} session${rows.length === 1 ? '' : 's'} loaded`);
    }
    if (hasMore) {
      countParts.push('scroll for more');
    }
  }
  if (searchPending && search.trim()) {
    countParts.push('updating search…');
  }

  const listFooter =
    hasMore && rows.length > 0 ? (
      <View style={styles.footer}>
        {loadingMore ? <ActivityIndicator color={colors.accent} /> : null}
      </View>
    ) : !hasMore && rows.length > 0 ? (
      <Text style={styles.endHint}>End of results</Text>
    ) : null;

  return (
    <View style={styles.root}>
      <View style={styles.toolbar}>
        <View style={styles.searchWrap}>
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search intent or parking lot"
            placeholderTextColor={colors.muted}
            autoCapitalize="none"
            autoCorrect={false}
            clearButtonMode="while-editing"
            style={styles.searchInput}
            accessibilityLabel="Search sessions by intent or parking lot text"
          />
          {searchPending && search.trim() ? (
            <ActivityIndicator style={styles.searchSpinner} color={colors.accent} />
          ) : null}
        </View>
        <Pressable
          onPress={onExport}
          style={styles.exportBtn}
          accessibilityRole="button"
          accessibilityLabel="Export all data as JSON"
        >
          <Text style={styles.exportText}>Export JSON</Text>
        </Pressable>
      </View>
      {countParts.length > 0 ? (
        <Text style={styles.countLine} accessibilityLiveRegion="polite">
          {countParts.join(' · ')}
        </Text>
      ) : null}
      <FlatList
        data={rows}
        keyExtractor={keyExtractor}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
        contentContainerStyle={rows.length === 0 ? styles.emptyContainer : styles.list}
        ListEmptyComponent={
          !searchPending || !search.trim() ? <Text style={styles.empty}>{emptyMessage}</Text> : (
            <View style={styles.emptyWithSpinner}>
              <ActivityIndicator color={colors.accent} />
              <Text style={styles.emptyMuted}>Searching…</Text>
            </View>
          )
        }
        renderItem={renderItem}
        initialNumToRender={12}
        windowSize={7}
        keyboardShouldPersistTaps="handled"
        onEndReached={() => void loadMore()}
        onEndReachedThreshold={0.35}
        ListFooterComponent={listFooter}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: 'transparent' },
  toolbar: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  searchWrap: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center' },
  searchInput: {
    flex: 1,
    minWidth: 0,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    color: colors.text,
    fontSize: 16,
  },
  searchSpinner: { marginLeft: spacing.sm },
  countLine: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
    paddingBottom: 0,
    color: colors.muted,
    fontSize: 13,
  },
  exportBtn: {
    flexShrink: 0,
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
  emptyWithSpinner: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.xl, gap: spacing.md },
  emptyMuted: { color: colors.muted, fontSize: 14 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardPressed: { opacity: 0.88 },
  intent: { color: colors.text, fontSize: 16, fontWeight: '600', marginBottom: spacing.xs },
  meta: { color: colors.muted, fontSize: 13 },
  metrics: { color: colors.accent, fontSize: 12, marginTop: spacing.xs, lineHeight: 17 },
  tapHint: { color: colors.muted, fontSize: 11, marginTop: spacing.sm, fontStyle: 'italic' },
  footer: { paddingVertical: spacing.lg, alignItems: 'center' },
  endHint: {
    textAlign: 'center',
    color: colors.muted,
    fontSize: 12,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
});
