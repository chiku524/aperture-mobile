import Constants from 'expo-constants';
import type { Purchase } from 'expo-iap';
import { Platform } from 'react-native';

import { joinUrl } from '../sync/syncClient';

export type IapVerifyResponse = {
  balance: number;
  credits_added?: number;
  duplicate?: boolean;
};

export async function verifyPlatformIapWithServer(
  baseUrl: string,
  token: string,
  purchase: Purchase,
): Promise<IapVerifyResponse> {
  const b = baseUrl.trim().replace(/\/+$/, '');
  const productId = purchase.productId;
  const platform = Platform.OS === 'ios' ? 'ios' : 'android';
  const body: Record<string, unknown> = { platform, product_id: productId };

  if (platform === 'ios') {
    const tid =
      'transactionId' in purchase && typeof purchase.transactionId === 'string'
        ? purchase.transactionId
        : null;
    if (!tid) {
      throw new Error('Missing Apple transaction id on purchase.');
    }
    body.apple_transaction_id = tid;
  } else {
    const pt = purchase.purchaseToken;
    if (!pt) {
      throw new Error('Missing Google purchase token.');
    }
    const pkg = Constants.expoConfig?.android?.package;
    if (!pkg) {
      throw new Error('expo.android.package is not set in app config.');
    }
    body.google_purchase_token = pt;
    body.google_package_name = pkg;
  }

  const res = await fetch(joinUrl(b, '/v1/billing/iap/verify'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token.trim()}`,
    },
    body: JSON.stringify(body),
  });
  let json: IapVerifyResponse & { error?: string; message?: string };
  try {
    json = (await res.json()) as IapVerifyResponse & { error?: string; message?: string };
  } catch {
    throw new Error(`Verify failed (${res.status})`);
  }
  if (!res.ok) {
    throw new Error(json.message || json.error || `Verify failed (${res.status})`);
  }
  return json;
}
