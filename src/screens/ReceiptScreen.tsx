import type { RouteProp } from '@react-navigation/native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getDatabase } from '../db/database';
import { abandonSession, completeSession, getSession, insertDigest } from '../db/repo';
import type { RootStackParamList } from '../navigation/types';
import { colors, spacing } from '../theme';

type Nav = NativeStackNavigationProp<RootStackParamList, 'Receipt'>;
type R = RouteProp<RootStackParamList, 'Receipt'>;

export function ReceiptScreen() {
  const insets = useSafeAreaInsets();
  const route = useRoute<R>();
  const navigation = useNavigation<Nav>();
  const { sessionId } = route.params;

  const [intent, setIntent] = useState('');
  const [summary, setSummary] = useState('');
  const [risks, setRisks] = useState('');
  const [nextStep, setNextStep] = useState('');

  useEffect(() => {
    void (async () => {
      const db = await getDatabase();
      const s = await getSession(db, sessionId);
      if (s) {
        setIntent(s.intent);
        setSummary(s.intent);
      }
    })();
  }, [sessionId]);

  const goHome = () => {
    navigation.reset({ index: 0, routes: [{ name: 'Main' }] });
  };

  const onSave = async () => {
    const db = await getDatabase();
    await insertDigest(db, sessionId, {
      summary: summary.trim() || intent,
      risks: risks.trim(),
      next_step: nextStep.trim(),
    });
    await completeSession(db, sessionId, Date.now());
    Alert.alert('Saved', 'Session closed and receipt stored.', [{ text: 'OK', onPress: goHome }]);
  };

  const onDiscard = () => {
    Alert.alert('Discard receipt?', 'The session will be marked abandoned.', [
      { text: 'Keep editing', style: 'cancel' },
      {
        text: 'Discard',
        style: 'destructive',
        onPress: async () => {
          const db = await getDatabase();
          await abandonSession(db, sessionId, Date.now());
          goHome();
        },
      },
    ]);
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={styles.label}>Session intent</Text>
        <Text style={styles.intent}>{intent}</Text>

        <Text style={[styles.label, styles.mt]}>Summary</Text>
        <Text style={styles.hint}>What moved during this block?</Text>
        <TextInput
          value={summary}
          onChangeText={setSummary}
          placeholder="Short summary"
          placeholderTextColor={colors.muted}
          style={styles.input}
          multiline
        />

        <Text style={[styles.label, styles.mt]}>Risks / unknowns</Text>
        <TextInput
          value={risks}
          onChangeText={setRisks}
          placeholder="Open questions, risks, fog"
          placeholderTextColor={colors.muted}
          style={styles.input}
          multiline
        />

        <Text style={[styles.label, styles.mt]}>Next physical step</Text>
        <Text style={styles.hint}>One small action to reduce attention residue.</Text>
        <TextInput
          value={nextStep}
          onChangeText={setNextStep}
          placeholder="e.g. Close laptop and write one sticky note"
          placeholderTextColor={colors.muted}
          style={styles.input}
          multiline
        />
      </ScrollView>

      <View style={styles.actions}>
        <Pressable style={styles.secondary} onPress={onDiscard}>
          <Text style={styles.secondaryText}>Discard</Text>
        </Pressable>
        <Pressable style={styles.primary} onPress={onSave}>
          <Text style={styles.primaryText}>Save & finish</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: spacing.lg, paddingBottom: 120 },
  label: { color: colors.text, fontSize: 15, fontWeight: '600' },
  hint: { color: colors.muted, fontSize: 13, marginTop: spacing.xs, marginBottom: spacing.sm },
  intent: { color: colors.muted, fontSize: 16, lineHeight: 24, marginBottom: spacing.sm },
  mt: { marginTop: spacing.lg },
  input: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    padding: spacing.md,
    color: colors.text,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
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
    borderRadius: 12,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  secondaryText: { color: colors.text, fontWeight: '600', fontSize: 16 },
});
