import * as Network from 'expo-network';
import { Platform } from 'react-native';

/**
 * When Wi‑Fi–only sync is enabled, block push/pull on an active cellular connection.
 * Ethernet / Wi‑Fi / unknown types are allowed so simulators and odd networks are not hard‑blocked.
 */
export async function assertSyncAllowedOnCurrentNetwork(wifiOnlyEnabled: boolean): Promise<void> {
  if (!wifiOnlyEnabled || Platform.OS === 'web') {
    return;
  }
  const state = await Network.getNetworkStateAsync();
  if (state.type === Network.NetworkStateType.CELLULAR) {
    throw new Error(
      'Wi‑Fi only sync is enabled. Connect to Wi‑Fi (or Ethernet) or turn the toggle off to sync over cellular.',
    );
  }
}
