/**
 * Native In-App Purchase bridge for iOS (StoreKit) and Android
 * (Google Play Billing) — wraps `react-native-iap` and forwards receipts to
 * our backend which handles server-side verification & idempotent crediting.
 *
 * The mobile app MUST use IAP for all digital purchases on iOS and Android
 * (Apple 3.1.1, Google Play Billing policy). Razorpay Payment Links remain
 * the payment method for the web app only.
 *
 * The module is loaded lazily so the code still runs under Expo Go (where
 * the native `RNIap` binding is absent).
 */
import { Platform } from 'react-native';
import api from '../api';

const ANDROID_SUB_PRODUCT_IDS = [
  'iema.pro.monthly',
  'iema.pro.annual',
  'iema.team.monthly',
  'iema.team.annual',
];
const IOS_SUB_PRODUCT_IDS = ANDROID_SUB_PRODUCT_IDS;

// Map store product IDs → IEMA plan_id, must stay in sync with backend
// `services/payments_service.py` DEFAULT_PRODUCT_MAP.
export const PRODUCT_TO_PLAN = {
  'iema.pro.monthly': 'pro',
  'iema.pro.annual': 'pro_annual',
  'iema.team.monthly': 'team',
  'iema.team.annual': 'team_annual',
};

let _RNIap = null;
let _initialized = false;
let _subscriptions = [];
let _purchaseUpdateSub = null;
let _purchaseErrorSub = null;

function loadRNIap() {
  if (_RNIap) return _RNIap;
  try {
    // eslint-disable-next-line global-require
    _RNIap = require('react-native-iap');
    return _RNIap;
  } catch (e) {
    return null;
  }
}

export function isIapAvailable() {
  return !!loadRNIap();
}

export async function initIap({ onPurchase, onError } = {}) {
  const RNIap = loadRNIap();
  if (!RNIap) return { ok: false, reason: 'RNIap not linked (Expo Go)' };
  if (_initialized) return { ok: true, cached: true };
  try {
    await RNIap.initConnection();
    // On Android, flush any lingering purchases that were interrupted mid-flow.
    if (Platform.OS === 'android' && RNIap.flushFailedPurchasesCachedAsPendingAndroid) {
      try { await RNIap.flushFailedPurchasesCachedAsPendingAndroid(); } catch { /* ignore */ }
    }
    _purchaseUpdateSub = RNIap.purchaseUpdatedListener(async (purchase) => {
      try {
        const verified = await verifyPurchase(purchase);
        if (verified?.ok) {
          // Acknowledge & finish so Apple/Google mark the transaction complete
          // and don't refund it after 3 days (Google) / 30s (Apple).
          try {
            await RNIap.finishTransaction({ purchase, isConsumable: false });
          } catch { /* already finished */ }
          onPurchase?.(verified, purchase);
        } else {
          onError?.(new Error(verified?.error || 'Server rejected receipt'));
        }
      } catch (e) {
        onError?.(e);
      }
    });
    _purchaseErrorSub = RNIap.purchaseErrorListener((err) => {
      // "E_USER_CANCELLED" is fine, everything else surfaces.
      if (err?.code !== 'E_USER_CANCELLED') onError?.(err);
    });
    _initialized = true;
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e?.message || String(e) };
  }
}

export async function loadSubscriptions() {
  const RNIap = loadRNIap();
  if (!RNIap) return [];
  const skus = Platform.OS === 'ios' ? IOS_SUB_PRODUCT_IDS : ANDROID_SUB_PRODUCT_IDS;
  try {
    _subscriptions = await RNIap.getSubscriptions({ skus });
    return _subscriptions;
  } catch (e) {
    return [];
  }
}

export async function purchaseSubscription(sku) {
  const RNIap = loadRNIap();
  if (!RNIap) throw new Error('In-app purchases are unavailable in Expo Go. Use a native build.');
  if (!_initialized) await initIap();
  if (Platform.OS === 'android') {
    // On Play Billing v5+, you must pass `subscriptionOffers` — pick the
    // first base plan / offer that Play returned when we loaded skus.
    const product = _subscriptions.find((p) => p.productId === sku);
    const offerToken = product?.subscriptionOfferDetails?.[0]?.offerToken;
    return RNIap.requestSubscription({
      sku,
      ...(offerToken ? { subscriptionOffers: [{ sku, offerToken }] } : {}),
    });
  }
  return RNIap.requestSubscription({ sku });
}

/** Forward the purchase receipt to our backend for server-side verification. */
async function verifyPurchase(purchase) {
  if (Platform.OS === 'ios') {
    // Apple: receipt is a base64 string in `transactionReceipt`.
    const receipt = purchase?.transactionReceipt;
    if (!receipt) return { ok: false, error: 'no iOS receipt' };
    const { data } = await api.post('/payments/iap/apple/verify', { receipt });
    return data;
  }
  // Android: send productId + purchaseToken; backend calls
  // androidpublisher.purchases.subscriptions.get.
  const { data } = await api.post('/payments/iap/google/verify', {
    product_id: purchase.productId,
    purchase_token: purchase.purchaseToken,
    is_subscription: true,
  });
  return data;
}

export async function endIap() {
  const RNIap = loadRNIap();
  if (!RNIap || !_initialized) return;
  try { _purchaseUpdateSub?.remove?.(); } catch { /* ignore */ }
  try { _purchaseErrorSub?.remove?.(); } catch { /* ignore */ }
  try { await RNIap.endConnection(); } catch { /* ignore */ }
  _initialized = false;
  _purchaseUpdateSub = null;
  _purchaseErrorSub = null;
}
