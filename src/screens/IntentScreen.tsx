import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { getDatabase } from '../db/database';
import { getActiveSession, insertSession, type Strictness } from '../db/repo';
import type { RootStackParamList } from '../navigation/types';
import { colors, spacing } from '../theme';

const DURATIONS = [
  { label: '25m', sec: 25 * 60 },
  { label: '45m', sec: 45 * 60 },
  { label: '60m', sec: 60 * 60 },
  { label: '90m', sec: 90 * 60 },
];

export function IntentScreen() {
  const rootNav = useNavigation().getParent<NativeStackNavigationProp<RootStackParamList>>();
  const [intent, setIntent] = useState('');
  const [parking, setParking] = useState('');
  const [durationSec, setDurationSec] = useState(25 * 60);
  const [strictness, setStrictness] = useState<Strictness>('soft');

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
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: spacing.lg, paddingBottom: spacing.xl * 2, backgroundColor: colors.bg },
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
  primary: {
    marginTop: spacing.xl,
    backgroundColor: colors.accent,
    paddingVertical: spacing.md,
    borderRadius: 12,
    alignItems: 'center',
  },
  primaryText: { color: '#041312', fontSize: 17, fontWeight: '700' },
});
