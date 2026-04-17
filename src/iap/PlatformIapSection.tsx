import type { ExpoPurchaseError, Purchase } from 'expo-iap';
import { useIAP } from 'expo-iap';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { verifyPlatformIapWithServer } from '../billing/verifyPlatformIap';
import { colors, spacing } from '../theme';

import { GUIDANCE_CREDIT_PACKS, GUIDANCE_IAP_SKUS } from './productIds';

type Props = {
  syncBaseUrl: string;
  syncToken: string;
  onCreditsUpdated: () => void;
};

function productPriceLabel(products: readonly { id: string; displayPrice?: string | null }[], sku: string): string {
  const p = products.find((x) => x.id === sku);
  const d = p?.displayPrice;
  return d && d.trim() ? d : sku;
}

export function PlatformIapSection({ syncBaseUrl, syncToken, onCreditsUpdated }: Props) {
  const [iapBusy, setIapBusy] = useState<string | null>(null);
  const handling = useRef(false);
  const finishTransactionRef = useRef<
    ((args: { purchase: Purchase; isConsumable?: boolean }) => Promise<void>) | null
  >(null);

  const { connected, products, fetchProducts, requestPurchase, finishTransaction } = useIAP({
    onPurchaseSuccess: async (purchase: Purchase) => {
      if (handling.current) return;
      handling.current = true;
      try {
        await verifyPlatformIapWithServer(syncBaseUrl, syncToken, purchase);
        await finishTransactionRef.current?.({ purchase, isConsumable: true });
        onCreditsUpdated();
        Alert.alert('Credits added', 'Your platform balance was updated.');
      } catch (e) {
        Alert.alert(
          'Could not verify purchase',
          e instanceof Error
            ? e.message
            : 'Check sync server IAP env and product IDs. You can retry after fixing the server.',
        );
      } finally {
        handling.current = false;
      }
    },
    onPurchaseError: (err: ExpoPurchaseError) => {
      Alert.alert('Purchase issue', err.message || 'The store could not complete the purchase.');
    },
    onError: (err) => {
      Alert.alert('Store connection', err.message);
    },
  });

  finishTransactionRef.current = finishTransaction;

  useEffect(() => {
    if (!connected) return;
    void (async () => {
      try {
        await fetchProducts({ skus: [...GUIDANCE_IAP_SKUS], type: 'in-app' });
      } catch {
        /* surfaced via onError */
      }
    })();
  }, [connected, fetchProducts]);

  const onBuy = async (sku: string) => {
    if (!syncBaseUrl.trim() || !syncToken.trim()) {
      Alert.alert('Sync required', 'Set base URL and bearer token above first.');
      return;
    }
    setIapBusy(sku);
    try {
      await requestPurchase({
        type: 'in-app',
        request: {
          apple: { sku },
          google: { skus: [sku] },
        },
      });
    } catch (e) {
      Alert.alert('Purchase failed', e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setIapBusy(null);
    }
  };

  if (Platform.OS === 'web') {
    return (
      <Text style={styles.note}>
        In-app purchases run on iOS and Android builds (development or production). Use a dev client or store build on a
        device or simulator with the store configured.
      </Text>
    );
  }

  return (
    <View>
      <Text style={styles.note}>
        Purchases use Apple / Google billing. Credits are granted after your sync server verifies the transaction
        (App Store Server API + Play Developer API).
      </Text>
      {!connected ? (
        <Text style={styles.muted}>Connecting to the App Store / Play Store…</Text>
      ) : (
        GUIDANCE_CREDIT_PACKS.map((pack) => (
          <Pressable
            key={pack.sku}
            style={[styles.packBtn, iapBusy === pack.sku && styles.packBtnBusy]}
            onPress={() => void onBuy(pack.sku)}
            disabled={iapBusy !== null}
          >
            {iapBusy === pack.sku ? (
              <ActivityIndicator color={colors.accent} />
            ) : (
              <Text style={styles.packText}>
                {pack.credits} credits — {productPriceLabel(products, pack.sku)}
              </Text>
            )}
          </Pressable>
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  note: { color: colors.muted, fontSize: 14, lineHeight: 21, marginBottom: spacing.md },
  muted: { color: colors.muted, fontSize: 14, marginBottom: spacing.sm },
  packBtn: {
    marginTop: spacing.sm,
    paddingVertical: spacing.md,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
  },
  packBtnBusy: { opacity: 0.7 },
  packText: { color: colors.accent, fontWeight: '700', fontSize: 16 },
});
