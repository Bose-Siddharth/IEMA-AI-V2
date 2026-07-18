import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, Alert, ActivityIndicator } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { Check } from 'lucide-react-native';
import api from '../api';
import ScreenHeader from '../components/ScreenHeader';
import { Button } from '../components/UI';
import { colors, spacing, fontSize, radii } from '../theme';

/**
 * Mobile Billing — mirrors the web experience exactly:
 *   - Prices shown in USD only (no INR selector, no Stripe)
 *   - Payments go through Razorpay **Payment Links** (hosted at rzp.io),
 *     opened inside an in-app browser via expo-web-browser. This works in
 *     Expo Go and standalone builds — no native IAP module required —
 *     and the rzp.io host bypasses the "unauthorized website" restriction
 *     tied to our merchant profile.
 *   - After the browser closes we poll the server for the payment status
 *     and refresh the wallet automatically.
 *
 * Native App Store / Play Store IAP is scaffolded on the backend
 * (/api/payments/iap/apple/verify, /iap/google/verify). To flip mobile
 * subscriptions to native IAP for iOS submission, add `react-native-iap`
 * via EAS Build and call those endpoints with the receipt payload. Until
 * then, Razorpay Payment Links serve both iOS and Android users.
 */

export default function BillingScreen({ navigation }) {
  const [packs, setPacks] = useState([]);
  const [plans, setPlans] = useState([]);
  const [buying, setBuying] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [packsRes, plansRes] = await Promise.allSettled([
        api.get('/packs/?currency=usd'),
        api.get('/admin/plans'),
      ]);
      if (packsRes.status === 'fulfilled') setPacks(packsRes.value.data.items || []);
      if (plansRes.status === 'fulfilled') {
        setPlans((plansRes.value.data.items || []).filter((p) => !p.is_free));
      }
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openHostedCheckout = async (shortUrl, onSettled) => {
    try {
      const result = await WebBrowser.openBrowserAsync(shortUrl, {
        dismissButtonStyle: 'close',
        controlsColor: colors.primary,
      });
      // `dismiss` = user closed the tab; `cancel` = they aborted.
      // Either way we poll — payment may still have succeeded before dismissal.
      if (result?.type === 'dismiss' || result?.type === 'cancel') {
        await onSettled?.();
      }
    } catch (e) {
      Alert.alert('Checkout error', String(e?.message || e));
    }
  };

  const buyPack = async (pack) => {
    setBuying(pack.slug);
    try {
      const { data } = await api.post('/payments/razorpay/order', { pack_slug: pack.slug });
      if (!data?.short_url) throw new Error('No checkout URL returned');
      await openHostedCheckout(data.short_url, async () => {
        try {
          const { data: st } = await api.get(`/payments/razorpay/link-status/${data.payment_link_id}`);
          if (st.status === 'paid') {
            Alert.alert('Payment successful', `${Math.floor(st.credits)} credits added to your wallet.`);
            navigation.navigate('Wallet');
          } else if (st.status === 'cancelled' || st.status === 'expired') {
            Alert.alert('Payment not completed', 'The checkout was cancelled or expired.');
          } else {
            Alert.alert('Payment pending', 'We\u2019re still confirming your payment \u2014 credits will appear shortly.');
          }
        } catch {
          Alert.alert('Verification pending', 'We couldn\u2019t confirm the payment yet. Please check the Wallet screen in a moment.');
        }
      });
    } catch (err) {
      Alert.alert('Payment failed', err.response?.data?.detail || err.message || 'Try again');
    } finally { setBuying(null); }
  };

  const subscribe = async (plan) => {
    setBuying(plan.plan_id);
    try {
      const { data } = await api.post(`/payments/subscribe/${plan.plan_id}`);
      if (!data?.short_url) throw new Error('No checkout URL returned');
      await openHostedCheckout(data.short_url, async () => {
        Alert.alert('Subscription in progress',
          'Once Razorpay confirms your first charge you\u2019ll receive the plan\u2019s monthly credits. Check the Wallet screen shortly.');
        navigation.navigate('Wallet');
      });
    } catch (err) {
      Alert.alert('Subscribe failed', err.response?.data?.detail || err.message || 'Try again');
    } finally { setBuying(null); }
  };

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <ScreenHeader title="Billing" navigation={navigation} />
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader title="Billing" navigation={navigation} />
      <ScrollView contentContainerStyle={{ padding: spacing.md, gap: spacing.md }}>
        <Text style={{ color: colors.textMuted, fontSize: fontSize.sm }}>
          Prices in USD. Payments via Razorpay \u2014 your card is billed the equivalent INR at checkout.
        </Text>

        {plans.length > 0 && (
          <>
            <Text style={{ color: colors.text, fontSize: fontSize.lg, fontWeight: '600', marginTop: 8 }}>
              Recurring plans
            </Text>
            {plans.map((p) => (
              <View key={p.plan_id} style={cardStyle(false)}>
                <Text style={labelStyle}>{(p.billing_period || 'monthly').toUpperCase()}</Text>
                <Text style={{ color: colors.text, fontSize: fontSize.lg, fontWeight: '600', marginTop: 2 }}>
                  {p.name}
                </Text>
                <Text style={priceStyle}>
                  ${p.price_usd}
                  <Text style={{ color: colors.textMuted, fontSize: fontSize.sm, fontWeight: '400' }}>
                    {' '}/ {p.billing_period === 'annual' ? 'year' : 'month'}
                  </Text>
                </Text>
                <View style={{ gap: 4, marginTop: 12 }}>
                  <Row text={`${p.monthly_credits} credits / ${p.billing_period === 'annual' ? 'year' : 'month'}`} />
                  <Row text={`${p.window_credits} credits per ${p.window_hours}h window`} />
                  <Row text="All AI modules" />
                </View>
                <Button title={buying === p.plan_id ? 'Opening\u2026' : `Subscribe to ${p.name}`}
                        loading={buying === p.plan_id}
                        onPress={() => subscribe(p)}
                        style={{ marginTop: spacing.lg }} />
              </View>
            ))}
          </>
        )}

        <Text style={{ color: colors.text, fontSize: fontSize.lg, fontWeight: '600', marginTop: 16 }}>
          Top-up packs
        </Text>
        {packs.map((p) => (
          <View key={p.slug} style={cardStyle(p.is_popular)}>
            {p.is_popular && (
              <View style={{ position: 'absolute', top: -10, right: 14, backgroundColor: colors.primary, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 }}>
                <Text style={{ color: '#fff', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, fontWeight: '600' }}>Popular</Text>
              </View>
            )}
            <Text style={{ color: colors.textMuted, fontSize: fontSize.sm }}>{p.name}</Text>
            <Text style={priceStyle}>${p.price.toFixed(2)}</Text>
            <Text style={{ color: colors.textMuted, marginTop: 2 }}>
              {Math.floor(p.credits).toLocaleString()} credits
              {p.bonus_credits > 0 && (
                <Text style={{ color: colors.success }}> + {Math.floor(p.bonus_credits)} bonus</Text>
              )}
            </Text>
            <View style={{ gap: 4, marginTop: 16 }}>
              <Row text="Never-expiring credits" />
              <Row text="All models: Claude + GPT" />
              <Row text="Priority processing" />
            </View>
            <Button title={`Buy ${p.name}`} loading={buying === p.slug} onPress={() => buyPack(p)}
                    variant={p.is_popular ? 'primary' : 'outline'} style={{ marginTop: spacing.lg }} />
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

function Row({ text }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <Check color={colors.primary} size={14} />
      <Text style={{ color: colors.textMuted, fontSize: fontSize.sm }}>{text}</Text>
    </View>
  );
}

const cardStyle = (popular) => ({
  borderWidth: 1,
  borderColor: popular ? colors.primary : colors.border,
  borderRadius: radii.lg,
  backgroundColor: colors.card,
  padding: spacing.lg,
  position: 'relative',
});
const priceStyle = { color: colors.text, fontSize: 32, fontWeight: '600', letterSpacing: -1, marginTop: 4 };
const labelStyle = { color: colors.primary, fontSize: 10, letterSpacing: 1, fontWeight: '600' };
