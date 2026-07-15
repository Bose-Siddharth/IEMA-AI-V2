import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, Platform, Alert } from 'react-native';
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import * as AppleAuthentication from 'expo-apple-authentication';
import { useDispatch } from 'react-redux';
import api from '../api';
import { setAuth } from '../store/slices/authSlice';
import { colors, spacing, radii, fontSize } from '../theme';

WebBrowser.maybeCompleteAuthSession();

// Same OAuth clients as web. Origin-registration in Google Cloud/Azure/Apple must include this app's
// deep-link scheme (iemaai://) for popup returns.
const GOOGLE_CLIENT_ID = '818667754847-v09vd70ssgv091rr0epotshvs6ib5krt.apps.googleusercontent.com';
const MICROSOFT_CLIENT_ID = '5de6c39a-bf40-4f42-88d8-f755a7797cc9';
const APPLE_SERVICE_ID = 'com.iemaai.app.auth0';

const GOOGLE_DISCOVERY = {
  authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenEndpoint: 'https://oauth2.googleapis.com/token',
};
const MS_DISCOVERY = {
  authorizationEndpoint: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
  tokenEndpoint: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
};

export default function SocialAuthButtons() {
  const dispatch = useDispatch();
  const [loading, setLoading] = useState(null);
  const redirectUri = AuthSession.makeRedirectUri({ scheme: 'iemaai', path: 'auth' });

  const finish = (data, provider) => {
    dispatch(setAuth(data));
  };

  const signInGoogle = async () => {
    setLoading('google');
    try {
      const request = new AuthSession.AuthRequest({
        clientId: GOOGLE_CLIENT_ID,
        redirectUri,
        responseType: AuthSession.ResponseType.IdToken,
        scopes: ['openid', 'profile', 'email'],
        extraParams: { nonce: Math.random().toString(36).slice(2) },
      });
      const result = await request.promptAsync(GOOGLE_DISCOVERY);
      if (result.type !== 'success') return;
      const idToken = result.params?.id_token;
      if (!idToken) { Alert.alert('Google', 'No id_token returned'); return; }
      const { data } = await api.post('/auth/google-verify', { credential: idToken });
      finish(data, 'Google');
    } catch (e) {
      Alert.alert('Google sign-in failed', e?.response?.data?.detail || e?.message || 'Try again');
    } finally { setLoading(null); }
  };

  const signInMicrosoft = async () => {
    setLoading('microsoft');
    try {
      const request = new AuthSession.AuthRequest({
        clientId: MICROSOFT_CLIENT_ID,
        redirectUri,
        responseType: AuthSession.ResponseType.Code,
        scopes: ['openid', 'profile', 'email', 'offline_access'],
        usePKCE: true,
        extraParams: { prompt: 'select_account' },
      });
      const result = await request.promptAsync(MS_DISCOVERY);
      if (result.type !== 'success') return;
      const code = result.params?.code;
      // Exchange code for tokens client-side (SPA-style PKCE)
      const tokenRes = await AuthSession.exchangeCodeAsync({
        clientId: MICROSOFT_CLIENT_ID,
        code,
        redirectUri,
        extraParams: { code_verifier: request.codeVerifier },
      }, MS_DISCOVERY);
      const idToken = tokenRes.idToken;
      if (!idToken) { Alert.alert('Microsoft', 'No id_token from Microsoft'); return; }
      const { data } = await api.post('/auth/microsoft-verify', { id_token: idToken });
      finish(data, 'Microsoft');
    } catch (e) {
      Alert.alert('Microsoft sign-in failed', e?.response?.data?.detail || e?.message || 'Try again');
    } finally { setLoading(null); }
  };

  const signInApple = async () => {
    setLoading('apple');
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      const idToken = credential.identityToken;
      if (!idToken) { Alert.alert('Apple', 'No identity token'); return; }
      const { data } = await api.post('/auth/apple', { id_token: idToken });
      finish(data, 'Apple');
    } catch (e) {
      if (e.code === 'ERR_CANCELED') return;
      Alert.alert('Apple sign-in failed', e?.response?.data?.detail || e?.message || 'Try again');
    } finally { setLoading(null); }
  };

  const btn = (label, onPress, key, testID, disabled) => (
    <TouchableOpacity
      testID={testID}
      onPress={onPress}
      disabled={disabled || loading !== null}
      activeOpacity={0.85}
      style={{
        flex: 1,
        height: 44, borderRadius: radii.md,
        borderWidth: 1, borderColor: colors.border,
        backgroundColor: colors.surface,
        alignItems: 'center', justifyContent: 'center',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {loading === key
        ? <ActivityIndicator size="small" color={colors.text} />
        : <Text style={{ color: colors.text, fontSize: fontSize.sm, fontWeight: '500' }}>{label}</Text>}
    </TouchableOpacity>
  );

  return (
    <View style={{ gap: spacing.sm }}>
      <TouchableOpacity
        testID="social-google"
        onPress={signInGoogle}
        disabled={loading !== null}
        activeOpacity={0.85}
        style={{
          height: 46, borderRadius: radii.md,
          borderWidth: 1, borderColor: colors.border,
          backgroundColor: colors.surface,
          flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
        }}
      >
        {loading === 'google'
          ? <ActivityIndicator size="small" color={colors.text} />
          : <Text style={{ color: colors.text, fontSize: fontSize.md, fontWeight: '500' }}>Continue with Google</Text>}
      </TouchableOpacity>
      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        {Platform.OS === 'ios'
          ? btn('Apple', signInApple, 'apple', 'social-apple')
          : btn('Apple', () => Alert.alert('Apple Sign-In', 'Apple Sign-In requires iOS.'), 'apple', 'social-apple', true)}
        {btn('Microsoft', signInMicrosoft, 'microsoft', 'social-microsoft')}
        {btn('Facebook', () => Alert.alert('Facebook', 'Not enabled (no secret provided).'), 'facebook', 'social-facebook', true)}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginVertical: spacing.md }}>
        <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
        <Text style={{ color: colors.textDim, fontSize: fontSize.xs }}>or continue with email</Text>
        <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
      </View>
    </View>
  );
}
