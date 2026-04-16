import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';

import {
  SETTINGS_METRICS_APP_TIME,
  SETTINGS_METRICS_MOTION,
  SETTINGS_SYNC_BASE_URL,
  SETTINGS_SYNC_TOKEN,
  SETTINGS_WIFI_ONLY_SYNC,
} from '../constants/settingsKeys';
import { getDatabase } from '../db/database';
import { getSetting, setSetting } from '../db/repo';
import { applySyncRecord } from '../sync/applyRemoteRecords';
import { buildPushRecords } from '../sync/buildPushRecords';
import { SyncClient } from '../sync/syncClient';
import { assertSyncAllowedOnCurrentNetwork } from '../sync/wifiGuard';
import { colors, spacing } from '../theme';

export function SettingsScreen() {
  const [baseUrl, setBaseUrl] = useState('');
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [wifiOnly, setWifiOnly] = useState(false);
  const [recordAppTime, setRecordAppTime] = useState(true);
  const [recordMotion, setRecordMotion] = useState(true);

  useFocusEffect(
    useCallback(() => {
      void (async () => {
        const db = await getDatabase();
        const [u, t, fg, motion, wifi] = await Promise.all([
          getSetting(db, SETTINGS_SYNC_BASE_URL),
          getSetting(db, SETTINGS_SYNC_TOKEN),
          getSetting(db, SETTINGS_METRICS_APP_TIME),
          getSetting(db, SETTINGS_METRICS_MOTION),
          getSetting(db, SETTINGS_WIFI_ONLY_SYNC),
        ]);
        if (u) setBaseUrl(u);
        if (t) setToken(t);
        setRecordAppTime(fg !== '0');
        setRecordMotion(motion !== '0');
        setWifiOnly(wifi === '1');
      })();
    }, []),
  );

  const persistMetricToggle = async (key: string, enabled: boolean) => {
    const db = await getDatabase();
    await setSetting(db, key, enabled ? '1' : '0');
  };

  const persist = async () => {
    const db = await getDatabase();
    await setSetting(db, SETTINGS_SYNC_BASE_URL, baseUrl.trim());
    await setSetting(db, SETTINGS_SYNC_TOKEN, token);
  };

  const clientOrAlert = (): SyncClient | null => {
    const b = baseUrl.trim().replace(/\/+$/, '');
    if (!b) {
      Alert.alert('Missing URL', 'Set a base URL like https://your-server.example.com');
      return null;
    }
    if (!token.trim()) {
      Alert.alert('Missing token', 'Set a bearer token your server accepts.');
      return null;
    }
    return new SyncClient(b, token.trim());
  };

  const onTest = async () => {
    const c = clientOrAlert();
    if (!c) return;
    setBusy('health');
    try {
      const h = await c.health();
      Alert.alert('Connection OK', `Server version: ${h.version}`);
    } catch (e) {
      Alert.alert('Health check failed', e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setBusy(null);
    }
  };

  const onPush = async () => {
    const c = clientOrAlert();
    if (!c) return;
    setBusy('push');
    try {
      await persist();
      await assertSyncAllowedOnCurrentNetwork(wifiOnly);
      const db = await getDatabase();
      const records = await buildPushRecords(db);
      const res = await c.push({ records });
      Alert.alert('Push complete', `Accepted ${res.accepted} records.`);
    } catch (e) {
      Alert.alert('Push failed', e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setBusy(null);
    }
  };

  const onPull = async () => {
    const c = clientOrAlert();
    if (!c) return;
    setBusy('pull');
    try {
      await persist();
      await assertSyncAllowedOnCurrentNetwork(wifiOnly);
      const db = await getDatabase();
      let cursor: string | null = null;
      let total = 0;
      for (let i = 0; i < 50; i += 1) {
        const page = await c.pull(cursor);
        await db.withTransactionAsync(async () => {
          for (const rec of page.records) {
            await applySyncRecord(db, rec);
          }
        });
        total += page.records.length;
        if (page.records.length === 0) break;
        cursor = page.nextCursor;
        if (cursor == null) break;
      }
      Alert.alert('Pull complete', `Merged ${total} records.`);
    } catch (e) {
      Alert.alert('Pull failed', e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setBusy(null);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>Cognitive metrics</Text>
      <Text style={styles.p}>
        Lightweight, on-device signals during an aperture: time with Aperture in the foreground (not system screen
        time), optional steps, and an approximate walk distance from stride length. Toggles apply to new tracking
        segments; finish or save a session to persist a snapshot.
      </Text>
      <View style={styles.row}>
        <Text style={styles.wifiLabel}>Record in-app time</Text>
        <Switch
          value={recordAppTime}
          onValueChange={(v) => {
            setRecordAppTime(v);
            void persistMetricToggle(SETTINGS_METRICS_APP_TIME, v);
          }}
        />
      </View>
      <View style={styles.row}>
        <Text style={styles.wifiLabel}>Record steps & distance (est.)</Text>
        <Switch
          value={recordMotion}
          onValueChange={(v) => {
            setRecordMotion(v);
            void persistMetricToggle(SETTINGS_METRICS_MOTION, v);
          }}
        />
      </View>

      <Text style={[styles.title, styles.sectionSpacer]}>Self-hosted sync</Text>
      <Text style={styles.p}>
        Optional backup to a server you control. TLS and bearer token only in this MVP — see docs/PLANNING.md.
      </Text>

      <Text style={styles.label}>Base URL</Text>
      <TextInput
        value={baseUrl}
        onChangeText={setBaseUrl}
        autoCapitalize="none"
        autoCorrect={false}
        placeholder="https://aperture.example.com"
        placeholderTextColor={colors.muted}
        style={styles.input}
      />

      <Text style={styles.label}>Bearer token</Text>
      <TextInput
        value={token}
        onChangeText={setToken}
        autoCapitalize="none"
        autoCorrect={false}
        secureTextEntry
        placeholder="Secret token"
        placeholderTextColor={colors.muted}
        style={styles.input}
      />

      <View style={styles.row}>
        <Text style={styles.wifiLabel}>Wi‑Fi only sync</Text>
        <Switch
          value={wifiOnly}
          onValueChange={(v) => {
            setWifiOnly(v);
            void persistMetricToggle(SETTINGS_WIFI_ONLY_SYNC, v);
          }}
        />
      </View>
      <Text style={styles.stub}>
        Push and pull are blocked on cellular when this is on (uses expo-network). Health check is still allowed.
      </Text>

      <Pressable style={styles.btn} onPress={onTest} disabled={busy !== null}>
        {busy === 'health' ? (
          <ActivityIndicator color={colors.accent} />
        ) : (
          <Text style={styles.btnText}>Test connection</Text>
        )}
      </Pressable>

      <Pressable style={styles.btn} onPress={onPush} disabled={busy !== null}>
        {busy === 'push' ? (
          <ActivityIndicator color={colors.accent} />
        ) : (
          <Text style={styles.btnText}>Push sync</Text>
        )}
      </Pressable>

      <Pressable style={styles.btn} onPress={onPull} disabled={busy !== null}>
        {busy === 'pull' ? (
          <ActivityIndicator color={colors.accent} />
        ) : (
          <Text style={styles.btnText}>Pull sync</Text>
        )}
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: spacing.lg, paddingBottom: spacing.xl * 2, backgroundColor: colors.bg },
  title: { color: colors.text, fontSize: 20, fontWeight: '700', marginBottom: spacing.sm },
  p: { color: colors.muted, fontSize: 14, lineHeight: 21, marginBottom: spacing.lg },
  label: { color: colors.text, fontWeight: '600', marginBottom: spacing.xs, marginTop: spacing.md },
  input: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    padding: spacing.md,
    color: colors.text,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.xl,
  },
  wifiLabel: { color: colors.text, fontWeight: '600' },
  stub: { color: colors.muted, fontSize: 12, marginTop: spacing.xs },
  btn: {
    marginTop: spacing.md,
    paddingVertical: spacing.md,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
  },
  btnText: { color: colors.accent, fontWeight: '700', fontSize: 16 },
  sectionSpacer: { marginTop: spacing.xl * 1.5 },
});
