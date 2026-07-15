import React, { useState } from 'react';
import { View, Text, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, MailCheck } from 'lucide-react-native';
import api from '../api';
import { colors, spacing, fontSize } from '../theme';
import { Button, Input, Label } from '../components/UI';

export default function ForgotPasswordScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async () => {
    if (!email) return;
    setLoading(true);
    try {
      await api.post('/auth/forgot-password', { email });
      setSent(true);
    } catch {} finally { setLoading(false); }
  };

  return (
    <ScrollView contentContainerStyle={{ flex: 1, paddingTop: insets.top + 40, paddingHorizontal: spacing.xl, backgroundColor: colors.bg }}>
      {sent ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ height: 56, width: 56, borderRadius: 14, backgroundColor: colors.primaryDim, borderWidth: 1, borderColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}>
            <MailCheck color={colors.primary} size={26} />
          </View>
          <Text style={{ color: colors.text, fontSize: fontSize.xxl, fontWeight: '600', marginTop: 20 }}>Check your email</Text>
          <Text style={{ color: colors.textMuted, textAlign: 'center', marginTop: 8, maxWidth: 300 }}>
            If an account exists for {email}, we've sent a link to reset your password.
          </Text>
          <Button title="Back to sign in" variant="outline" style={{ marginTop: 24, minWidth: 200 }} onPress={() => navigation.navigate('Login')} />
        </View>
      ) : (
        <>
          <Text style={{ color: colors.text, fontSize: fontSize.hero, fontWeight: '600', letterSpacing: -1 }}>Forgot password?</Text>
          <Text style={{ color: colors.textMuted, fontSize: fontSize.md, marginTop: 8 }}>
            Enter your email — we'll send you a link to reset your password.
          </Text>
          <View style={{ marginTop: 32, gap: 12 }}>
            <View>
              <Label>Email</Label>
              <Input value={email} onChangeText={setEmail} placeholder="you@company.com" keyboardType="email-address" testID="forgot-email" />
            </View>
            <Button title="Send reset link" onPress={submit} loading={loading} testID="forgot-submit" />
            <Button title="Back to sign in" variant="outline" onPress={() => navigation.navigate('Login')} />
          </View>
        </>
      )}
    </ScrollView>
  );
}
