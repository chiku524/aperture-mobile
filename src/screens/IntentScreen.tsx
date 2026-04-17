import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { fetchPlatformCreditBalance, fetchPublicHealth } from '../billing/platformBilling';
import { resolveEffectiveAiApiKey } from '../config/bundledAiKey';
import { parseAiSource } from '../constants/aiSource';
import {
  SETTINGS_AI_API_BASE,
  SETTINGS_AI_API_KEY,
  SETTINGS_AI_MODEL,
  SETTINGS_AI_SOURCE,
  SETTINGS_SYNC_BASE_URL,
  SETTINGS_SYNC_TOKEN,
} from '../constants/settingsKeys';
import { getDatabase } from '../db/database';
import { getActiveSession, getSetting, insertSession, type Strictness } from '../db/repo';
import {
  assertGuidanceCreditsAvailable,
  consumeGuidanceCredits,
  getGuidanceCreditBalance,
  GUIDANCE_CREDIT_COST,
} from '../guidance/aiCredits';
import { requestIntentGuidance } from '../guidance/requestIntentGuidance';
import { requestPlatformGuidance } from '../guidance/requestPlatformGuidance';
import type { MainTabParamList, RootStackParamList } from '../navigation/types';
import { colors, spacing } from '../theme';
import { impactLight } from '../utils/haptics';

const DURATIONS = [
  { label: '25m', sec: 25 * 60 },
  { label: '45m', sec: 45 * 60 },
  { label: '60m', sec: 60 * 60 },
  { label: '90m', sec: 90 * 60 },
];

const DEFAULT_AI_BASE = 'https://api.openai.com/v1';

export function IntentScreen() {
  const rootNav = useNavigation().getParent<NativeStackNavigationProp<RootStackParamList>>();
  const tabNav = useNavigation<BottomTabNavigationProp<MainTabParamList>>();
  const [intent, setIntent] = useState('');
  const [parking, setParking] = useState('');
  const [durationSec, setDurationSec] = useState(25 * 60);
  const [strictness, setStrictness] = useState<Strictness>('soft');
  const [aiReady, setAiReady] = useState(false);
  const [aiSource, setAiSource] = useState(parseAiSource(null));
  const [guidanceCredits, setGuidanceCredits] = useState<number | null>(null);
  const [platformCredits, setPlatformCredits] = useState<number | null>(null);
  const [guidanceOpen, setGuidanceOpen] = useState(false);
  const [guidanceLoading, setGuidanceLoading] = useState(false);
  const [guidanceText, setGuidanceText] = useState('');

  useFocusEffect(
    useCallback(() => {
      void (async () => {
        const db = await getDatabase();
        const src = parseAiSource(await getSetting(db, SETTINGS_AI_SOURCE));
        setAiSource(src);
        if (src === 'byo') {
          const key = await getSetting(db, SETTINGS_AI_API_KEY);
          setAiReady(Boolean(resolveEffectiveAiApiKey(key)));
          setGuidanceCredits(await getGuidanceCreditBalance(db));
          setPlatformCredits(null);
          return;
        }
        const syncBase = ((await getSetting(db, SETTINGS_SYNC_BASE_URL)) ?? '').trim().replace(/\/+$/, '');
        const syncTok = ((await getSetting(db, SETTINGS_SYNC_TOKEN)) ?? '').trim();
        if (!syncBase || !syncTok) {
          setAiReady(false);
          setPlatformCredits(null);
          return;
        }
        try {
          const h = await fetchPublicHealth(syncBase);
          const ok = Boolean(h.billing?.platformGuidance);
          setAiReady(ok);
          if (ok) {
            const { credits } = await fetchPlatformCreditBalance(syncBase, syncTok);
            setPlatformCredits(credits);
          } else {
            setPlatformCredits(null);
          }
        } catch {
          setAiReady(false);
          setPlatformCredits(null);
        }
        setGuidanceCredits(null);
      })();
    }, []),
  );

  const onSuggest = async () => {
    const trimmed = intent.trim();
    if (trimmed.length < 4) {
      Alert.alert('Add a bit more intent', 'Write at least a short phrase so guidance can be specific.');
      return;
    }
    const db = await getDatabase();
    const src = parseAiSource(await getSetting(db, SETTINGS_AI_SOURCE));

    if (src === 'platform') {
      const syncBase = ((await getSetting(db, SETTINGS_SYNC_BASE_URL)) ?? '').trim().replace(/\/+$/, '');
      const syncTok = ((await getSetting(db, SETTINGS_SYNC_TOKEN)) ?? '').trim();
      if (!syncBase || !syncTok) {
        Alert.alert('Sync required', 'Set self-hosted sync URL and bearer token in Settings.', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Open Settings', onPress: () => tabNav.navigate('Settings') },
        ]);
        return;
      }
      setGuidanceOpen(true);
      setGuidanceLoading(true);
      setGuidanceText('');
      try {
        const text = await requestPlatformGuidance({
          syncBaseUrl: syncBase,
          syncToken: syncTok,
          intent: trimmed,
          parkingLot: parking,
          durationMinutes: Math.round(durationSec / 60),
          strictness,
        });
        setGuidanceText(text);
        try {
          const { credits } = await fetchPlatformCreditBalance(syncBase, syncTok);
          setPlatformCredits(credits);
        } catch {
          /* ignore */
        }
      } catch (e) {
        setGuidanceText(e instanceof Error ? e.message : 'Something went wrong.');
      } finally {
        setGuidanceLoading(false);
      }
      return;
    }

    const base = (await getSetting(db, SETTINGS_AI_API_BASE))?.trim() || DEFAULT_AI_BASE;
    const key = resolveEffectiveAiApiKey(await getSetting(db, SETTINGS_AI_API_KEY));
    const model = (await getSetting(db, SETTINGS_AI_MODEL))?.trim() || 'gpt-4o-mini';
    if (!key) {
      Alert.alert('API key needed', 'Add your key under Settings → Optional AI guidance (or set EXPO_PUBLIC_OPENAI_API_KEY in `.env` for local dev).', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Open Settings', onPress: () => tabNav.navigate('Settings') },
      ]);
      return;
    }
    try {
      await assertGuidanceCreditsAvailable(db, GUIDANCE_CREDIT_COST);
    } catch (e) {
      Alert.alert('Credits required', e instanceof Error ? e.message : 'Add guidance credits in Settings.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Open Settings', onPress: () => tabNav.navigate('Settings') },
      ]);
      return;
    }
    setGuidanceOpen(true);
    setGuidanceLoading(true);
    setGuidanceText('');
    try {
      const text = await requestIntentGuidance({
        apiBaseUrl: base,
        apiKey: key,
        model,
        intent: trimmed,
        parkingLot: parking,
        durationMinutes: Math.round(durationSec / 60),
        strictness,
      });
      const nextBal = await consumeGuidanceCredits(db, GUIDANCE_CREDIT_COST);
      setGuidanceCredits(nextBal);
      setGuidanceText(text);
    } catch (e) {
      setGuidanceText(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setGuidanceLoading(false);
    }
  };

  const onStart = async () => {
    const trimmed = intent.trim();
    if (!trimmed) {
      Alert.alert('Intent required', 'Describe what “done” means for this block.');
      return;
    }
    const db = await getDatabase();
    const active = await getActiveSession(db);
    if (active) {
      Alert.alert(
        'Session already open',
        'Finish or discard the current aperture before starting another.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Go to session',
            onPress: () => rootNav?.navigate('Aperture', { sessionId: active.id }),
          },
        ],
      );
      return;
    }
    const row = await insertSession(db, {
      intent: trimmed,
      parking_note: parking.trim(),
      duration_sec: durationSec,
      strictness,
    });
    impactLight();
    rootNav?.navigate('Aperture', { sessionId: row.id });
  };

  return (
    <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
      <Text style={styles.label}>Primary intent</Text>
      <Text style={styles.hint}>What does “done” look like for this block?</Text>
      <TextInput
        value={intent}
        onChangeText={setIntent}
        placeholder="e.g. Finish reading chapter 4 and capture 5 bullets"
        placeholderTextColor={colors.muted}
        style={styles.input}
        multiline
      />

      <Text style={[styles.label, styles.mt]}>Parking lot (optional)</Text>
      <Text style={styles.hint}>One line to park an intrusion without acting on it.</Text>
      <TextInput
        value={parking}
        onChangeText={setParking}
        placeholder="Optional"
        placeholderTextColor={colors.muted}
        style={styles.input}
      />

      <Text style={[styles.label, styles.mt]}>Optional guidance</Text>
      <Text style={styles.hint}>
        {aiSource === 'platform'
          ? 'Suggestions via your sync server (operator OpenAI key + IAP credits). Purchase credits in Settings. Not medical advice.'
          : `Short suggestions using your API key or EXPO_PUBLIC_OPENAI_API_KEY in a root .env file. Each successful suggestion uses ${GUIDANCE_CREDIT_COST} local credit (see Settings). Not medical advice. Requests go from this device to your provider.`}
      </Text>
      {aiSource === 'platform' && platformCredits != null && aiReady ? (
        <Text style={styles.creditLine}>Platform credits: {platformCredits}</Text>
      ) : null}
      {aiSource === 'byo' && guidanceCredits != null && aiReady ? (
        <Text style={styles.creditLine}>Local guidance credits: {guidanceCredits}</Text>
      ) : null}
      <Pressable
        onPress={onSuggest}
        style={[styles.secondary, !aiReady && styles.secondaryMuted]}
        disabled={guidanceLoading}
      >
        <Text style={styles.secondaryText}>Suggest how to approach this</Text>
      </Pressable>
      {!aiReady ? (
        <Pressable onPress={() => tabNav.navigate('Settings')}>
          <Text style={styles.link}>
            {aiSource === 'platform'
              ? 'Configure sync + platform billing in Settings'
              : 'Configure API in Settings → Optional AI guidance'}
          </Text>
        </Pressable>
      ) : null}

      <Text style={[styles.label, styles.mt]}>Duration</Text>
      <View style={styles.row}>
        {DURATIONS.map((d) => (
          <Pressable
            key={d.sec}
            onPress={() => setDurationSec(d.sec)}
            style={[styles.chip, durationSec === d.sec && styles.chipOn]}
          >
            <Text style={[styles.chipText, durationSec === d.sec && styles.chipTextOn]}>{d.label}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={[styles.label, styles.mt]}>Strictness</Text>
      <View style={styles.row}>
        <Pressable
          onPress={() => setStrictness('soft')}
          style={[styles.chip, strictness === 'soft' && styles.chipOn]}
        >
          <Text style={[styles.chipText, strictness === 'soft' && styles.chipTextOn]}>Soft</Text>
        </Pressable>
        <Pressable
          onPress={() => setStrictness('hard')}
          style={[styles.chip, strictness === 'hard' && styles.chipOn]}
        >
          <Text style={[styles.chipText, strictness === 'hard' && styles.chipTextOn]}>Hard</Text>
        </Pressable>
      </View>
      <Text style={styles.strictHint}>Informational in this build — both modes behave the same.</Text>

      <Pressable onPress={onStart} style={styles.primary}>
        <Text style={styles.primaryText}>Start aperture</Text>
      </Pressable>

      <Modal visible={guidanceOpen} transparent animationType="fade" onRequestClose={() => setGuidanceOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Approach ideas</Text>
            {guidanceLoading ? (
              <ActivityIndicator size="large" color={colors.accent} style={styles.modalSpinner} />
            ) : (
              <ScrollView style={styles.modalScroll}>
                <Text style={styles.modalBody}>{guidanceText}</Text>
              </ScrollView>
            )}
            <Pressable style={styles.primary} onPress={() => setGuidanceOpen(false)}>
              <Text style={styles.primaryText}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: spacing.lg, paddingBottom: spacing.xl * 2, backgroundColor: 'transparent' },
  label: { color: colors.text, fontSize: 16, fontWeight: '600' },
  hint: { color: colors.muted, fontSize: 13, marginTop: spacing.xs, marginBottom: spacing.sm },
  input: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    padding: spacing.md,
    color: colors.text,
    minHeight: 48,
    textAlignVertical: 'top',
  },
  mt: { marginTop: spacing.lg },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
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
  strictHint: { color: colors.muted, fontSize: 12, marginTop: spacing.sm },
  secondary: {
    marginTop: spacing.sm,
    paddingVertical: spacing.md,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.accent,
    alignItems: 'center',
    backgroundColor: '#0f2420',
  },
  secondaryMuted: { opacity: 0.75, borderColor: colors.border },
  secondaryText: { color: colors.accent, fontWeight: '700', fontSize: 15 },
  link: { color: colors.accent, fontSize: 13, marginTop: spacing.sm, textDecorationLine: 'underline' },
  creditLine: { color: colors.muted, fontSize: 13, marginTop: spacing.xs },
  primary: {
    marginTop: spacing.xl,
    backgroundColor: colors.accent,
    paddingVertical: spacing.md,
    borderRadius: 12,
    alignItems: 'center',
  },
  primaryText: { color: '#041312', fontSize: 17, fontWeight: '700' },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  modalCard: {
    maxHeight: '88%',
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modalTitle: { color: colors.text, fontSize: 18, fontWeight: '700', marginBottom: spacing.md },
  modalSpinner: { marginVertical: spacing.xl },
  modalScroll: { maxHeight: 360, marginBottom: spacing.md },
  modalBody: { color: colors.text, fontSize: 15, lineHeight: 24 },
});
