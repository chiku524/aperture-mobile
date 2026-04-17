import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

export function impactLight(): void {
  if (Platform.OS === 'web') return;
  try {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  } catch {
    /* optional native module */
  }
}

export function notifySuccess(): void {
  if (Platform.OS === 'web') return;
  try {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  } catch {
    /* optional native module */
  }
}
