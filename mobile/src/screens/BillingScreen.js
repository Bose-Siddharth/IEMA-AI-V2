import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Alert, ActivityIndicator, Linking } from 'react-native';
import { Check } from 'lucide-react-native';
import api from '../api';
import ScreenHeader from '../components/ScreenHeader';
import { Card, Button } from '../components/UI';
import { colors, spacing, fontSize, radii } from '../theme';

const CURRENCIES = [
  { key: 'usd', label: 'USD (Stripe)', symbol: '$' },
  { key: 'inr', label: 'INR (Razorpay)', symbol: '₹' },
];

export default function BillingScreen({ navigation }) {
  const [currency, setCurrency] = useState('inr');
  const [packs, setPacks] = useState([]);
  const [buying, setBuying] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/packs/?currency=${currency}`);
      setPacks(data.items);
    } catch {} finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [currency]);

  const buy = async (pack) => {
    setBuying(pack.slug);
    try {
      if (currency === 'usd') {
        // Stripe — open Checkout URL in in-app browser
        const { data } = await api.post('/payments/stripe/checkout', {
          pack_slug: pack.slug,
          origin_url: 'https://iema-ai-platform.preview.emergentagent.com',
        });
        Linking.openURL(data.url);
        Alert.alert('Checkout opened', 'Complete payment in your browser. Return here — your credits will appear once the payment is confirmed.');
      } else {
        // Razorpay — for mobile, we open the hosted checkout link
        const { data } = await api.post('/payments/razorpay/order', { pack_slug: pack.slug });
        // On mobile, open razorpay hosted page (test-mode fallback UX for MVP)
        const url = `https://api.razorpay.com/v1/checkout/embedded?order_id=${data.order_id}&key_id=${data.key_id}&amount=${data.amount}&currency=INR`;
        Alert.alert('Razorpay Test Payment', 'For production, integrate react-native-razorpay SDK. For now, opening the order details.', [
          { text: 'OK' },
        ]);
      }
    } catch (err) {
      Alert.alert('Payment failed', err.response?.data?.detail || 'Try again');
    } finally { setBuying(null); }
  };

  const symbol = CURRENCIES.find(c => c.key === currency)?.symbol;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader title="Billing" navigation={navigation} />
      <ScrollView contentContainerStyle={{ padding: spacing.md, gap: spacing.md }}>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {CURRENCIES.map(c => (
            <TouchableOpacity key={c.key} onPress={() => setCurrency(c.key)}
              style={{ flex: 1, paddingVertical: 10, borderRadius: radii.md, borderWidth: 1, borderColor: currency === c.key ? colors.primary : colors.border, backgroundColor: currency === c.key ? colors.primaryDim : 'transparent', alignItems: 'center' }}>
              <Text style={{ color: currency === c.key ? colors.primary : colors.textMuted, fontSize: fontSize.sm, fontWeight: '500' }}>{c.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {loading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
        ) : packs.map((p) => (
          <View key={p.slug} style={{ borderWidth: 1, borderColor: p.is_popular ? colors.primary : colors.border, borderRadius: radii.lg, backgroundColor: colors.card, padding: spacing.lg, position: 'relative' }}>
            {p.is_popular && (
              <View style={{ position: 'absolute', top: -10, right: 14, backgroundColor: colors.primary, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 }}>
                <Text style={{ color: '#fff', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, fontWeight: '600' }}>Popular</Text>
              </View>
            )}
            <Text style={{ color: colors.textMuted, fontSize: fontSize.sm }}>{p.name}</Text>
            <Text style={{ color: colors.text, fontSize: 36, fontWeight: '600', letterSpacing: -1, marginTop: 4 }}>
              {symbol}{p.price.toFixed(currency === 'usd' ? 2 : 0)}
            </Text>
            <Text style={{ color: colors.textMuted, marginTop: 2 }}>
              {Math.floor(p.credits).toLocaleString()} credits
              {p.bonus_credits > 0 && <Text style={{ color: colors.success }}> + {Math.floor(p.bonus_credits)} bonus</Text>}
            </Text>
            <View style={{ gap: 4, marginTop: 16 }}>
              <Row text="Never-expiring credits" />
              <Row text="All models: Claude + GPT" />
              <Row text="Priority processing" />
            </View>
            <Button title={`Buy ${p.name}`} loading={buying === p.slug} onPress={() => buy(p)}
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
