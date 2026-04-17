import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';

import { getBundledOpenAiApiKey } from '../config/bundledAiKey';
import { fetchPlatformCreditBalance, fetchPublicHealth } from '../billing/platformBilling';
import { type AiSource, parseAiSource } from '../constants/aiSource';
import {
  SETTINGS_AI_API_BASE,
  SETTINGS_AI_API_KEY,
  SETTINGS_AI_MODEL,
  SETTINGS_AI_SOURCE,
  SETTINGS_METRICS_APP_TIME,
  SETTINGS_METRICS_MOTION,
  SETTINGS_LAST_SYNC_AT,
  SETTINGS_SYNC_BASE_URL,
  SETTINGS_SYNC_PULL_ON_FOREGROUND,
  SETTINGS_SYNC_TOKEN,
  SETTINGS_WIFI_ONLY_SYNC,
} from '../constants/settingsKeys';
import { getDatabase } from '../db/database';
import { getSetting, setSetting } from '../db/repo';
import { addGuidanceCredits, getGuidanceCreditBalance, GUIDANCE_CREDIT_COST } from '../guidance/aiCredits';
import { buildPushRecords } from '../sync/buildPushRecords';
import { mergePullPages } from '../sync/mergePullPages';
import { SyncClient } from '../sync/syncClient';
import { assertSyncAllowedOnCurrentNetwork } from '../sync/wifiGuard';
import { colors, spacing } from '../theme';
import { notifySuccess } from '../utils/haptics';
import { PlatformIapSection } from '../iap/PlatformIapSection';

const DEFAULT_AI_BASE = 'https://api.openai.com/v1';

export function SettingsScreen() {
  const [baseUrl, setBaseUrl] = useState('');
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [wifiOnly, setWifiOnly] = useState(false);
  const [recordAppTime, setRecordAppTime] = useState(true);
  const [recordMotion, setRecordMotion] = useState(true);
  const [aiBase, setAiBase] = useState('');
  const [aiKey, setAiKey] = useState('');
  const [aiModel, setAiModel] = useState('');
  const [guidanceCredits, setGuidanceCredits] = useState(0);
  const [creditsToAdd, setCreditsToAdd] = useState('');
  const [aiSource, setAiSource] = useState<AiSource>('byo');
  const [platformCredits, setPlatformCredits] = useState<number | null>(null);
  const [iapAppleOk, setIapAppleOk] = useState(false);
  const [iapGoogleOk, setIapGoogleOk] = useState(false);
  const [platformGuidanceOk, setPlatformGuidanceOk] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [pullOnForeground, setPullOnForeground] = useState(false);

  const refreshPlatformBalance = async () => {
    const b = baseUrl.trim().replace(/\/+$/, '');
    const tok = token.trim();
    if (!b || !tok) {
      setPlatformCredits(null);
      return;
    }
    try {
      const { credits } = await fetchPlatformCreditBalance(b, tok);
      setPlatformCredits(credits);
    } catch {
      setPlatformCredits(null);
    }
  };

  useFocusEffect(
    useCallback(() => {
      void (async () => {
        const db = await getDatabase();
        const [u, t, fg, motion, wifi, pullFg, ab, ak, am, src, lastSync] = await Promise.all([
          getSetting(db, SETTINGS_SYNC_BASE_URL),
          getSetting(db, SETTINGS_SYNC_TOKEN),
          getSetting(db, SETTINGS_METRICS_APP_TIME),
          getSetting(db, SETTINGS_METRICS_MOTION),
          getSetting(db, SETTINGS_WIFI_ONLY_SYNC),
          getSetting(db, SETTINGS_SYNC_PULL_ON_FOREGROUND),
          getSetting(db, SETTINGS_AI_API_BASE),
          getSetting(db, SETTINGS_AI_API_KEY),
          getSetting(db, SETTINGS_AI_MODEL),
          getSetting(db, SETTINGS_AI_SOURCE),
          getSetting(db, SETTINGS_LAST_SYNC_AT),
        ]);
        setGuidanceCredits(await getGuidanceCreditBalance(db));
        if (u) setBaseUrl(u);
        if (t) setToken(t);
        setRecordAppTime(fg !== '0');
        setRecordMotion(motion !== '0');
        setWifiOnly(wifi === '1');
        setPullOnForeground(pullFg === '1');
        setAiBase(ab ?? '');
        setAiKey(ak ?? '');
        setAiModel(am ?? '');
        setAiSource(parseAiSource(src));
        if (lastSync && /^\d+$/.test(lastSync)) {
          try {
            setLastSyncAt(new Date(Number(lastSync)).toLocaleString());
          } catch {
            setLastSyncAt(null);
          }
        } else {
          setLastSyncAt(null);
        }

        const syncBase = (u ?? '').trim().replace(/\/+$/, '');
        if (syncBase) {
          try {
            const h = await fetchPublicHealth(syncBase);
            setIapAppleOk(Boolean(h.billing?.iap?.apple));
            setIapGoogleOk(Boolean(h.billing?.iap?.google));
            setPlatformGuidanceOk(Boolean(h.billing?.platformGuidance));
          } catch {
            setIapAppleOk(false);
            setIapGoogleOk(false);
            setPlatformGuidanceOk(false);
          }
        } else {
          setIapAppleOk(false);
          setIapGoogleOk(false);
          setPlatformGuidanceOk(false);
        }

        if (syncBase && (t ?? '').trim()) {
          try {
            const { credits } = await fetchPlatformCreditBalance(syncBase, (t ?? '').trim());
            setPlatformCredits(credits);
          } catch {
            setPlatformCredits(null);
          }
        } else {
          setPlatformCredits(null);
        }
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

  const onSaveAiSettings = async () => {
    const db = await getDatabase();
    const base = aiBase.trim() || DEFAULT_AI_BASE;
    await setSetting(db, SETTINGS_AI_API_BASE, base);
    await setSetting(db, SETTINGS_AI_API_KEY, aiKey.trim());
    await setSetting(db, SETTINGS_AI_MODEL, (aiModel.trim() || 'gpt-4o-mini').trim());
    Alert.alert('Saved', 'AI guidance settings are stored locally on this device.');
  };

  const persistAiSource = async (next: AiSource) => {
    setAiSource(next);
    const db = await getDatabase();
    await setSetting(db, SETTINGS_AI_SOURCE, next);
  };

  const onAddGuidanceCredits = async () => {
    const n = Number.parseInt(creditsToAdd.trim(), 10);
    if (!Number.isFinite(n) || n < 1) {
      Alert.alert('Invalid amount', 'Enter a whole number ≥ 1 to add to your balance.');
      return;
    }
    const db = await getDatabase();
    try {
      const next = await addGuidanceCredits(db, n);
      setGuidanceCredits(next);
      setCreditsToAdd('');
      Alert.alert('Credits updated', `New balance: ${next}`);
    } catch (e) {
      Alert.alert('Could not update', e instanceof Error ? e.message : 'Unknown error');
    }
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
      const now = String(Date.now());
      await setSetting(db, SETTINGS_LAST_SYNC_AT, now);
      setLastSyncAt(new Date(Number(now)).toLocaleString());
      notifySuccess();
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
      const total = await mergePullPages(db, c);
      const now = String(Date.now());
      await setSetting(db, SETTINGS_LAST_SYNC_AT, now);
      setLastSyncAt(new Date(Number(now)).toLocaleString());
      notifySuccess();
      Alert.alert('Pull complete', `Merged ${total} records.`);
    } catch (e) {
      Alert.alert('Pull failed', e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setBusy(null);
    }
  };

  const onPushAndPull = async () => {
    const c = clientOrAlert();
    if (!c) return;
    setBusy('sync');
    try {
      await persist();
      await assertSyncAllowedOnCurrentNetwork(wifiOnly);
      const db = await getDatabase();
      const records = await buildPushRecords(db);
      const pushRes = await c.push({ records });
      const pullTotal = await mergePullPages(db, c);
      const now = String(Date.now());
      await setSetting(db, SETTINGS_LAST_SYNC_AT, now);
      setLastSyncAt(new Date(Number(now)).toLocaleString());
      notifySuccess();
      Alert.alert(
        'Sync complete',
        `Push accepted ${pushRes.accepted} records. Pull merged ${pullTotal} records.`,
      );
    } catch (e) {
      Alert.alert('Sync failed', e instanceof Error ? e.message : 'Unknown error');
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
        Backup to a server you control. The same base URL and bearer token are used for platform AI + IAP credit
        grants when you choose that mode below. Configure OpenAI and Apple / Google verification on the server (see
        sync-server/env.example).
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

      <View style={styles.row}>
        <Text style={styles.wifiLabel}>Pull when app opens</Text>
        <Switch
          value={pullOnForeground}
          onValueChange={(v) => {
            setPullOnForeground(v);
            void persistMetricToggle(SETTINGS_SYNC_PULL_ON_FOREGROUND, v);
          }}
        />
      </View>
      <Text style={styles.stub}>
        When enabled, a pull merge runs after the app returns to the foreground (at most about once every 90 seconds).
        Respects Wi‑Fi only sync. Silent on failure — use Pull sync above if you need to see errors.
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
      <Pressable style={styles.btn} onPress={onPushAndPull} disabled={busy !== null}>
        {busy === 'sync' ? (
          <ActivityIndicator color={colors.accent} />
        ) : (
          <Text style={styles.btnText}>Push & pull</Text>
        )}
      </Pressable>
      <Text style={styles.stub}>
        Last successful push or pull: {lastSyncAt ?? '—'}
      </Text>

      <Text style={[styles.title, styles.sectionSpacer]}>Optional AI guidance</Text>
      <Text style={styles.p}>
        Choose how the Intent tab gets suggestions. Output is informational, not medical or therapeutic advice.
      </Text>

      <Text style={styles.label}>AI source</Text>
      <View style={styles.chipRow}>
        <Pressable
          onPress={() => void persistAiSource('byo')}
          style={[styles.chip, aiSource === 'byo' && styles.chipOn]}
        >
          <Text style={[styles.chipText, aiSource === 'byo' && styles.chipTextOn]}>Bring your own API</Text>
        </Pressable>
        <Pressable
          onPress={() => void persistAiSource('platform')}
          style={[styles.chip, aiSource === 'platform' && styles.chipOn]}
        >
          <Text style={[styles.chipText, aiSource === 'platform' && styles.chipTextOn]}>Platform credits</Text>
        </Pressable>
      </View>

      {aiSource === 'platform' ? (
        <>
          <Text style={styles.p}>
            Prompts go to your sync server, which calls OpenAI with the operator key and deducts server-side credits.
            Buy consumable packs with Apple / Google in-app billing; the server verifies each purchase before adding
            credits. Your bearer token identifies the credit wallet (hashed on the server).
          </Text>
          <Text style={styles.p}>
            Server status: Apple IAP verify {iapAppleOk ? 'on' : 'off'}, Google IAP verify {iapGoogleOk ? 'on' : 'off'}
            , model proxy {platformGuidanceOk ? 'on' : 'off'}.
          </Text>
          <Text style={styles.label}>Platform credit balance</Text>
          <Text style={styles.p}>
            Balance: <Text style={styles.em}>{platformCredits ?? '—'}</Text>
          </Text>
          <Pressable style={styles.btn} onPress={() => void refreshPlatformBalance()}>
            <Text style={styles.btnText}>Refresh balance</Text>
          </Pressable>
          <Text style={[styles.label, { marginTop: spacing.lg }]}>Buy credits (App Store / Play)</Text>
          {Platform.OS === 'web' ? (
            <Text style={styles.p}>Use the iOS or Android app build to purchase IAP packs.</Text>
          ) : (
            <PlatformIapSection
              syncBaseUrl={baseUrl}
              syncToken={token}
              onCreditsUpdated={() => void refreshPlatformBalance()}
            />
          )}
        </>
      ) : (
        <>
          <Text style={styles.p}>
            Each successful suggestion uses {GUIDANCE_CREDIT_COST} credit from the local balance below. For local dev,
            create a file named <Text style={styles.mono}>.env</Text> next to <Text style={styles.mono}>package.json</Text>
            (same folder as this app’s <Text style={styles.mono}>package.json</Text>), copy lines from{' '}
            <Text style={styles.mono}>.env.example</Text>, set <Text style={styles.mono}>EXPO_PUBLIC_OPENAI_API_KEY</Text>
            , then restart Metro. That key is embedded in the bundle — dev only. Requests go from this device to your
            provider.
          </Text>

          <Text style={styles.label}>Local guidance credits</Text>
          <Text style={styles.p}>
            Balance: <Text style={styles.em}>{guidanceCredits}</Text>
            {getBundledOpenAiApiKey() && !aiKey.trim()
              ? ' — API key currently from EXPO_PUBLIC_OPENAI_API_KEY'
              : ''}
          </Text>
          <TextInput
            value={creditsToAdd}
            onChangeText={setCreditsToAdd}
            keyboardType="number-pad"
            placeholder="Credits to add"
            placeholderTextColor={colors.muted}
            style={styles.input}
          />
          <Pressable style={styles.btn} onPress={onAddGuidanceCredits}>
            <Text style={styles.btnText}>Add to local balance</Text>
          </Pressable>

          <Text style={styles.label}>API base URL</Text>
          <TextInput
            value={aiBase}
            onChangeText={setAiBase}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder={DEFAULT_AI_BASE}
            placeholderTextColor={colors.muted}
            style={styles.input}
          />

          <Text style={styles.label}>API key (optional if using EXPO_PUBLIC_OPENAI_API_KEY)</Text>
          <TextInput
            value={aiKey}
            onChangeText={setAiKey}
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
            placeholder="sk-… or leave blank for bundled dev key"
            placeholderTextColor={colors.muted}
            style={styles.input}
          />

          <Text style={styles.label}>Model id</Text>
          <TextInput
            value={aiModel}
            onChangeText={setAiModel}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="gpt-4o-mini"
            placeholderTextColor={colors.muted}
            style={styles.input}
          />

          <Pressable style={styles.btn} onPress={onSaveAiSettings}>
            <Text style={styles.btnText}>Save AI guidance settings</Text>
          </Pressable>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: spacing.lg, paddingBottom: spacing.xl * 2, backgroundColor: 'transparent' },
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
  mono: { fontFamily: 'monospace', fontSize: 13, color: colors.accent },
  em: { fontWeight: '700', color: colors.text },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md },
  chip: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipOn: { borderColor: colors.accent, backgroundColor: '#0f2a26' },
  chipText: { color: colors.muted, fontWeight: '600' },
  chipTextOn: { color: colors.accent },
  btnDisabled: { opacity: 0.55 },
});
